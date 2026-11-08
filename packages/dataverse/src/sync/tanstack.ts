import { BTreeIndex, type Collection, type Transaction, type CollectionConfig, type InsertMutationFn, type UpdateMutationFn, type DeleteMutationFn, type PendingMutation, type SyncConfig, type UtilsRecord } from "@tanstack/db";
import { SyncEngine, type EtagReader, type SyncTable } from "./engine";
import { plainClone } from "./util";
import type { QueuedMutation } from "./types";

/**
 * TanStack DB collection adapters over the generic {@link SyncEngine} (and a
 * plain online pull). This module is product-agnostic: the table is addressed
 * through the engine's {@link SyncTable} contract extended with the two read
 * channels (`getRecords` for offline pulls, `iterateRecords` for online
 * streaming pulls), and the concurrency token is read through the injected
 * {@link EtagReader}. The Dataverse table satisfies the contract structurally;
 * other products can reuse these factories over an equivalent table shape.
 *
 * Peer dependency: `@tanstack/db`. Import this entry (`dataverse-schema/sync/tanstack`)
 * only in apps that use TanStack DB.
 */

const DEFAULT_SYNC_INTERVAL = 30000;
const DEFAULT_POLL_INTERVAL = 30000;

/**
 * The table contract the TanStack adapters need — the engine's {@link SyncTable}
 * write surface plus the two read channels used for remote pulls.
 */
export type TanstackSyncTable = SyncTable & {
    getRecords(query?: unknown, options?: { signal?: AbortSignal }): Promise<any[]>;
    iterateRecords(query?: unknown, options?: { signal?: AbortSignal }): AsyncIterable<any>;
};

/** Reads the concurrency token from a record. Defaults to the `$etag` record convention. */
const defaultGetEtag: EtagReader = (value) => value?.["$etag"];

/**
 * Creates indexes on the collection for the primary key plus every key listed
 * in `indexKeys`. These are the columns correlated joins/live subqueries
 * (`materialize`) filter on, so having them indexed keeps the includes
 * materialization fast and avoids the known "empty snapshot when the driving
 * collection is indexed" lazy-load pitfalls in the other direction.
 */
function createDefaultIndexes(table: SyncTable, collection: Collection<any, any, any>, indexKeys: string[]): void {
    const indexedKeys = new Set<string>([table.primaryKey.key, ...indexKeys]);
    for (const key of indexedKeys) {
        try {
            collection.createIndex((row: any) => row[key], { indexType: BTreeIndex });
        } catch (err) {
            // Index creation is best-effort — a duplicate index or unsupported key
            // should never break syncing.
            console.warn(`[sync-collection] failed to create index "${key}" for "${table.entitySetName}":`, err);
        }
    }
}

export type SyncCollectionConfig<TRow extends object> = {
    table: TanstackSyncTable;
    /**
     * Unique collection id. Defaults to the table's entitySetName — provide an
     * explicit id when creating multiple collections over the same entity
     * (e.g. with different query filters), otherwise they will collide.
     */
    id?: string;
    /**
     * Query options limiting which records the collection syncs (filter,
     * select, orderby, …). Opaque here; passed through to the table's
     * `getRecords`/`iterateRecords` on every remote pull.
     */
    query?: unknown;
    syncInterval?: number;
    /** When true, the collection rejects all insert/update/delete mutations. */
    readonly?: boolean;
    /** When true, the offline collection rejects mutations while offline. */
    readOnlyWhenOffline?: boolean;
    /**
     * Additional row keys to index beyond the primary key (e.g. lookup keys —
     * the columns correlated joins filter on).
     */
    indexKeys?: string[];
    /** Reads the concurrency token from server records. Defaults to `$etag`. */
    getEtag?: EtagReader;
    // NOTE: The passthrough options use `any` for the row type on purpose.
    // Referencing an inferred row type here breaks generic inference from
    // `table` (TypeScript collapses the row type when the table is widened),
    // which in turn made the resulting collection query resolve to `never[]`.
} & Omit<CollectionConfig<any>, "sync" | "getKey" | "onInsert" | "onUpdate" | "onDelete">;

export interface SyncCollectionUtils<TRow extends object> extends UtilsRecord {
    /** Pulls a fresh snapshot of the configured query from the server now. */
    forceSync: () => Promise<void>;
    /** The table this collection reads from and writes to. */
    table: TanstackSyncTable;
}

export type OfflineCollectionConfig<TRow extends object> = SyncCollectionConfig<TRow> & {
    /**
     * When true (default), remote syncing/flushing only runs while the document
     * is visible. Set to false to sync regardless of `visibilityState` (e.g. in a
     * non-visible web-resource context).
     */
    requireVisible?: boolean;
};

/**
 * Online-only TanStack collection: polls (or explicitly syncs) the table via
 * its read channels and writes mutations straight to the server. Cross-tab
 * changes are mirrored over a BroadcastChannel keyed by the collection id.
 * Use {@link offlineCollectionOptions} when writes must survive offline.
 */
export function syncCollectionOptions<TRow extends object>(
    config: SyncCollectionConfig<TRow>,
): CollectionConfig<TRow, string | number, never, SyncCollectionUtils<TRow>> {
    const {
        table,
        id: explicitId,
        query,
        syncInterval = DEFAULT_SYNC_INTERVAL,
        readonly = false,
        indexKeys = [],
        getEtag = defaultGetEtag,
        ...rest
    } = config;
    const pk = table.primaryKey;
    const getKey = ((item: TRow) => (item as any)[pk.key]);
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

    const defaultOnInsert: InsertMutationFn<TRow> = async ({ transaction }) => {
        if (readonly) throw new Error("Collection is read-only");
        const results: (string | number)[] = [];
        const serialized: Array<{ id: string; type: string; key: any; value: any; entitySetName: string }> = [];
        for (const mutation of transaction.mutations) {
            const record = await table.createRecord(mutation.modified);
            const key = table.getPrimaryId(record)!;
            results.push(key);
            serialized.push({ id: mutation.mutationId, type: "insert", key, value: record, entitySetName: collectionId });
        }
        broadcastMutations(serialized);
        return results;
    };

    const defaultOnUpdate: UpdateMutationFn<TRow> = async ({ transaction }) => {
        if (readonly) throw new Error("Collection is read-only");
        const results: (string | number)[] = [];
        const serialized: Array<{ id: string; type: string; key: any; value: any; entitySetName: string }> = [];
        for (const mutation of transaction.mutations) {
            const record = await table.updateRecord(mutation.key, mutation.changes);
            const key = table.getPrimaryId(record)!;
            results.push(key);
            // The returned record already carries the fresh concurrency token,
            // so the cross-tab broadcast keeps sibling tabs' optimistic state current.
            serialized.push({ id: mutation.mutationId, type: "update", key, value: record, entitySetName: collectionId });
        }
        broadcastMutations(serialized);
        // Re-pull so the collection row's etag is refreshed from the server.
        // Without this, a subsequent update would still carry the pre-write
        // etag and fail the If-Match check until an unrelated sync happened.
        void utils.forceSync();
        return results;
    };

    const defaultOnDelete: DeleteMutationFn<TRow> = async ({ transaction }) => {
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

    const syncConfig: SyncConfig<TRow> = {
        sync: ({ begin, write, commit, markReady, collection }) => {
            createDefaultIndexes(table, collection, indexKeys);
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
                    console.warn(`[sync-collection] sync failed for "${collectionId}":`, err);
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

    const utils: SyncCollectionUtils<TRow> = {
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

/**
 * Translates a TanStack `PendingMutation` into the offline engine's durable
 * {@link QueuedMutation} format. For updates, persists only the changed
 * columns (`changes`) rather than the entire row (`modified`). This keeps the
 * IndexedDB payloads small and means the flush's updateRecord call sends a
 * delta instead of a full-row PATCH that could clobber unrelated fields.
 */
export function serializeMutation(engine: SyncEngine, mutation: PendingMutation<any>): QueuedMutation {
    return {
        id: mutation.mutationId,
        type: mutation.type,
        value: plainClone(mutation.modified),
        changes: plainClone(mutation.changes),
        key: mutation.key,
        entitySetName: mutation.collection.id,
        timestamp: mutation.createdAt.valueOf(),
        sequence: engine.nextSequence(),
        attempts: 0,
        ifMatch: engine.getEtag(mutation.modified),
    };
}

/**
 * Builds the offline collection options backed by the given {@link SyncEngine}.
 * The engine owns all queue persistence, flushing, retries and conflict
 * resolution; this factory only wires TanStack's {@link SyncConfig} on top:
 * hydrating the collection from the IDB cache, remote pulls, and enqueueing
 * optimistic mutations into the engine's durable queue.
 */
export function offlineCollectionOptions<TRow extends object>(
    engine: SyncEngine,
    config: OfflineCollectionConfig<TRow>,
): CollectionConfig<TRow, string | number, never, SyncCollectionUtils<TRow>> {
    if (engine.isClosed) throw new Error("SyncEngine is closed");
    const {
        table,
        id: explicitId,
        query,
        syncInterval = DEFAULT_POLL_INTERVAL,
        readOnlyWhenOffline = false,
        readonly = false,
        requireVisible = true,
        indexKeys = [],
        getEtag = defaultGetEtag,
        ...rest
    } = config;
    // Widened deliberately: the sync DB stores heterogeneous tables.
    const widenedTable = table as SyncTable;
    engine.tables.set(table.entitySetName, widenedTable);
    const pk = table.primaryKey;
    const getKey = (item: TRow) => (item as any)[pk.key];
    // Multiple collections may target the same entitySet with different
    // filters — the id (explicit or derived) is what keeps them distinct.
    // The IndexedDB cache store is also keyed by this id so two filtered
    // collections over one entity don't overwrite each other's snapshots.
    const collectionId = explicitId ?? table.entitySetName;
    // Both the cache store for this collection and the entity's own table
    // store (which may not exist yet if the table was registered after the
    // DB was first opened) go through the engine's version-bump machinery.
    const cacheReady = Promise.all([
        engine.ensureCollectionStore(collectionId),
        engine.ensureTableStore(table.entitySetName),
    ]);
    void cacheReady;

    let pollTimer: ReturnType<typeof setTimeout> | undefined;
    let syncFromBackend: ((signal: AbortSignal) => Promise<void>);
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
        engine.trackActiveFetch(syncController);
        activeSync = syncFromBackend(syncController.signal).finally(() => {
            engine.untrackActiveFetch(syncController!);
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
            await engine.flushQueue()
            await scheduleNextSync!(50)
        }
    }

    const syncConfig: SyncConfig<TRow> = {
        sync: ({ begin, write, commit, markReady, collection }) => {
            createDefaultIndexes(table, collection, indexKeys);
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

            syncFromBackend = async (signal: AbortSignal) => {
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
                                write({ type: "update", value: record, metadata: { source: "backend" } });
                            }
                            keysToDelete.delete(key);
                        } else {
                            write({ type: "insert", value: record, metadata: { source: "backend" } });
                        }
                    }
                    for (const key of keysToDelete) {
                        write({ type: "delete", value: collection.get(key)!, metadata: { source: "backend" } });
                    }
                    commit();
                    const db = await engine.getDB();
                    const tx = db.transaction(collectionId, "readwrite");
                    await tx.store.clear();
                    for (const record of records) {
                        tx.store.put(record);
                    }
                    await tx.done;
                } catch (err: any) {
                    if (err?.name !== "AbortError" && !signal.aborted) {
                        console.warn(`[sync-offline] Remote sync failed for "${collectionId}":`, err);
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
                                const db = await engine.getDB();
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

            engine.channel.addEventListener("message", handleTabMessage);

            const syncFromIDB = async () => {
                await cacheReady;
                const db = await engine.getDB();
                const cached = (await db.getAll(collectionId)) as TRow[];
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
                    console.warn(`[sync-offline] Cache sync failed for "${collectionId}":`, err);
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
                engine.channel.removeEventListener("message", handleTabMessage);
                if (pollTimer) clearTimeout(pollTimer);
                window.removeEventListener("online", flushAndSync);
                document.removeEventListener("visibilitychange", flushAndSync);
            };
            engine.addCollectionCleanup(cleanup);
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
        engine.abortActiveFetches();
        engine.channel.postMessage({ type: "ABORT_ACTIVE_FETCHES" });

        // 2. Queue mutations into IndexedDB
        const serialized = transaction.mutations.map(v => serializeMutation(engine, v));
        await engine.queueMutations(serialized);
        engine.channel.postMessage({ type: "MUTATIONS_ADDED", mutations: serialized });

        // 4. Request sync cycle
        if (navigator.onLine) {
            await engine.flushQueue()
            await scheduleNextSync(100)

        }
    };

    const utils: SyncCollectionUtils<TRow> = {
        forceSync: async () => {
            // Flush any queued local mutations, then pull fresh state from
            // the backend (mirrors the online adapter's forceSync utility).
            await engine.flushQueue();
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
    } as CollectionConfig<TRow, string | number, never, SyncCollectionUtils<TRow>>;
}

export type ReadonlyStorageConfig<T extends object, TKey extends string | number> = {
    /** Stable, unique IDB store / TanStack collection ID. */
    id: string;

    /** Fetches the complete authoritative snapshot. */
    load: (context: { signal: AbortSignal }) => Promise<readonly T[]>;

    /** Stable primary key for TanStack DB and IndexedDB replacement logic. */
    getKey: (value: T) => TKey;

    /** Optional automatic refresh period. Omit or set 0 to disable polling. */
    syncInterval?: number;

    /** Defaults true. When true, do not refresh hidden documents. */
    requireVisible?: boolean;

    /**
     * Optional transform/validation boundary for untrusted loader output.
     * It may also be async.
     */
    parse?: (value: unknown) => T | Promise<T>;
};

/**
 * Read-only TanStack collection over an arbitrary snapshot loader (reference
 * data, lookup lists, configuration). The last snapshot is cached in the
 * engine's IndexedDB so the collection hydrates instantly on reload; `load`
 * is re-run on the configured `syncInterval` (polling is off by default).
 */
export function readonlyStorageCollectionOptions<T extends object, TKey extends string | number>(
    engine: SyncEngine,
    config: ReadonlyStorageConfig<T, TKey>,
): CollectionConfig<T, TKey, never> {
    if (engine.isClosed) throw new Error("SyncEngine is closed");

    const {
        id,
        load,
        getKey,
        syncInterval = 0,
        requireVisible = true,
        parse,
    } = config;

    const cacheReady = engine.ensureCollectionStore(id);

    let disposed = false;
    let activeSync: Promise<void> | undefined;
    let syncQueued = false;
    let controller: AbortController | undefined;
    let pollTimer: ReturnType<typeof setTimeout> | undefined;

    const replaceCache = async (records: readonly T[]) => {
        await cacheReady;

        const db = await engine.getDB();
        const tx = db.transaction(id, "readwrite");

        await tx.store.clear();
        for (const record of records) {
            await tx.store.put(record, getKey(record));
        }

        await tx.done;
    };

    return {
        id,
        getKey,

        sync: {
            sync: ({ begin, write, commit, markReady, collection }) => {
                let ready = false;

                const markReadyOnce = () => {
                    if (!ready) {
                        ready = true;
                        markReady();
                    }
                };

                const hydrate = async () => {
                    await cacheReady;

                    const db = await engine.getDB();
                    const cached = await db.getAll(id) as T[];

                    if (!disposed && cached.length > 0) {
                        begin();
                        for (const record of cached) {
                            write({
                                type: "insert",
                                value: record,
                                metadata: { source: "idb" },
                            });
                        }
                        commit();
                    }
                };

                const isRefreshAllowed = () =>
                    !requireVisible || document.visibilityState === "visible";

                const refresh = async () => {
                    if (disposed || !isRefreshAllowed() || !navigator.onLine) return;

                    if (activeSync) {
                        syncQueued = true;
                        return activeSync;
                    }

                    controller = new AbortController();
                    engine.trackActiveFetch(controller);

                    activeSync = (async () => {
                        try {
                            const loaded = await load({ signal: controller!.signal });
                            if (disposed || controller!.signal.aborted) return;

                            const records = parse
                                ? await Promise.all(loaded.map(parse))
                                : [...loaded];

                            // Write persistent state before replacing in-memory state.
                            await replaceCache(records);

                            if (disposed || controller!.signal.aborted) return;

                            // Full replacement — rows no longer returned are removed.
                            const nextKeys = new Set(records.map(getKey));

                            begin();
                            for (const record of records) {
                                write({
                                    type: "insert",
                                    value: record,
                                    metadata: { source: "loader" },
                                });
                            }
                            for (const existing of collection.values()) {
                                if (!nextKeys.has(getKey(existing))) {
                                    write({
                                        type: "delete",
                                        value: existing,
                                        metadata: { source: "loader" },
                                    });
                                }
                            }
                            commit();
                        } catch (err: any) {
                            if (err?.name !== "AbortError" && !controller?.signal.aborted) {
                                console.warn(`[readonly-storage] Load failed for "${id}":`, err);
                            }
                        } finally {
                            if (controller) engine.untrackActiveFetch(controller);
                            controller = undefined;
                            activeSync = undefined;
                        }
                    })();

                    await activeSync;

                    if (syncQueued && !disposed) {
                        syncQueued = false;
                        await refresh();
                    }
                };

                const schedule = () => {
                    if (!syncInterval || disposed) return;

                    clearTimeout(pollTimer);
                    pollTimer = setTimeout(async () => {
                        await refresh().catch((error) => {
                            console.warn(`[readonly-storage] Refresh failed for "${id}":`, error);
                        });
                        schedule();
                    }, syncInterval);
                };

                void hydrate()
                    .then(refresh)
                    .catch((error) => {
                        console.warn(`[readonly-storage] Initialization failed for "${id}":`, error);
                    })
                    .finally(() => {
                        markReadyOnce();
                        schedule();
                    });

                const onOnline = () => { void refresh(); };
                const onVisibilityChange = () => {
                    if (document.visibilityState === "visible") {
                        void refresh().catch(() => undefined);
                    }
                };

                window.addEventListener("online", onOnline);
                document.addEventListener("visibilitychange", onVisibilityChange);

                const cleanup = () => {
                    if (disposed) return;
                    disposed = true;
                    syncQueued = false;
                    controller?.abort("Readonly storage disposed");
                    clearTimeout(pollTimer);
                    window.removeEventListener("online", onOnline);
                    document.removeEventListener("visibilitychange", onVisibilityChange);
                };

                engine.addCollectionCleanup(cleanup);
                return cleanup;
            },

            rowUpdateMode: "full",
        },

        onInsert: async () => {
            throw new Error(`Readonly storage "${id}" does not support inserts`);
        },
        onUpdate: async () => {
            throw new Error(`Readonly storage "${id}" does not support updates`);
        },
        onDelete: async () => {
            throw new Error(`Readonly storage "${id}" does not support deletes`);
        },

        startSync: true,
    };
}
