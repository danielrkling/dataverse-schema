import { createCollection } from "@tanstack/db"
import { DataverseSyncDB } from "../../../../src/tanstack-db/index"
import { Suite } from "../../harness/runner"
import { assert, assertEquals } from "../../harness/assert"
import { seedRow } from "../../harness/seed"
import { makeSyncDB, readQueue, simulateOffline } from "../db-helper"

/**
 * Durability: a queued (offline) mutation survives a "page reload", i.e. a brand
 * new DataverseSyncDB opened with the SAME database name must still see it in
 * IndexedDB and be able to flush it once online.
 */
export const durabilitySuite: Suite = {
  name: "durability",
  title: "IndexedDB durability across reload",
  tests: (ctx) => [
    {
      name: "offline mutation persists across a fresh DB instance and flushes on reconnect",
      fn: async () => {
        const name = ctx.fx.name("durable")
        const dbName = `dvt-dur-${Date.now().toString(36)}`
        const tables = [ctx.tables.TestTable, ctx.tables.TestTable0]

        // --- Session 1: go offline, enqueue a mutation, then "reload". ---
        const db1 = new DataverseSyncDB(dbName, tables, 1)
        const restore1 = simulateOffline(true)
        let collection1: any
        try {
          collection1 = createCollection(db1.createCollectionOptions({ table: ctx.tables.TestTable })) as any
          await new Promise((r) => setTimeout(r, 500))
          collection1.insert({ name, int: 55, text: "durable" })
          await new Promise((r) => setTimeout(r, 300))
          const q1 = await readQueue(db1)
          assert(q1.length === 1, `mutation queued in session 1 (got ${q1.length})`)
        } finally {
          restore1()
          collection1?.delete?.(undefined)
          db1.close()
        }

        // --- Session 2: simulate a reload by reopening the SAME database name. ---
        const db2 = new DataverseSyncDB(dbName, tables, 1)
        let collection2: any
        try {
          const q2 = await readQueue(db2)
          assert(q2.length === 1, `mutation survived reload in IndexedDB (got ${q2.length})`)
          assertEquals(q2[0].entitySetName, ctx.tables.TestTable.entitySetName, "survived mutation targets right entity")

          collection2 = createCollection(db2.createCollectionOptions({ table: ctx.tables.TestTable })) as any
          // Online now (default), so the initial flush picks up the persisted queue.
          await new Promise((r) => setTimeout(r, 900))
          const q3 = await readQueue(db2)
          assertEquals(q3.length, 0, "persisted queue flushed after reload+online")
          const rows = await ctx.tables.TestTable.getRecords({ filter: `nnsyc200_name eq '${name}'` })
          assert(rows.length === 1, "durable mutation eventually reached Dataverse")
          ctx.fx.track(rows[0].id)
          collection2.delete(rows[0].id)
        } finally {
          collection2?.delete?.(undefined)
          db2.close()
        }
      },
    },
    {
      name: "cache store is rebuilt from a fresh sync after clear",
      fn: async () => {
        const db = makeSyncDB([ctx.tables.TestTable, ctx.tables.TestTable0])
        const id = await seedRow(ctx, { int: 7, text: "cache-me" })
        const collection = createCollection(db.createCollectionOptions({ table: ctx.tables.TestTable })) as any
        try {
          await new Promise((r) => setTimeout(r, 700))
          // The cache store should contain the seeded row after the first sync.
          const idb = await (db as any).getDB()
          const cached = (await idb.getAll(ctx.tables.TestTable.entitySetName)) as any[]
          assert(cached.some((r) => r.id === id), "row cached in IndexedDB after sync")
        } finally {
          collection.delete(id)
          db.close()
        }
      },
    },
  ],
}
