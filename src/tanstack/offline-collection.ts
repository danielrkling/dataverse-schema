import type { CollectionConfig, InsertMutationFn, UpdateMutationFn, DeleteMutationFn, SyncConfig } from "@tanstack/db";
import type { DataverseTable, GenericProperties, Infer } from "dataverse-schema";
import type {
  DataverseOfflineCollectionConfig,
  DataverseOfflineCollectionUtils,
  QueuedMutation,
} from "./types";
import { DEFAULT_QUEUE_STORE } from "./types";
import {
  getAllFromIDB,
  getFromIDB,
  putAllToIDB,
  putToIDB,
  enqueueToIDB,
  deleteManyFromIDB,
  clearIDBStore,
  deleteWhereFromIDB,
} from "./idb";
import { replayMutations } from "./replay";
import type { OfflineChannelMessage } from "./coordination";
import {
  requireCrossTabApis,
  withLock,
  replayLockName,
  openChannel,
  postToChannel,
} from "./coordination";

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
  requireCrossTabApis();

  const { table, query, id, dbName = "dataverse-schema", storeName, syncInterval = DEFAULT_POLL_INTERVAL, queueStoreName = DEFAULT_QUEUE_STORE, ...rest } = config;
  const pk = table.primaryKey;
  const getKey = config.getKey ?? ((item: Infer<T>) => (item as any)[pk.key]);
  const collectionId = id ?? table.entitySetName;
  const dataStore = storeName ?? table.entitySetName;
  const lockName = replayLockName(dbName, collectionId);
  // Identifies this options instance so BroadcastChannel self-delivery can be
  // ignored instead of triggering a redundant sync cycle on the sender.
  const instanceId = crypto.randomUUID();

  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let onlineHandler: (() => void) | null = null;
  let channelCleanup: (() => void) | null = null;
  let syncFn: (() => Promise<void>) | null = null;

  async function getQueue(): Promise<QueuedMutation[]> {
    try {
      return await getAllFromIDB<QueuedMutation>(dbName, queueStoreName);
    } catch {
      return [];
    }
  }

  function broadcast(
    message: Omit<OfflineChannelMessage, "dbName" | "collectionId" | "source">,
  ): void {
    postToChannel({ ...message, dbName, collectionId, source: instanceId });
  }

  async function queueMutation(
    mutation: Omit<QueuedMutation, "sequence">,
  ): Promise<void> {
    await enqueueToIDB<QueuedMutation>(dbName, queueStoreName, [mutation]);
    broadcast({ type: "queue-changed" });
  }

  const syncConfig: SyncConfig<Infer<T>> = {
    sync: ({ begin, write, commit, markReady }) => {
      // Coalescing: concurrent sync requests (poll, online, forceSync,
      // BroadcastChannel) collapse into one in-flight cycle plus at most one
      // follow-up rerun.
      let running = false;
      let rerunRequested = false;
      let currentRun: Promise<void> = Promise.resolve();

      const runCycle = async (): Promise<void> => {
        // Phase 1: hydrate from IDB (fast) — runs in every tab, so offline and
        // non-leader tabs still get instant cached UI.
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

        if (!navigator.onLine) {
          markReady();
          return;
        }

        // Phase 2: leader-tab only. Replay local mutations first so the remote
        // snapshot (and therefore IDB) includes our pending writes, preventing
        // the optimistic-clobber bug. Non-leaders skip this — their own fresh
        // snapshot arrives via the sync-complete broadcast.
        try {
          await withLock(lockName, async () => {
            await replayMutations({
              dbName,
              queueStoreName,
              tables: { [collectionId]: table as DataverseTable<GenericProperties> },
              collectionId,
            });

            const queryString = buildQueryForTable(table as DataverseTable<GenericProperties>, query);
            begin();
            try {
              for await (const page of table.client.iteratePages(table.entitySetName, { query: queryString })) {
                const records = page.map((v: any) => table.transformValueFromDataverse(v));
                for (const record of records) {
                  write({ type: "insert", value: record });
                }
                await putAllToIDB(dbName, dataStore, records, pk.key);
              }
            } finally {
              commit();
            }

            broadcast({ type: "sync-complete" });
          });
        } catch (err) {
          console.warn(`[dataverse-offline] remote sync failed for "${collectionId}":`, err);
        }

        markReady();
      };

      const runSync = (): Promise<void> => {
        if (running) {
          rerunRequested = true;
          return currentRun;
        }
        running = true;
        currentRun = (async () => {
          try {
            do {
              rerunRequested = false;
              await runCycle();
            } while (rerunRequested);
          } catch (err) {
            console.warn(`[dataverse-offline] sync error for "${collectionId}":`, err);
          } finally {
            running = false;
          }
        })();
        return currentRun;
      };
      syncFn = runSync;

      channelCleanup = openChannel((message) => {
        if (message.source === instanceId) return;
        if (message.dbName !== dbName || message.collectionId !== collectionId) return;
        syncFn?.();
      });

      syncFn?.();

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
        if (channelCleanup) {
          channelCleanup();
          channelCleanup = null;
        }
      };
    },
    rowUpdateMode: "partial",
  };

  const defaultOnInsert: InsertMutationFn<Infer<T>> = async ({ transaction }) => {
    const results: (string | number)[] = [];
    for (const mutation of transaction.mutations) {
      const key = (mutation.modified as any)[pk.key] ?? crypto.randomUUID();
      await putToIDB(dbName, dataStore, mutation.modified);

      if (navigator.onLine) {
        try {
          const guid = await table.insertRecord(mutation.modified);
          results.push(guid);
        } catch (err) {
          console.warn(`[dataverse-offline] insert failed, queuing:`, err);
          await queueMutation({
            id: crypto.randomUUID(),
            type: "insert",
            key,
            value: mutation.modified,
            collectionId,
            timestamp: Date.now(),
          });
          results.push(key);
        }
      } else {
        await queueMutation({
          id: crypto.randomUUID(),
          type: "insert",
          key,
          value: mutation.modified,
          collectionId,
          timestamp: Date.now(),
        });
        results.push(key);
      }
    }
    return results;
  };

  const defaultOnUpdate: UpdateMutationFn<Infer<T>> = async ({ transaction }) => {
    const results: (string | number)[] = [];
    for (const mutation of transaction.mutations) {
      const existing = await getFromIDB<any>(dbName, dataStore, mutation.key);
      const merged = { ...(existing ?? { [pk.key]: mutation.key }), ...mutation.changes };
      await putToIDB(dbName, dataStore, merged);

      if (navigator.onLine) {
        try {
          await table.updateRecord(mutation.key, mutation.changes);
          results.push(mutation.key);
        } catch (err) {
          console.warn(`[dataverse-offline] update failed, queuing:`, err);
          await queueMutation({
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
        await queueMutation({
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
          await queueMutation({
            id: crypto.randomUUID(),
            type: "delete",
            key: mutation.key,
            collectionId,
            timestamp: Date.now(),
          });
          results.push(mutation.key);
        }
      } else {
        await queueMutation({
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
      await deleteWhereFromIDB(dbName, queueStoreName, "collectionId", collectionId);
      broadcast({ type: "queue-changed", count: 0 });
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
