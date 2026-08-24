import type { CollectionConfig, InsertMutationFn, UpdateMutationFn, DeleteMutationFn, SyncConfig, UtilsRecord } from "@tanstack/db";
import { getEtag, type DataverseTable, type GenericProperties, type Infer } from "dataverse-schema";

const DEFAULT_SYNC_INTERVAL = 30000;

export type DataverseCollectionConfig<T extends GenericProperties> = {
    table: DataverseTable<T>;
    syncInterval?: number;
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


export function dataverseCollectionOptions<T extends GenericProperties>(
    config: DataverseCollectionConfig<T>,
): CollectionConfig<Infer<T>, string | number, never, DataverseCollectionUtils<T>> {
    const { table, syncInterval = DEFAULT_SYNC_INTERVAL, ...rest } = config;
    const pk = table.primaryKey;
    const getKey = ((item: Infer<T>) => (item as any)[pk.key]);
    const collectionId = table.entitySetName;

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
        const results: (string | number)[] = [];
        const serialized: Array<{ id: string; type: string; key: any; value: any; entitySetName: string }> = [];
        for (const mutation of transaction.mutations) {
            const guid = await table.createRecord(mutation.modified);
            results.push(guid);
            serialized.push({ id: mutation.mutationId, type: "insert", key: guid, value: mutation.modified, entitySetName: collectionId });
        }
        broadcastMutations(serialized);
        return results;
    };

    const defaultOnUpdate: UpdateMutationFn<Infer<T>> = async ({ transaction }) => {
        const results: (string | number)[] = [];
        const serialized: Array<{ id: string; type: string; key: any; value: any; entitySetName: string }> = [];
        for (const mutation of transaction.mutations) {
            await table.updateRecord(mutation.key, mutation.changes);
            results.push(mutation.key);
            serialized.push({ id: mutation.mutationId, type: "update", key: mutation.key, value: mutation.changes, entitySetName: collectionId });
        }
        broadcastMutations(serialized);
        return results;
    };

    const defaultOnDelete: DeleteMutationFn<Infer<T>> = async ({ transaction }) => {
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

            syncFn = async () => {
                // Guard against concurrent syncs (forceSync + poll tick) touching
                // the same collection's synced transaction at once.
                if (syncInFlight) return;
                syncInFlight = true;
                syncController = new AbortController();
                try {
                    const keysToDelete = new Set(collection.keys())
                    begin();
                    for await (const record of table.iterateRecords(undefined, { signal: syncController.signal })) {
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
