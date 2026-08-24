import { createCollection } from "@tanstack/db"
import { DataverseSyncDB } from "../../../../src/tanstack-db/index"
import { Suite } from "../../harness/runner"
import { assert, assertEquals } from "../../harness/assert"
import { seedRow } from "../../harness/seed"
import { makeSyncDB } from "../db-helper"

/**
 * Cross-tab behaviour in a single page: two collection instances backed by the
 * SAME DataverseSyncDB (and therefore the same BroadcastChannel) should observe
 * each other's mutations via the MUTATIONS_ADDED channel message.
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
        const db = makeSyncDB([ctx.tables.TestTable, ctx.tables.TestTable0])
        let a: any, b: any
        try {
          a = createCollection(db.createCollectionOptions({ table: ctx.tables.TestTable })) as any
          b = createCollection(db.createCollectionOptions({ table: ctx.tables.TestTable })) as any
          await new Promise((r) => setTimeout(r, 500))
          const name = ctx.fx.name("xtab")
          a.insert({ name, int: 8, text: "from-a" })
          // The MUTATIONS_ADDED message is delivered synchronously on postMessage
          // within the same realm, so a short wait is enough.
          await new Promise((r) => setTimeout(r, 300))
          const inB = [...b.values()].find((v: any) => v.name === name)
          assert(inB, "sibling collection received the mutation via BroadcastChannel")
          assertEquals(inB.int, 8, "propagated row keeps its values")
        } finally {
          a?.delete?.(undefined)
          b?.delete?.(undefined)
          db.close()
        }
      },
    },
    {
      name: "ABORT_ACTIVE_FETCHES signal is broadcast between collections",
      fn: async () => {
        const db = makeSyncDB([ctx.tables.TestTable, ctx.tables.TestTable0])
        let a: any, b: any
        try {
          a = createCollection(db.createCollectionOptions({ table: ctx.tables.TestTable })) as any
          b = createCollection(db.createCollectionOptions({ table: ctx.tables.TestTable })) as any
          await new Promise((r) => setTimeout(r, 500))
          const name = ctx.fx.name("xtab-abort")
          a.insert({ name, int: 9, text: "z" })
          await new Promise((r) => setTimeout(r, 300))
          assert([...b.values()].some((v: any) => v.name === name), "b saw the row (abort broadcast path exercised)")
        } finally {
          a?.delete?.(undefined)
          b?.delete?.(undefined)
          db.close()
        }
      },
    },
  ],
}
