const DEFAULT_POLL_INTERVAL$1 = 3e4;
function buildSelect$1(table) {
  return Object.values(table.fields).filter((v) => v.kind === "value" || v.type === "lookupId" || v.type === "file" || v.type === "image").map((v) => v.fromDataverseName).join(",");
}
function buildQueryForTable$1(table, query) {
  const params = new URLSearchParams();
  const select = buildSelect$1(table);
  if (select) params.set("$select", select);
  if (query?.top) params.set("$top", String(query.top));
  if (query?.filter) params.set("$filter", query.filter);
  if (query?.orderby) {
    const ob = typeof query.orderby === "string" ? query.orderby : Object.entries(query.orderby).map(([key, value]) => `${table.fields[key].name} ${value}`).join(",");
    if (ob) params.set("$orderby", ob);
  }
  return params.toString();
}
function dataverseCollectionOptions(config) {
  const { table, query, id, ...rest } = config;
  const pk = table.primaryKey;
  const getKey = config.getKey ?? ((item) => item[pk.key]);
  const collectionId = id ?? table.entitySetName;
  let pollTimer = null;
  let syncFn = null;
  const defaultOnInsert = async ({ transaction }) => {
    const results = [];
    for (const mutation of transaction.mutations) {
      const guid = await table.insertRecord(mutation.modified);
      results.push(guid);
    }
    return results;
  };
  const defaultOnUpdate = async ({ transaction }) => {
    const results = [];
    for (const mutation of transaction.mutations) {
      await table.updateRecord(mutation.key, mutation.changes);
      results.push(mutation.key);
    }
    return results;
  };
  const defaultOnDelete = async ({ transaction }) => {
    const results = [];
    for (const mutation of transaction.mutations) {
      await table.deleteRecord(mutation.key);
      results.push(mutation.key);
    }
    return results;
  };
  const syncConfig = {
    sync: ({ begin, write, commit, markReady, collection }) => {
      syncFn = async () => {
        try {
          const queryString = buildQueryForTable$1(table, query);
          begin();
          for await (const record of table.client.iterateRecords(table.entitySetName, { query: queryString })) {
            write({ type: "insert", value: table.transformValueFromDataverse(record) });
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
      }, DEFAULT_POLL_INTERVAL$1);
      return () => {
        if (pollTimer) {
          clearInterval(pollTimer);
          pollTimer = null;
        }
      };
    },
    rowUpdateMode: "partial"
  };
  const utils = {
    forceSync: async () => {
      await syncFn?.();
    }
  };
  return {
    ...rest,
    id: collectionId,
    getKey,
    sync: syncConfig,
    onInsert: config.onInsert ?? defaultOnInsert,
    onUpdate: config.onUpdate ?? defaultOnUpdate,
    onDelete: config.onDelete ?? defaultOnDelete,
    utils
  };
}

const DEFAULT_QUEUE_STORE = "__mutations";

function openIDB(dbName, storeName, version = 1) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, version);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(storeName)) {
        db.createObjectStore(storeName, { keyPath: "id" });
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      if (db.objectStoreNames.contains(storeName)) {
        resolve(db);
      } else {
        db.close();
        const req2 = indexedDB.open(dbName, version + 1);
        req2.onupgradeneeded = () => {
          const db2 = req2.result;
          if (!db2.objectStoreNames.contains(storeName)) {
            db2.createObjectStore(storeName, { keyPath: "id" });
          }
        };
        req2.onsuccess = () => resolve(req2.result);
        req2.onerror = () => reject(req2.error);
      }
    };
    request.onerror = () => reject(request.error);
  });
}
async function getAllFromIDB(dbName, storeName) {
  const db = await openIDB(dbName, storeName);
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readonly");
      const store = tx.objectStore(storeName);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}
async function getFromIDB(dbName, storeName, key) {
  const db = await openIDB(dbName, storeName);
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readonly");
      const store = tx.objectStore(storeName);
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}
async function putToIDB(dbName, storeName, item) {
  const db = await openIDB(dbName, storeName);
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readwrite");
      const store = tx.objectStore(storeName);
      store.put(item);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
async function enqueueToIDB(dbName, storeName, items) {
  if (items.length === 0) return;
  const db = await openIDB(dbName, storeName);
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readwrite");
      const store = tx.objectStore(storeName);
      let maxSeq = 0;
      const cursorRequest = store.openCursor();
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (cursor) {
          const value = cursor.value;
          const seq = value.sequence;
          if (typeof seq === "number" && seq > maxSeq) {
            maxSeq = seq;
          }
          cursor.continue();
        } else {
          let next = maxSeq;
          for (const item of items) {
            next += 1;
            store.put({ ...item, sequence: next });
          }
        }
      };
      cursorRequest.onerror = () => reject(cursorRequest.error);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
async function putAllToIDB(dbName, storeName, items, keyPath = "id") {
  const db = await openIDB(dbName, storeName);
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readwrite");
      const store = tx.objectStore(storeName);
      for (const item of items) {
        store.put(item);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
async function deleteManyFromIDB(dbName, storeName, keys) {
  const db = await openIDB(dbName, storeName);
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readwrite");
      const store = tx.objectStore(storeName);
      for (const key of keys) {
        store.delete(key);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
async function clearIDBStore(dbName, storeName) {
  const db = await openIDB(dbName, storeName);
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readwrite");
      const store = tx.objectStore(storeName);
      store.clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
async function deleteWhereFromIDB(dbName, storeName, keyPath, value) {
  const db = await openIDB(dbName, storeName);
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readwrite");
      const store = tx.objectStore(storeName);
      const request = store.openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          if (cursor.value[keyPath] === value) {
            cursor.delete();
          }
          cursor.continue();
        }
      };
      request.onerror = () => reject(request.error);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

function compactMutationsWithConsumed(mutations) {
  const groups = /* @__PURE__ */ new Map();
  for (const m of mutations) {
    const key = `${m.collectionId}::${m.key}`;
    let group = groups.get(key);
    if (!group) {
      group = [];
      groups.set(key, group);
    }
    group.push(m);
  }
  const compacted = [];
  const resultGroups = [];
  for (const group of groups.values()) {
    group.sort((a, b) => a.sequence - b.sequence);
    let result = null;
    for (const m of group) {
      if (!result) {
        result = { ...m };
        continue;
      }
      if (result.type === "insert") {
        if (m.type === "insert") {
          result = { ...m };
        } else if (m.type === "update") {
          result = { ...result, value: { ...result.value, ...m.value }, sequence: m.sequence };
        } else if (m.type === "delete") {
          result = null;
        }
      } else if (result.type === "update") {
        if (m.type === "update") {
          result = { ...result, value: { ...result.value, ...m.value }, sequence: m.sequence };
        } else if (m.type === "delete") {
          result = { ...m };
        }
      } else if (result.type === "delete") {
        if (m.type === "insert") {
          result = { ...m };
        } else if (m.type === "update") ; else if (m.type === "delete") ;
      }
    }
    if (result) {
      compacted.push(result);
    }
    resultGroups.push({
      result,
      ids: group.map((m) => m.id)
    });
  }
  compacted.sort((a, b) => a.sequence - b.sequence);
  return { mutations: compacted, groups: resultGroups };
}

const CHANNEL_NAME = "dataverse-offline";
function requireCrossTabApis() {
  if (typeof navigator === "undefined" || !("locks" in navigator)) {
    throw new Error(
      "dataverseOfflineCollectionOptions requires the Web Locks API (navigator.locks), available in all evergreen browsers since 2020-2022"
    );
  }
  if (typeof BroadcastChannel === "undefined") {
    throw new Error(
      "dataverseOfflineCollectionOptions requires the BroadcastChannel API, available in all evergreen browsers since 2020"
    );
  }
}
async function withLock(name, fn) {
  const locks = navigator.locks;
  if (!locks) return null;
  return await locks.request(
    name,
    { ifAvailable: true },
    async (lock) => {
      if (!lock) return null;
      return fn();
    }
  );
}
function replayLockName(dbName, collectionId) {
  return `dataverse-offline:${dbName}:${collectionId}`;
}
function openChannel(handler) {
  const channel = new BroadcastChannel(CHANNEL_NAME);
  channel.onmessage = (event) => {
    const message = event.data;
    if (!message) return;
    handler(message);
  };
  return () => channel.close();
}
let postChannel;
function getPostChannel() {
  if (postChannel === void 0) {
    try {
      postChannel = new BroadcastChannel(CHANNEL_NAME);
    } catch {
      postChannel = null;
    }
  }
  return postChannel;
}
function postToChannel(message) {
  try {
    getPostChannel()?.postMessage(message);
  } catch {
  }
}

const TYPE_ORDER = { insert: 0, update: 1, delete: 2 };
const MAX_RETRIES = 6;
function backoffDelayMs(attempts) {
  return Math.min(2 ** (attempts - 1) * 1e3, 5 * 60 * 1e3);
}
function sortByType(mutations) {
  return [...mutations].sort((a, b) => {
    const typeDiff = TYPE_ORDER[a.type] - TYPE_ORDER[b.type];
    if (typeDiff !== 0) return typeDiff;
    return a.sequence - b.sequence;
  });
}
async function replayMutations(options) {
  const {
    dbName = "dataverse-schema",
    queueStoreName = DEFAULT_QUEUE_STORE,
    tables,
    collectionId
  } = options;
  let allMutations;
  try {
    allMutations = await getAllFromIDB(dbName, queueStoreName);
  } catch {
    return { succeeded: 0, failed: 0, remaining: 0 };
  }
  if (allMutations.length === 0) {
    return { succeeded: 0, failed: 0, remaining: 0 };
  }
  const scope = collectionId ? allMutations.filter((m) => m.collectionId === collectionId) : allMutations;
  if (scope.length === 0) {
    return { succeeded: 0, failed: 0, remaining: 0 };
  }
  const { mutations: compacted, groups } = compactMutationsWithConsumed(scope);
  const now = Date.now();
  const succeeded = [];
  const failed = [];
  const consumedIds = /* @__PURE__ */ new Set();
  for (const group of groups) {
    if (!group.result) {
      for (const id of group.ids) consumedIds.add(id);
    } else {
      for (const id of group.ids) {
        if (id !== group.result.id) consumedIds.add(id);
      }
    }
  }
  const sorted = sortByType(compacted);
  for (const mutation of sorted) {
    const table = tables[mutation.collectionId];
    if (!table) {
      console.warn(
        `[replay] no table found for collection "${mutation.collectionId}", skipping mutation ${mutation.id}`
      );
      failed.push(mutation);
      continue;
    }
    const attempts = mutation.attempts ?? 0;
    if (attempts >= MAX_RETRIES && mutation.lastAttemptAt != null && now - mutation.lastAttemptAt < backoffDelayMs(attempts)) {
      continue;
    }
    try {
      switch (mutation.type) {
        case "insert": {
          const existing = await table.getRecord(mutation.key);
          if (existing != null) {
            await table.updateRecord(mutation.key, mutation.value);
          } else {
            await table.insertRecord(mutation.value);
          }
          break;
        }
        case "update":
          await table.updateRecord(mutation.key, mutation.value);
          break;
        case "delete":
          await table.deleteRecord(mutation.key);
          break;
      }
      succeeded.push(mutation);
    } catch (err) {
      console.warn(`[replay] failed to replay mutation ${mutation.id} on "${mutation.collectionId}":`, err);
      failed.push({
        ...mutation,
        attempts: attempts + 1,
        lastAttemptAt: now
      });
    }
  }
  const successKeys = succeeded.map((m) => m.id);
  if (successKeys.length > 0 || consumedIds.size > 0) {
    await deleteManyFromIDB(dbName, queueStoreName, [...consumedIds, ...successKeys]);
  }
  for (const mutation of failed) {
    await putToIDB(dbName, queueStoreName, mutation);
  }
  const remaining = scope.length - succeeded.length - consumedIds.size;
  return {
    succeeded: succeeded.length,
    failed: failed.length,
    remaining
  };
}
async function replayAllQueues(options) {
  const {
    dbName = "dataverse-schema",
    queueStoreName = DEFAULT_QUEUE_STORE,
    tables
  } = options;
  let allMutations;
  try {
    allMutations = await getAllFromIDB(dbName, queueStoreName);
  } catch {
    return { succeeded: 0, failed: 0, remaining: 0 };
  }
  const byCollection = /* @__PURE__ */ new Map();
  for (const m of allMutations) {
    const list = byCollection.get(m.collectionId) ?? [];
    list.push(m);
    byCollection.set(m.collectionId, list);
  }
  let succeeded = 0;
  let failed = 0;
  let remaining = 0;
  for (const [collectionId, mutations] of byCollection) {
    const result = await withLock(
      replayLockName(dbName, collectionId),
      async () => replayMutations({ dbName, queueStoreName, tables, collectionId })
    );
    if (result) {
      succeeded += result.succeeded;
      failed += result.failed;
      remaining += result.remaining;
    } else {
      remaining += mutations.length;
    }
  }
  return { succeeded, failed, remaining };
}

const DEFAULT_POLL_INTERVAL = 3e4;
function buildSelect(table) {
  return Object.values(table.fields).filter((v) => v.kind === "value" || v.type === "lookupId" || v.type === "file" || v.type === "image").map((v) => v.fromDataverseName).join(",");
}
function buildQueryForTable(table, query) {
  const params = new URLSearchParams();
  const select = buildSelect(table);
  if (select) params.set("$select", select);
  if (query?.top) params.set("$top", String(query.top));
  if (query?.filter) params.set("$filter", query.filter);
  if (query?.orderby) {
    const ob = typeof query.orderby === "string" ? query.orderby : Object.entries(query.orderby).map(([key, value]) => `${table.fields[key].name} ${value}`).join(",");
    if (ob) params.set("$orderby", ob);
  }
  return params.toString();
}
function dataverseOfflineCollectionOptions(config) {
  requireCrossTabApis();
  const { table, query, id, dbName = "dataverse-schema", storeName, syncInterval = DEFAULT_POLL_INTERVAL, queueStoreName = DEFAULT_QUEUE_STORE, ...rest } = config;
  const pk = table.primaryKey;
  const getKey = config.getKey ?? ((item) => item[pk.key]);
  const collectionId = id ?? table.entitySetName;
  const dataStore = storeName ?? table.entitySetName;
  const lockName = replayLockName(dbName, collectionId);
  const instanceId = crypto.randomUUID();
  let pollTimer = null;
  let onlineHandler = null;
  let channelCleanup = null;
  let syncFn = null;
  async function getQueue() {
    try {
      return await getAllFromIDB(dbName, queueStoreName);
    } catch {
      return [];
    }
  }
  function broadcast(message) {
    postToChannel({ ...message, dbName, collectionId, source: instanceId });
  }
  async function queueMutation(mutation) {
    await enqueueToIDB(dbName, queueStoreName, [mutation]);
    broadcast({ type: "queue-changed" });
  }
  const syncConfig = {
    sync: ({ begin, write, commit, markReady }) => {
      let running = false;
      let rerunRequested = false;
      let currentRun = Promise.resolve();
      const runCycle = async () => {
        let cached = [];
        try {
          cached = await getAllFromIDB(dbName, dataStore);
        } catch {
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
        try {
          await withLock(lockName, async () => {
            await replayMutations({
              dbName,
              queueStoreName,
              tables: { [collectionId]: table },
              collectionId
            });
            const queryString = buildQueryForTable(table, query);
            begin();
            try {
              for await (const page of table.client.iteratePages(table.entitySetName, { query: queryString })) {
                const records = page.map((v) => table.transformValueFromDataverse(v));
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
      const runSync = () => {
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
    rowUpdateMode: "partial"
  };
  const defaultOnInsert = async ({ transaction }) => {
    const results = [];
    for (const mutation of transaction.mutations) {
      const key = mutation.modified[pk.key] ?? crypto.randomUUID();
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
            timestamp: Date.now()
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
          timestamp: Date.now()
        });
        results.push(key);
      }
    }
    return results;
  };
  const defaultOnUpdate = async ({ transaction }) => {
    const results = [];
    for (const mutation of transaction.mutations) {
      const existing = await getFromIDB(dbName, dataStore, mutation.key);
      const merged = { ...existing ?? { [pk.key]: mutation.key }, ...mutation.changes };
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
            timestamp: Date.now()
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
          timestamp: Date.now()
        });
        results.push(mutation.key);
      }
    }
    return results;
  };
  const defaultOnDelete = async ({ transaction }) => {
    const results = [];
    for (const mutation of transaction.mutations) {
      await deleteManyFromIDB(dbName, dataStore, [mutation.key]).catch(() => {
      });
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
            timestamp: Date.now()
          });
          results.push(mutation.key);
        }
      } else {
        await queueMutation({
          id: crypto.randomUUID(),
          type: "delete",
          key: mutation.key,
          collectionId,
          timestamp: Date.now()
        });
        results.push(mutation.key);
      }
    }
    return results;
  };
  const utils = {
    isOnline: () => navigator.onLine,
    getPendingMutations: () => getQueue(),
    forceSync: async () => {
      await syncFn?.();
    },
    clearLocalData: async () => {
      await clearIDBStore(dbName, dataStore);
      await deleteWhereFromIDB(dbName, queueStoreName, "collectionId", collectionId);
      broadcast({ type: "queue-changed", count: 0 });
    }
  };
  return {
    ...rest,
    id: collectionId,
    getKey,
    sync: syncConfig,
    onInsert: config.onInsert ?? defaultOnInsert,
    onUpdate: config.onUpdate ?? defaultOnUpdate,
    onDelete: config.onDelete ?? defaultOnDelete,
    utils
  };
}

export { MAX_RETRIES, backoffDelayMs, dataverseCollectionOptions, dataverseOfflineCollectionOptions, replayAllQueues, replayMutations };
