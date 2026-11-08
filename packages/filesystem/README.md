# filesystem-schema

A strongly-typed TypeScript library that uses the **File System Access API** as a local database. Pick a root folder, declare tables with the same field/schema conventions as `dataverse-schema` and `sharepoint-schema`, and get type-safe CRUD over plain JSON files.

- **One root folder** — verified with an `fsdb.json` manifest containing a `version` and `brandId`; opening an inconsistent folder throws.
- **Folder-backed tables** — each table is a folder, each record is an `<id>.json` file.
- **Single-file tables** — all records live in one JSON array file inside a table folder (`<table>/data.json`).
- **Schema-style fields** — `text`, `number`, `bool`, `date`, `datetime`, `json`, `choice`, `multiChoice`, `primaryKey`, phantom `T` inference, and Standard Schema validation.
- **Plain record reads** — `getRecord` / `getRecords` return normal typed objects/arrays; filter, sort, and project them in memory with ordinary JavaScript.
- **Opt-in retry policy** — rescues transient `locked`/`io-error` failures on reads; writes and deletes require explicit opt-in.
- **Optimistic concurrency** — records carry a `$rev`; pass it as `ifMatch` to reject stale writes.
- **Soft delete / trash** — move deleted records into `<table>/.meta/trash/` and restore or purge them.
- **Managed timestamps + history** — optional `createdAt`/`updatedAt` fields and per-record snapshots.
- **Live change detection** — Chromium `FileSystemObserver`-backed `table.watch(...)`.
- **Persisted handles** — store the picked root in IndexedDB and auto-load it on the next visit.
- Zero runtime dependencies beyond `@standard-schema/spec` (type-only).

## Installation

```bash
npm i filesystem-schema
```

## Quick start

```ts
import {
  FileSystemDatabase,
  pickRoot,
  primaryKey,
  text,
  bool,
  date,
  choice,
  InferTable,
} from "filesystem-schema";

// 1. Ask the user for a root folder (Chromium, secure context).
const root = await pickRoot({ mode: "readwrite" });

// 2. Provision it once, then reopen/verify it.
await FileSystemDatabase.initialize(root, { version: 1, brandId: "com.acme.app" });
const db = await FileSystemDatabase.open(root, { version: 1, brandId: "com.acme.app" });

// 3. Declare a table. The key is the TypeScript property; the factory argument
//    is the key written to JSON.
const Tasks = db.table({
  name: "tasks",
  fields: {
    id: primaryKey(),                 // string, defaults to "id"
    title: text("title"),
    done: bool("done"),
    due: date("due"),
    status: choice("status", { choices: ["Draft", "Done"] as const }),
  },
});

type Task = InferTable<typeof Tasks>;
// { id: string; title: string; done: boolean; due: Date | null; status: "Draft" | "Done" | null }

// 4. CRUD
const task = await Tasks.createRecord({ title: "Ship it", status: "Draft" });
await Tasks.updateRecord(task.id, { status: "Done", done: true });
const same = await Tasks.getRecord(task.id);
const all = await Tasks.getRecords();
await Tasks.deleteRecord(task.id);
```

The folder now looks like:

```text
acme-data/
  fsdb.json                 { "version": 1, "brandId": "com.acme.app" }
  tasks/
    .meta/
      table.json            table metadata
    <id>.json               one record
```

## Root manifest and consistency

`FileSystemDatabase.initialize` writes `fsdb.json`:

```json
{
  "version": 1,
  "brandId": "com.acme.app"
}
```

`FileSystemDatabase.open(root, { version, brandId })` reads it and throws a `FileSystemManifestError` when:

- the manifest is missing (`code: "missing"`),
- the shape is invalid (`code: "invalid"`),
- the version does not match (`code: "version"`),
- the brand id does not match (`code: "brand"`).

```ts
import { FileSystemManifestError, FileSystemDatabase } from "filesystem-schema";

try {
  const db = await FileSystemDatabase.open(root, { version: 2, brandId: "com.acme.app" });
} catch (error) {
  if (error instanceof FileSystemManifestError) {
    // error.code, error.manifest
  }
}
```

`initialize` is idempotent for the same manifest and refuses to replace a different one unless `{ overwrite: true }` is passed. `db.verify()` re-reads the manifest later.

## Table metadata

Every table folder contains `.meta/table.json`, created lazily before mutations
(or explicitly via `table.getMetadata()`):

```json
{
  "format": "filesystem-schema/table",
  "version": 1,
  "kind": "folder",
  "brandId": "com.acme.app",
  "primaryKey": "id",
  "trash": true,
  "history": { "limit": 20 },
  "timestamps": { "createdAt": "createdAt", "updatedAt": "updatedAt" },
  "createdAt": "2026-11-08T09:00:00.000Z",
  "updatedAt": "2026-11-08T09:00:00.000Z"
}
```

- `kind` is `"folder"` or `"single-file"`.
- `version` defaults to the root manifest version; override with
  `schemaVersion`.
- Reopening a table validates `brandId`, `kind`, and `primaryKey`; drift throws.
- The field schema stays in code — metadata describes storage layout and feature
  flags, not a second schema.

## Fields

| Factory | JSON value | Reads as |
|---|---|---|
| `text(name)` | string | `string` (missing ≡ `""`) |
| `title()` | `title` string sugar | `string` |
| `number(name)` | number | `number \| null` |
| `bool(name)` | boolean | `boolean` (missing ≡ `false`) |
| `date(name)` / `datetime(name)` | ISO string | `Date \| null` |
| `choice(name, { choices })` | string | the choice literal \| `null` |
| `multiChoice(name, { choices })` | string array | `string[]` (missing ≡ `[]`) |
| `json(name, { schema })` | any JSON | the schema's output type \| `null` |
| `primaryKey(name = "id")` | string | `string` |

Fields accept an optional Standard Schema `schema` option:

```ts
import * as v from "valibot";

const Tasks = db.table({
  name: "tasks",
  fields: {
    id: primaryKey(),
    title: text("title", { schema: v.pipe(v.string(), v.minLength(2)) }),
    meta: json("meta", { schema: v.object({ priority: v.number() }) }),
  },
  // Optional whole-record schema too:
  schema: v.object({ id: v.string(), title: v.string(), meta: v.nullish(v.any()) }),
});
```

Validation runs on reads and writes. Nullish values skip the field schema so a missing optional field does not fail just because a schema was supplied. Async schemas throw; the transform layer is synchronous (file I/O is async).

Phantom `T` properties match the other packages:

```ts
const Status = Tasks.fields.status.T; // "Draft" | "Done" | null
type TaskRow = typeof Tasks.T;        // the whole inferred record
```

## Folder tables

```ts
const Tasks = db.table({ name: "tasks", fields: { id: primaryKey(), title: text("title") } });

await Tasks.createRecord({ title: "A" });           // id generated via crypto.randomUUID()
await Tasks.createRecord({ id: "custom", title: "B" });
await Tasks.getRecord("custom");                    // record | null
await Tasks.getRecords();                           // sorted by id
await Tasks.hasRecord("custom");
await Tasks.updateRecord("custom", { title: "B2" }); // shallow merge; undefined = no-op, null = clear
await Tasks.upsertRecord("custom", { title: "B3" });
await Tasks.deleteRecord("custom");
```

- The record id is stored in the primary-key field **and** encoded into the file name.
- Ids with spaces/slashes are percent-encoded (`"a/b c"` → `a%2Fb%20c.json`) and read back losslessly. Keep ids case-insensitively unique on Windows/macOS, where file names are not case-sensitive.
- Unsafe table names and reserved Windows names (e.g. `CON`) throw instead of letting the OS sanitize them.
- Undeclared input keys are dropped, matching the other schema packages.
- `getRecords()` on a missing table folder returns `[]`; `getRecord(id)` returns `null`.

## Single-file tables

Use `db.singleFileTable(...)` when a small collection should be one JSON array
file inside its own table folder:

```ts
const Settings = db.singleFileTable({
  name: "settings",          // → <root>/settings/data.json
  fields: { id: primaryKey(), key: text("key"), value: number("value") },
});

await Settings.createRecord({ id: "theme", key: "theme", value: 1 });
const rows = await Settings.getRecords(); // same CRUD surface
```

- File content is a JSON array of record objects at `<table>/data.json`.
- Writes replace the whole file, so this layout is intended for small tables (settings, reference data). Use `db.table(...)` for larger collections. A singleton document is simply a single-file table containing one record.
- `fileName` overrides the data file name inside the table folder (`data.json` by default). The table folder name cannot be the root manifest file name.
- Missing primary keys, duplicate ids, and non-array file contents throw when read.

## Filtering in memory

There is deliberately no query builder: without an index there is no server-side
query to push down, so the library returns plain arrays and you use normal
JavaScript:

```ts
const tasks = await Tasks.getRecords();
const open = tasks
  .filter((task) => task.status === "Draft")
  .sort((a, b) => (a.due?.getTime() ?? Infinity) - (b.due?.getTime() ?? Infinity));
```

## Client helpers

```ts
import { pickRoot, ensurePermission } from "filesystem-schema";

const root = await pickRoot({ mode: "readwrite" }); // showDirectoryPicker()
if (!(await ensurePermission(root, "readwrite", { request: true }))) {
  throw new Error("write permission denied");
}
```

`pickRoot` throws a clear error when the API is unavailable (non-Chromium browser, insecure context, or Node). The library itself accepts any structural `FsDirectoryHandle`, so tests and non-browser hosts can inject their own implementation — see `test/memory-fs.ts`.

## Saving handles and auto-loading

Directory handles can be persisted in IndexedDB under a stable key (usually your
`brandId`) so users do not have to pick the folder every time:

```ts
import {
  initializeStoredDatabase,
  tryOpenStoredDatabase,
  resolveRootHandle,
  FileSystemDatabase,
} from "filesystem-schema";

// First run: pick a folder, write the manifest, and remember the handle.
const createdDb = await initializeStoredDatabase(
  "com.acme.app",
  { version: 1, brandId: "com.acme.app" },
  {},
  { mode: "readwrite" },
);

// Later visits: silent auto-load. Returns null if the handle is missing or the
// browser has reset its permission to "prompt".
const reopened = await tryOpenStoredDatabase("com.acme.app", {
  version: 1,
  brandId: "com.acme.app",
});

if (!reopened) {
  // Ask from a click handler; requestPermission needs a user gesture.
  const root = await resolveRootHandle("com.acme.app", {
    mode: "readwrite",
    requestPermission: true,
  });
  const db = await FileSystemDatabase.open(root, {
    version: 1,
    brandId: "com.acme.app",
  });
}
```

Lower-level helpers:

```ts
import {
  saveDirectoryHandle,
  loadDirectoryHandle,
  getStoredHandle,
  listStoredHandles,
  deleteDirectoryHandle,
  clearStoredHandles,
  tryLoadRootHandle,
} from "filesystem-schema";

await saveDirectoryHandle("com.acme.app", root);
const root = await loadDirectoryHandle("com.acme.app");       // handle | null
const info = await listStoredHandles();                        // metadata only
await deleteDirectoryHandle("com.acme.app");

// Permission-aware but never opens the picker:
const permitted = await tryLoadRootHandle("com.acme.app");     // handle | null
```

Important browser behavior: the handle itself survives a reload, but permission
often returns as `"prompt"`; requesting it requires a user gesture. Use
`tryLoadRootHandle`/`tryOpenStoredDatabase` for silent startup and
`resolveRootHandle`/`openStoredDatabase` from a “Reconnect” click. The default
store uses IndexedDB database `filesystem-schema`; pass `{ store }` for a custom
`HandleStore` or `{ databaseName }`/`{ factory }` to isolate the IndexedDB store.

## Errors and shared file servers

All File System Access failures are wrapped in a `FileSystemStorageError`
carrying a stable `code`, the `operation`, the relative `path`, and
table/record/root context. The original DOMException is available as
`originalError` (and `cause`).

```ts
import { FileSystemStorageError, isStorageError } from "filesystem-schema";

try {
  await Tasks.updateRecord(task.id, { title: "New title" });
} catch (error) {
  if (isStorageError(error, "locked")) {
    // another process holds the file, or the share is read-only
  } else if (isStorageError(error, "permission-denied")) {
    // re-request permission / show a picker
  }
}
```

| Code | Typical cause |
|---|---|
| `permission-denied` | `NotAllowedError`, `SecurityError`, `EACCES` |
| `locked` | `NoModificationAllowedError` / `InvalidModificationError` — another process holds the file, or the share is mounted read-only |
| `read-only` | `EROFS` |
| `quota-exceeded` | `QuotaExceededError`, `ENOSPC` |
| `io-error` | `NotReadableError`, `NetworkError`, `OperationError` — the network share disconnected mid-operation |
| `invalid-state` | `InvalidStateError` |
| `type-mismatch` | a file and directory share a name |
| `not-found` | the file/directory disappeared |
| `invalid-data` | encoding/decoding failure |
| `unsupported` | the browser/handle does not implement the operation |
| `conflict` | an `ifMatch` revision is stale |
| `unknown` | anything else |

`AbortError` passes through unchanged so standard cancellation semantics keep
working. Failed writes abort the writable stream (best effort) before throwing,
so a failed `close()` never resolves as a successful write.
`isRetryableStorageError(error)` marks `locked`, `io-error`, and `invalid-state`
as worth retrying with backoff on a flaky network share.

### Retries

Retries are **opt-in** and disabled by default. Supply a policy at the database
or table level:

```ts
const db = await FileSystemDatabase.open(root, {
  version: 1,
  brandId: "com.acme.app",
  retry: {
    attempts: 3,      // total attempts, including the first
    delayMs: 100,
    maxDelayMs: 2_000,
    backoff: 2,
    jitter: true,
  },
});

// Or override for one table:
const Tasks = db.table({
  name: "tasks",
  fields: { id: primaryKey(), title: text("title") },
  retry: { attempts: 5, retryWrites: false },
  // retry: false disables the database policy for this table
});
```

Defaults when a policy is present:

- `retryReads: true` — reads, directory listings, manifest reads, and idempotent directory creation retry transient failures.
- `retryWrites: false` — writes are attempted exactly once.
- `retryDeletes: false` — deletes are attempted exactly once.
- Only `locked`, `io-error`, and `invalid-state` are retried; permission,
  not-found, quota, validation, and invalid-data failures surface immediately.

**Why writes are off by default:** a failed `close()` or `removeEntry()` has an
ambiguous commit result. Retrying can duplicate a create, overwrite a concurrent
update, or turn a successful delete into a "not found" error. Set
`retryWrites: true` / `retryDeletes: true` only when your operation is safe to
repeat, and treat deletes as idempotent at the application level. A custom
`shouldRetry(error, operation)` callback can add narrower rules.

## Optimistic concurrency

Reads include a content revision as `$rev` (a fast non-cryptographic hash plus
length). Pass it back as `ifMatch` to reject a stale update or delete:

```ts
const task = await Tasks.getRecord("1");

// Somebody else writes before us...
await Tasks.updateRecord("1", { title: "Updated elsewhere" });

try {
  await Tasks.updateRecord("1", { title: "Mine" }, { ifMatch: task!.$rev });
} catch (error) {
  if (isStorageError(error, "conflict")) {
    // re-read and merge, or show a conflict UI
  }
}
```

- Every record from `getRecord`/`getRecords`/`createRecord`/`updateRecord` has `$rev`.
- Single-file tables use one file-level revision (any array write changes it).
- `ifMatch: "*"` bypasses the check.
- `FileSystemConflictError` exposes `expectedRevision` and `actualRevision`.
- There is still a check-to-write race: the File System Access API has no atomic
  compare-and-swap, so `$rev` detects realistic shared-drive conflicts but is not
  a distributed lock.

## Soft delete and trash

Enable trash on a table:

```ts
const Tasks = db.table({
  name: "tasks",
  fields: { id: primaryKey(), title: text("title") },
  trash: true,
});

await Tasks.deleteRecord("1");           // → <table>/.meta/trash/<snapshot>.json
const trash = await Tasks.listTrash();   // { id, deletedAt, fileName }[]
await Tasks.restoreRecord("1");          // newest trash entry wins
await Tasks.purgeTrash("1");             // permanently remove that id's entries
await Tasks.deleteRecord("1", { permanent: true }); // bypass trash
```

- `restoreRecord(id, { ifExists: "overwrite" })` can replace a live record;
  default is to throw.
- Trash entries preserve the raw record and deletion timestamp.
- Both table layouts keep trash under `<table>/.meta/trash/`.

## Timestamps and history

```ts
const Tasks = db.table({
  name: "tasks",
  fields: {
    id: primaryKey(),
    title: text("title"),
    createdAt: datetime("createdAt"),
    updatedAt: datetime("updatedAt"),
  },
  timestamps: true,
  history: { limit: 20 }, // 0 keeps every snapshot
});
```

- `timestamps` injects a `createdAt` on create and refreshes `updatedAt` on
  update. The named fields must be declared in `fields`.
- `history` writes the previous raw record to
  `<table>/.meta/history/<id>/<snapshot>.json` before updates and permanent
  deletes. Trash deletes are already snapshots, so history is skipped for them.
- `listHistory(id)` returns `{ fileName, savedAt }[]`, newest first.
- `restoreHistory(id, fileName)` restores a snapshot (default `ifExists:
  "overwrite"`).
- History snapshots are pruned to `limit` per record (default 20).

## Watching changes

Chromium’s `FileSystemObserver` is supported directly:

```ts
const stop = await Tasks.watch((event) => {
  if (event.type === "created" || event.type === "updated") {
    console.log(event.id, event.record);
  }
});

// later
stop();
```

- Folder tables observe the table folder and emit `created` / `updated` /
  `deleted` / `moved` events per `<id>.json`.
- Single-file tables observe their table folder's `data.json` and diff the array
  into per-record events.
- `{ loadRecord: false }` skips the follow-up read; `{ signal }` disconnects on
  abort; `onError` receives callback/read failures.
- `isFileSystemObserverSupported()` reports whether the API exists. There is no
  polling fallback.

### Shared file server caveats

- There is no distributed locking or transaction. Writes are last-write-wins;
  single-file tables replace the whole JSON array on every mutation.
- Directory listings can be stale. During batch reads a record that disappears
  between listing and reading is skipped; `getRecord` returns `null`. Writes and
  deletes surface lock/permission errors instead of retrying.
- Keep record ids case-insensitively unique on Windows/macOS shares.
- `$rev`/`ifMatch` is a best-effort optimistic check, not an atomic CAS. There
  is a small window between verification and commit.

## Sync engine

`FileSystemTable` structurally satisfies the generic offline sync engine's `SyncTable` contract (`entitySetName`, `primaryKey`, `fields`, `getPrimaryId`, CRUD). The package exports `syncTableCompat` as a compile-time/runtime assertion, matching `sharepoint-schema`.

## Development

```bash
# from the repository root
npm test
npm run typecheck

cd packages/filesystem
npx vitest run
npx tsc --noEmit
```

Tests use an in-memory directory handle and never touch a real filesystem or browser.
