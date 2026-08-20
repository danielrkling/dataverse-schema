import { CollectionConfig, UtilsRecord } from '@tanstack/db';
import { DataverseTable, GenericProperties, Infer } from 'dataverse-schema';
export type DataverseCollectionConfig<T extends GenericProperties> = {
    table: DataverseTable<T>;
    syncInterval?: number;
    readOnlyWhenOffline?: boolean;
} & Omit<CollectionConfig<Infer<T>>, "sync" | "getKey" | "onInsert" | "onUpdate" | "onDelete">;
export interface DataverseCollectionUtils<T extends GenericProperties> extends UtilsRecord {
    forceSync: () => Promise<void>;
    table: DataverseTable<T>;
}
export declare function dataverseCollectionOptions<T extends GenericProperties>(config: DataverseCollectionConfig<T>): CollectionConfig<Infer<T>, string | number, never, DataverseCollectionUtils<T>>;
