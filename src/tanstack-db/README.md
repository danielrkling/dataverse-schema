# `@tanstack/db` integration

This package ships a second entry point, `dataverse-schema/tanstack-db`, that adapts
`DataverseTable` to [`@tanstack/db`](https://tanstack.com/db) collections. It provides
two ways to bind a table to a live, reactive collection:

| Export | Mode | Persistence |
|---|---|---|
| `dataverseCollectionOptions` | **Online** | Polls Dataverse directly; writes go straight through. |
| `DataverseSyncDB.createCollectionOptions` | **Offline-capable** | Queues mutations in IndexedDB, flushes when online, cross-tab via `BroadcastChannel`. |

Both return a standard `@tanstack/db` `CollectionConfig`, so everything downstream
(queries, reactivity, `collection.insert/update/delete`, `utils`) works the same way.

```bash
npm i dataverse-schema @tanstack/db
```

> `@tanstack/db` is an **optional peer dependency**. Import from
> `dataverse-schema/tanstack-db` only when you actually use this integration.

---

## Online collection (`dataverseCollectionOptions`)

A polling collection that syncs the table's rows from Dataverse and writes mutations
straight back to the API.

```typescript
import { createCollection } from "@tanstack/db";
import {
  DataverseClient,
  DataverseTable,
  primaryKey,
  string,
  number,
} from "dataverse-schema";
import { dataverseCollectionOptions } from "dataverse-schema/tanstack-db";

const client = new DataverseClient();
const Account = new DataverseTable({
  entitySetName: "accounts",
  logicalName: "account",
  client,
  fields: {
    id: primaryKey("accountid"),
    name: string("name"),
    revenue: number("revenue"),
  },
});

const collection = createCollection(
  dataverseCollectionOptions({ table: Account, syncInterval: 15000 }),
);

// React to changes
collection.subscribeChanges((changes) => {
  for (const c of changes) console.log(c.type, c.key, c.value);
});

// Mutate — writes through to Dataverse
await collection.insert({ id: crypto.randomUUID(), name: "Acme", revenue: 1000 });
await collection.update(accountId, (draft) => { draft.revenue = 2000; });
await collection.delete(accountId);

// Pull external changes immediately
const utils = collection.utils; // { forceSync, table }
await utils.forceSync();
```

### Options (`DataverseCollectionConfig`)

| Option | Type | Default | Description |
|---|---|---|---|
| `table` | `DataverseTable<T>` | — | The table to bind (required). |
| `syncInterval` | `number` | `30000` | Poll interval in ms for background re-sync. |
| `readonly` | `boolean` | `false` | When `true`, **all** insert/update/delete mutations are rejected before touching Dataverse. Use for reference/lookup tables you don't want edited. |
| `readOnlyWhenOffline` | `boolean` | `false` | Reserved for parity; the online collection has no local queue, so offline writes simply surface a network error. |

In addition, any standard `@tanstack/db` `CollectionConfig` fields (except `sync`,
`getKey`, `onInsert`, `onUpdate`, `onDelete`, which are provided for you) may be
passed through.

### `utils` (per-collection)

`createCollection` exposes `collection.utils` typed as `DataverseCollectionUtils<T>`:

- `forceSync(): Promise<void>` — re-run the sync immediately (e.g. after an out-of-band change).
- `table: DataverseTable<T>` — the bound table.

The collection also syncs **immediately on creation** (`startSync: true`) and propagates
mutations to other tabs via a `BroadcastChannel` keyed by the entity-set name
(`MUTATIONS_ADDED` / `ABORT_ACTIVE_FETCHES`), so a change in one tab shows up in
another without waiting for the next poll.

---

## Offline-capable collection (`DataverseSyncDB`)

For apps that must keep working with no/flaky connectivity, wrap one or more tables in a
`DataverseSyncDB`. Mutations are written to an IndexedDB queue, flushed to Dataverse
when online, and shared across browser tabs.

```typescript
import { createCollection } from "@tanstack/db";
import { DataverseSyncDB, dataverseCollectionOptions } from "dataverse-schema/tanstack-db";
// NOTE: dataverseCollectionOptions is the ONLINE builder; for offline use
// DataverseSyncDB.createCollectionOptions (see below).

const db = new DataverseSyncDB("my-app-cache", [Account, Contact], 1);

const collection = createCollection(
  db.createCollectionOptions({
    table: Account,
    syncInterval: 20000,
    requireVisible: false, // sync even when the document is hidden
  }),
);

// Inserts/updates/deletes are queued locally and flushed automatically when online.
await collection.insert({ id: crypto.randomUUID(), name: "Acme", revenue: 1000 });

// Inspect / recover the queue
const queued = await db.getQueueCount();            // number of pending mutations
const errored = await db.getErroredMutations();      // mutations that exhausted retries
for (const m of errored) await db.retryErroredMutation(m.id);
// or await db.discardErroredMutation(m.id);

// Manual flush + re-sync
await collection.utils.forceSync();

// Always release the DB when the app tears down.
db.close();
```

### `DataverseSyncDB`

```typescript
new DataverseSyncDB(name: string, tables: DataverseTable<GenericProperties>[], version: number)
```

- `name` — also the **IndexedDB database name** and the **`BroadcastChannel` name**.
  Use a unique name per app/schema; two instances with the same name share the lock and
  channel (that's how cross-tab coordination works).
- `tables` — every `DataverseTable` you'll bind via `createCollectionOptions`. Registering
  a table not passed here makes its queued mutations land in the "errored" store.
- `version` — IndexedDB schema version (used by `openDB` `upgrade`).

#### Methods

| Method | Returns | Description |
|---|---|---|
| `createCollectionOptions<T>(config)` | `CollectionConfig` | Build a `@tanstack/db` collection config backed by this DB. |
| `getQueueCount()` | `Promise<number>` | Count of pending (not-yet-flushed) mutations. |
| `getErroredMutations()` | `Promise<QueuedMutation[]>` | Mutations that exhausted retry attempts. |
| `retryErroredMutation(id)` | `Promise<void>` | Reset attempts and re-enqueue a failed mutation (flushes if online). |
| `discardErroredMutation(id)` | `Promise<void>` | Permanently drop a failed mutation. |
| `queueMutations(mutations)` | `Promise<void>` | Low-level: persist raw queued mutations (throws `MutationPersistenceError` on failure). |
| `close()` | `void` | Abort in-flight fetches, close the channel + IndexedDB, clear timers. Call on teardown. |

### Options (`DataverseOfflineCollectionConfig`)

Extends the online `DataverseCollectionConfig`, plus:

| Option | Type | Default | Description |
|---|---|---|---|
| `requireVisible` | `boolean` | `true` | When `true`, remote sync/flush only runs while `document.visibilityState === "visible"`. Set `false` to sync regardless (useful inside non-visible web resources). |
| `readOnlyWhenOffline` | `boolean` | `false` | Reject mutations while offline (they'd otherwise just queue and flush later). |
| `readonly` | `boolean` | `false` | Reject **all** mutations regardless of connectivity — for reference tables. |

### Offline `utils`

Same shape as the online collection: `collection.utils.forceSync()` (flush queued
mutations **and** re-pull from Dataverse) and `collection.utils.table`.

### `QueuedMutation` / `MutationPersistenceError`

- `QueuedMutation` — the persisted shape in IndexedDB (`id`, `type`, `key`, `value`,
  `entitySetName`, `attempts`, `ifMatch`, `nextAttemptAt`, `error`, …).
- `MutationPersistenceError` — thrown by `queueMutations` when IndexedDB writes fail.
  Carries `mutationIds: string[]` and the original `cause`.

---

## Retry / durability behavior

- Failed flushes retry with **exponential backoff** (`1s, 2s, 4s …`, capped at 60s).
- A delayed retry **self-heals**: a timer wakes `flushQueue` when the soonest
  `nextAttemptAt` is due, so a failed mutation re-attempts even while idle and online.
- After `MAX_MUTATION_ATTEMPTS` (3) failures, the mutation moves to the **errored**
  store (`getErroredMutations`) instead of blocking the queue.
- The IndexedDB queue survives page reloads: reopen the same `DataverseSyncDB` name and
  queued mutations flush on the next online sync.

---

## Cross-tab coordination (both modes)

Both adapters broadcast a `BroadcastChannel` keyed by the collection/entity-set id:

- `MUTATIONS_ADDED` — a mutation applied in one tab is written into sibling collections
  immediately (and, for the offline adapter, into the local IndexedDB cache).
- `ABORT_ACTIVE_FETCHES` — a mutation in one tab aborts in-flight server pulls in other
  tabs so they re-sync promptly.

This means a create/update/delete in one browser tab is reflected in other tabs without
waiting for the next poll.

---

## Notes & caveats

- The offline collection uses `rowUpdateMode: "full"`; the online collection uses
  `"partial"`.
- `@tanstack/db` collections only start syncing immediately because both builders set
  `startSync: true`. If you build collections manually, ensure you either set
  `startSync: true` or attach a subscriber.
- `readonly` / `readOnlyWhenOffline` rejections happen **before** any network call or
  queue write, so they're safe to use for guarding reference data.
- This entry point is browser-only (uses `IndexedDB`, `BroadcastChannel`,
  `navigator.onLine`). It is not intended for Node.js or SSR.
