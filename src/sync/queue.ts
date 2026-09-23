import { IDBPDatabase, openDB } from "idb";
import { type DataverseTable } from "../table";
import { type GenericProperties } from "../types";
import { getEtag } from "../util";
import { isConcurrencyError, isKeyViolation, serializeError } from "./classifiers";
import { isDeterministicFailure } from "./error-codes";
import { isMetaKey, isMetaOnly, valuesEqual } from "./util";
import { MutationPersistenceError, type QueuedMutation } from "./types";

/** Options for {@link SyncEngine} construction. */
export type SyncEngineOptions = {
    /** Name for the engine's IndexedDB database and BroadcastChannel. Unique per instance — two DBs with the same name share the flush lock. */
    name: string;
    /** Tables the engine can sync; keyed by `entitySetName`. */
    tables: DataverseTable<GenericProperties>[];
    /** Schema version for the IndexedDB database; grows when late-registered collections need new stores. */
    version: number;
    /**
     * When true, queued inserts replay with the offline transaction time as
     * `overriddencreatedon` (the "Record Created On" attribute), so the
     * record's `createdon` shows when it was created offline rather than
     * when the queue was flushed. Requires the flushing user's security
     * role to include `prvOverrideCreatedOnCreatedBy`.
     */
    overrideCreatedOn?: boolean;
    /**
     * Retry budget per mutation: failed mutations are re-attempted with
     * exponential backoff until they are sent this many times, then moved to
     * the errored store for operator resolution. Deterministic failures
     * (concurrency conflicts, key violations, validation) bypass the budget
     * and error immediately. Default 3.
     */
    maxAttempts?: number;
    /**
     * Base delay in ms for the exponential retry backoff
     * (`retryBaseDelay * 2^(attempt - 1)`, capped at `retryMaxDelay`).
     * Default 1000.
     */
    retryBaseDelay?: number;
    /**
     * Upper cap in ms for the retry backoff delay. Default 60000.
     */
    retryMaxDelay?: number;
    /**
     * When true (the default), the engine auto-flushes the mutation queue
     * whenever the tab comes back online. Turn off for test environments,
     * web workers (no `navigator.onLine`/Web Locks), or apps that flush only
     * on explicit user action.
     */
    flushOnOnline?: boolean;
};

const DEFAULT_MAX_MUTATION_ATTEMPTS = 3;
const DEFAULT_RETRY_BASE_DELAY = 1000;
const DEFAULT_RETRY_MAX_DELAY = 60000;

/**
 * Snapshot for presenting a conflicted mutation to a user: the server's
 * current authoritative record, and which of the mutation's fields the
 * server state actually differs on. A differing etag only *means*
 * something touched the record — the field diff is what makes "Force",
 * "Rebase" or "Discard" an informed choice instead of a blind button.
 */
export type ConflictDetails = {
    /**
     * The transformed server record (null when the record was deleted
     * server-side), including *all* of the table's fields — not just the
     * locally changed ones.
     */
    server: any | null;
    /**
     * One entry for every field defined on the table's `fields` map, in map
     * order — a ready-to-render conflict comparison row list.
     */
    fields: FieldDiff[];
    /**
     * Convenience subset: the field names whose diff status is `"conflict"`
     * (i.e. all fields the local mutation touches that genuinely differ from
     * the server snapshot). Empty when the values are equal despite the etag
     * difference (cosmetic churn) — in that case a plain retry is safe.
     */
    conflictingFields: string[];
};

/** Status of one field in a conflict-details comparison. */
export type FieldDiffStatus =
    /** Touched locally and changed on the server to a different value. */
    | "conflict"
    /** Changed locally but the server snapshot already matches the local value. */
    | "local-change"
    /** Untouched locally, but the server state differs from the local row. */
    | "server-change"
    /** Local proposal and server record agree. */
    | "unchanged";

/** One table field's comparison row in {@link ConflictDetails.fields}. */
export type FieldDiff = {
    /** TypeScript property name, matching the table's `fields` map key. */
    field: string;
    /** The local proposal: the mutation's value/changes overlay. Absent if not set. */
    local?: unknown;
    /** The server record's value. Absent if the field is not on the server record. */
    server?: unknown;
    /**
     * The value carried in the mutation's `changes` delta, when the field is
     * explicitly part of the partial update — `undefined` when the field is
     * only present via the full optimistic row (`value`) or unchanged.
     */
    changed?: unknown;
    status: FieldDiffStatus;
};

/**
 * Retry resolutions for an errored mutation. A resolution is a property of
 * the retry call, not of the mutation: a mutation previously retried with
 * force is un-forced by a later plain or useFreshEtag retry.
 */
export type RetryOptions = {
    /** Re-apply without any `If-Match` precondition (local changes win). */
    force?: boolean;
    /** Re-apply on top of the server's current etag (server state is the base). */
    useFreshEtag?: boolean;
};

/**
 * The vanilla offline sync engine: a durable IndexedDB mutation queue with a
 * flush cycle (web-lock serialized, cross-tab broadcast), deterministic
 * failure classification, etag freshness bookkeeping, and conflict
 * resolutions (force / rebase / discard / plain retry). It talks to Dataverse
 * through the registered {@link DataverseTable}s and knows nothing about
 * TanStack DB; adapters (see src/tanstack-db.ts) only map their mutation
 * format into {@link QueuedMutation} and feed it to {@link enqueue}.
 */
export class SyncEngine {
    name: string;
    version: number;
    // Widened deliberately: the sync DB stores heterogeneous tables.
    readonly tables = new Map<string, DataverseTable<GenericProperties>>();

    MUTATION_QUEUE_NAME = "Mutations"
    ERRORED_MUTATIONS_NAME = "Errored Mutations"

    readonly channel: BroadcastChannel
    private closed = false
    // Per-collection cache stores (keyed by collection id). Unlike the table
    // stores derived from entitySetName, these exist so multiple filtered
    // collections over the same entity don't overwrite each other's snapshots.
    private collectionStores = new Set<string>()
    private collectionStorePromises = new Map<string, Promise<void>>()
    // The version passed to openDB — grows when a late-registered collection
    // needs its own object store and the DB must be reopened to create it.
    private dbVersion: number
    private activeFetchControllers = new Set<AbortController>()
    private collectionCleanups = new Set<() => void>()
    // Last etag we successfully wrote for each record key. Lets a queued update
    // that was built against a stale optimistic snapshot borrow the fresher etag
    // produced by an earlier update in the same flush (or a prior flush), so
    // consecutive conditional updates don't 412 each other. Seeded from the
    // mutation's own ifMatch when empty.
    private keyEtags = new Map<string, string>()
    // Schedules a wake-up for the soonest delayed retry so a failed mutation
    // re-attempts even while the app is idle and online. Cleared on each
    // queueMutations/flush and on close().
    private retryTimer: ReturnType<typeof setTimeout> | undefined
    private readonly channelMessageHandler: (event: MessageEvent) => void
    // Subscribers notified whenever the mutation queue or errored store
    // changes (mutations enqueued, flushed, errored, retried, discarded).
    // Listeners receive no payload — call getQueueCount()/getErroredMutations()
    // to read the current state (see the conflict-dashboard use case).
    private mutationListeners = new Set<() => void>()

    constructor(options: SyncEngineOptions) {
        this.name = options.name;
        this.channel = new BroadcastChannel(options.name)
        this.version = options.version;
        this.dbVersion = options.version;
        this.overrideCreatedOn = options.overrideCreatedOn === true;
        this.maxAttempts = options.maxAttempts ?? DEFAULT_MAX_MUTATION_ATTEMPTS;
        this.retryBaseDelay = options.retryBaseDelay ?? DEFAULT_RETRY_BASE_DELAY;
        this.retryMaxDelay = options.retryMaxDelay ?? DEFAULT_RETRY_MAX_DELAY;
        this.flushOnOnline = options.flushOnOnline !== false;
        for (const table of options.tables) this.tables.set(table.entitySetName, table);

        // Listen for tab sync & cancellation signals across browser tabs
        this.channelMessageHandler = (event: MessageEvent) => {
            if (event.data?.type === "ABORT_ACTIVE_FETCHES") {
                this.abortActiveFetches();
            }
        };
        this.channel.addEventListener("message", this.channelMessageHandler);

        // Auto-flush when the tab regains connectivity (opt out via
        // `flushOnOnline`). The Web Lock serializes this with any other
        // tab's flush, so concurrent wake-ups are safe.
        if (this.flushOnOnline && typeof globalThis.addEventListener === "function") {
            this.onlineHandler = async () => {
                if (navigator.onLine && !this.closed) void this.flushQueue();
            };
            globalThis.addEventListener("online", this.onlineHandler);
        }
    }

    // Captured from SyncEngineOptions: replay queued inserts with the offline
    // transaction time as `overriddencreatedon` so `createdon` reflects when
    // the record was created offline, not when the queue was flushed.
    overrideCreatedOn = false;
    // Retry budget per mutation before it moves to the errored store.
    maxAttempts: number
    // Exponential backoff curve for delayed retries (base * 2^(attempt-1),
    // capped at retryMaxDelay). A failed mutation re-attempts even while the
    // app is idle, waking via retryTimer once its nextAttemptAt is due.
    retryBaseDelay: number
    retryMaxDelay: number
    // Whether the engine auto-flushes when the tab regains connectivity.
    flushOnOnline = true
    // "online" listener installed when flushOnOnline is enabled; removed in close().
    private onlineHandler: (() => void) | undefined

    // Monotonic ordering counter for queued mutations — adapters assign it
    // when serializing their mutation format into {@link QueuedMutation}.
    sequence = 0;
    nextSequence(): number {
        return this.sequence++;
    }

    /**
     * Registers a listener invoked (synchronously, best-effort) whenever the
     * offline mutation state changes in this tab: mutations get enqueued,
     * flushed, moved to/from the errored store, or discarded. Returns an
     * unsubscribe function. Cross-tab changes are not delivered directly —
     * each tab's own queueMutations/flushQueue activity fires the hook, so
     * attach a listener per tab that redraws from
     * {@link getQueueCount}/{@link getErroredMutations}.
     */
    public onMutationsChanged(listener: () => void): () => void {
        this.mutationListeners.add(listener);
        return () => { this.mutationListeners.delete(listener); };
    }

    private notifyMutationsChanged(): void {
        for (const listener of [...this.mutationListeners]) {
            try { listener(); } catch (err) { console.warn("[dataverse-offline] listener failed:", err); }
        }
    }

    private db: IDBPDatabase | Promise<IDBPDatabase> | undefined;
    async getDB(): Promise<IDBPDatabase> {
        if (!this.db) {
            const self = this
            const dbPromise = openDB(this.name, this.dbVersion, {
                upgrade(database, _oldVersion, _newVersion, transaction) {
                    // Queue stores are durable application state. Table stores are
                    // disposable cache state and are rebuilt by the next sync.
                    // Per-collection cache stores (see ensureCollectionStore)
                    // are preserved too.
                    for (const storeName of Array.from(database.objectStoreNames)) {
                        if (
                            storeName !== self.MUTATION_QUEUE_NAME &&
                            storeName !== self.ERRORED_MUTATIONS_NAME &&
                            !self.collectionStores.has(storeName)
                        ) {
                            database.deleteObjectStore(storeName);
                        }
                    }

                    let store = database.objectStoreNames.contains(self.MUTATION_QUEUE_NAME)
                        ? transaction!.objectStore(self.MUTATION_QUEUE_NAME)
                        : database.createObjectStore(self.MUTATION_QUEUE_NAME, { keyPath: "id" });
                    if (!store.indexNames.contains("by_timestamp")) {
                        store.createIndex("by_timestamp", ["timestamp", "sequence"]);
                    }

                    if (!database.objectStoreNames.contains(self.ERRORED_MUTATIONS_NAME)) {
                        database.createObjectStore(self.ERRORED_MUTATIONS_NAME, { keyPath: "id" });
                    }

                    for (const table of self.tables.values()) {
                        if (!database.objectStoreNames.contains(table.entitySetName)) {
                            // keyPath uses the TypeScript property name (e.g. "id"),
                            // which is the same key getKey() reads — consistent with
                            // the logical column mapping done elsewhere.
                            database.createObjectStore(table.entitySetName, { keyPath: table.primaryKey.key });
                        }
                    }
                },
                blocked(currentVersion, blockedVersion) {
                    // Another tab still holds an old-version connection; our
                    // own "versionchange" close below is what unblocks it.
                    console.warn(
                        `[dataverse-offline] DB "${self.name}" upgrade to v${blockedVersion} ` +
                            `blocked while another tab holds a v${currentVersion} connection`,
                    );
                },
            });
            // When any tab upgrades the schema (e.g. a late-registered
            // collection opened a store on the fly), close this connection
            // promptly — otherwise the upgrading tab hangs in "blocked" until
            // this connection is finally closed. Track the new version first
            // so a subsequent open() here skips straight ahead to it.
            void dbPromise.then((db) => {
                db.addEventListener("versionchange", (event: IDBVersionChangeEvent) => {
                    self.dbVersion = Math.max(self.dbVersion, event.newVersion ?? 0);
                    db.close();
                    if (self.db === dbPromise) self.db = undefined;
                });
            });
            this.db = dbPromise;
        }
        return this.db;
    }

    /**
     * Registers a per-collection cache store (keyed by collection id). If the
     * database is already open without this store, it is reopened with a
     * bumped version so the upgrade callback can create it. The returned
     * promise resolves once the store is safe to read/write.
     *
     * Reopens are serialized through {@link dbReopenPromise}: two collections
     * registered back-to-back must not interleave openDB calls — the first
     * bump creates a store the second bump would otherwise re-check against a
     * stale connection. Before closing an open connection, in-flight fetches
     * are aborted locally and cross-tab, because the new open transaction must
     * wait for every other tab's connection to be closed on versionchange
     * (each getDB registers that handler itself).
     */
    public ensureCollectionStore(name: string): Promise<void> {
        let p = this.collectionStorePromises.get(name);
        if (!p) {
            p = (async () => {
                // Register before any DB work so a concurrent upgrade's
                // migration callback preserves this store.
                this.collectionStores.add(name);
                const tail = this.dbReopenPromise ?? Promise.resolve();
                this.dbReopenPromise = (async () => {
                    await tail;
                    if (this.closed) return;
                    const db = await this.getDB();
                    if (!db.objectStoreNames.contains(name)) {
                        // Stop in-flight reads/writes so closing the connection
                        // doesn't fail transactions created before the reopen.
                        this.abortActiveFetches();
                        this.channel.postMessage({ type: "ABORT_ACTIVE_FETCHES" });
                        db.close();
                        this.db = undefined;
                        this.dbVersion = db.version + 1;
                        await this.getDB();
                    }
                })();
                await this.dbReopenPromise;
            })();
            this.collectionStorePromises.set(name, p);
        }
        return p;
    }

    private dbReopenPromise: Promise<void> | undefined;

    /**
     * Ensures the object store for a table's {@link entitySetName} exists. Same
     * reopen machinery as {@link ensureCollectionStore}; use this when a table
     * is registered after the DB has already been opened, because table stores
     * are otherwise only created inside the upgrade callback.
     */
    public ensureTableStore(entitySetName: string): Promise<void> {
        return this.ensureCollectionStore(entitySetName);
    }

    /**
     * Instantly aborts any in-flight remote server GET requests across all collections.
     */
    public abortActiveFetches() {
        for (const controller of this.activeFetchControllers) {
            controller.abort("New mutation enqueued");
        }
        this.activeFetchControllers.clear();
    }

    /** Registers a collection-scoped cleanup to run when the queue closes. */
    public addCollectionCleanup(cleanup: () => void): void {
        this.collectionCleanups.add(cleanup);
    }

    /** Registers an in-flight fetch controller so abortActiveFetches can cancel it. */
    public trackActiveFetch(controller: AbortController): void {
        this.activeFetchControllers.add(controller);
    }

    /** Unregisters a fetch controller previously registered with trackActiveFetch. */
    public untrackActiveFetch(controller: AbortController): void {
        this.activeFetchControllers.delete(controller);
    }

    get isClosed(): boolean {
        return this.closed;
    }

    public close() {
        if (this.closed) return;
        this.closed = true;
        this.abortActiveFetches();
        if (this.retryTimer) {
            clearTimeout(this.retryTimer);
            this.retryTimer = undefined;
        }
        for (const cleanup of [...this.collectionCleanups]) cleanup();
        this.collectionCleanups.clear();
        this.mutationListeners.clear();
        this.channel.removeEventListener("message", this.channelMessageHandler);
        this.channel.close();
        if (this.onlineHandler && typeof globalThis.removeEventListener === "function") {
            globalThis.removeEventListener("online", this.onlineHandler);
            this.onlineHandler = undefined;
        }
        const pending = this.db;
        this.db = undefined;
        if (pending) {
            void Promise.resolve(pending).then((db) => db.close()).catch(() => undefined);
        }
    }

    /**
     * Flushes the mutation queue to Dataverse. After a successful flush the
     * authoritative server records (carrying fresh etags) are broadcast via the
     * MUTATIONS_ADDED channel so every collection reconciles its in-memory row
     * and IDB cache store — see the offline adapter's handleTabMessage.
     */
    public async flushQueue() {
        // The Web Lock is keyed by the database name (this.name). Cross-tab
        // serialization of flushQueue relies on this name being unique per
        // SyncEngine instance — two DBs with the same name share the lock
        // (and the BroadcastChannel), which is what enables multi-tab safety.
        await navigator.locks.request(this.name, async () => {
            const db = await this.getDB();

            // Records successfully written during this flush, carrying the
            // server-returned (authoritative) etag. Broadcast after the loop so
            // every collection — including this tab's — reconciles its
            // in-memory row and IDB cache without waiting for a server re-pull.
            const flushed: Array<{ id: string; type: string; key: any; value: any; entitySetName: string }> = [];
            // Whether the queue or errored store was modified; searched and
            // MUTATIONS_ADDED broadcasts make collections reconcile regardless.
            let changed = false;

            while (true) {
                const tx = db.transaction(this.MUTATION_QUEUE_NAME, "readonly");
                const index = tx.store.index("by_timestamp");
                const cursor = await index.openCursor(null, "next");

                if (!cursor) break; // Queue is empty

                const mutation = cursor.value as QueuedMutation;
                if (mutation.nextAttemptAt && mutation.nextAttemptAt > Date.now()) {
                    break;
                }
                const table = this.tables.get(mutation.entitySetName);

                if (!table) {
                    console.error(`Table ${mutation.entitySetName} not registered in DB`);
                    await db.delete(this.MUTATION_QUEUE_NAME, mutation.id);
                    continue;
                }

                // Use the freshest etag we know for this key (a prior successful
                // update in this or an earlier flush), falling back to the
                // etag captured when the mutation was enqueued. This keeps a
                // second queued update — built against the same stale optimistic
                // snapshot as the first — from sending an outdated If-Match.
                // Forced mutations bypass all etag bookkeeping — they must not
                // re-inherit the stale etag or the conflict they are being
                // forced through would just repeat.
                if ((mutation.type === "update" || mutation.type === "delete") && !mutation.force) {
                    const fresh = this.keyEtags.get(mutation.key);
                    if (fresh && fresh !== mutation.ifMatch) {
                        mutation.ifMatch = fresh;
                    }
                }

                try {
                    if (mutation.type === "insert") {
                        // `overrideCreatedOn` replays the offline transaction
                        // time as `overriddencreatedon`; without it the record
                        // would show the flush time as its `createdon`.
                        const record = await table.createRecord(
                            mutation.value,
                            this.overrideCreatedOn ? { overriddenCreatedOn: new Date(mutation.timestamp) } : undefined,
                        );
                        flushed.push({ id: mutation.id, type: "insert", key: table.getPrimaryId(record)!, value: record, entitySetName: mutation.entitySetName });
                    } else if (mutation.type === "update") {
                        // With `force`, send no If-Match at all: updateRecord
                        // then defaults to `If-Match: *` (overwrite if the
                        // record exists) and deleteRecord runs unconditionally.
                        // A bookkeeping-only delta ($-keys only) would PATCH
                        // nothing and silently drop the user's edit — fall
                        // back to the full optimistic row in that case.
                        const delta = isMetaOnly(mutation.changes) ? mutation.value : mutation.changes;
                        const record = await table.updateRecord(mutation.key, delta, { ifMatch: mutation.force ? undefined : mutation.ifMatch });
                        const etag = getEtag(record);
                        if (etag) {
                            // Persist the new etag so a later flush (or a
                            // sibling update still queued for this key) uses it
                            // instead of the stale snapshot etag.
                            this.keyEtags.set(mutation.key, etag);
                            mutation.ifMatch = etag;
                            await db.put(this.MUTATION_QUEUE_NAME, mutation);
                        }
                        flushed.push({ id: mutation.id, type: "update", key: mutation.key, value: record, entitySetName: mutation.entitySetName });
                    } else if (mutation.type === "delete") {
                        await table.deleteRecord(mutation.key, { ifMatch: mutation.force ? undefined : mutation.ifMatch });
                        // The record is gone — drop any cached etag for it.
                        this.keyEtags.delete(mutation.key);
                        flushed.push({ id: mutation.id, type: "delete", key: mutation.key, value: undefined, entitySetName: mutation.entitySetName });
                    }

                    await db.delete(this.MUTATION_QUEUE_NAME, mutation.id);
                    changed = true;
                } catch (e) {
                    if (!navigator.onLine) break; // Pause queue processing if offline
                    console.error(`[dataverse-offline] Failed to flush mutation ${mutation.id}:`, e);
                    mutation.error = serializeError(e);
                    mutation.lastAttemptAt = Date.now();
                    // Deterministic failures (412 concurrency, duplicate-key
                    // violations, missing records, validation rejects) cannot
                    // behave any differently on a retry, so skip the retry
                    // cycle entirely and move the mutation straight to the
                    // errored store — interpretError explains why, and how the
                    // operator can get past it. Transient failures (throttle,
                    // 5xx, network) keep the retry/backoff cycle below.
                    if (isDeterministicFailure(e)) mutation.attempts = this.maxAttempts;
                    else mutation.attempts++;
                    if (mutation.attempts >= this.maxAttempts) {
                        mutation.nextAttemptAt = undefined;
                        await db.delete(this.MUTATION_QUEUE_NAME, mutation.id);
                        await db.put(this.ERRORED_MUTATIONS_NAME, mutation)
                        changed = true;
                    } else {
                        const delay = Math.min(
                            this.retryMaxDelay,
                            this.retryBaseDelay * 2 ** (mutation.attempts - 1),
                        );
                        mutation.nextAttemptAt = mutation.lastAttemptAt + delay;
                        await db.put(this.MUTATION_QUEUE_NAME, mutation)
                        // Self-heal: wake flushQueue when this retry is due, so a
                        // failed mutation re-attempts even with no further user
                        // activity (the lock + online guard keep it safe).
                        if (navigator.onLine) {
                            if (this.retryTimer) clearTimeout(this.retryTimer);
                            this.retryTimer = setTimeout(() => {
                                this.retryTimer = undefined;
                                void this.flushQueue();
                            }, delay);
                        }
                        break;
                    }


                }
            }

            // Reconcile collections + IDB cache with the authoritative records.
            // handleTabMessage writes each into the collection and the
            // collectionId cache store (and ignores rows for other entity sets),
            // so a single broadcast updates both memory and disk in every tab.
            if (flushed.length > 0) {
                this.channel.postMessage({ type: "MUTATIONS_ADDED", mutations: flushed });
            }
            if (changed) this.notifyMutationsChanged();
        })
    }

    async getQueueCount(): Promise<number> {
        const db = await this.getDB();
        return db.count(this.MUTATION_QUEUE_NAME);
    }

    async getErroredMutations(): Promise<QueuedMutation[]> {
        const db = await this.getDB();
        return db.getAll(this.ERRORED_MUTATIONS_NAME) as Promise<QueuedMutation[]>;
    }

    /**
     * Snapshot for presenting a conflicted mutation to a user: the server's
     * current authoritative record, and which of the mutation's fields the
     * server state actually differs on. A differing etag only *means*
     * something touched the record — the field diff is what makes "Force",
     * "Rebase" or "Discard" an informed choice instead of a blind button.
     *
     * Semantics:
     * - `server` is the transformed record (null when the record was deleted
     *   server-side), including *all* of the table's fields — not just the
     *   locally changed ones.
     * - `conflictingFields` compares only the fields the local mutation
     *   touches against the server record (see {@link ConflictDetails}).
     * Unknown fields (e.g. navigation blobs not present in the snapshot) are
     * treated as conflicting rather than silently ignored.
     */
    async getConflictDetails(mutation: QueuedMutation): Promise<ConflictDetails> {
        const table = this.tables.get(mutation.entitySetName);
        if (!table) throw new Error(`Table "${mutation.entitySetName}" is not registered in this SyncEngine`);
        const server = await table.getRecord(mutation.key) as any;
        // The local side of the diff: the *entire* proposed row (what the
        // optimistic state believed the record would become) overlaid with the
        // changes delta. Diffing `changes` alone is not enough: with
        // rowUpdateMode "full" (as the offline collection uses) the delta can
        // end up carrying only row bookkeeping ($-keys), while the real local
        // edit — the fields this mutation exists to write — lives in `value`.
        const proposed: Record<string, unknown> = {};
        const changed = new Map<string, unknown>();
        const fill = (source: unknown, record: boolean) => {
            for (const [k, v] of Object.entries(source ?? {})) {
                if (isMetaKey(k)) continue;
                if (record) changed.set(k, v);
                proposed[k] = v;
            }
        };
        // Full proposed row first, then the changes delta takes precedence
        // (later writes win), so an explicit partial update is honored even
        // where the row snapshot is stale.
        fill(mutation.value, false);
        fill(mutation.type === "update" ? mutation.changes : undefined, true);
        // When the changes delta is bookkeeping-only (the full rowUpdateMode
        // case above), every difference between the proposed row and the
        // server must count as locally changed — otherwise genuine local
        // edits would be misclassified as "server-change".
        const changesMetaOnly = isMetaOnly(mutation.changes);
        // One row per field defined on the table, in `fields` map order.
        // `$`-prefixed bookkeeping keys are excluded implicitly: they are not
        // table fields.
        const fields: FieldDiff[] = [];
        for (const [name] of Object.entries(table.fields)) {
            const local = proposed[name];
            const serverValue = server?.[name];
            const explicitlyChanged = changed.has(name);
            const differs = !valuesEqual(local, serverValue);
            const status: FieldDiffStatus = differs
                ? ((explicitlyChanged || changesMetaOnly) ? "conflict" : "server-change")
                : (explicitlyChanged ? "local-change" : "unchanged");
            fields.push({
                field: name,
                local,
                server: serverValue,
                changed: explicitlyChanged ? changed.get(name) : undefined,
                status,
            });
        }
        return {
            server,
            fields,
            conflictingFields: fields.filter((f) => f.status === "conflict").map((f) => f.field),
        };
    }

    /**
     * Moves an errored mutation back into the retry queue and flushes.
     *
     * Resolution options ({@link RetryOptions}):
     *
     * - **Force** (`{ force: true }`): re-applied without its `If-Match`
     *   precondition — updates overwrite the server's current state
     *   (`If-Match: *`) and deletes run unconditionally. Use after a 412
     *   concurrency failure (see {@link isConcurrencyError}) when the local
     *   changes should win regardless of concurrent server-side edits.
     * - **Rebase** (`{ useFreshEtag: true }`): fetches the server's current
     *   record and re-applies the local changes on top of its *fresh* etag
     *   — a "resend my edits, accept the server's state as the base"
     *   resolution. Fails with 412 again if the record is touched between
     *   reading the etag and the write. If the server cannot be reached the
     *   freshest etag already known to this DB is used instead of aborting.
     * - Plain (`{}`): retries with the etag it last carried — useful only if
     *   the server record has since reverted to the expected etag.
     *
     * The resolution is a property of the retry call, not of the mutation:
     * a mutation previously retried with `force` is un-forced by a later
     * plain or `useFreshEtag` retry (and, once un-forced, inherits the
     * freshest known etag rather than a bare precondition).
     */
    async retryErroredMutation(
        id: string,
        options?: RetryOptions,
    ): Promise<void> {
        const db = await this.getDB();
        const mutation = await db.get(this.ERRORED_MUTATIONS_NAME, id) as QueuedMutation | undefined;
        if (!mutation) return;

        mutation.attempts = 0;
        mutation.error = undefined;
        mutation.lastAttemptAt = undefined;
        mutation.nextAttemptAt = undefined;
        // Resolution is re-chosen on every retry, never accumulated from
        // prior retries: a previously forced mutation must not stay forced
        // when it is later retried plainly or with useFreshEtag.
        mutation.force = options?.force === true;
        if (mutation.force) {
            // Drop the etag entirely — a forced write sends no precondition.
            mutation.ifMatch = undefined;
        } else if (options?.useFreshEtag && mutation.type !== "insert") {
            // Rebase: read the server's current etag so the mutation is
            // re-queued carrying the etag the record has *right now*. This
            // MUST run before the write transaction below is opened —
            // awaiting a network request while an IndexedDB transaction is
            // active lets the transaction auto-commit, and the later
            // delete/put then throws InvalidStateError.
            const table = this.tables.get(mutation.entitySetName);
            if (table) {
                let fresh: string | undefined;
                try {
                    const server = await table.getRecord(mutation.key);
                    fresh = server ? getEtag(server) : undefined;
                } catch {
                    // Server unreachable while rebasing — fall back to the
                    // freshest etag this DB has already successfully
                    // written for the key (the same source flushQueue
                    // uses) instead of abandoning the retry outright.
                    fresh = this.keyEtags.get(mutation.key);
                }
                if (fresh && fresh !== mutation.ifMatch) {
                    mutation.ifMatch = fresh;
                    this.keyEtags.set(mutation.key, fresh);
                }
            }
        } else if (mutation.ifMatch === undefined) {
            // Un-forcing a mutation previously sent bare: a missing etag
            // would behave exactly like force (If-Match: * / unconditional
            // delete), so restore the freshest etag we know.
            const fresh = this.keyEtags.get(mutation.key);
            if (fresh) mutation.ifMatch = fresh;
        }

        const tx = db.transaction(
            [this.MUTATION_QUEUE_NAME, this.ERRORED_MUTATIONS_NAME],
            "readwrite",
        );
        // Both requests must be created synchronously before awaiting
        // either: awaiting delete() alone first can let the transaction
        // become inactive/complete in some browser timing conditions,
        // making the later put() throw InvalidStateError.
        const erroredStore = tx.objectStore(this.ERRORED_MUTATIONS_NAME);
        const queueStore = tx.objectStore(this.MUTATION_QUEUE_NAME);
        await Promise.all([
            erroredStore.delete(id),
            queueStore.put(mutation),
        ]);
        await tx.done;
        this.notifyMutationsChanged();
        if (navigator.onLine) await this.flushQueue();
    }

    async discardErroredMutation(id: string): Promise<void> {
        const db = await this.getDB();
        await db.delete(this.ERRORED_MUTATIONS_NAME, id);
        this.notifyMutationsChanged();
    }

    async queueMutations(mutations: QueuedMutation[]) {
        if (mutations.length === 0) return;
        // A freshly arrived mutation may make a previously-delayed retry due now;
        // drop any pending retry wake-up so the upcoming flush re-evaluates.
        if (this.retryTimer) {
            clearTimeout(this.retryTimer);
            this.retryTimer = undefined;
        }
        try {
            const db = await this.getDB();
            const storeNames = [
                this.MUTATION_QUEUE_NAME,
                ...new Set(mutations.map((mutation) => mutation.entitySetName)),
            ];
            const tx = db.transaction(storeNames, "readwrite");

            for (const mutation of mutations) {
                if (mutation.type === "insert" || mutation.type === "update") {
                    tx.objectStore(mutation.entitySetName).put(mutation.value);
                } else if (mutation.type === "delete") {
                    tx.objectStore(mutation.entitySetName).delete(mutation.key);
                }
                tx.objectStore(this.MUTATION_QUEUE_NAME).put(mutation);
            }
            await tx.done;
            this.notifyMutationsChanged();
        } catch (e) {
            console.error("[dataverse-offline] Error writing mutation to IDB:", e);
            throw new MutationPersistenceError(
                "Failed to persist offline mutations",
                mutations.map((mutation) => mutation.id),
                e,
            );
        }
    }
}
