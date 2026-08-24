import { createCollection } from "@tanstack/db"
import { DataverseSyncDB, dataverseCollectionOptions } from "../../../../src/tanstack-db/index"
import { Suite } from "../../harness/runner"
import { assert, assertEquals, assertRejects } from "../../harness/assert"
import { seedRow } from "../../harness/seed"
import { makeSyncDB, forceVisible, waitFor } from "../db-helper"

/**
 * Exercises the configurable options added to both adapters:
 *  - offline `utils.forceSync` (manual flush + remote sync)
 *  - offline `requireVisible: false` (sync regardless of visibility)
 *  - `readonly: true` (mutations rejected on both adapters)
 */
export const optionsSuite: Suite = {
  name: "options",
  title: "Adapter options (forceSync / requireVisible / readonly)",
  async setup(ctx) {
    ctx.state.row = await seedRow(ctx, { int: 3, text: "opts", choice: "B" })
  },
  tests: (ctx) => [
    {
      name: "offline utils.forceSync flushes queue and re-syncs",
      fn: async () => {
        const db = makeSyncDB([ctx.tables.TestTable, ctx.tables.TestTable0])
        const restoreVis = forceVisible()
        let collection: any
        try {
          collection = createCollection(db.createCollectionOptions({ table: ctx.tables.TestTable })) as any
          await waitFor(() => collection.size >= 1, 8000)
          const name = ctx.fx.name("opts-fs")
          const id = crypto.randomUUID()
          // Insert while offline so it's queued, then go online + forceSync.
          const restore = simulateOfflineHere()
          collection.insert({ id, name, int: 70, text: "fs" })
          await new Promise((r) => setTimeout(r, 300))
          const queuedBefore = await db.getQueueCount()
          assert(queuedBefore >= 1, `mutation queued before forceSync (got ${queuedBefore})`)
          restore()
          const utils = collection.utils as { forceSync: () => Promise<void> }
          assert(typeof utils?.forceSync === "function", "forceSync util exposed on offline collection")
          await utils.forceSync()
          await waitFor(async () => {
            const queue = await db.getQueueCount()
            const rows = await ctx.tables.TestTable.getRecords({ filter: `nnsyc200_name eq '${name}'` })
            return queue === 0 && rows.length === 1
          }, 8000)
          const rows = await ctx.tables.TestTable.getRecords({ filter: `nnsyc200_name eq '${name}'` })
          ctx.fx.track(rows[0].id)
        } finally {
          restoreVis()
          collection?.delete?.(ctx.state.row)
          db.close()
        }
      },
    },
    {
      name: "offline requireVisible:false syncs even when hidden",
      fn: async () => {
        const db = makeSyncDB([ctx.tables.TestTable, ctx.tables.TestTable0])
        // Force hidden so the default visibility gate would normally block sync.
        const origVis = document.visibilityState
        Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" })
        let collection: any
        try {
          collection = createCollection(
            db.createCollectionOptions({ table: ctx.tables.TestTable, requireVisible: false }),
          ) as any
          await waitFor(() => collection.size >= 1, 8000)
          assert(collection.size >= 1, "collection synced despite hidden visibility (requireVisible:false)")
        } finally {
          Object.defineProperty(document, "visibilityState", { configurable: true, get: () => origVis })
          collection?.delete?.(ctx.state.row)
          db.close()
        }
      },
    },
    {
      name: "online readonly:true rejects mutations",
      fn: async () => {
        const config = dataverseCollectionOptions({ table: ctx.tables.TestTable, readonly: true })
        const collection = createCollection(config) as any
        await waitFor(() => collection.size >= 1, 8000)
        const id = crypto.randomUUID()
        // Insert should be rejected by the adapter's readonly guard.
        await assertRejects(
          () => collection.insert({ id, name: ctx.fx.name("ro"), int: 1, text: "x" }),
          "read-only",
        )
        assert(collection.size >= 1, "collection still intact after rejected insert")
      },
    },
    {
      name: "offline readonly:true rejects mutations",
      fn: async () => {
        const db = makeSyncDB([ctx.tables.TestTable, ctx.tables.TestTable0])
        const collection = createCollection(
          db.createCollectionOptions({ table: ctx.tables.TestTable, readonly: true }),
        ) as any
        await waitFor(() => collection.size >= 1, 8000)
        const id = crypto.randomUUID()
        await assertRejects(
          () => collection.insert({ id, name: ctx.fx.name("ro-off"), int: 1, text: "x" }),
          "read-only",
        )
        // And it must NOT have been queued in IndexedDB.
        const count = await db.getQueueCount()
        assertEquals(count, 0, "no mutation queued while readonly")
        collection.delete(ctx.state.row)
        db.close()
      },
    },
  ],
}

// Minimal inline offline toggle (mirrors db-helper.simulateOffline but kept
// local to avoid importing the restore tuple into the test body).
function simulateOfflineHere(): () => void {
  const previous = navigator.onLine
  Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false })
  window.dispatchEvent(new Event("offline"))
  return () => {
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => previous })
    window.dispatchEvent(new Event(previous ? "online" : "offline"))
  }
}
