// @vitest-environment node
import { expect, test } from "vitest";
// The notification + conflict tests exercise real IndexedDB usage — Node has
// no indexedDB global, so the in-memory shim (installed as a dev dependency)
// stands in for the browser API.
import "fake-indexeddb/auto";
import { isConcurrencyError, isKeyViolation, DataverseSyncDB, type QueuedMutation } from "../src/tanstack-db";
import { DataverseHttpError } from "../src";
import { DataverseClient } from "../src/client";
import { DataverseTable, file, image, primaryKey, string } from "../src";

// --- serializeMutation proxy stripping ---

test("serializeMutation strips proxies so the payload is structuredClone-safe", () => {
  const table = new DataverseTable({
    client: new DataverseClient({ url: "https://org.crm.dynamics.com/api/data/v9.2" }),
    entitySetName: "contacts",
    logicalName: "contact",
    fields: { id: primaryKey("contactid"), name: string("fullname") },
  });
  const db = new DataverseSyncDB("test-db", [table], 1);

  // Simulate a row that passed through a live-query join: the record itself
  // and its nested values are wrapped in (structurally un-cloneable) proxies.
  const proxiedRow = new Proxy({ id: "guid-1", name: "Ada", nested: { etag: "W/\"1\"" } }, {
    get(target, prop) { return target[prop as keyof typeof target]; },
  });
  const proxiedChanges = new Proxy({ name: "Grace" }, {
    get(target, prop) { return target[prop as keyof typeof target]; },
  });

  const queued = db.serializeMutation({
    mutationId: "m1",
    type: "update",
    key: "guid-1",
    modified: proxiedRow,
    changes: proxiedChanges,
    collection: { id: "contacts" },
    createdAt: new Date(),
  } as any);

  // structuredClone is exactly what IndexedDB/BroadcastChannel do under the
  // hood — this used to throw "could not be cloned" for proxied rows.
  const cloned = structuredClone(queued);
  expect(cloned.value).toEqual({ id: "guid-1", name: "Ada", nested: { etag: "W/\"1\"" } });
  expect(cloned.changes).toEqual({ name: "Grace" });
  expect(cloned.value).not.toBe(proxiedRow);
  db.close();
});

test("serializeMutation preserves binary payloads (file/image upload channels)", async () => {
  const table = new DataverseTable({
    client: new DataverseClient({ url: "https://org.crm.dynamics.com/api/data/v9.2" }),
    entitySetName: "accounts",
    logicalName: "account",
    fields: { id: primaryKey("accountid"), photo: image("entityimage"), doc: file("myfile") },
  });
  const db = new DataverseSyncDB("test-db-bin", [table], 1);

  const blob = new Blob(["binary"], { type: "image/png" });
  const queued = db.serializeMutation({
    mutationId: "m2",
    type: "update",
    key: "guid-2",
    modified: { id: "guid-2", photo: { data: blob }, doc: { name: "report.pdf", data: blob } },
    changes: { photo: { data: blob }, doc: { name: "report.pdf", data: blob } },
    collection: { id: "accounts" },
    createdAt: new Date(),
  } as any);

  const cloned = structuredClone(queued);
  // The Blob must survive as a Blob, not be degraded to {} — otherwise the
  // `value.data instanceof Blob` check in the field afterSave hooks fails and
  // the upload silently never happens.
  expect(cloned.changes.photo.data).toBeInstanceOf(Blob);
  expect(cloned.changes.doc.data).toBeInstanceOf(Blob);
  expect(cloned.changes.doc.name).toBe("report.pdf");
  await expect(cloned.changes.photo.data.text()).resolves.toBe("binary");
  db.close();
});

// --- isConcurrencyError ---

test("isConcurrencyError detects 412 responses from DataverseHttpError", () => {
  const conflict = new DataverseHttpError("412 Precondition Failed", 412, "Precondition Failed", undefined);
  expect(isConcurrencyError(conflict)).toBe(true);
  expect(isConcurrencyError(new DataverseHttpError("409 Conflict", 409, "Conflict", undefined))).toBe(false);
  expect(isConcurrencyError(new Error("412 part of 4123"))).toBe(false);
  expect(isConcurrencyError(undefined)).toBe(false);
});

test("isConcurrencyError detects serialized errors after an IndexedDB round-trip", () => {
  // After a page reload, stored errors are plain objects — instanceof fails,
  // so detection must rely on the persisted status property shape.
  const stored = structuredClone({
    name: "DataverseHttpError",
    message: "412 Precondition Failed",
    status: 412,
    statusText: "Precondition Failed",
    body: {},
  });
  expect(isConcurrencyError(stored)).toBe(true);
  expect(isConcurrencyError(structuredClone({ status: 409, message: "conflict" }))).toBe(false);
  expect(isConcurrencyError({ message: "no status" })).toBe(false);
});

test("isKeyViolation detects DuplicateRecordEntityKey errors", () => {
  // The exact error shape the user reported: a duplicate alternate key
  // surfacing as HTTP 412 with the Dataverse error body preserved.
  const violation412 = {
    name: "DataverseHttpError", message: "412 Entity Key Project ID violated.",
    status: 412, statusText: "Precondition Failed",
    body: {
      code: "0x80060892",
      message: "Entity Key Project ID violated. A record with the same value for Project already exists. A duplicate record cannot be created. Select one or more unique values and try again.",
    },
  };
  expect(isKeyViolation(violation412)).toBe(true);
  // A key violation is NOT a resolvable etag conflict — Force/Rebase must
  // not be offered for it even though the status is 412.
  expect(isConcurrencyError(violation412)).toBe(false);

  // Duplicate detection result with a distinct code.
  expect(isKeyViolation({
    status: 409, body: { code: "0x80040333", message: "A record was not created because a duplicate already exists" },
  })).toBe(true);

  // Zero-code fallback via the canonical message fragment.
  expect(isKeyViolation({
    status: 412, body: { code: "0x0", message: "A duplicate record cannot be created." },
  })).toBe(true);

  // A genuine etag conflict is NOT a key violation.
  const conflict = structuredClone({
    name: "DataverseHttpError", message: "412 Precondition Failed",
    status: 412, statusText: "Precondition Failed",
    body: { code: "0x80060891", message: "Precondition Failed: etag mismatch." },
  });
  expect(isKeyViolation(conflict)).toBe(false);
  expect(isConcurrencyError(conflict)).toBe(true);

  expect(isKeyViolation(undefined)).toBe(false);
  expect(isKeyViolation(new Error("boom"))).toBe(false);
});

// --- mutation-change notifications ---

test("onMutationsChanged fires when mutations are enqueued", async () => {
  const table = new DataverseTable({
    client: new DataverseClient({ url: "https://org.crm.dynamics.com/api/data/v9.2" }),
    entitySetName: "tasks",
    logicalName: "task",
    fields: { id: primaryKey("activityid"), subject: string("subject") },
  });
  const db = new DataverseSyncDB("test-db-notify", [table], 1);
  const events: number[] = [];
  const unsub = db.onMutationsChanged(() => events.push(events.length));
  await db.queueMutations([{
    id: "n1", type: "update", key: "guid-n", value: { id: "guid-n", subject: "x" }, changes: { subject: "x" },
    entitySetName: "tasks", timestamp: Date.now(), sequence: 1, attempts: 0,
  }]);
  expect(events).toHaveLength(1);
  unsub();
  await db.queueMutations([{
    id: "n2", type: "update", key: "guid-n2", value: { id: "guid-n2", subject: "y" }, changes: { subject: "y" },
    entitySetName: "tasks", timestamp: Date.now(), sequence: 2, attempts: 0,
  }]);
  expect(events).toHaveLength(1); // unsubscribed listener not called again
  db.close();
});

// --- retry resolution is re-chosen per retry, never accumulated ---

test("retryErroredMutation un-forces a previously forced mutation on a plain retry", async () => {
  const table = new DataverseTable({
    client: new DataverseClient({ url: "https://org.crm.dynamics.com/api/data/v9.2" }),
    entitySetName: "tasks",
    logicalName: "task",
    fields: { id: primaryKey("activityid"), subject: string("subject") },
  });
  const db = new DataverseSyncDB("test-db-force", [table], 1);
  const unlock = stubNavigatorOffline();
  try {
    const errored: QueuedMutation = {
      id: "f1", type: "update", key: "guid-f", value: { id: "guid-f", subject: "x" },
      changes: { subject: "x" }, entitySetName: "tasks", timestamp: Date.now(),
      sequence: 1, attempts: 3, error: { name: "DataverseHttpError", message: "412", status: 412 },
      ifMatch: 'W/"1"',
    };
    // Seed the errored store directly (flush-only paths are locked/networked).
    const dbi = await (db as any).getDB();
    await dbi.put(db.ERRORED_MUTATIONS_NAME, errored);

    // 1. Force it: bare precondition, flag set.
    await db.retryErroredMutation("f1", { force: true });
    let queued = await dbi.get(db.MUTATION_QUEUE_NAME, "f1");
    expect(queued.force).toBe(true);
    expect(queued.ifMatch).toBeUndefined();

    // Move it back to errored for the next scenario.
    await dbi.put(db.ERRORED_MUTATIONS_NAME, queued);
    await dbi.delete(db.MUTATION_QUEUE_NAME, "f1");

    // 2. Now retry *plainly*: force must be cleared, and — critically — the
    // etag must be restored from the etag cache, because a bare precondition
    // would silently behave like force again.
    // Seed the freshest-known etag the way a prior successful write would.
    (db as any).keyEtags.set("guid-f", 'W/"2"');
    await db.retryErroredMutation("f1");
    queued = await dbi.get(db.MUTATION_QUEUE_NAME, "f1");
    expect(queued.force).toBeFalsy();
    expect(queued.ifMatch).toBe('W/"2"');
    // Retry vitals were reset too.
    expect(queued.attempts).toBe(0);
    expect(queued.error).toBeUndefined();
  } finally {
    unlock();
    db.close();
  }
});

function stubNavigatorOffline(): () => void {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", {
    value: {
      onLine: false,
      // flushQueue takes the lock before looping; the callback runs inline so
      // tests exercising flushQueue directly can drive it synchronously.
      locks: { request: async (_name: string, cb: () => Promise<void>) => cb() },
    },
    configurable: true,
  });
  return () => {
    if (descriptor) Object.defineProperty(globalThis, "navigator", descriptor);
    else delete (globalThis as { navigator?: unknown }).navigator;
  };
}

// --- getConflictDetails excludes row metadata keys ---

test("getConflictDetails ignores $-prefixed metadata keys", async () => {
  const table = new DataverseTable({
    client: new DataverseClient({ url: "https://org.crm.dynamics.com/api/data/v9.2" }),
    entitySetName: "tasks",
    logicalName: "task",
    fields: { id: primaryKey("activityid"), subject: string("subject"), priority: string("prioritycode") },
  });
  const db = new DataverseSyncDB("test-db-meta", [table], 1);
  const unlock = stubNavigatorOffline();
  // Stub the server snapshot: subject matches local, priority was
  // concurrently changed. Also carries metadata keys as real rows do.
  (db as any).tables.set("tasks", {
    ...table,
    getRecord: async () => ({ id: "guid-c", subject: "local edit", priority: "urgent", $etag: 'W/"9"' }),
  });
  try {
    const details = await db.getConflictDetails({
      id: "c1", type: "update", key: "guid-c",
      value: { id: "guid-c", subject: "local edit", priority: "low", "$synced": 1, "$origin": "op-1", "$key": "guid-c", "$collectionId": "tasks" },
      changes: { subject: "local edit", priority: "low", "$synced": 2, "$key": "guid-c" },
      entitySetName: "tasks", timestamp: Date.now(), sequence: 1, attempts: 0,
    });
    // Only the genuinely-differing real column is flagged; the $-keys the
    // TanStack DB layer adds to rows are never present server-side and
    // must not show up as conflicts.
    expect(details.conflictingFields).toEqual(["priority"]);
  } finally {
    unlock();
    db.close();
  }
});

test("getConflictDetails detects edits that live in `value` when `changes` is bookkeeping-only", async () => {
  // Reproduces the reported bug: with rowUpdateMode "full" the changes delta
  // can contain only $-keys, while the real local edit (description "Edge"
  // vs server "Chrome") exists only in the full optimistic row. Diffing
  // `changes` alone reported "no fields differ" — a standard retry was
  // suggested for what is a real conflict.
  const table = new DataverseTable({
    client: new DataverseClient({ url: "https://org.crm.dynamics.com/api/data/v9.2" }),
    entitySetName: "tankStructuralItems",
    logicalName: "c220a_tankstructuralitem",
    fields: { id: primaryKey("tankStructuralItemId"), description: string("description") },
  });
  const db = new DataverseSyncDB("test-db-fullmode", [table], 1);
  const unlock = stubNavigatorOffline();
  (db as any).tables.set("tankStructuralItems", {
    ...table,
    getRecord: async () => ({
      id: "guid-k", description: "Chrome", createdon: "2026-02-09T21:12:15.000Z", $etag: 'W/"109481402"',
    }),
  });
  try {
    const details = await db.getConflictDetails({
      id: "c2", type: "update", key: "guid-k",
      value: {
        id: "guid-k", description: "Edge", createdon: "2026-02-09T21:12:15.000Z",
        $etag: 'W/"109481374"', "$synced": true, "$origin": "remote",
        "$key": "guid-k", "$collectionId": "tankStructuralItems",
      },
      changes: { "$synced": true, "$origin": "remote", "$key": "guid-k", "$collectionId": "tankStructuralItems" },
      entitySetName: "tankStructuralItems", timestamp: Date.now(), sequence: 0, attempts: 3,
      ifMatch: 'W/"109481374"',
      error: { name: "DataverseHttpError", message: "412", status: 412 },
    });
    expect(details.conflictingFields).toEqual(["description"]);
  } finally {
    unlock();
    db.close();
  }
});

test("flushQueue substitutes the full row when a queued update's changes are bookkeeping-only", async () => {
  const table = new DataverseTable({
    client: new DataverseClient({ url: "https://org.crm.dynamics.com/api/data/v9.2" }),
    entitySetName: "tankStructuralItems",
    logicalName: "c220a_tankstructuralitem",
    fields: { id: primaryKey("tankStructuralItemId"), description: string("description") },
  });
  const db = new DataverseSyncDB("test-db-metaonly", [table], 1);
  const unlock = stubNavigatorOffline();
  const sent: unknown[] = [];
  (db as any).tables.set("tankStructuralItems", {
    ...table,
    updateRecord: async (_id: unknown, changes: unknown) => {
      sent.push(changes);
      return { id: "guid-m", $etag: 'W/"2"' };
    },
  });
  try {
    const dbi = await (db as any).getDB();
    await dbi.put(db.MUTATION_QUEUE_NAME, {
      id: "m1", type: "update", key: "guid-m",
      value: { id: "guid-m", description: "Edge", "$synced": true, "$origin": "remote", "$key": "guid-m", "$collectionId": "tankStructuralItems" },
      changes: { "$synced": true, "$origin": "remote", "$key": "guid-m", "$collectionId": "tankStructuralItems" },
      entitySetName: "tankStructuralItems", timestamp: Date.now(), sequence: 1, attempts: 0,
      ifMatch: 'W/"1"',
    } satisfies QueuedMutation);
    await (db as any).flushQueue();
    // The full optimistic row — not the $-key-only delta — must be what is
    // written to Dataverse, otherwise "Rebase changes" silently drops the
    // actual edit.
    expect(sent).toHaveLength(1);
    expect((sent[0] as Record<string, unknown>).description).toBe("Edge");
  } finally {
    unlock();
    db.close();
  }
});
