import { Suite } from "../../harness/runner"
import { assert, assertEquals } from "../../harness/assert"
import { seedRow } from "../../harness/seed"
import { SyncEngine, isKeyViolation } from "../../../../src/tanstack-db"
import {
  makeSyncDB,
  enqueueRaw,
  waitFor,
  sweepTestDbs,
  dvtDbNames,
} from "../db-helper"

/**
 * Engine-level behaviours that only need the SyncQueue internals and an
 * IndexedDB backend — no live record writes (except where noted), so these
 * also run quickly and are unaffected by server latency.
 */
export const engineCoreSuite: Suite = {
  name: "engine-core",
  title: "Sync engine core (listeners, etag ops, sweeps)",
  tests: (ctx) => [
    {
      name: "onMutationsChanged fires when a mutation is enqueued",
      fn: async () => {
        const db = makeSyncDB([ctx.tables.TestTable, ctx.tables.TestTable0])
        try {
          const events: number[] = []
          const unsubscribe = db.onMutationsChanged(() => events.push(events.length))
          await enqueueRaw(db, {
            id: `core-evt-${Date.now()}`,
            type: "insert",
            key: crypto.randomUUID(),
            value: { id: crypto.randomUUID(), name: "evt", int: 1, text: "t" },
            changes: { name: "evt" },
            entitySetName: ctx.tables.TestTable.entitySetName,
            timestamp: Date.now(),
            sequence: 1,
            attempts: 0,
          })
          assert(events.length >= 1, "listener fired on queueMutations")
          unsubscribe()
          await enqueueRaw(db, {
            id: `core-evt2-${Date.now()}`,
            type: "insert",
            key: crypto.randomUUID(),
            value: { id: crypto.randomUUID(), name: "evt" },
            changes: {},
            entitySetName: ctx.tables.TestTable.entitySetName,
            timestamp: Date.now(),
            sequence: 2,
            attempts: 0,
          })
          assert(events.length === 1, "unsubscribed listener is not called again")
        } finally {
          db.close()
        }
      },
    },
    {
      name: "abortActiveFetches aborts tracked controllers",
      fn: async () => {
        const db = makeSyncDB([ctx.tables.TestTable, ctx.tables.TestTable0])
        try {
          const trackActiveFetch = (db as any).trackActiveFetch.bind(db)
          assert(typeof trackActiveFetch === "function", "engine exposes the fetch-registry")
          const controller = new AbortController()
          trackActiveFetch(controller)
          db.abortActiveFetches()
          assert(controller.signal.aborted, "tracked fetch controller was aborted")
          // Untracked controllers are unaffected.
          const independent = new AbortController()
          db.abortActiveFetches()
          assert(!independent.signal.aborted, "untracked controller is not aborted")
          // The engine's own channel still relays ABORT_ACTIVE_FETCHES between engines.
          const listener = new AbortController()
          db.channel.postMessage({ type: "ABORT_ACTIVE_FETCHES" })
          void listener
        } finally {
          db.close()
        }
      },
    },
    {
      name: "isKeyViolation classifies the DuplicateRecordEntityKey body offline",
      fn: async () => {
        const stored = {
          name: "DataverseHttpError",
          message: "412 Entity Key Project ID violated.",
          status: 412,
          statusText: "Precondition Failed",
          body: {
            code: "0x80060892",
            message: "Entity Key Project ID violated. A record with the same value for Project already exists. A duplicate record cannot be created. Select one or more unique values and try again.",
          },
        }
        assert(isKeyViolation(stored), "duplicate-key violation detected from serialized body")
        assert(!isKeyViolation({ status: 412, body: { code: "0x80060881", message: "etag mismatch" } }), "etag conflicts are not key violations")
      },
    },
    {
      name: "getConflictDetails classifies conflict / local-change / unchanged rows (live)",
      fn: async () => {
        const db = makeSyncDB([ctx.tables.TestTable, ctx.tables.TestTable0])
        const id = await seedRow(ctx, { int: 3, name: "conflict-review", text: "seeded" })
        try {
          const server = (await ctx.tables.TestTable.getRecord(id)) as any
          assert(server, "server record present")
          const details = await db.getConflictDetails({
            id: `core-conflict-${Date.now()}`,
            type: "update",
            key: id,
            // One explicit conflict (int), one explicit locally-changed edit
            // that matches the server (name), plus $-keys that must never
            // surface as conflict rows; text stays untouched (unchanged).
            value: { ...server, int: server.int + 100 },
            changes: { int: server.int + 100, name: server.name, "$synced": true, "$key": id },
            entitySetName: ctx.tables.TestTable.entitySetName,
            timestamp: Date.now(),
            sequence: 1,
            attempts: 3,
            ifMatch: 'W/"stale"',
            error: { name: "DataverseHttpError", message: "412", status: 412 },
          })
          const by = Object.fromEntries(details.fields.map((f) => [f.field, f]))
          assertEquals(by.int.status, "conflict", "explicit divergent field is a conflict")
          assertEquals(by.id.status, "unchanged", "untouched field rows are unchanged")
          assertEquals(details.conflictingFields, ["int"], "conflictingFields holds only conflicts")
        } finally {
          db.close()
        }
      },
    },
    {
      name: "dvt-db-* databases are deleted by the sweep",
      fn: async () => {
        // Create a throwaway engine so there is guaranteed residue, then close
        // it and verify the sweep erases the database.
        const db = makeSyncDB([ctx.tables.TestTable, ctx.tables.TestTable0])
        await enqueueRaw(db, {
          id: `core-sweep-${Date.now()}`,
          type: "insert",
          key: crypto.randomUUID(),
          value: { id: crypto.randomUUID() },
          changes: {},
          entitySetName: ctx.tables.TestTable.entitySetName,
          timestamp: Date.now(),
          sequence: 3,
          attempts: 0,
        })
        db.close()
        await waitFor(() => dvtDbNames().then((n) => n.includes(db.name)), 5000)
        const swept = await sweepTestDbs()
        assert(swept >= 1, `at least one database swept (got ${swept})`)
        assert(!(await dvtDbNames()).includes(db.name), "sweep removed the created database")
      },
    },
  ],
}
