import type { CollectionConfig, InsertMutationFn, UpdateMutationFn, DeleteMutationFn, SyncConfig } from "@tanstack/db";
import type { DataverseTable, GenericProperties, Infer } from "../index";
import type {
  DataverseOfflineCollectionConfig,
  DataverseOfflineCollectionUtils,
  QueuedMutation,
} from "./types";
import { DEFAULT_QUEUE_STORE } from "./types";
import {
  getAllFromIDB,
  putAllToIDB,
  deleteManyFromIDB,
  clearIDBStore,
} from "./idb";
import { compactMutations } from "./compact";

const DEFAULT_POLL_INTERVAL = 30000;

function buildSelect(table: DataverseTable<GenericProperties>): string {
  return Object.values(table.fields)
    .filter((v: any) => v.kind === "value" || v.type === "lookupId" || v.type === "file" || v.type === "image")
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
  if (query?.top) params.set("$top", String(query.top));
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

export function dataverseOfflineCollectionOptions<T extends GenericProperties>(
  config: DataverseOfflineCollectionConfig<T>,
): CollectionConfig<Infer<T>, string | number, never, DataverseOfflineCollectionUtils> & { utils: DataverseOfflineCollectionUtils } {
  const { table, query, id, dbName = "dataverse-schema", storeName, syncInterval = DEFAULT_POLL_INTERVAL, queueStoreName = DEFAULT_QUEUE_STORE, ...rest } = config;
  const pk = table.primaryKey;
  const getKey = config.getKey ?? ((item: Infer<T>) => (item as any)[pk.key]);
  const collectionId = id ?? table.entitySetName;
  const dataStore = storeName ?? table.entitySetName;

  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let syncFn: (() => Promise<void>) | null = null;
  let onlineHandler: (() => void) | null = null;
  let nextSequence = 1;

  async function getQueue(): Promise<QueuedMutation[]> {
    try {
      return await getAllFromIDB<QueuedMutation>(dbName, queueStoreName);
    } catch {
      return [];
    }
  }

  async function enqueue(mutation: Omit<QueuedMutation, "sequence">): Promise<void> {
    const queue = await getQueue();
    const seq = nextSequence++;
    queue.push({ ...mutation, sequence: seq });
    await putAllToIDB(dbName, queueStoreName, queue, "id");
  }

  async function removeSuccessful(mutations: QueuedMutation[]): Promise<void> {
    if (mutations.length === 0) return;
    await deleteManyFromIDB(
      dbName,
      queueStoreName,
      mutations.map((m) => m.id),
    );
  }

  async function replayQueue(): Promise<void> {
    const allMutations = await getQueue();
    if (allMutations.length === 0) return;

    // Filter to this collection's mutations, then compact
    const myMutations = allMutations.filter((m) => m.collectionId === collectionId);
    const compacted = compactMutations(myMutations);

    // Sort: inserts first (FK-safe), then by sequence
    const TYPE_ORDER: Record<string, number> = { insert: 0, update: 1, delete: 2 };
    compacted.sort((a, b) => {
      const d = TYPE_ORDER[a.type] - TYPE_ORDER[b.type];
      return d !== 0 ? d : a.sequence - b.sequence;
    });

    const succeeded: QueuedMutation[] = [];
    const failed: QueuedMutation[] = [];

    for (const mutation of compacted) {
      try {
        switch (mutation.type) {
          case "insert":
            await table.insertRecord(mutation.value);
            break;
          case "update":
            await table.updateRecord(mutation.key as string, mutation.value);
            break;
          case "delete":
            await table.deleteRecord(mutation.key as string);
            break;
        }
        succeeded.push(mutation);
      } catch (err) {
        console.warn(`[dataverse-offline] failed to replay mutation ${mutation.id}:`, err);
        failed.push(mutation);
      }
    }

    await removeSuccessful(succeeded);

    if (failed.length > 0) {
      console.warn(`[dataverse-offline] ${failed.length} mutations failed for "${collectionId}", will retry next cycle`);
    }
  }

  const syncConfig: SyncConfig<Infer<T>> = {
    sync: ({ begin, write, commit, markReady }) => {
      syncFn = async () => {
        try {
          // Phase 1: hydrate from IDB (fast)
          let cached: Infer<T>[] = [];
          try {
            cached = await getAllFromIDB<Infer<T>>(dbName, dataStore);
          } catch {
            // IDB may not exist yet
          }

          if (cached.length > 0) {
            begin();
            for (const item of cached) {
              write({ type: "insert", value: item });
            }
            commit();
          }

          // Phase 2: sync from Dataverse
          try {
            const queryString = buildQueryForTable(table as DataverseTable<GenericProperties>, query);
            begin();
            for await (const page of table.client.iteratePages(table.entitySetName, queryString)) {
              const records = page.map((v: any) => table.transformValueFromDataverse(v));
              for (const record of records) {
                write({ type: "insert", value: record });
              }
              await putAllToIDB(dbName, dataStore, records, pk.key);
            }
            commit();

            if (navigator.onLine) {
              await replayQueue();
            }
          } catch (err) {
            console.warn(`[dataverse-offline] remote sync failed for "${collectionId}":`, err);
          }

          markReady();
        } catch (err) {
          console.warn(`[dataverse-offline] sync error for "${collectionId}":`, err);
          markReady();
        }
      };

      syncFn();

      if (syncInterval > 0) {
        pollTimer = setInterval(() => syncFn?.(), syncInterval);
      }

      onlineHandler = () => syncFn?.();
      window.addEventListener("online", onlineHandler);

      return () => {
        if (pollTimer) {
          clearInterval(pollTimer);
          pollTimer = null;
        }
        if (onlineHandler) {
          window.removeEventListener("online", onlineHandler);
          onlineHandler = null;
        }
      };
    },
    rowUpdateMode: "partial",
  };

  const defaultOnInsert: InsertMutationFn<Infer<T>> = async ({ transaction }) => {
    const results: (string | number)[] = [];
    for (const mutation of transaction.mutations) {
      let existing: any[];
      try { existing = await getAllFromIDB<any>(dbName, dataStore); } catch { existing = []; }
      existing.push(mutation.modified);
      await putAllToIDB(dbName, dataStore, existing, pk.key);

      if (navigator.onLine) {
        try {
          const guid = await table.insertRecord(mutation.modified);
          results.push(guid);
        } catch (err) {
          console.warn(`[dataverse-offline] insert failed, queuing:`, err);
          await enqueue({
            id: crypto.randomUUID(),
            type: "insert",
            key: (mutation.modified as any)[pk.key] ?? crypto.randomUUID(),
            value: mutation.modified,
            collectionId,
            timestamp: Date.now(),
          });
          results.push((mutation.modified as any)[pk.key]);
        }
      } else {
        await enqueue({
          id: crypto.randomUUID(),
          type: "insert",
          key: (mutation.modified as any)[pk.key] ?? crypto.randomUUID(),
          value: mutation.modified,
          collectionId,
          timestamp: Date.now(),
        });
        results.push((mutation.modified as any)[pk.key]);
      }
    }
    return results;
  };

  const defaultOnUpdate: UpdateMutationFn<Infer<T>> = async ({ transaction }) => {
    const results: (string | number)[] = [];
    for (const mutation of transaction.mutations) {
      let existing: any[];
      try { existing = await getAllFromIDB<any>(dbName, dataStore); } catch { existing = []; }
      const idx = existing.findIndex((item: any) => item[pk.key] === mutation.key);
      if (idx !== -1) {
        existing[idx] = { ...existing[idx], ...mutation.changes };
      } else {
        existing.push({ [pk.key]: mutation.key, ...mutation.changes });
      }
      await putAllToIDB(dbName, dataStore, existing, pk.key);

      if (navigator.onLine) {
        try {
          await table.updateRecord(mutation.key, mutation.changes);
          results.push(mutation.key);
        } catch (err) {
          console.warn(`[dataverse-offline] update failed, queuing:`, err);
          await enqueue({
            id: crypto.randomUUID(),
            type: "update",
            key: mutation.key,
            value: mutation.changes,
            collectionId,
            timestamp: Date.now(),
          });
          results.push(mutation.key);
        }
      } else {
        await enqueue({
          id: crypto.randomUUID(),
          type: "update",
          key: mutation.key,
          value: mutation.changes,
          collectionId,
          timestamp: Date.now(),
        });
        results.push(mutation.key);
      }
    }
    return results;
  };

  const defaultOnDelete: DeleteMutationFn<Infer<T>> = async ({ transaction }) => {
    const results: (string | number)[] = [];
    for (const mutation of transaction.mutations) {
      await deleteManyFromIDB(dbName, dataStore, [mutation.key]).catch(() => {});

      if (navigator.onLine) {
        try {
          await table.deleteRecord(mutation.key);
          results.push(mutation.key);
        } catch (err) {
          console.warn(`[dataverse-offline] delete failed, queuing:`, err);
          await enqueue({
            id: crypto.randomUUID(),
            type: "delete",
            key: mutation.key,
            collectionId,
            timestamp: Date.now(),
          });
          results.push(mutation.key);
        }
      } else {
        await enqueue({
          id: crypto.randomUUID(),
          type: "delete",
          key: mutation.key,
          collectionId,
          timestamp: Date.now(),
        });
        results.push(mutation.key);
      }
    }
    return results;
  };

  const utils: DataverseOfflineCollectionUtils = {
    isOnline: () => navigator.onLine,
    getPendingMutations: () => getQueue() as any,
    forceSync: async () => {
      await syncFn?.();
    },
    clearLocalData: async () => {
      await clearIDBStore(dbName, dataStore);
      // Only clear this collection's mutations from the shared queue
      const queue = await getQueue();
      const remaining = queue.filter((m) => m.collectionId !== collectionId);
      await putAllToIDB(dbName, queueStoreName, remaining, "id");
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
  } as CollectionConfig<Infer<T>, string | number, never, DataverseOfflineCollectionUtils> & { utils: DataverseOfflineCollectionUtils };
}
