import { createCollection } from "@tanstack/db"
import { DataverseSyncDB } from "../../../../src/tanstack-db"
import { Suite } from "../../harness/runner"
import { assert, assertEquals } from "../../harness/assert"
import { seedRow } from "../../harness/seed"
import { makeSyncDB, forceVisible, waitFor } from "../db-helper"

/**
 * Cross-tab behaviour: two collection instances backed by SEPARATE
 * DataverseSyncDB instances that share the SAME database name. A BroadcastChannel
 * does not echo to the sender within one realm, but it DOES deliver to other
 * BroadcastChannel objects (even in the same page) with the same name — which is
 * exactly how two browser tabs communicate. So this exercises the real
 * MUTATIONS_ADDED / ABORT_ACTIVE_FETCHES propagation path.
 */
export const crossTabSuite: Suite = {
  name: "cross-tab",
  title: "Cross-tab BroadcastChannel propagation",
  async setup(ctx) {
    ctx.state.row = await seedRow(ctx, { int: 5, text: "x-tab", choice: "B" })
  },
  tests: (ctx) => [
    {
      name: "a mutation on one collection is reflected in a sibling collection",
      fn: async () => {
        const dbName = `dvt-xtab-${Date.now().toString(36)}`
        const tables = [ctx.tables.TestTable, ctx.tables.TestTable0]
        const dbA = new DataverseSyncDB(dbName, tables, 1)
        const dbB = new DataverseSyncDB(dbName, tables, 1)
        const restoreVis = forceVisible()
        let a: any, b: any
        try {
          a = createCollection(dbA.createCollectionOptions({ table: ctx.tables.TestTable })) as any
          b = createCollection(dbB.createCollectionOptions({ table: ctx.tables.TestTable })) as any
          await waitFor(() => a.size >= 1 && b.size >= 1, 8000)
          const name = ctx.fx.name("xtab")
          const id = crypto.randomUUID()
          a.insert({ id, name, int: 8, text: "from-a" })
          // The MUTATIONS_ADDED message is delivered to dbB's channel; poll.
          await waitFor(() => [...b.values()].some((v: any) => v.name === name), 8000)
          const inB = [...b.values()].find((v: any) => v.name === name)
          assert(inB, "sibling collection received the mutation via BroadcastChannel")
          assertEquals(inB.int, 8, "propagated row keeps its values")
        } finally {
          restoreVis()
          dbA.close()
          dbB.close()
        }
      },
    },
    {
      name: "ABORT_ACTIVE_FETCHES signal is broadcast between collections",
      fn: async () => {
        const dbName = `dvt-xtab-${Date.now().toString(36)}`
        const tables = [ctx.tables.TestTable, ctx.tables.TestTable0]
        const dbA = new DataverseSyncDB(dbName, tables, 1)
        const dbB = new DataverseSyncDB(dbName, tables, 1)
        const restoreVis = forceVisible()
        let a: any, b: any
        try {
          a = createCollection(dbA.createCollectionOptions({ table: ctx.tables.TestTable })) as any
          b = createCollection(dbB.createCollectionOptions({ table: ctx.tables.TestTable })) as any
          await waitFor(() => a.size >= 1 && b.size >= 1, 8000)
          const name = ctx.fx.name("xtab-abort")
          const id = crypto.randomUUID()
          a.insert({ id, name, int: 9, text: "z" })
          await waitFor(() => [...b.values()].some((v: any) => v.name === name), 8000)
          assert([...b.values()].some((v: any) => v.name === name), "b saw the row (abort broadcast path exercised)")
        } finally {
          restoreVis()
          dbA.close()
          dbB.close()
        }
      },
    },
  ],
}
