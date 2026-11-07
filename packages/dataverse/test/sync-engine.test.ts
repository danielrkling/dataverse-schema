// @vitest-environment node
import { expect, test } from "vitest";
import "fake-indexeddb/auto";
import { SyncEngine, type SyncEngineOptions, type SyncTable, type QueuedMutation } from "../src/sync";

// Engine-level generic tests: exercise SyncEngine against stub SyncTables so
// the queue/retry/conflict machinery is verified independently of any product
// adapter. Product-integration coverage lives in
// packages/dataverse/test/sync.test.ts.

import { serializeError, isDeterministicFailure, isConcurrencyError } from "../src/sync/errors";

/** Node's navigator has neither `onLine` nor `locks` — stub a connected navigator. */
function stubNavigatorOnline() {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
    Object.defineProperty(globalThis, "navigator", {
        value: {
            onLine: true,
            locks: { request: async (_n: string, fn: () => Promise<void>) => fn() },
        },
        configurable: true,
    });
    return () => {
        if (descriptor) Object.defineProperty(globalThis, "navigator", descriptor);
        else delete (globalThis as { navigator?: unknown }).navigator;
    };
}

type StubState = Record<string, Record<string, any>>;

/** Status-shaped plain error ("http-like"): { status, statusText, body }. */
function httpError(status: number, body: unknown) {
    const err = new Error(`HTTP ${status}`) as Error & { status: number; statusText: string; body: unknown };
    err.status = status;
    err.statusText = String(status);
    err.body = body;
    return err;
}

function stubTable(name: string, state: StubState, failure?: Error): SyncTable {
    return {
        entitySetName: name,
        primaryKey: { key: "id" },
        fields: { id: {}, name: {}, n: {} },
        getPrimaryId: (v: any) => v?.id,
        async getRecord(id: string) {
            const row = state[name]?.[id];
            return row ? { ...row } : null;
        },
        async createRecord(value: any) {
            if (failure) throw failure;
            state[name] ??= {};
            const id = value.id ?? `row-${Object.keys(state[name]).length + 1}`;
            const row = { ...value, id, _etag: "w/1" };
            state[name][id] = row;
            return { ...row };
        },
        async updateRecord(id: string, value: any, options?: { ifMatch?: string }) {
            if (failure) throw failure;
            const row = state[name]?.[id];
            if (!row) throw httpError(404, { message: "missing" });
            if (options?.ifMatch && row._etag !== options.ifMatch.replace(/^W\//, "")) {
                throw httpError(412, { message: "etag mismatch" });
            }
            Object.assign(row, value, { _etag: `w/${(parseInt(row._etag.slice(2)) || 0) + 1}` });
            return { ...row };
        },
        async deleteRecord(id: string, _options?: { ifMatch?: string }) {
            if (failure) throw failure;
            delete state[name]?.[id];
            return id;
        },
    };
}

async function makeEngine(tables: SyncTable[], options?: Partial<SyncEngineOptions>) {
    const e = new SyncEngine({
        name: `sync-test-${Math.random().toString(36).slice(2)}`,
        version: 1,
        tables,
        getEtag: (v) => (v?._etag ? `W/${v._etag}` : undefined),
        flushOnOnline: false,
        ...options,
    });
    return e;
}

// --- flush: insert / update / delete through stub tables ---

test("engine flushes queued mutations through stub tables", async () => {
    const state: StubState = {};
    const e = await makeEngine([stubTable("todos", state)]);

    await e.queueMutations([
        { id: "m1", type: "insert", key: "row-1", value: { id: "row-1", name: "a" }, changes: {}, entitySetName: "todos", timestamp: 1, sequence: e.nextSequence(), attempts: 0 },
    ]);
    await e.flushQueue();

    expect(await e.getQueueCount()).toBe(0);
    expect(Object.keys(state.todos)).toHaveLength(1);
    await e.close();
});

// --- retry & errored store ---

test("transient failures exhaust the budget then land in the errored store", async () => {
    const state: StubState = {};
    stubNavigatorOnline();
    const e = await makeEngine([stubTable("todos", state, new Error("network down"))], { maxAttempts: 2, retryBaseDelay: 1, retryMaxDelay: 1 });

    await e.queueMutations([
        { id: "m1", type: "insert", key: "row-1", value: { id: "row-1", name: "a" }, changes: {}, entitySetName: "todos", timestamp: 1, sequence: e.nextSequence(), attempts: 0 },
    ]);
    await e.flushQueue();
    // backoff delay is 1ms; wait for the self-healing retry flush to run
    await new Promise((r) => setTimeout(r, 30));

    const errored = await e.getErroredMutations();
    expect(errored).toHaveLength(1);
    expect(errored[0].id).toBe("m1");

    // discard resolution empties the errored store
    await e.discardErroredMutation("m1");
    expect(await e.getErroredMutations()).toHaveLength(0);
    await e.close();
});

// --- conflict details ---

test("conflict details expose per-field diffs and conflictingFields", async () => {
    const state: StubState = {};
    const e = await makeEngine([stubTable("todos", state)]);

    state.todos = { "row-1": { id: "row-1", name: "server", n: 2, _etag: "w/5" } };
    const mutation: QueuedMutation = {
        id: "m1", type: "update", key: "row-1",
        value: { name: "local", n: 2 }, changes: { name: "local" },
        entitySetName: "todos", timestamp: 1, sequence: 0, attempts: 1,
        ifMatch: "W/w/4",
    };

    const details = await e.getConflictDetails(mutation);
    expect(details.conflictingFields).toContain("name");
    const byName = details.fields.find((f) => f.field === "name")!;
    expect(byName.status).toBe("conflict");
    expect(byName.local).toBe("local");
    expect(byName.server).toBe("server");
    await e.close();
});

// --- generic default error helpers ---

test("generic serializeError keeps status bodies clone-safe", () => {
    const stored = structuredClone(serializeError(httpError(412, { message: "etag mismatch" })));
    expect(stored).toEqual({ name: "Error", message: "HTTP 412", status: 412, statusText: "412", body: { message: "etag mismatch" } });
});

test("generic deterministic classification by status", () => {
    expect(isDeterministicFailure({ status: 412 })).toBe(true);
    expect(isDeterministicFailure({ status: 404 })).toBe(true);
    expect(isDeterministicFailure({ status: 400 })).toBe(true);
    expect(isDeterministicFailure({ status: 429 })).toBe(false);
    expect(isDeterministicFailure({ status: 401 })).toBe(false);
    expect(isDeterministicFailure({ status: 500 })).toBe(false);
    expect(isDeterministicFailure(new Error("transport"))).toBe(false);
    expect(isConcurrencyError({ status: 412 })).toBe(true);
    expect(isConcurrencyError({ status: 400 })).toBe(false);
});
