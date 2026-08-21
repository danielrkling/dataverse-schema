import { type Transaction, type CollectionConfig, type PendingMutation, type SyncConfig } from "@tanstack/db";
import { IDBPDatabase, openDB } from "idb";
import { getEtag, type DataverseTable, type GenericProperties, type Infer } from "dataverse-schema";
import type { DataverseCollectionConfig } from "./collection";

const DEFAULT_POLL_INTERVAL = 30000;
const MAX_MUTATION_ATTEMPTS = 3;
const RETRY_BASE_DELAY = 1000;
const RETRY_MAX_DELAY = 60000;


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


export class DataverseSyncDB {
    name: string;
    version: number;
    tables: Map<string, DataverseTable<GenericProperties>>;

    MUTATION_QUEUE_NAME = "Mutations"
    ERRORED_MUTATIONS_NAME = "Errored Mutations"

    channel: BroadcastChannel
    private closed = false
    private activeFetchControllers = new Set<AbortController>()
    private collectionCleanups = new Set<() => void>()
    private readonly channelMessageHandler: (event: MessageEvent) => void

    constructor(name: string, tables: DataverseTable<GenericProperties>[], version: number) {
        this.name = name;
        this.channel = new BroadcastChannel(name)
        this.version = version;
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
        return {
            id: mutation.mutationId,
            type: mutation.type,
            value: mutation.modified,
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
            this.db = await openDB(this.name, this.version, {
                upgrade(database, oldVersion, _newVersion, transaction) {
                    // Queue stores are durable application state. Table stores are
                    // disposable cache state and are rebuilt by the next sync.
                    for (const storeName of Array.from(database.objectStoreNames)) {
                        if (
                            storeName !== self.MUTATION_QUEUE_NAME &&
                            storeName !== self.ERRORED_MUTATIONS_NAME
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
                            database.createObjectStore(table.entitySetName, { keyPath: table.primaryKey.key });
                        }
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
        for (const controller of this.activeFetchControllers) {
            controller.abort("New mutation enqueued");
        }
        this.activeFetchControllers.clear();
    }

    public close() {
        if (this.closed) return;
        this.closed = true;
        this.abortActiveFetches();
        for (const cleanup of [...this.collectionCleanups]) cleanup();
        this.collectionCleanups.clear();
        this.channel.removeEventListener("message", this.channelMessageHandler);
        this.channel.close();
        this.db?.close();
        this.db = undefined;
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
                if (mutation.nextAttemptAt && mutation.nextAttemptAt > Date.now()) {
                    break;
                }
                const table = this.tables.get(mutation.entitySetName);

                if (!table) {
                    console.error(`Table ${mutation.entitySetName} not registered in DB`);
                    await db.delete(this.MUTATION_QUEUE_NAME, mutation.id);
                    continue;
                }


                try {
                    if (mutation.type === "insert") {
                        await table.createRecord(mutation.value);
                    } else if (mutation.type === "update") {
                        await table.updateRecord(mutation.key, mutation.value, { ifMatch: mutation.ifMatch });
                    } else if (mutation.type === "delete") {
                        await table.deleteRecord(mutation.key, { ifMatch: mutation.ifMatch });
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
                        break;
                    }


                }
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
    ): CollectionConfig<Infer<T>, string | number, never> {
        if (this.closed) throw new Error("DataverseSyncDB is closed");
        const {
            table,
            syncInterval = DEFAULT_POLL_INTERVAL,
            readOnlyWhenOffline = false,
            ...rest
        } = config;
        this.tables.set(table.entitySetName, table);
        const pk = table.primaryKey;
        const getKey = (item: Infer<T>) => (item as any)[pk.key];
        const collectionId = table.entitySetName;

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
                    if (navigator.onLine && document.visibilityState === "visible") {
                        await runSync();
                        scheduleNextSync(syncInterval);
                    }
                    resolve()
                }, time);
            })
        };

        const flushAndSync = async () => {
            if (!disposed && document.visibilityState === "visible" && navigator.onLine) {
                await this.flushQueue()
                await scheduleNextSync!(50)
            }
        }

        const syncConfig: SyncConfig<Infer<T>> = {
            sync: ({ begin, write, commit, markReady, collection }) => {
                syncFromDataverse = async (signal: AbortSignal) => {
                    try {
                        // Pass down signal to underlying API client
                        const records = await table.getRecords(undefined, { signal });

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
