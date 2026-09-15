import { BTreeIndex, type Collection, type Transaction, type CollectionConfig, type InsertMutationFn, type UpdateMutationFn, type DeleteMutationFn, type PendingMutation, type SyncConfig, type UtilsRecord } from "@tanstack/db";
import { getEtag, type DataverseTable, type GenericProperties, type Infer, type ODataTableQueryOptions,SyncEngine, plainClone, type QueuedMutation } from "./index";


const DEFAULT_SYNC_INTERVAL = 30000;
const DEFAULT_POLL_INTERVAL = 30000;

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

/**
 * TanStack DB adapter for the vanilla {@link SyncEngine} offline engine.
 * The engine (src/sync) owns all queue persistence, flushing, retry and
 * conflict-resolution logic; the adapter only translates TanStack
 * {@link PendingMutation}s into the engine's {@link QueuedMutation} format
 * and wires the engine's state into TanStack collection configs.
 */

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
        ifMatch: getEtag(mutation.modified),
    };
}

/**
 * Builds the offline collection options backed by the given {@link SyncEngine}.
 * The engine owns all queue persistence, flushing, retries and conflict
 * resolution; this factory only wires TanStack's {@link SyncConfig} on top:
 * hydrating the collection from the IDB cache, remote pulls, and enqueueing
 * optimistic mutations into the engine's durable queue.
 */
export function dataverseOfflineCollectionOptions<T extends GenericProperties>(
    engine: SyncEngine,
    config: DataverseOfflineCollectionConfig<T>,
): CollectionConfig<Infer<T>, string | number, never, DataverseCollectionUtils<T>> {
    if (engine.isClosed) throw new Error("SyncEngine is closed");
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
    engine.tables.set(table.entitySetName, table as DataverseTable<GenericProperties>);
    const pk = table.primaryKey;
    const getKey = (item: Infer<T>) => (item as any)[pk.key];
    // Multiple collections may target the same entitySet with different
    // filters — the id (explicit or derived) is what keeps them distinct.
    // The IndexedDB cache store is also keyed by this id so two filtered
    // collections over one entity don't overwrite each other's snapshots.
    const collectionId = explicitId ?? table.entitySetName;
    const cacheReady = engine.ensureCollectionStore(collectionId);

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
        engine.trackActiveFetch(syncController);
        activeSync = syncFromDataverse(syncController.signal).finally(() => {
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
                    const db = await engine.getDB();
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

    const utils: DataverseCollectionUtils<T> = {
        forceSync: async () => {
            // Flush any queued local mutations, then pull fresh state from
            // Dataverse (mirrors the online adapter's forceSync utility).
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
    } as CollectionConfig<Infer<T>, string | number, never, DataverseCollectionUtils<T>>;
}
