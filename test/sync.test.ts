// @vitest-environment node
import { expect, test } from "vitest";
// Engine-level tests exercise real IndexedDB usage — Node has no indexedDB
// global, so the in-memory shim stands in for the browser API.
import "fake-indexeddb/auto";
import { serializeMutation, plainClone } from "../src/tanstack-db";
import { DataverseClient, DataverseHttpError, DataverseTable, SyncEngine, isDeterministicFailure, interpretError, primaryKey, string, number, serializeError, type QueuedMutation } from "../src";

function makeTable(entitySetName = "tasks", logicalName = "task") {
  return new DataverseTable({
    client: new DataverseClient({ url: "https://org.crm.dynamics.com/api/data/v9.2" }),
    entitySetName,
    logicalName,
    fields: { id: primaryKey(`${logicalName}id`), subject: string("subject"), priority: number("prioritycode") },
  });
}

function stubNavigatorOffline(): () => void {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", { value: { onLine: false }, configurable: true });
  return () => {
    if (descriptor) Object.defineProperty(globalThis, "navigator", descriptor);
    else delete (globalThis as { navigator?: unknown }).navigator;
  };
}

/** Same, but forcing a connected (onLine: true) navigator — Node's real navigator has no `onLine` at all. */
function stubNavigatorOnline(): () => void {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", {
    value: { onLine: true, locks: { request: async (_n: string, fn: () => Promise<void>) => fn() } },
    configurable: true,
  });
  return () => {
    if (descriptor) Object.defineProperty(globalThis, "navigator", descriptor);
    else delete (globalThis as { navigator?: unknown }).navigator;
  };
}

const errored: QueuedMutation = {
  id: "x", type: "update", key: "k", value: { id: "k", subject: "s" },
  changes: { subject: "s" }, entitySetName: "tasks", timestamp: 0,
  sequence: 1, attempts: 3, error: { name: "DataverseHttpError", message: "412", status: 412 },
  ifMatch: 'W/"old"',
};

// --- engine sequence assignment ---

test("serializeMutation assigns monotonically increasing sequence numbers", () => {
  const table = makeTable();
  const engine = new SyncEngine({ name: "sync-seq", tables: [table], version: 1 });
  const mutation = {
    mutationId: "m", type: "update" as const, key: "k",
    modified: { id: "k", subject: "0" }, changes: { subject: "0" },
    collection: { id: "tasks" }, createdAt: new Date(),
  };
  const first = serializeMutation(engine, mutation as any);
  const second = serializeMutation(engine, { ...mutation, mutationId: "m2" } as any);
  const third = serializeMutation(engine, { ...mutation, mutationId: "m3" } as any);
  expect(first.sequence).toBe(0);
  expect(second.sequence).toBe(1);
  expect(third.sequence).toBe(2);
  expect(engine.nextSequence()).toBe(3);
  engine.close();
});

test("plainClone strips proxies and preserves binary/date values", () => {
  const blob = new Blob(["x"]);
  const date = new Date(2026, 8, 14);
  const row = new Proxy({ blob, date, nested: { a: 1 } }, { get: (t, p) => t[p as never] });
  const out = plainClone(row) as typeof row;
  // structuredClone is what IndexedDB does under the hood — the copy must be cloneable.
  const cloned = structuredClone(out);
  expect(cloned.date).toBeInstanceOf(Date);
  expect(cloned.date.getTime()).toBe(date.getTime());
  expect(cloned.nested).toEqual({ a: 1 });
  expect(cloned.blob).toBeInstanceOf(Blob);
});

// --- discard resolution ---

test("discardErroredMutation removes the mutation and notifies", async () => {
  const table = makeTable();
  const engine = new SyncEngine({ name: "sync-discard", tables: [table], version: 1 });
  const unlock = stubNavigatorOffline();
  try {
    const dbi = await (engine as any).getDB();
    await dbi.put(engine.ERRORED_MUTATIONS_NAME, { ...errored, id: "discard-me" });
    const events: number[] = [];
    const unsub = engine.onMutationsChanged(() => events.push(events.length));
    await engine.discardErroredMutation("discard-me");
    expect((await dbi.getAll(engine.ERRORED_MUTATIONS_NAME)).length).toBe(0);
    expect(events).toHaveLength(1);
    unsub();
  } finally {
    unlock();
    engine.close();
  }
});

// --- fetch-abort registry ---

test("abortActiveFetches aborts every tracked controller", () => {
  const table = makeTable();
  const engine = new SyncEngine({ name: "sync-abort", tables: [table], version: 1 });
  const controller = new AbortController();
  engine.trackActiveFetch(controller);
  engine.abortActiveFetches();
  expect(controller.signal.aborted).toBe(true);
  engine.close();
});

// --- rebase resolution ---

test("retryErroredMutation with useFreshEtag adopts the server's current etag", async () => {
  const table = makeTable();
  const engine = new SyncEngine({ name: "sync-rebase", tables: [table], version: 1 });
  const unlock = stubNavigatorOffline();
  try {
    // Server snapshot carries the freshest etag.
    (engine.tables.get("tasks") as any).getRecord = async () => ({ id: "k", $etag: 'W/"fresh"' });
    const dbi = await (engine as any).getDB();
    await dbi.put(engine.ERRORED_MUTATIONS_NAME, { ...errored, id: "rebase-me" });

    await engine.retryErroredMutation("rebase-me", { useFreshEtag: true });

    const queued = await dbi.get(engine.MUTATION_QUEUE_NAME, "rebase-me");
    // The stale etag must be replaced by the server's current one.
    expect(queued.ifMatch).toBe('W/"fresh"');
    expect(queued.force).toBe(false);
    expect(queued.attempts).toBe(0);
    // And the etag cache is primed so a sibling mutation for the same record
    // doesn't 412 against the old etag.
    expect((engine as any).keyEtags.get("k")).toBe('W/"fresh"');
    expect((await dbi.getAll(engine.ERRORED_MUTATIONS_NAME)).length).toBe(0);
  } finally {
    unlock();
    engine.close();
  }
});

test("rebase falls back to the freshest cached etag when the server is unreachable", async () => {
  const table = makeTable();
  const engine = new SyncEngine({ name: "sync-rebase-fallback", tables: [table], version: 1 });
  const unlock = stubNavigatorOffline();
  try {
    // Server fetch throws (network fail / offline).
    (engine.tables.get("tasks") as any).getRecord = async () => { throw new Error("unreachable") };
    const dbi = await (engine as any).getDB();
    await dbi.put(engine.ERRORED_MUTATIONS_NAME, { ...errored, id: "rebase-2", ifMatch: 'W/"stale"' });
    (engine as any).keyEtags.set("k", 'W/"cached"');

    await engine.retryErroredMutation("rebase-2", { useFreshEtag: true });

    const queued = await dbi.get(engine.MUTATION_QUEUE_NAME, "rebase-2");
    expect(queued.ifMatch).toBe('W/"cached"');
    expect(await dbi.get(engine.ERRORED_MUTATIONS_NAME, "rebase-2")).toBeUndefined();
  } finally {
    unlock();
    engine.close();
  }
});

// --- conflict details edge cases ---

test("getConflictDetails treats a deleted server record as conflicting on all proposed fields", async () => {
  const table = makeTable("leads", "lead");
  const engine = new SyncEngine({ name: "sync-conflict-deleted", tables: [table], version: 1 });
  const unlock = stubNavigatorOffline();
  try {
    (engine.tables.get("leads") as any).getRecord = async () => null;
    const details = await engine.getConflictDetails({
      id: "c", type: "update", key: "k",
      value: { id: "k", subject: "s" },
      changes: { subject: "s" },
      entitySetName: "leads", timestamp: 0, sequence: 1, attempts: 3,
    });
    // The server record is gone — every proposed real field is a conflict and
    // the row list includes the server value explicitly as undefined.
    const subject = details.fields.find((f) => f.field === "subject");
    expect(subject?.status).toBe("conflict");
    expect(subject?.local).toBe("s");
    expect(subject?.server).toBeUndefined();
    expect(details.server).toBeNull();
    expect(details.conflictingFields).toEqual(["subject"]);
  } finally {
    unlock();
    engine.close();
  }
});

test("retryErroredMutation resolves nothing when no such errored mutation exists", async () => {
  const table = makeTable();
  const engine = new SyncEngine({ name: "sync-retry-missing", tables: [table], version: 1 });
  const unlock = stubNavigatorOffline();
  try {
    await expect(engine.retryErroredMutation("nope")).resolves.toBeUndefined();
  } finally {
    unlock();
    engine.close();
  }
});

// --- error guidance ---

test("interpretError classifies the documented Dataverse failure modes", () => {
  const keyViolation = interpretError({
    name: "DataverseHttpError", message: "412", status: 412, body: {
      code: "0x80060892",
      message: "Entity Key Project ID violated. A record with the same value for Project already exists. A duplicate record cannot be created.",
    },
  });
  expect(keyViolation.category).toBe("key-violation");
  expect(keyViolation.codeName).toBe("DuplicateRecordEntityKey");
  expect(keyViolation.deterministic).toBe(true);

  const concurrency = interpretError({ status: 412, body: { code: "0x80060881", message: "etag mismatch" } });
  expect(concurrency.category).toBe("concurrency");
  expect(concurrency.deterministic).toBe(true);
});

test("interpretError treats statuses the way the retry loop needs", () => {
  expect(interpretError({ status: 404, body: {} }).category).toBe("missing-record");
  expect(interpretError({ status: 404 }).deterministic).toBe(true);
  expect(interpretError({ status: 429 }).category).toBe("throttled");
  expect(interpretError({ status: 429 }).deterministic).toBe(false);
  expect(interpretError({ status: 401 }).category).toBe("identity");
  expect(interpretError({ status: 401 }).deterministic).toBe(false);
  expect(interpretError({ status: 403 }).category).toBe("permission");
  expect(interpretError({ status: 403 }).deterministic).toBe(true);
  expect(interpretError({ status: 503 }).category).toBe("transient");
  expect(interpretError({ status: 503 }).deterministic).toBe(false);
  expect(interpretError({ status: 400, body: { message: "unrecognized property 'x'" } }).category).toBe("validation");
  expect(interpretError({ status: 400 }).deterministic).toBe(true);
  // No status at all = transport failure → transient.
  expect(interpretError(new TypeError("fetch failed")).category).toBe("transient");
  expect(interpretError(new TypeError("fetch failed")).deterministic).toBe(false);

  // Round-trip through serializeError (IndexedDB restore) keeps the guidance.
  const stored = structuredClone(serializeError(new DataverseHttpError(
    "412 Precondition Failed", 412, "Precondition Failed",
    { code: "0x80060892", message: "Entity Key Project ID violated. A record with the same value for Project already exists." },
  )));
  const restored = interpretError(stored);
  expect(restored.category).toBe("key-violation");
  expect(restored.codeName).toBe("DuplicateRecordEntityKey");
  expect(restored.deterministic).toBe(true);
});

test("isDeterministicFailure agrees with the guidance categories", () => {
  expect(isDeterministicFailure({ status: 412 })).toBe(true);
  expect(isDeterministicFailure({ status: 404 })).toBe(true);
  expect(isDeterministicFailure({ status: 400 })).toBe(true);
  expect(isDeterministicFailure({ status: 429 })).toBe(false);
  expect(isDeterministicFailure({ status: 500 })).toBe(false);
  expect(isDeterministicFailure({})).toBe(false);
});

// --- created-on override on flush ---

test("flushed inserts replay the offline transaction time as overriddencreatedon when enabled", async () => {
  const table = makeTable();
  const bodies: any[] = [];
  table.client.fetch = async (_url: any, init: any) => {
    bodies.push(JSON.parse(init.body as string));
    return { taskid: "generated", subject: "offline note", prioritycode: 1 };
  };
  const engine = new SyncEngine({ name: "sync-created-on-override", tables: [table], version: 1, overrideCreatedOn: true });
  try {
    const dbi = await (engine as any).getDB();
    const timestamp = new Date("2026-09-13T14:22:00Z").getTime();
    await dbi.put(engine.MUTATION_QUEUE_NAME, {
      id: "m1", type: "insert", key: "generated", value: { subject: "offline note", prioritycode: 1 },
      changes: { subject: "offline note" }, entitySetName: "tasks",
      timestamp, sequence: 1, attempts: 0,
    });
    await engine.flushQueue();
    expect(bodies[0].overriddencreatedon).toBe("2026-09-13T14:22:00.000Z");
    expect((await dbi.getAll(engine.MUTATION_QUEUE_NAME)).length).toBe(0);
  } finally {
    engine.close();
  }
});

test("flushed inserts omit overriddencreatedon when the engine option is off", async () => {
  const table = makeTable();
  const bodies: any[] = [];
  table.client.fetch = async (_url: any, init: any) => {
    bodies.push(JSON.parse(init.body as string));
    return { taskid: "generated", subject: "offline note", prioritycode: 1 };
  };
  const engine = new SyncEngine({ name: "sync-no-created-on-override", tables: [table], version: 1 });
  try {
    const dbi = await (engine as any).getDB();
    await dbi.put(engine.MUTATION_QUEUE_NAME, {
      id: "m2", type: "insert", key: "generated", value: { subject: "offline note", prioritycode: 1 },
      changes: { subject: "offline note" }, entitySetName: "tasks",
      timestamp: new Date("2026-09-13T14:22:00Z").getTime(), sequence: 1, attempts: 0,
    });
    await engine.flushQueue();
    expect(bodies[0].overriddencreatedon).toBeUndefined();
  } finally {
    engine.close();
  }
});

// --- engine options ---

test("maxAttempts moves a transient failure to the errored store after a single attempt", async () => {
  const table = makeTable();
  let calls = 0;
  table.client.fetch = async () => {
    calls++;
    throw new DataverseHttpError("500 Internal Server Error", 500, "Internal Server Error", {});
  };
  const engine = new SyncEngine({ name: "sync-max-attempts", tables: [table], version: 1, maxAttempts: 1 });
  let unlock = () => {};
  try {
    unlock = stubNavigatorOnline();
    const dbi = await (engine as any).getDB();
    await dbi.put(engine.MUTATION_QUEUE_NAME, {
      id: "m3", type: "update", key: "k", value: { id: "k", subject: "s" },
      changes: { subject: "s" }, entitySetName: "tasks",
      timestamp: 0, sequence: 1, attempts: 0, ifMatch: 'W/"e"',
    });
    await engine.flushQueue();
    expect(calls).toBe(1);
    expect((await dbi.getAll(engine.MUTATION_QUEUE_NAME)).length).toBe(0);
    const errored = await dbi.getAll(engine.ERRORED_MUTATIONS_NAME);
    expect(errored).toHaveLength(1);
    expect((errored[0] as any).attempts).toBe(1);
  } finally {
    unlock();
    engine.close();
  }
});
