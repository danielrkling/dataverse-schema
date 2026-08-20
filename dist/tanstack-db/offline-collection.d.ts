import { CollectionConfig, PendingMutation } from '@tanstack/db';
import { IDBPDatabase } from 'idb';
import { DataverseTable, GenericProperties, Infer } from '../index.ts';
import { DataverseCollectionConfig } from './collection';
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
    etag?: string;
    lastAttemptAt?: number;
    nextAttemptAt?: number;
    error?: any;
};
export declare class MutationPersistenceError extends Error {
    readonly mutationIds: string[];
    readonly cause: unknown;
    constructor(message: string, mutationIds: string[], cause: unknown);
}
export declare class DataverseSyncDB {
    name: string;
    version: number;
    tables: Map<string, DataverseTable<GenericProperties>>;
    MUTATION_QUEUE_NAME: string;
    ERRORED_MUTATIONS_NAME: string;
    channel: BroadcastChannel;
    private closed;
    private activeFetchControllers;
    private collectionCleanups;
    private readonly channelMessageHandler;
    constructor(name: string, tables: DataverseTable<GenericProperties>[], version: number);
    sequence: number;
    serializeMutation(mutation: PendingMutation<any>): QueuedMutation;
    private db;
    getDB(): Promise<IDBPDatabase<unknown>>;
    /**
     * Instantly aborts any in-flight remote server GET requests across all collections.
     */
    abortActiveFetches(): void;
    close(): void;
    private flushQueue;
    getQueueCount(): Promise<number>;
    getErroredMutations(): Promise<QueuedMutation[]>;
    retryErroredMutation(id: string): Promise<void>;
    discardErroredMutation(id: string): Promise<void>;
    queueMutations(mutations: QueuedMutation[]): Promise<void>;
    createCollectionOptions<T extends GenericProperties>(config: DataverseOfflineCollectionConfig<T>): CollectionConfig<Infer<T>, string | number, never>;
}
