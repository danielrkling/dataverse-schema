import { createCollection } from "@tanstack/db"
import { dataverseCollectionOptions } from "../../../../src/tanstack-db"
import { Suite } from "../../harness/runner"
import { assert, assertEquals } from "../../harness/assert"
import { seedRow } from "../../harness/seed"
import { forceVisible, waitFor } from "../db-helper"

/**
 * Cross-tab propagation for the ONLINE collection. The online adapter uses a
 * BroadcastChannel keyed by the collection id, so — like the offline adapter —
 * a mutation in one collection is reflected in a sibling collection that shares
 * the same entity set / collection id (even within a single page, the two
 * collections are separate BroadcastChannel endpoints and therefore receive
 * each other's messages).
 */
export const onlineCrossTabSuite: Suite = {
  name: "online-cross-tab",
  title: "Cross-tab (online collection) BroadcastChannel propagation",
  async setup(ctx) {
    ctx.state.row = await seedRow(ctx, { int: 5, text: "x-tab-online", choice: "B" })
  },
  tests: (ctx) => [
    {
      name: "a mutation on one online collection is reflected in a sibling",
      fn: async () => {
        const cfgA = dataverseCollectionOptions({ table: ctx.tables.TestTable })
        const cfgB = dataverseCollectionOptions({ table: ctx.tables.TestTable })
        const a = createCollection(cfgA) as any
        const b = createCollection(cfgB) as any
        const restoreVis = forceVisible()
        try {
          await waitFor(() => a.size >= 1 && b.size >= 1, 8000)
          const name = ctx.fx.name("xtab-online")
          const id = crypto.randomUUID()
          a.insert({ id, name, int: 8, text: "from-a" })
          await waitFor(() => [...b.values()].some((v: any) => v.name === name), 8000)
          const inB = [...b.values()].find((v: any) => v.name === name)
          assert(inB, "sibling online collection received the mutation via BroadcastChannel")
          assertEquals(inB.int, 8, "propagated row keeps its values")
        } finally {
          restoreVis()
          ;(a as any).delete?.(ctx.state.row)
          ;(b as any).delete?.(ctx.state.row)
        }
      },
    },
    {
      name: "ABORT_ACTIVE_FETCHES is broadcast between online collections",
      fn: async () => {
        const cfgA = dataverseCollectionOptions({ table: ctx.tables.TestTable })
        const cfgB = dataverseCollectionOptions({ table: ctx.tables.TestTable })
        const a = createCollection(cfgA) as any
        const b = createCollection(cfgB) as any
        const restoreVis = forceVisible()
        try {
          await waitFor(() => a.size >= 1 && b.size >= 1, 8000)
          const name = ctx.fx.name("xtab-online-abort")
          const id = crypto.randomUUID()
          a.insert({ id, name, int: 9, text: "z" })
          await waitFor(() => [...b.values()].some((v: any) => v.name === name), 8000)
          assert([...b.values()].some((v: any) => v.name === name), "b saw the row (abort broadcast path exercised)")
        } finally {
          restoreVis()
          ;(a as any).delete?.(ctx.state.row)
          ;(b as any).delete?.(ctx.state.row)
        }
      },
    },
  ],
}
