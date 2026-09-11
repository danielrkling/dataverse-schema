import { BTreeIndex, type Collection, type Transaction, type CollectionConfig, type InsertMutationFn, type UpdateMutationFn, type DeleteMutationFn, type PendingMutation, type SyncConfig, type UtilsRecord } from "@tanstack/db";
import { IDBPDatabase, openDB } from "idb";
import { DataverseHttpError, getEtag, type DataverseTable, type GenericProperties, type Infer, type ODataTableQueryOptions } from "./index";

const DEFAULT_SYNC_INTERVAL = 30000;

/**
 * Creates indexes on the collection for the primary key and every `lookupId`
 * field of the table. These are the columns correlated joins/live subqueries
 * (`materialize`) filter on, so having them indexed keeps the includes
 * materialization fast and avoids the known "empty snapshot when the driving
 * collection is indexed" lazy-load pitfalls in the other direction.
 */
function createDefaultIndexes(table: DataverseTable<GenericProperties>, collection: Collection<any, any, any>): void {
  const fields = Object.entries(table.fields);
  const indexedKeys = new Set<string>([table.primaryKey.key]);
  for (const [key, field] of fields) {
    if (key === table.primaryKey.key) continue;
    if (field.type === "lookupId") indexedKeys.add(key);
  }
  for (const key of indexedKeys) {
    try {
      collection.createIndex((row: any) => row[key], { indexType: BTreeIndex });
    } catch (err) {
      // Index creation is best-effort — a duplicate index or unsupported key
      // should never break syncing.
      console.warn(`[dataverse-collection] failed to create index "${key}" for "${table.entitySetName}":`, err);
    }
  }
  // Debug aid: list every index now registered on the collection. The paths
  // printed here must match the field named in any TanStack DB
  // "Join requires an index on ..." warning for that collection id.
  const indexes = [...collection.indexes.values()].map((i: any) => i.expression?.path);
}
const DEFAULT_POLL_INTERVAL = 30000;
const MAX_MUTATION_ATTEMPTS = 3;
const RETRY_BASE_DELAY = 1000;
const RETRY_MAX_DELAY = 60000;

export type DataverseCollectionConfig<T extends GenericProperties> = {
    table: DataverseTable<T>;
    /**
     * Unique collection id. Defaults to the table's entitySetName — provide an
     * explicit id when creating multiple collections over the same entity
     * (e.g. with different query filters), otherwise they will collide.
     */
    id?: string;
    /**
     * Query options limiting which records the collection syncs (filter,
     * select, orderby, …). Applied to every remote sync pull.
     */
    query?: ODataTableQueryOptions<T>;
    syncInterval?: number;
    /** When true, the collection rejects all insert/update/delete mutations. */
    readonly?: boolean;
    readOnlyWhenOffline?: boolean;
    // NOTE: The passthrough options use `any` for the row type on purpose.
    // Referencing `Infer<T>` here breaks generic inference of `T` from `table`
    // (TypeScript collapses `T` to `never` when the table is widened to
    // `DataverseTable<GenericProperties>`), which in turn made the resulting
    // collection query resolve to `never[]`.
} & Omit<CollectionConfig<any>, "sync" | "getKey" | "onInsert" | "onUpdate" | "onDelete">;

export interface DataverseCollectionUtils<T extends GenericProperties> extends UtilsRecord {
    forceSync: () => Promise<void>;
    table: DataverseTable<T>
}

export type DataverseOfflineCollectionConfig<T extends GenericProperties> = DataverseCollectionConfig<T> & {
    /**
     * When true (default), remote syncing/flushing only runs while the document
     * is visible. Set to false to sync regardless of `visibilityState` (e.g. in a
     * non-visible web-resource context).
     */
    requireVisible?: boolean;
};

/**
 * Deep-copies a value into plain objects/arrays. Used to strip the reactive
 * proxies that @tanstack/db's live-query/materialize layer wraps rows in —
 * proxies cannot pass through structuredClone, so any mutation payload that
 * came from a joined row would otherwise throw when written to IndexedDB
 * (or posted over the BroadcastChannel). Reading through the proxy and
 * rebuilding plain containers is enough; no proxy detection is needed.
 */
function plainClone<T>(value: T): T {
    if (Array.isArray(value)) {
        return value.map(plainClone) as unknown as T;
    }
    // Dates clone naturally via structuredClone once the surrounding proxies
    // are gone, so preserve the instance instead of degrading it to a string.
    if (value instanceof Date) {
        return new Date(value.getTime()) as unknown as T;
    }
    // Binary values (file/image upload payloads: `{ data: Blob }`) must pass
    // through untouched — Object.keys on a Blob yields [], so the generic
    // object branch below would silently replace it with `{}` and the
    // `instanceof Blob` upload path in field afterSave hooks would never fire.
    // These types have no enumerable own properties and cannot be the reactive
    // row proxies being stripped here, so identity-passthrough is safe.
    if (
        value instanceof Blob ||
        value instanceof ArrayBuffer ||
        ArrayBuffer.isView(value)
    ) {
        return value;
    }
    if (value !== null && typeof value === "object") {
        const out: Record<string, unknown> = {};
        for (const key of Object.keys(value as Record<string, unknown>)) {
            out[key] = plainClone((value as Record<string, unknown>)[key]);
        }
        return out as unknown as T;
    }
    return value;
}

/**
 * True for the synthetic bookkeeping properties @tanstack/db (and this
 * library's adapters) attach to rows beside the real Dataverse columns —
 * `$key`, `$collectionId`, `$synced`, `$origin`, … — plus `$etag`. They
 * exist only in the optimistic/in-memory row, never on a server snapshot,
 * so they would always pollute a field-level conflict diff with phantom
 * "differences".
 */
function isMetaKey(key: string): boolean {
    return key.startsWith("$");
}

/**
 * True when a delta object contains only bookkeeping keys (`$`-prefixed) —
 * i.e., patching it would write nothing to Dataverse. An empty delta
 * (length 0) is left alone: there is nothing to fall back on and the
 * caller's body building will produce an empty (no-op) request either way.
 */
function isMetaOnly(delta: unknown): boolean {
    const keys = Object.keys(delta ?? {});
    return keys.length > 0 && keys.every(isMetaKey);
}

/**
 * Structural equality for comparing a local mutation field value against the
 * server record in {@link DataverseSyncDB.getConflictDetails}. Handles the
 * value shapes Dataverse records carry: primitives, Date instances (compare
 * by timestamp — JSON round-trips make instance identity useless), arrays,
 * nested plain objects, and binary values (Blob identity).
 */
function valuesEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
    if (Array.isArray(a) || Array.isArray(b)) {
        if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
        return a.every((v, i) => valuesEqual(v, b[i]));
    }
    if (a && b && typeof a === "object" && typeof b === "object") {
        const ak = Object.keys(a as object), bk = Object.keys(b as object);
        if (ak.length !== bk.length) return false;
        return ak.every((k) => valuesEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
    }
    return false;
}

export type QueuedMutation = {
    id: string;
    type: "insert" | "update" | "delete";
    key: string;
    value?: any;
    changes: any;
    entitySetName: string;
    timestamp: number;
    sequence: number;
    attempts: number;
    ifMatch?: string;
    /**
     * When true, the mutation is retried without an `If-Match` precondition:
     * updates become overwrite-if-exists (`If-Match: *`) and deletes run
     * unconditionally. Used to force a mutation that previously failed with a
     * 412 concurrency conflict (see {@link isConcurrencyError} and
     * {@link DataverseSyncDB.retryErroredMutation}).
     */
    force?: boolean;
    lastAttemptAt?: number;
    nextAttemptAt?: number;
    error?: any
};

export class MutationPersistenceError extends Error {
    constructor(
        message: string,
        readonly mutationIds: string[],
        readonly cause: unknown,
    ) {
        super(message);
        this.name = "MutationPersistenceError";
    }
}

/**
 * Reduces a thrown error to a structured-clone-safe plain object before it is
 * persisted into the IndexedDB errored store. Besides keeping the `put` from
 * throwing (`DataverseHttpError.response` holds a live `Response` object,
 * which cannot be cloned), this preserves the HTTP status as an own property
 * so conflict detection keeps working after a page reload — once the error
 * has passed through IndexedDB, `instanceof DataverseHttpError` no longer
 * holds (the class identity is not restored), only the data survives.
 */
function serializeError(error: unknown): Record<string, unknown> {
    if (error instanceof DataverseHttpError) {
        return {
            name: error.name,
            message: error.message,
            status: error.status,
            statusText: error.statusText,
            body: error.body,
        };
    }
    if (error instanceof Error) {
        return { name: error.name, message: error.message };
    }
    return { name: "UnknownError", value: error };
}

/**
 * Returns true when the error is a Dataverse 412 (Precondition Failed)
 * response — an optimistic-concurrency failure meaning the server's etag no
 * longer matches the etag the mutation was built against. Such mutations are
 * moved to the errored store and can be re-applied with
 * {@link DataverseSyncDB.retryErroredMutation} using the `force` or
 * `useFreshEtag` options.
 *
 * Because stored errors are serialized plain objects ({@link serializeError}),
 * detection cannot rely on `instanceof` alone — it also matches the persisted
 * `status` property shape, so an error read back after a page reload is still
 * recognized.
 *
 * Duplicate-key violations can surface as 412s too, but they are NOT
 * concurrency failures — Force only removes the `If-Match` precondition and
 * cannot make a record unique, and rebasing onto the server's etag changes
 * nothing either. Those are excluded here so resolution UIs don't offer
 * Force/Rebase for them; use {@link isKeyViolation} to detect them instead.
 */
export function isConcurrencyError(error: unknown): boolean {
    const status = (error as { status?: unknown } | undefined)?.status;
    if (status !== 412) return false;
    return !isKeyViolation(error);
}

/**
 * Returns true when a Dataverse error is a unique-key / duplicate-detection
 * violation (e.g. `DuplicateRecordEntityKey`, `0x80060892`: "Entity Key {0}
 * violated. A record with the same value for {1} already exists."), or the
 * classic duplicate-detection result (`DuplicateRecordsFound`,
 * `0x80040333`). These failures are deterministic — the same payload will
 * keep failing no matter when it is retried and no matter which etag it
 * carries — so they skip the retry cycle entirely and move straight to the
 * errored store. Resolution is never automatic: the payload must be edited
 * (different key values) or discarded.
 */
export function isKeyViolation(error: unknown): boolean {
    if (error instanceof DataverseHttpError) {
        // Reconstruct the serialized shape to share one code path.
        error = { body: error.body };
    }
    const body = (error as { body?: { code?: unknown; message?: unknown } } | undefined)?.body as
        { code?: unknown; message?: unknown } | undefined;
    const code = typeof body?.code === "string" ? body.code.toLowerCase() : undefined;
    if (code && KEY_VIOLATION_CODES.has(code)) return true;
    const message = typeof body?.message === "string" ? body.message : undefined;
    // Some duplicate-detection paths return a zero/empty code; fall back to
    // the canonical message fragment of DuplicateRecordEntityKey.
    return typeof message === "string" && DUPLICATE_KEY_MESSAGE.test(message);
}

const KEY_VIOLATION_CODES = new Set([
    "0x80060892", // DuplicateRecordEntityKey
    "0x80040333", // DuplicateRecordsFound
]);
const DUPLICATE_KEY_MESSAGE = /duplicate record cannot be created|same value for .* already exists/i;

export function dataverseCollectionOptions<T extends GenericProperties>(
    config: DataverseCollectionConfig<T>,
): CollectionConfig<Infer<T>, string | number, never, DataverseCollectionUtils<T>> {
    const {
        table,
        id: explicitId,
        query,
        syncInterval = DEFAULT_SYNC_INTERVAL,
        readonly = false,
        ...rest
    } = config;
    const pk = table.primaryKey;
    const getKey = ((item: Infer<T>) => (item as any)[pk.key]);
    // Multiple collections may target the same entitySet with different
    // filters — the id (explicit or derived) is what keeps them distinct.
    const collectionId = explicitId ?? table.entitySetName;

    // Cross-tab coordination: mirror the offline adapter's BroadcastChannel so
    // mutations in one tab are reflected in other tabs immediately (and so
    // in-flight syncs can be aborted). Keyed by the collection id, matching the
    // offline adapter's channel naming.
    const channel = new BroadcastChannel(collectionId);
    let disposed = false;

    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let syncFn: (() => Promise<void>) | null = null;
    let syncInFlight = false;
    let syncController: AbortController | undefined;

    // Broadcast a set of mutations to sibling tabs so their collections update
    // without waiting for the next poll. Mirrors the offline adapter's wire format.
    const broadcastMutations = (
        mutations: Array<{ id: string; type: string; key: any; value: any; entitySetName: string }>,
    ) => {
        if (disposed) return;
        channel.postMessage({ type: "ABORT_ACTIVE_FETCHES" });
        channel.postMessage({ type: "MUTATIONS_ADDED", mutations });
    };

    const defaultOnInsert: InsertMutationFn<Infer<T>> = async ({ transaction }) => {
        if (readonly) throw new Error("Collection is read-only");
        const results: (string | number)[] = [];
        const serialized: Array<{ id: string; type: string; key: any; value: any; entitySetName: string }> = [];
        for (const mutation of transaction.mutations) {
            const record = await table.createRecord(mutation.modified);
            const guid = table.getPrimaryId(record)!;
            results.push(guid);
            serialized.push({ id: mutation.mutationId, type: "insert", key: guid, value: record, entitySetName: collectionId });
        }
        broadcastMutations(serialized);
        return results;
    };

    const defaultOnUpdate: UpdateMutationFn<Infer<T>> = async ({ transaction }) => {
        if (readonly) throw new Error("Collection is read-only");
        const results: (string | number)[] = [];
        const serialized: Array<{ id: string; type: string; key: any; value: any; entitySetName: string }> = [];
        for (const mutation of transaction.mutations) {
            const record = await table.updateRecord(mutation.key, mutation.changes);
            const guid = table.getPrimaryId(record)!;
            results.push(guid);
            // The returned record already carries the fresh $etag, so the
            // cross-tab broadcast keeps sibling tabs' optimistic state current.
            serialized.push({ id: mutation.mutationId, type: "update", key: guid, value: record, entitySetName: collectionId });
        }
        broadcastMutations(serialized);
        // Re-pull so the collection row's etag is refreshed from the server.
        // Without this, a subsequent update would still carry the pre-write
        // etag and fail the If-Match check until an unrelated sync happened.
        void utils.forceSync();
        return results;
    };

    const defaultOnDelete: DeleteMutationFn<Infer<T>> = async ({ transaction }) => {
        if (readonly) throw new Error("Collection is read-only");
        const results: (string | number)[] = [];
        const serialized: Array<{ id: string; type: string; key: any; value: any; entitySetName: string }> = [];
        for (const mutation of transaction.mutations) {
            await table.deleteRecord(mutation.key);
            results.push(mutation.key);
            serialized.push({ id: mutation.mutationId, type: "delete", key: mutation.key, value: undefined, entitySetName: collectionId });
        }
        broadcastMutations(serialized);
        return results;
    };

    const syncConfig: SyncConfig<Infer<T>> = {
        sync: ({ begin, write, commit, markReady, collection }) => {
            createDefaultIndexes(table as DataverseTable<GenericProperties>, collection);
            const handleTabMessage = (event: MessageEvent) => {
                if (disposed) return;
                if (event.data?.type === "ABORT_ACTIVE_FETCHES") {
                    // Another tab mutated — cancel our in-flight server pull so we
                    // re-sync promptly with fresh data.
                    syncController?.abort();
                } else if (event.data?.type === "MUTATIONS_ADDED") {
                    const incoming = (event.data.mutations as Array<any>)
                        .filter((m) => m.entitySetName === collectionId);
                    if (incoming.length === 0) return;
                    begin();
                    for (const m of incoming) {
                        if (m.type === "delete") {
                            const existing = collection.get(m.key);
                            if (existing) write({ type: "delete", value: existing });
                        } else if (m.type === "update") {
                            const existing = collection.get(m.key);
                            if (existing) write({ type: "update", value: { ...existing, ...m.value } });
                        } else {
                            write({ type: "insert", value: m.value });
                        }
                    }
                    commit();
                    // Re-pull from the server to reconcile etags/optimistic state.
                    void syncFn?.();
                }
            };
            channel.addEventListener("message", handleTabMessage);

            // Re-pull as soon as connectivity returns rather than waiting for
            // the next poll tick.
            const handleOnline = () => { void syncFn?.(); };
            // Guarded so non-DOM runtimes (unit tests, Node) don't blow up;
            // in the browser globalThis IS the event target for "online".
            if (typeof globalThis.addEventListener === "function") {
                globalThis.addEventListener("online", handleOnline);
            }
            const removeOnlineListener = () => {
                if (typeof globalThis.removeEventListener === "function") {
                    globalThis.removeEventListener("online", handleOnline);
                }
            };

            syncFn = async () => {
                // Guard against concurrent syncs (forceSync + poll tick) touching
                // the same collection's synced transaction at once.
                if (syncInFlight) return;
                // Skip remote pulls while offline (e.g. WiFi down). Note DevTools
                // network throttling does NOT flip navigator.onLine, so this guard
                // won't pause polling under emulated offline — those failed pulls
                // are caught and logged below instead.
                if (!navigator.onLine) {
                    markReady();
                    return;
                }
                syncInFlight = true;
                syncController = new AbortController();
                try {
                    const keysToDelete = new Set(collection.keys())
                    begin();
                    for await (const record of table.iterateRecords(query, { signal: syncController.signal })) {
                        const key = table.getPrimaryId(record)!
                        const existingRecord = collection.get(key)
                        if (existingRecord) {
                            if (getEtag(record) !== getEtag(existingRecord)) {
                                write({ type: "update", value: record })
                            }
                            keysToDelete.delete(key)
                        } else {
                            write({ type: "insert", value: record });
                        }
                    }
                    for (const key of keysToDelete) {
                        write({ type: "delete", value: collection.get(key)! })
                    }
                    commit();

                } catch (err) {
                    console.warn(`[dataverse-collection] sync failed for "${collectionId}":`, err);
                } finally {
                    syncInFlight = false;
                    syncController = undefined;
                    markReady();
                }
            };

            syncFn();

            pollTimer = setInterval(() => {
                syncFn?.();
            }, syncInterval);

            return () => {
                disposed = true;
                if (pollTimer) {
                    clearInterval(pollTimer);
                    pollTimer = null;
                }
                channel.removeEventListener("message", handleTabMessage);
                removeOnlineListener();
                channel.close();
            };
        },
        rowUpdateMode: "partial",
    };

    const utils: DataverseCollectionUtils<T> = {
        forceSync: async () => {
            await syncFn?.();
        },
        table
    };

    return {
        ...rest,
        id: collectionId,
        getKey,
        sync: syncConfig,
        onInsert: defaultOnInsert,
        onUpdate: defaultOnUpdate,
        onDelete: defaultOnDelete,
        utils,
        defaultIndexType: BTreeIndex,
        // Begin syncing immediately on creation rather than waiting for the
        // first subscriber to attach (the default for @tanstack/db collections).
        startSync: true,
    }
}

export class DataverseSyncDB {
    name: string;
    version: number;
    tables: Map<string, DataverseTable<GenericProperties>>;

    MUTATION_QUEUE_NAME = "Mutations"
    ERRORED_MUTATIONS_NAME = "Errored Mutations"

    channel: BroadcastChannel
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

    constructor(name: string, tables: DataverseTable<GenericProperties>[], version: number) {
        this.name = name;
        this.channel = new BroadcastChannel(name)
        this.version = version;
        this.dbVersion = version;
        this.tables = new Map(tables.map((v) => [v.entitySetName, v]));

        // Listen for tab sync & cancellation signals across browser tabs
        this.channelMessageHandler = (event: MessageEvent) => {
            if (event.data?.type === "ABORT_ACTIVE_FETCHES") {
                this.abortActiveFetches();
            }
        };
        this.channel.addEventListener("message", this.channelMessageHandler);
    }

    sequence = 0;
    serializeMutation(mutation: PendingMutation<any>): QueuedMutation {
        // For updates, persist only the changed columns (`changes`) rather than
        // the entire row (`modified`). This keeps the IndexedDB payloads small
        // and means flushQueue's updateRecord call sends a delta instead of a
        // full-row PATCH that could clobber unrelated fields.
        return {
            id: mutation.mutationId,
            type: mutation.type,
            value: plainClone(mutation.modified),
            changes: plainClone(mutation.changes),
            key: mutation.key,
            entitySetName: mutation.collection.id,
            timestamp: mutation.createdAt.valueOf(),
            sequence: this.sequence++,
            attempts: 0,
            ifMatch: getEtag(mutation.modified),
        };
    }

    private db: IDBPDatabase | undefined;
    async getDB() {
        if (!this.db) {
            const self = this
            this.db = await openDB(this.name, this.dbVersion, {
                upgrade(database, oldVersion, _newVersion, transaction) {
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
            });
        }
        return this.db;
    }

    /**
     * Registers a per-collection cache store (keyed by collection id). If the
     * database is already open without this store, it is reopened with a
     * bumped version so the upgrade callback can create it. The returned
     * promise resolves once the store is safe to read/write.
     */
    private ensureCollectionStore(name: string): Promise<void> {
        let p = this.collectionStorePromises.get(name);
        if (!p) {
            p = (async () => {
                this.collectionStores.add(name);
                let db = await this.getDB();
                if (!db.objectStoreNames.contains(name)) {
                    db.close();
                    this.db = undefined;
                    this.dbVersion = db.version + 1;
                    await this.getDB();
                }
            })();
            this.collectionStorePromises.set(name, p);
        }
        return p;
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
        this.db?.close();
        this.db = undefined;
    }

    /**
     * Flushes the mutation queue to Dataverse. After a successful flush the
     * authoritative server records (carrying fresh etags) are broadcast via the
     * MUTATIONS_ADDED channel so every collection reconciles its in-memory row
     * and IDB cache store — see {@link createCollectionOptions}'s
     * handleTabMessage.
     */
    private async flushQueue() {
        // The Web Lock is keyed by the database name (this.name). Cross-tab
        // serialization of flushQueue relies on this name being unique per
        // DataverseSyncDB instance — two DBs with the same name share the lock
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
                // Forced mutations (see retryErroredMutation) bypass all etag
                // bookkeeping — they must not re-inherit the stale etag or the
                // conflict they are being forced through would just repeat.
                if ((mutation.type === "update" || mutation.type === "delete") && !mutation.force) {
                    const fresh = this.keyEtags.get(mutation.key);
                    if (fresh && fresh !== mutation.ifMatch) {
                        mutation.ifMatch = fresh;
                    }
                }

                try {
                    if (mutation.type === "insert") {
                        const record = await table.createRecord(mutation.value);
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
                    // 412 conflicts (precondition failed) and duplicate-key
                    // violations are deterministic: neither will behave any
                    // differently on a retry, so skip the retry cycle
                    // entirely and move the mutation straight to the errored
                    // store. From there, concurrency conflicts can be
                    // re-applied with retryErroredMutation force/useFreshEtag
                    // (see QueuedMutation.force); key violations must be
                    // edited or discarded.
                    if (isConcurrencyError(e) || isKeyViolation(e)) mutation.attempts = MAX_MUTATION_ATTEMPTS;
                    else mutation.attempts++;
                    if (mutation.attempts >= MAX_MUTATION_ATTEMPTS) {
                        mutation.nextAttemptAt = undefined;
                        await db.delete(this.MUTATION_QUEUE_NAME, mutation.id);
                        await db.put(this.ERRORED_MUTATIONS_NAME, mutation)
                        changed = true;
                    } else {
                        const delay = Math.min(
                            RETRY_MAX_DELAY,
                            RETRY_BASE_DELAY * 2 ** (mutation.attempts - 1),
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
     *   touches (`changes` for updates, `value` otherwise) against the
     *   server record. Empty when the values are equal despite the etag
     *   difference (cosmetic churn) — in that case plain retry is safe.
     * Unknown fields (e.g. navigation blobs not present in the snapshot) are
     * treated as conflicting rather than silently ignored.
     */
    async getConflictDetails(mutation: QueuedMutation): Promise<{ server: any | null; conflictingFields: string[] }> {
        const table = this.tables.get(mutation.entitySetName);
        if (!table) throw new Error(`Table "${mutation.entitySetName}" is not registered in this DataverseSyncDB`);
        const server = await table.getRecord(mutation.key) as any;
        // The local side of the diff: the *entire* proposed row (what the
        // optimistic state believed the record would become) overlaid with the
        // changes delta. Diffing `changes` alone is not enough: with
        // rowUpdateMode "full" (as the offline collection uses) the delta can
        // end up carrying only row bookkeeping ($-keys), while the real local
        // edit — the fields this mutation exists to write — lives in `value`.
        const local: Record<string, unknown> = {};
        const fill = (source: unknown) => {
            for (const [k, v] of Object.entries(source ?? {})) {
                if (isMetaKey(k)) continue;
                local[k] = v;
            }
        };
        // Full proposed row first, then the changes delta takes precedence
        // (later writes win), so an explicit partial update is honored even
        // where the row snapshot is stale.
        fill(mutation.value);
        fill(mutation.type === "update" ? mutation.changes : undefined);
        const conflictingFields = local && server
            ? Object.keys(local).filter((k) => !valuesEqual(local[k], server[k]))
            : Object.keys(local);
        return { server, conflictingFields };
    }
    /**
     * Moves an errored mutation back into the retry queue and flushes.
     *
     * Resolution options:
     *
     * - **Force** (`{ force: true }`): re-applied without its `If-Match`
     *   precondition — updates overwrite the server's current state
     *   (`If-Match: *`) and deletes run unconditionally. Use after a 412
     *   concurrency failure (see {@link isConcurrencyError}) when the local
     *   changes should win regardless of concurrent server-side edits.
     * - **Rebase** (`{ useFreshEtag: true }`): fetches the server's current
     *   record and re-applies the local `changes` on top of its *fresh* etag
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
     *
     * ```ts
     * if (isConcurrencyError(errored.error)) {
     *     // after reviewing getConflictDetails(errored):
     *     await db.retryErroredMutation(errored.id, { force: true });
     * }
     * ```
     */
    async retryErroredMutation(
        id: string,
        options?: { force?: boolean; useFreshEtag?: boolean },
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

    createCollectionOptions<T extends GenericProperties>(
        config: DataverseOfflineCollectionConfig<T>,
    ): CollectionConfig<Infer<T>, string | number, never, DataverseCollectionUtils<T>> {
        if (this.closed) throw new Error("DataverseSyncDB is closed");
        const {
            table,
            id: explicitId,
            query,
            syncInterval = DEFAULT_POLL_INTERVAL,
            readOnlyWhenOffline = false,
            readonly = false,
            requireVisible = true,
            ...rest
        } = config;
        // Widened deliberately: the sync DB stores heterogeneous tables.
        this.tables.set(table.entitySetName, table as DataverseTable<GenericProperties>);
        const pk = table.primaryKey;
        const getKey = (item: Infer<T>) => (item as any)[pk.key];
        // Multiple collections may target the same entitySet with different
        // filters — the id (explicit or derived) is what keeps them distinct.
        // The IndexedDB cache store is also keyed by this id so two filtered
        // collections over one entity don't overwrite each other's snapshots.
        const collectionId = explicitId ?? table.entitySetName;
        const cacheReady = this.ensureCollectionStore(collectionId);

        let pollTimer: ReturnType<typeof setTimeout> | undefined;
        let syncFromDataverse: ((signal: AbortSignal) => Promise<void>);
        let syncController: AbortController | undefined;
        let activeSync: Promise<void> | undefined;
        let syncQueued = false;
        let disposed = false;

        const runSync = async () => {
            if (disposed) return;
            if (activeSync) {
                syncQueued = true;
                return activeSync;
            }

            syncController = new AbortController();
            this.activeFetchControllers.add(syncController);
            activeSync = syncFromDataverse(syncController.signal).finally(() => {
                this.activeFetchControllers.delete(syncController!);
                syncController = undefined;
                activeSync = undefined;
            });

            await activeSync;
            if (syncQueued && !disposed) {
                syncQueued = false;
                await runSync();
            }
        };

        const scheduleNextSync = (time: number) => {
            return new Promise<void>((resolve) => {
                if (pollTimer) clearTimeout(pollTimer);
                pollTimer = setTimeout(async () => {
                    const visible = !requireVisible || document.visibilityState === "visible";
                    if (navigator.onLine && visible) {
                        await runSync();
                        scheduleNextSync(syncInterval);
                    }
                    resolve()
                }, time);
            })
        };

        const flushAndSync = async () => {
            const visible = !requireVisible || document.visibilityState === "visible";
            if (!disposed && visible && navigator.onLine) {
                await this.flushQueue()
                await scheduleNextSync!(50)
            }
        }

        const syncConfig: SyncConfig<Infer<T>> = {
            sync: ({ begin, write, commit, markReady, collection }) => {
                createDefaultIndexes(table as DataverseTable<GenericProperties>, collection);
                // The collection must become ready even when the remote sync is
                // skipped (offline at load, hidden tab). Otherwise anything
                // awaiting collection readiness hangs forever.
                let markedReady = false;
                const markReadyOnce = () => {
                    if (!markedReady) {
                        markedReady = true;
                        markReady();
                    }
                };

                syncFromDataverse = async (signal: AbortSignal) => {
                    try {
                        await cacheReady;
                        // Pass down signal to underlying API client
                        const records = await table.getRecords(query, { signal });

                        if (signal.aborted) return;

                        const keysToDelete = new Set([
                            ...collection.keys(),
                        ]);


                        begin();
                        for (const record of records) {
                            const key = table.getPrimaryId(record)!;
                            const existingRecord = collection.get(key);
                            if (existingRecord) {
                                if (getEtag(record) !== getEtag(existingRecord)) {
                                    write({ type: "update", value: record, metadata: { source: "dv" } });
                                }
                                keysToDelete.delete(key);
                            } else {
                                write({ type: "insert", value: record, metadata: { source: "dv" } });
                            }
                        }
                        for (const key of keysToDelete) {
                            write({ type: "delete", value: collection.get(key)!, metadata: { source: "dv" } });
                        }
                        commit();
                        const db = await this.getDB();
                        const tx = db.transaction(collectionId, "readwrite");
                        await tx.store.clear();
                        for (const record of records) {
                            tx.store.put(record);
                        }
                        await tx.done;
                    } catch (err: any) {
                        if (err?.name !== "AbortError" && !signal.aborted) {
                            console.warn(`[dataverse-offline] Remote sync failed for "${collectionId}":`, err);
                        }
                    } finally {
                        markReadyOnce();
                    }
                };

                const handleTabMessage = (event: MessageEvent) => {
                    if (event.data?.type === "MUTATIONS_ADDED") {
                        begin();
                        const localWrites: Array<() => Promise<void>> = [];
                        for (const mutation of event.data.mutations) {
                            if (table.entitySetName === mutation.entitySetName) {
                                write({ type: mutation.type, value: mutation.value, metadata: { source: "tab" } });
                                // Also persist into the local IndexedDB cache so a
                                // reload keeps the row until the next remote sync.
                                localWrites.push(async () => {
                                    await cacheReady;
                                    const db = await this.getDB();
                                    const tx = db.transaction(collectionId, "readwrite");
                                    if (mutation.type === "delete") {
                                        tx.store.delete(mutation.key);
                                    } else {
                                        tx.store.put(mutation.value);
                                    }
                                    await tx.done;
                                });
                            }
                        }
                        commit();
                        scheduleNextSync(50)
                        // Best-effort: don't let a cache write failure break the
                        // in-memory collection update above. Fire-and-forget.
                        for (const w of localWrites) void w().catch(() => undefined);
                    }
                };

                this.channel.addEventListener("message", handleTabMessage);

                const syncFromIDB = async () => {
                    await cacheReady;
                    const db = await this.getDB();
                    const cached = (await db.getAll(collectionId)) as Infer<T>[];
                    if (!disposed && cached.length > 0) {
                        begin();
                        for (const item of cached) {
                            write({ type: "insert", value: item, metadata: { source: "idb" } });
                        }
                        commit();
                    }
                };

                syncFromIDB().then(flushAndSync).catch((err) => {
                    if (!disposed) {
                        console.warn(`[dataverse-offline] Cache sync failed for "${collectionId}":`, err);
                    }
                }).finally(() => {
                    // Hydration finished (or failed) — the collection is usable
                    // from cache even if the remote pull was skipped offline.
                    markReadyOnce();
                });

                window.addEventListener("online", flushAndSync);
                document.addEventListener("visibilitychange", flushAndSync);

                const cleanup = () => {
                    if (disposed) return;
                    disposed = true;
                    syncQueued = false;
                    syncController?.abort("Collection disposed");
                    this.channel.removeEventListener("message", handleTabMessage);
                    if (pollTimer) clearTimeout(pollTimer);
                    window.removeEventListener("online", flushAndSync);
                    document.removeEventListener("visibilitychange", flushAndSync);
                    this.collectionCleanups.delete(cleanup);
                };
                this.collectionCleanups.add(cleanup);
                return cleanup;
            },
            rowUpdateMode: "full",
        };

        const defaultMutation = async ({ transaction }: { transaction: Transaction<any> }) => {
            if (readonly) {
                throw new Error("Collection is read-only");
            }
            if (readOnlyWhenOffline && !navigator.onLine) {
                throw new Error("Collection is read-only while offline");
            }

            // 1. Instantly abort active server requests locally and across tabs
            this.abortActiveFetches();
            this.channel.postMessage({ type: "ABORT_ACTIVE_FETCHES" });

            // 2. Queue mutations into IndexedDB
            const serialized = transaction.mutations.map(v => this.serializeMutation(v));
            await this.queueMutations(serialized);
            this.channel.postMessage({ type: "MUTATIONS_ADDED", mutations: serialized });

            // 4. Request sync cycle
            if (navigator.onLine) {
                await this.flushQueue()
                await scheduleNextSync(100)

            }
        };

        const utils: DataverseCollectionUtils<T> = {
            forceSync: async () => {
                // Flush any queued local mutations, then pull fresh state from
                // Dataverse (mirrors the online adapter's forceSync utility).
                await this.flushQueue();
                await runSync();
            },
            table,
        };

        return {
            ...rest,
            id: collectionId,
            getKey,
            sync: syncConfig,
            onInsert: defaultMutation,
            onUpdate: defaultMutation,
            onDelete: defaultMutation,
            utils,
            defaultIndexType: BTreeIndex,
            // Begin syncing immediately on creation rather than waiting for the
            // first subscriber to attach (the default for @tanstack/db collections).
            startSync: true,
        } as CollectionConfig<Infer<T>, string | number, never, DataverseCollectionUtils<T>>;
    }
}
