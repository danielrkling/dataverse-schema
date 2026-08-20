import { DataverseTable, GenericProperties, Infer } from "dataverse-schema";
import { IDBPDatabase } from "idb";
import { CollectionConfig, PendingMutation, UtilsRecord } from "@tanstack/db";
//#region src/tanstack-db/collection.d.ts
type DataverseCollectionConfig<T extends GenericProperties> = {
  table: DataverseTable<T>;
  syncInterval?: number;
  readOnlyWhenOffline?: boolean;
} & Omit<CollectionConfig<Infer<T>>, "sync" | "getKey" | "onInsert" | "onUpdate" | "onDelete">;
interface DataverseCollectionUtils<T extends GenericProperties> extends UtilsRecord {
  forceSync: () => Promise<void>;
  table: DataverseTable<T>;
}
declare function dataverseCollectionOptions<T extends GenericProperties>(config: DataverseCollectionConfig<T>): CollectionConfig<Infer<T>, string | number, never, DataverseCollectionUtils<T>>;
//#endregion
//#region src/tanstack-db/offline-collection.d.ts
type DataverseOfflineCollectionConfig<T extends GenericProperties> = DataverseCollectionConfig<T>;
type QueuedMutation = {
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
declare class MutationPersistenceError extends Error {
  readonly mutationIds: string[];
  readonly cause: unknown;
  constructor(message: string, mutationIds: string[], cause: unknown);
}
declare class DataverseSyncDB {
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
//#endregion
export { type DataverseCollectionConfig, type DataverseCollectionUtils, type DataverseOfflineCollectionConfig, DataverseSyncDB, MutationPersistenceError, type QueuedMutation, dataverseCollectionOptions };