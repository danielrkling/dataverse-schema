import type { CollectionConfig, InsertMutationFn, UpdateMutationFn, DeleteMutationFn, SyncConfig, UtilsRecord } from "@tanstack/db";
import type { DataverseTable, GenericProperties, Infer } from "../index";
import type { DataverseCollectionConfig, DataverseCollectionUtils } from "./types";

const MAX_DEFAULT_ROWS = 5000;
const DEFAULT_POLL_INTERVAL = 30000;

function buildSelect(table: DataverseTable<GenericProperties>): string {
  return Object.values(table.fields)
    .filter((v: any) => v.kind === "value" || v.type === "lookupId" || v.type === "file")
    .map((v: any) => v.fromDataverseName)
    .join(",");
}

function buildQueryForTable(
  table: DataverseTable<GenericProperties>,
  query?: { orderby?: any; filter?: string; top?: number },
): string {
  const params = new URLSearchParams();
  const select = buildSelect(table);
  if (select) params.set("$select", select);
  const top = query?.top ?? MAX_DEFAULT_ROWS;
  params.set("$top", String(top));
  if (query?.filter) params.set("$filter", query.filter);
  if (query?.orderby) {
    const ob = typeof query.orderby === "string"
      ? query.orderby
      : Object.entries(query.orderby)
          .map(([key, value]) => `${table.fields[key].name} ${value}`)
          .join(",");
    if (ob) params.set("$orderby", ob);
  }
  return params.toString();
}

export function dataverseCollectionOptions<T extends GenericProperties>(
  config: DataverseCollectionConfig<T>,
): CollectionConfig<Infer<T>, string | number, never, DataverseCollectionUtils> & { utils: DataverseCollectionUtils } {
  const { table, query, id, ...rest } = config;
  const pk = table.getPrimaryKey();
  const getKey = config.getKey ?? ((item: Infer<T>) => (item as any)[pk.key]);
  const collectionId = id ?? table.entitySetName;

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
          const queryString = buildQueryForTable(table as DataverseTable<GenericProperties>, query);
          const raw = await table.client.getRecords(table.entitySetName, queryString);
          const records = raw.map((v: any) => table.transformValueFromDataverse(v));

          begin();
          for (const record of records) {
            write({ type: "insert", value: record });
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
      }, DEFAULT_POLL_INTERVAL);

      return () => {
        if (pollTimer) {
          clearInterval(pollTimer);
          pollTimer = null;
        }
      };
    },
    rowUpdateMode: "partial",
  };

  const utils: DataverseCollectionUtils = {
    forceSync: async () => {
      await syncFn?.();
    },
  };

  return {
    ...rest,
    id: collectionId,
    getKey,
    sync: syncConfig,
    onInsert: config.onInsert ?? defaultOnInsert,
    onUpdate: config.onUpdate ?? defaultOnUpdate,
    onDelete: config.onDelete ?? defaultOnDelete,
    utils,
  } as CollectionConfig<Infer<T>, string | number, never, DataverseCollectionUtils> & { utils: DataverseCollectionUtils };
}
