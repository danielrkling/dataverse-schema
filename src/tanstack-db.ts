import { type Transaction, type CollectionConfig, type InsertMutationFn, type UpdateMutationFn, type DeleteMutationFn, type PendingMutation, type SyncConfig, type UtilsRecord } from "@tanstack/db";
import { IDBPDatabase, openDB } from "idb";
import { getEtag, type DataverseTable, type GenericProperties, type Infer, type ODataTableQueryOptions } from "./index";

const DEFAULT_SYNC_INTERVAL = 30000;
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
            value: mutation.modified,
            changes: mutation.changes,
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
                if (mutation.type === "update" || mutation.type === "delete") {
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
                        const record = await table.updateRecord(mutation.key, mutation.changes, { ifMatch: mutation.ifMatch });
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
                        await table.deleteRecord(mutation.key, { ifMatch: mutation.ifMatch });
                        // The record is gone — drop any cached etag for it.
                        this.keyEtags.delete(mutation.key);
                        flushed.push({ id: mutation.id, type: "delete", key: mutation.key, value: undefined, entitySetName: mutation.entitySetName });
                    }

                    await db.delete(this.MUTATION_QUEUE_NAME, mutation.id);
                } catch (e) {
                    if (!navigator.onLine) break; // Pause queue processing if offline
                    console.error(`[dataverse-offline] Failed to flush mutation ${mutation.id}:`, e);
                    mutation.error = e
                    mutation.attempts++
                    mutation.lastAttemptAt = Date.now();
                    if (mutation.attempts >= MAX_MUTATION_ATTEMPTS) {
                        mutation.nextAttemptAt = undefined;
                        await db.delete(this.MUTATION_QUEUE_NAME, mutation.id);
                        await db.put(this.ERRORED_MUTATIONS_NAME, mutation)
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

    async retryErroredMutation(id: string): Promise<void> {
        const db = await this.getDB();
        const tx = db.transaction(
            [this.MUTATION_QUEUE_NAME, this.ERRORED_MUTATIONS_NAME],
            "readwrite",
        );
        const mutation = await tx.objectStore(this.ERRORED_MUTATIONS_NAME).get(id) as QueuedMutation | undefined;
        if (mutation) {
            mutation.attempts = 0;
            mutation.error = undefined;
            mutation.lastAttemptAt = undefined;
            mutation.nextAttemptAt = undefined;
            await tx.objectStore(this.ERRORED_MUTATIONS_NAME).delete(id);
            await tx.objectStore(this.MUTATION_QUEUE_NAME).put(mutation);
        }
        await tx.done;
        if (mutation && navigator.onLine) await this.flushQueue();
    }

    async discardErroredMutation(id: string): Promise<void> {
        const db = await this.getDB();
        await db.delete(this.ERRORED_MUTATIONS_NAME, id);
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
            // Begin syncing immediately on creation rather than waiting for the
            // first subscriber to attach (the default for @tanstack/db collections).
            startSync: true,
        } as CollectionConfig<Infer<T>, string | number, never, DataverseCollectionUtils<T>>;
    }
}
