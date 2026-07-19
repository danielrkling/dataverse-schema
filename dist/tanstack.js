const MAX_DEFAULT_ROWS$1 = 5e3;
const DEFAULT_POLL_INTERVAL$1 = 3e4;
function buildSelect$1(table) {
  return Object.values(table.fields).filter((v) => v.kind === "value" || v.type === "lookupId" || v.type === "file").map((v) => v.fromDataverseName).join(",");
}
function buildQueryForTable$1(table, query) {
  const params = new URLSearchParams();
  const select = buildSelect$1(table);
  if (select) params.set("$select", select);
  const top = query?.top ?? MAX_DEFAULT_ROWS$1;
  params.set("$top", String(top));
  if (query?.filter) params.set("$filter", query.filter);
  if (query?.orderby) {
    const ob = typeof query.orderby === "string" ? query.orderby : Object.entries(query.orderby).map(([key, value]) => `${table.fields[key].name} ${value}`).join(",");
    if (ob) params.set("$orderby", ob);
  }
  return params.toString();
}
function dataverseCollectionOptions(config) {
  const { table, query, id, ...rest } = config;
  const pk = table.getPrimaryKey();
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
          const raw = await table.client.getRecords(table.entitySetName, queryString);
          const records = raw.map((v) => table.transformValueFromDataverse(v));
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

function compactMutations(mutations) {
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
  }
  compacted.sort((a, b) => a.sequence - b.sequence);
  return compacted;
}

const MAX_DEFAULT_ROWS = 5e3;
const DEFAULT_POLL_INTERVAL = 3e4;
function buildSelect(table) {
  return Object.values(table.fields).filter((v) => v.kind === "value" || v.type === "lookupId" || v.type === "file").map((v) => v.fromDataverseName).join(",");
}
function buildQueryForTable(table, query) {
  const params = new URLSearchParams();
  const select = buildSelect(table);
  if (select) params.set("$select", select);
  const top = query?.top ?? MAX_DEFAULT_ROWS;
  params.set("$top", String(top));
  if (query?.filter) params.set("$filter", query.filter);
  if (query?.orderby) {
    const ob = typeof query.orderby === "string" ? query.orderby : Object.entries(query.orderby).map(([key, value]) => `${table.fields[key].name} ${value}`).join(",");
    if (ob) params.set("$orderby", ob);
  }
  return params.toString();
}
function dataverseOfflineCollectionOptions(config) {
  const { table, query, id, dbName = "dataverse-schema", storeName, syncInterval = DEFAULT_POLL_INTERVAL, queueStoreName = DEFAULT_QUEUE_STORE, ...rest } = config;
  const pk = table.getPrimaryKey();
  const getKey = config.getKey ?? ((item) => item[pk.key]);
  const collectionId = id ?? table.entitySetName;
  const dataStore = storeName ?? table.entitySetName;
  let pollTimer = null;
  let syncFn = null;
  let onlineHandler = null;
  let nextSequence = 1;
  async function getQueue() {
    try {
      return await getAllFromIDB(dbName, queueStoreName);
    } catch {
      return [];
    }
  }
  async function enqueue(mutation) {
    const queue = await getQueue();
    const seq = nextSequence++;
    queue.push({ ...mutation, sequence: seq });
    await putAllToIDB(dbName, queueStoreName, queue, "id");
  }
  async function removeSuccessful(mutations) {
    if (mutations.length === 0) return;
    await deleteManyFromIDB(
      dbName,
      queueStoreName,
      mutations.map((m) => m.id)
    );
  }
  async function replayQueue() {
    const allMutations = await getQueue();
    if (allMutations.length === 0) return;
    const myMutations = allMutations.filter((m) => m.collectionId === collectionId);
    const compacted = compactMutations(myMutations);
    const TYPE_ORDER = { insert: 0, update: 1, delete: 2 };
    compacted.sort((a, b) => {
      const d = TYPE_ORDER[a.type] - TYPE_ORDER[b.type];
      return d !== 0 ? d : a.sequence - b.sequence;
    });
    const succeeded = [];
    const failed = [];
    for (const mutation of compacted) {
      try {
        switch (mutation.type) {
          case "insert":
            await table.insertRecord(mutation.value);
            break;
          case "update":
            await table.updateRecord(mutation.key, mutation.value);
            break;
          case "delete":
            await table.deleteRecord(mutation.key);
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
  const syncConfig = {
    sync: ({ begin, write, commit, markReady }) => {
      syncFn = async () => {
        try {
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
          try {
            const queryString = buildQueryForTable(table, query);
            const raw = await table.client.getRecords(table.entitySetName, queryString);
            const records = raw.map((v) => table.transformValueFromDataverse(v));
            begin();
            for (const record of records) {
              write({ type: "insert", value: record });
            }
            commit();
            await putAllToIDB(dbName, dataStore, records, pk.key);
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
    rowUpdateMode: "partial"
  };
  const defaultOnInsert = async ({ transaction }) => {
    const results = [];
    for (const mutation of transaction.mutations) {
      let existing;
      try {
        existing = await getAllFromIDB(dbName, dataStore);
      } catch {
        existing = [];
      }
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
            key: mutation.modified[pk.key] ?? crypto.randomUUID(),
            value: mutation.modified,
            collectionId,
            timestamp: Date.now()
          });
          results.push(mutation.modified[pk.key]);
        }
      } else {
        await enqueue({
          id: crypto.randomUUID(),
          type: "insert",
          key: mutation.modified[pk.key] ?? crypto.randomUUID(),
          value: mutation.modified,
          collectionId,
          timestamp: Date.now()
        });
        results.push(mutation.modified[pk.key]);
      }
    }
    return results;
  };
  const defaultOnUpdate = async ({ transaction }) => {
    const results = [];
    for (const mutation of transaction.mutations) {
      let existing;
      try {
        existing = await getAllFromIDB(dbName, dataStore);
      } catch {
        existing = [];
      }
      const idx = existing.findIndex((item) => item[pk.key] === mutation.key);
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
            timestamp: Date.now()
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
          await enqueue({
            id: crypto.randomUUID(),
            type: "delete",
            key: mutation.key,
            collectionId,
            timestamp: Date.now()
          });
          results.push(mutation.key);
        }
      } else {
        await enqueue({
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
      const queue = await getQueue();
      const remaining = queue.filter((m) => m.collectionId !== collectionId);
      await putAllToIDB(dbName, queueStoreName, remaining, "id");
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

const TYPE_ORDER = { insert: 0, update: 1, delete: 2 };
function sortByType(mutations) {
  return [...mutations].sort((a, b) => {
    const typeDiff = TYPE_ORDER[a.type] - TYPE_ORDER[b.type];
    if (typeDiff !== 0) return typeDiff;
    return a.sequence - b.sequence;
  });
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
  if (allMutations.length === 0) {
    return { succeeded: 0, failed: 0, remaining: 0 };
  }
  const compacted = compactMutations(allMutations);
  const sorted = sortByType(compacted);
  const succeeded = [];
  const failed = [];
  for (const mutation of sorted) {
    const table = tables[mutation.collectionId];
    if (!table) {
      console.warn(
        `[replayAllQueues] no table found for collection "${mutation.collectionId}", skipping mutation ${mutation.id}`
      );
      failed.push(mutation);
      continue;
    }
    try {
      switch (mutation.type) {
        case "insert":
          await table.insertRecord(mutation.value);
          break;
        case "update":
          await table.updateRecord(mutation.key, mutation.value);
          break;
        case "delete":
          await table.deleteRecord(mutation.key);
          break;
      }
      succeeded.push(mutation);
    } catch (err) {
      console.warn(`[replayAllQueues] failed to replay mutation ${mutation.id} on "${mutation.collectionId}":`, err);
      failed.push(mutation);
    }
  }
  await deleteManyFromIDB(
    dbName,
    queueStoreName,
    succeeded.map((m) => m.id)
  );
  const remaining = allMutations.length - succeeded.length;
  return {
    succeeded: succeeded.length,
    failed: failed.length,
    remaining
  };
}

export { dataverseCollectionOptions, dataverseOfflineCollectionOptions, replayAllQueues };
