import { type Transaction, type CollectionConfig, type PendingMutation, type SyncConfig } from "@tanstack/db";
import { IDBPDatabase, openDB } from "idb";
import { getEtag, keys, type DataverseTable, type GenericProperties, type Infer } from "../index";
import type { DataverseCollectionConfig } from "./collection";

const DEFAULT_POLL_INTERVAL = 30000;


export type DataverseOfflineCollectionConfig<T extends GenericProperties> = DataverseCollectionConfig<T>;

export type QueuedMutation = {
    id: string;
    type: "insert" | "update" | "delete";
    key: string;
    value?: any;
    entitySetName: string;
    timestamp: number;
    sequence: number;
    attempts: number;
    error?: any
};


export class DataverseSyncDB {
    name: string;
    version: number;
    tables: Map<string, DataverseTable<GenericProperties>>;

    MUTATION_QUEUE_NAME = "Mutations"
    ERRORED_MUTATIONS_NAME = "Errored Mutations"

    channel: BroadcastChannel

    private globalFetchController = new AbortController()

    constructor(name: string, tables: DataverseTable<GenericProperties>[], version: number) {
        this.name = name;
        this.channel = new BroadcastChannel(name)
        this.version = version;
        this.tables = new Map(tables.map((v) => [v.entitySetName, v]));

        // Listen for tab sync & cancellation signals across browser tabs
        this.channel.addEventListener("message", (event: MessageEvent) => {
            if (event.data?.type === "ABORT_ACTIVE_FETCHES") {
                this.abortActiveFetches();
            }
        });
    }

    sequence = 0;
    serializeMutation(mutation: PendingMutation<any>): QueuedMutation {
        return {
            id: mutation.mutationId,
            type: mutation.type,
            value: mutation.modified,
            key: mutation.key,
            entitySetName: mutation.collection.id,
            timestamp: mutation.createdAt.valueOf(),
            sequence: this.sequence++,
            attempts: 0
        };
    }

    private db: IDBPDatabase | undefined;
    async getDB() {
        if (!this.db) {
            const self = this
            this.db = await openDB(this.name, this.version, {
                upgrade(database, oldVersion) {
                    if (oldVersion !== 0) {
                        const existingStores = Array.from(database.objectStoreNames);
                        for (const storeName of existingStores) {
                            database.deleteObjectStore(storeName);
                        }
                    }

                    const store = database.createObjectStore(self.MUTATION_QUEUE_NAME, { keyPath: "id" });
                    store.createIndex("by_timestamp", ["timestamp", "sequence"]);
                    database.createObjectStore(self.ERRORED_MUTATIONS_NAME, { keyPath: "id" });
                    for (const table of self.tables.values()) {
                        database.createObjectStore(table.entitySetName, { keyPath: table.primaryKey.key });
                    }
                },
            });
        }
        return this.db;
    }

    /**
     * Instantly aborts any in-flight remote server GET requests across all collections.
     */
    public abortActiveFetches() {
        if (this.globalFetchController) {
            this.globalFetchController.abort("New mutation enqueued");
            this.globalFetchController = new AbortController()
        }
    }



    private async flushQueue() {
        await navigator.locks.request(this.name, async () => {
            const db = await this.getDB();

            while (true) {
                const tx = db.transaction(this.MUTATION_QUEUE_NAME, "readonly");
                const index = tx.store.index("by_timestamp");
                const cursor = await index.openCursor(null, "next");

                if (!cursor) break; // Queue is empty

                const mutation = cursor.value as QueuedMutation;
                const table = this.tables.get(mutation.entitySetName);

                if (!table) {
                    console.error(`Table ${mutation.entitySetName} not registered in DB`);
                    await db.delete(this.MUTATION_QUEUE_NAME, mutation.id);
                    continue;
                }


                try {
                    if (mutation.type === "insert") {
                        await table.insertRecord(mutation.value);
                    } else if (mutation.type === "update") {
                        await table.updateRecord(mutation.key, mutation.value, getEtag(mutation.value));
                    } else if (mutation.type === "delete") {
                        await table.deleteRecord(mutation.key, getEtag(mutation.value));
                    }

                    await db.delete(this.MUTATION_QUEUE_NAME, mutation.id);
                } catch (e) {
                    if (!navigator.onLine) break; // Pause queue processing if offline
                    console.error(`[dataverse-offline] Failed to flush mutation ${mutation.id}:`, e);
                    mutation.error = e
                    mutation.attempts++
                    if (mutation.attempts > 2) {
                        await db.delete(this.MUTATION_QUEUE_NAME, mutation.id);
                        await db.put(this.ERRORED_MUTATIONS_NAME, mutation)
                    } else {
                        await db.put(this.MUTATION_QUEUE_NAME, mutation)
                    }


                }
            }
        })
    }

    async getQueueCount(): Promise<number> {
        const db = await this.getDB();
        return db.count(this.MUTATION_QUEUE_NAME);
    }

    async queueMutations(mutations: QueuedMutation[]) {
        try {
            const db = await this.getDB();
            const tx = db.transaction([this.MUTATION_QUEUE_NAME, ...mutations.map((m) => m.entitySetName)], "readwrite");

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
        }
    }

    createCollectionOptions<T extends GenericProperties>(
        config: DataverseOfflineCollectionConfig<T>,
    ): CollectionConfig<Infer<T>, string | number, never> {
        const { table, syncInterval = DEFAULT_POLL_INTERVAL, ...rest } = config;
        this.tables.set(table.entitySetName, table);
        const pk = table.primaryKey;
        const getKey = (item: Infer<T>) => (item as any)[pk.key];
        const collectionId = table.entitySetName;

        let pollTimer: number;
        let syncFromDataverse: ((signal: AbortSignal) => Promise<void>);

        const scheduleNextSync = (time: number) => {
            return new Promise<void>((resolve) => {
                if (pollTimer) clearTimeout(pollTimer);
                pollTimer = setTimeout(async () => {
                    if (navigator.onLine && document.visibilityState === "visible") {
                        await syncFromDataverse(this.globalFetchController.signal)
                        scheduleNextSync(syncInterval);
                    }
                    resolve()
                }, time);
            })
        };

        const flushAndSync = async () => {
            if (document.visibilityState === "visible" && navigator.onLine) {
                await this.flushQueue()
                await scheduleNextSync!(50)
            }
        }

        const syncConfig: SyncConfig<Infer<T>> = {
            sync: ({ begin, write, commit, markReady, collection }) => {
                syncFromDataverse = async (signal: AbortSignal) => {
                    try {
                        // Pass down signal to underlying API client
                        const records = await table.getRecords({ signal } as any);

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
                        const tx = db.transaction(table.entitySetName, "readwrite");
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
                        markReady();
                    }
                };

                const handleTabMessage = (event: MessageEvent) => {
                    if (event.data?.type === "MUTATIONS_ADDED") {
                        begin();
                        for (const mutation of event.data.mutations) {
                            if (table.entitySetName === mutation.entitySetName) {
                                write({ type: mutation.type, value: mutation.value, metadata: { source: "tab" } });
                            }
                        }
                        commit();
                        scheduleNextSync(50)
                    }
                };

                this.channel.addEventListener("message", handleTabMessage);

                const syncFromIDB = async () => {
                    const db = await this.getDB();
                    const cached = (await db.getAll(table.entitySetName)) as Infer<T>[];
                    if (cached.length > 0) {
                        begin();
                        for (const item of cached) {
                            write({ type: "insert", value: item, metadata: { source: "idb" } });
                        }
                        commit();
                    }
                };

                syncFromIDB().then(flushAndSync);

                window.addEventListener("online", flushAndSync);
                document.addEventListener("visibilitychange", flushAndSync);

                return () => {
                    this.channel.removeEventListener("message", handleTabMessage);
                    if (pollTimer) clearTimeout(pollTimer);
                    window.removeEventListener("online", flushAndSync);
                    document.removeEventListener("visibilitychange", flushAndSync);
                };
            },
            rowUpdateMode: "full",
        };

        const defaultMutation = async ({ transaction }: { transaction: Transaction<any> }) => {
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

        return {
            ...rest,
            id: collectionId,
            getKey,
            sync: syncConfig,
            onInsert: defaultMutation,
            onUpdate: defaultMutation,
            onDelete: defaultMutation,
        } as CollectionConfig<Infer<T>, string | number, never>;
    }
}
