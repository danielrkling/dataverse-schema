import { createCollection } from "@tanstack/db"
import { DataverseSyncDB } from "../../../../src/tanstack-db"
import { Suite } from "../../harness/runner"
import { assert, assertEquals } from "../../harness/assert"
import { seedRow } from "../../harness/seed"
import { makeSyncDB, readQueue, readErrored, simulateOffline, enqueueRaw, flush, forceVisible, waitFor } from "../db-helper"

export const offlineQueueSuite: Suite = {
  name: "offline-queue",
  title: "Offline mutation queue (DataverseSyncDB)",
  tests: (ctx) => [
    {
      name: "createCollectionOptions builds a collection backed by the sync DB",
      fn: async () => {
        const db = makeSyncDB([ctx.tables.TestTable, ctx.tables.TestTable0])
        const restoreVis = forceVisible()
        try {
          const config = db.createCollectionOptions({ table: ctx.tables.TestTable })
          const collection = createCollection(config) as any
          await waitFor(() => collection.size >= 0, 3000)
        } finally {
          restoreVis()
          db.close()
        }
      },
    },
    {
      name: "online insert is flushed and appears in Dataverse immediately",
      fn: async () => {
        const db = makeSyncDB([ctx.tables.TestTable, ctx.tables.TestTable0])
        const restoreVis = forceVisible()
        try {
          const config = db.createCollectionOptions({ table: ctx.tables.TestTable })
          const collection = createCollection(config) as any
          await waitFor(() => collection.size >= 0, 3000)
          const name = ctx.fx.name("offline-on")
          const id = crypto.randomUUID()
          collection.insert({ id, name, int: 11, text: "flush-me" })
          await waitFor(async () => {
            const queue = await readQueue(db)
            const rows = await ctx.tables.TestTable.getRecords({ filter: `nnsyc200_name eq '${name}'` })
            return queue.length === 0 && rows.length === 1
          }, 8000)
          const rows = await ctx.tables.TestTable.getRecords({ filter: `nnsyc200_name eq '${name}'` })
          ctx.fx.track(rows[0].id)
        } finally {
          restoreVis()
          db.close()
        }
      },
    },
    {
      name: "offline insert is queued in IndexedDB and NOT sent to Dataverse",
      fn: async () => {
        const db = makeSyncDB([ctx.tables.TestTable, ctx.tables.TestTable0])
        const restore = simulateOffline(true)
        const restoreVis = forceVisible()
        try {
          const config = db.createCollectionOptions({ table: ctx.tables.TestTable })
          const collection = createCollection(config) as any
          await waitFor(() => collection.size >= 0, 3000)
          const name = ctx.fx.name("offline-q")
          const id = crypto.randomUUID()
          collection.insert({ id, name, int: 22, text: "queued" })
          // Give any (incorrect) flush a chance to run.
          await new Promise((r) => setTimeout(r, 500))
          const queue = await readQueue(db)
          assert(queue.length === 1, `expected 1 queued mutation, got ${queue.length}`)
          assertEquals(queue[0].type, "insert", "queued as insert")
          assertEquals(queue[0].entitySetName, ctx.tables.TestTable.entitySetName, "queue targets correct entity set")
          const rows = await ctx.tables.TestTable.getRecords({ filter: `nnsyc200_name eq '${name}'` })
          assertEquals(rows.length, 0, "offline insert must NOT reach Dataverse yet")
        } finally {
          restore()
          restoreVis()
          db.close()
        }
      },
    },
    {
      name: "coming back online flushes the queued mutation",
      fn: async () => {
        const db = makeSyncDB([ctx.tables.TestTable, ctx.tables.TestTable0])
        const restore = simulateOffline(true)
        const restoreVis = forceVisible()
        let name = ""
        try {
          const config = db.createCollectionOptions({ table: ctx.tables.TestTable })
          const collection = createCollection(config) as any
          await waitFor(() => collection.size >= 0, 3000)
          name = ctx.fx.name("offline-then-on")
          const id = crypto.randomUUID()
          collection.insert({ id, name, int: 33, text: "deferred" })
          await new Promise((r) => setTimeout(r, 400))
          // Go back online — the `online` event should trigger flushAndSync.
          restore()
          await waitFor(async () => {
            const queue = await readQueue(db)
            const rows = await ctx.tables.TestTable.getRecords({ filter: `nnsyc200_name eq '${name}'` })
            return queue.length === 0 && rows.length === 1
          }, 10000)
          const rows = await ctx.tables.TestTable.getRecords({ filter: `nnsyc200_name eq '${name}'` })
          ctx.fx.track(rows[0].id)
        } finally {
          restore()
          restoreVis()
          db.close()
        }
      },
    },
    {
      name: "getQueueCount / getErroredMutations report DB state",
      fn: async () => {
        const db = makeSyncDB([ctx.tables.TestTable, ctx.tables.TestTable0])
        const restore = simulateOffline(true)
        const restoreVis = forceVisible()
        try {
          const config = db.createCollectionOptions({ table: ctx.tables.TestTable })
          const collection = createCollection(config) as any
          await waitFor(() => collection.size >= 0, 3000)
          const name = ctx.fx.name("qcount")
          const id = crypto.randomUUID()
          collection.insert({ id, name, int: 44, text: "x" })
          await new Promise((r) => setTimeout(r, 400))
          const count = await db.getQueueCount()
          assert(count >= 1, `getQueueCount should see the queued mutation (got ${count})`)
          const errored = await db.getErroredMutations()
          assertEquals(errored.length, 0, "no errored mutations yet")
        } finally {
          restore()
          restoreVis()
          db.close()
        }
      },
    },
    {
      name: "errored mutation can be retried and discarded",
      fn: async () => {
        const db = makeSyncDB([ctx.tables.TestTable, ctx.tables.TestTable0])
        const restoreVis = forceVisible()
        const id = await seedRow(ctx, { int: 1, text: "will-fail" })
        const collection = createCollection(db.createCollectionOptions({ table: ctx.tables.TestTable })) as any
        try {
          await waitFor(() => collection.size >= 1, 8000)
          // Inject a failing update (stale ifMatch) directly into the queue. The
          // per-table cache store is keyed by the TS primary key `id`, so the
          // value must carry it or queueMutations throws on the IDB put.
          const eid = `test-err-${Date.now()}`
          await enqueueRaw(db, {
            id: eid,
            type: "update",
            key: id,
            value: { id, int: 2 },
            changes: { int: 2 },
            entitySetName: ctx.tables.TestTable.entitySetName,
            timestamp: Date.now(),
            sequence: 0,
            attempts: 0,
            ifMatch: 'W/"999999"',
          })
          // The adapter uses an exponential retry backoff (1s, 2s, 4s, ...) and
          // skips flushing a mutation whose nextAttemptAt is still in the future.
          // So we flush, then wait past the backoff, repeating until the mutation
          // exhausts its attempts and lands in the errored store.
          await waitFor(async () => {
            await flush(db)
            await new Promise((r) => setTimeout(r, 1300))
            const errored = await readErrored(db)
            return errored.some((m) => m.id === eid)
          }, 20000, 1300)
          const errored = await readErrored(db)
          assert(errored.length >= 1, `expected the failing mutation in errored store (got ${errored.length})`)
          const found = errored.find((m) => m.id === eid)
          assert(found, "the injected mutation is in the errored store")
          await db.retryErroredMutation(eid)
          const afterRetry = await readErrored(db)
          assert(!afterRetry.some((m) => m.id === eid), "retry removed it from errored store")
          await db.discardErroredMutation(eid)
        } finally {
          await ctx.tables.TestTable.deleteRecord(id).catch(() => undefined)
          restoreVis()
          db.close()
        }
      },
    },
  ],
}
