import type { CollectionConfig, InsertMutationFn, UpdateMutationFn, DeleteMutationFn, SyncConfig, UtilsRecord } from "@tanstack/db";
import { getEtag, type DataverseTable, type GenericProperties, type Infer } from "dataverse-schema";

const DEFAULT_SYNC_INTERVAL = 30000;

export type DataverseCollectionConfig<T extends GenericProperties> = {
    table: DataverseTable<T>;
    syncInterval?: number;
    readOnlyWhenOffline?: boolean;
} & Omit<CollectionConfig<Infer<T>>, "sync" | "getKey" | "onInsert" | "onUpdate" | "onDelete">;

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

    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let syncFn: (() => Promise<void>) | null = null;

    const defaultOnInsert: InsertMutationFn<Infer<T>> = async ({ transaction }) => {
        const results: (string | number)[] = [];
        for (const mutation of transaction.mutations) {
            const guid = await table.insertRecord(mutation.modified);
            results.push(guid);
        }
        return results;
    };

    const defaultOnUpdate: UpdateMutationFn<Infer<T>> = async ({ transaction }) => {
        const results: (string | number)[] = [];
        for (const mutation of transaction.mutations) {
            await table.updateRecord(mutation.key, mutation.changes);
            results.push(mutation.key);
        }
        return results;
    };

    const defaultOnDelete: DeleteMutationFn<Infer<T>> = async ({ transaction }) => {
        const results: (string | number)[] = [];
        for (const mutation of transaction.mutations) {
            await table.deleteRecord(mutation.key);
            results.push(mutation.key);
        }
        return results;
    };

    const syncConfig: SyncConfig<Infer<T>> = {
        sync: ({ begin, write, commit, markReady, collection }) => {
            syncFn = async () => {
                try {
                    const keysToDelete = new Set(collection.keys())
                    begin();
                    for await (const record of table.iterateRecords()) {
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
                    markReady();
                }
            };

            syncFn();

            pollTimer = setInterval(() => {
                syncFn?.();
            }, syncInterval);

            return () => {
                if (pollTimer) {
                    clearInterval(pollTimer);
                    pollTimer = null;
                }
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
    }
}
