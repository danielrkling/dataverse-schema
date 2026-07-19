import type { CollectionConfig, InsertMutationFn, UpdateMutationFn, DeleteMutationFn, UtilsRecord } from "@tanstack/db";
import type { DataverseTable, GenericProperties, Infer, QueryForTable } from "../index";

export const DEFAULT_QUEUE_STORE = "__mutations";

export type DataverseCollectionConfig<T extends GenericProperties> = {
  id?: string;
  table: DataverseTable<T>;
  query?: QueryForTable<Infer<T>>;
  getKey?: (item: Infer<T>) => string | number;
  onInsert?: InsertMutationFn<Infer<T>>;
  onUpdate?: UpdateMutationFn<Infer<T>>;
  onDelete?: DeleteMutationFn<Infer<T>>;
} & Omit<CollectionConfig<Infer<T>>, "sync" | "getKey" | "onInsert" | "onUpdate" | "onDelete">;

export type DataverseOfflineCollectionConfig<T extends GenericProperties> =
  DataverseCollectionConfig<T> & {
    dbName?: string;
    storeName?: string;
    syncInterval?: number;
    queueStoreName?: string;
  };

export interface DataverseCollectionUtils extends UtilsRecord {
  forceSync: () => Promise<void>;
}

export interface DataverseOfflineCollectionUtils extends UtilsRecord {
  isOnline: () => boolean;
  getPendingMutations: () => QueuedMutation[];
  forceSync: () => Promise<void>;
  clearLocalData: () => Promise<void>;
}

export type QueuedMutation = {
  id: string;
  type: "insert" | "update" | "delete";
  key: string | number;
  value?: any;
  collectionId: string;
  sequence: number;
  timestamp: number;
};
