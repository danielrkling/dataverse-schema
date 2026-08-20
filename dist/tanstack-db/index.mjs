import { getEtag } from 'dataverse-schema';

const DEFAULT_SYNC_INTERVAL = 3e4;
function dataverseCollectionOptions(config) {
  const { table, syncInterval = DEFAULT_SYNC_INTERVAL, ...rest } = config;
  const pk = table.primaryKey;
  const getKey = (item) => item[pk.key];
  const collectionId = table.entitySetName;
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
          const keysToDelete = new Set(collection.keys());
          begin();
          for await (const record of table.iterateRecords()) {
            const key = table.getPrimaryId(record);
            const existingRecord = collection.get(key);
            if (existingRecord) {
              if (getEtag(record) !== getEtag(existingRecord)) {
                write({ type: "update", value: record });
              }
              keysToDelete.delete(key);
            } else {
              write({ type: "insert", value: record });
            }
          }
          for (const key of keysToDelete) {
            write({ type: "delete", value: collection.get(key) });
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
      }, syncInterval);
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
    },
    table
  };
  return {
    ...rest,
    id: collectionId,
    getKey,
    sync: syncConfig,
    onInsert: defaultOnInsert,
    onUpdate: defaultOnUpdate,
    onDelete: defaultOnDelete,
    utils
  };
}

const instanceOfAny = (object, constructors) => constructors.some((c) => object instanceof c);

let idbProxyableTypes;
let cursorAdvanceMethods;
// This is a function to prevent it throwing up in node environments.
function getIdbProxyableTypes() {
    return (idbProxyableTypes ||
        (idbProxyableTypes = [
            IDBDatabase,
            IDBObjectStore,
            IDBIndex,
            IDBCursor,
            IDBTransaction,
        ]));
}
// This is a function to prevent it throwing up in node environments.
function getCursorAdvanceMethods() {
    return (cursorAdvanceMethods ||
        (cursorAdvanceMethods = [
            IDBCursor.prototype.advance,
            IDBCursor.prototype.continue,
            IDBCursor.prototype.continuePrimaryKey,
        ]));
}
const transactionDoneMap = new WeakMap();
const transformCache = new WeakMap();
const reverseTransformCache = new WeakMap();
function promisifyRequest(request) {
    const promise = new Promise((resolve, reject) => {
        const unlisten = () => {
            request.removeEventListener('success', success);
            request.removeEventListener('error', error);
        };
        const success = () => {
            resolve(wrap(request.result));
            unlisten();
        };
        const error = () => {
            reject(request.error);
            unlisten();
        };
        request.addEventListener('success', success);
        request.addEventListener('error', error);
    });
    // This mapping exists in reverseTransformCache but doesn't exist in transformCache. This
    // is because we create many promises from a single IDBRequest.
    reverseTransformCache.set(promise, request);
    return promise;
}
function cacheDonePromiseForTransaction(tx) {
    // Early bail if we've already created a done promise for this transaction.
    if (transactionDoneMap.has(tx))
        return;
    const done = new Promise((resolve, reject) => {
        const unlisten = () => {
            tx.removeEventListener('complete', complete);
            tx.removeEventListener('error', error);
            tx.removeEventListener('abort', error);
        };
        const complete = () => {
            resolve();
            unlisten();
        };
        const error = () => {
            reject(tx.error || new DOMException('AbortError', 'AbortError'));
            unlisten();
        };
        tx.addEventListener('complete', complete);
        tx.addEventListener('error', error);
        tx.addEventListener('abort', error);
    });
    // Cache it for later retrieval.
    transactionDoneMap.set(tx, done);
}
let idbProxyTraps = {
    get(target, prop, receiver) {
        if (target instanceof IDBTransaction) {
            // Special handling for transaction.done.
            if (prop === 'done')
                return transactionDoneMap.get(target);
            // Make tx.store return the only store in the transaction, or undefined if there are many.
            if (prop === 'store') {
                return receiver.objectStoreNames[1]
                    ? undefined
                    : receiver.objectStore(receiver.objectStoreNames[0]);
            }
        }
        // Else transform whatever we get back.
        return wrap(target[prop]);
    },
    set(target, prop, value) {
        target[prop] = value;
        return true;
    },
    has(target, prop) {
        if (target instanceof IDBTransaction &&
            (prop === 'done' || prop === 'store')) {
            return true;
        }
        return prop in target;
    },
};
function replaceTraps(callback) {
    idbProxyTraps = callback(idbProxyTraps);
}
function wrapFunction(func) {
    // Due to expected object equality (which is enforced by the caching in `wrap`), we
    // only create one new func per func.
    // Cursor methods are special, as the behaviour is a little more different to standard IDB. In
    // IDB, you advance the cursor and wait for a new 'success' on the IDBRequest that gave you the
    // cursor. It's kinda like a promise that can resolve with many values. That doesn't make sense
    // with real promises, so each advance methods returns a new promise for the cursor object, or
    // undefined if the end of the cursor has been reached.
    if (getCursorAdvanceMethods().includes(func)) {
        return function (...args) {
            // Calling the original function with the proxy as 'this' causes ILLEGAL INVOCATION, so we use
            // the original object.
            func.apply(unwrap(this), args);
            return wrap(this.request);
        };
    }
    return function (...args) {
        // Calling the original function with the proxy as 'this' causes ILLEGAL INVOCATION, so we use
        // the original object.
        return wrap(func.apply(unwrap(this), args));
    };
}
function transformCachableValue(value) {
    if (typeof value === 'function')
        return wrapFunction(value);
    // This doesn't return, it just creates a 'done' promise for the transaction,
    // which is later returned for transaction.done (see idbObjectHandler).
    if (value instanceof IDBTransaction)
        cacheDonePromiseForTransaction(value);
    if (instanceOfAny(value, getIdbProxyableTypes()))
        return new Proxy(value, idbProxyTraps);
    // Return the same value back if we're not going to transform it.
    return value;
}
function wrap(value) {
    // We sometimes generate multiple promises from a single IDBRequest (eg when cursoring), because
    // IDB is weird and a single IDBRequest can yield many responses, so these can't be cached.
    if (value instanceof IDBRequest)
        return promisifyRequest(value);
    // If we've already transformed this value before, reuse the transformed value.
    // This is faster, but it also provides object equality.
    if (transformCache.has(value))
        return transformCache.get(value);
    const newValue = transformCachableValue(value);
    // Not all types are transformed.
    // These may be primitive types, so they can't be WeakMap keys.
    if (newValue !== value) {
        transformCache.set(value, newValue);
        reverseTransformCache.set(newValue, value);
    }
    return newValue;
}
const unwrap = (value) => reverseTransformCache.get(value);

/**
 * Open a database.
 *
 * @param name Name of the database.
 * @param version Schema version.
 * @param callbacks Additional callbacks.
 */
function openDB(name, version, { blocked, upgrade, blocking, terminated } = {}) {
    const request = indexedDB.open(name, version);
    const openPromise = wrap(request);
    if (upgrade) {
        request.addEventListener('upgradeneeded', (event) => {
            upgrade(wrap(request.result), event.oldVersion, event.newVersion, wrap(request.transaction), event);
        });
    }
    if (blocked) {
        request.addEventListener('blocked', (event) => blocked(
        // Casting due to https://github.com/microsoft/TypeScript-DOM-lib-generator/pull/1405
        event.oldVersion, event.newVersion, event));
    }
    openPromise
        .then((db) => {
        if (terminated)
            db.addEventListener('close', () => terminated());
        if (blocking) {
            db.addEventListener('versionchange', (event) => blocking(event.oldVersion, event.newVersion, event));
        }
    })
        .catch(() => { });
    return openPromise;
}

const readMethods = ['get', 'getKey', 'getAll', 'getAllKeys', 'count'];
const writeMethods = ['put', 'add', 'delete', 'clear'];
const cachedMethods = new Map();
function getMethod(target, prop) {
    if (!(target instanceof IDBDatabase &&
        !(prop in target) &&
        typeof prop === 'string')) {
        return;
    }
    if (cachedMethods.get(prop))
        return cachedMethods.get(prop);
    const targetFuncName = prop.replace(/FromIndex$/, '');
    const useIndex = prop !== targetFuncName;
    const isWrite = writeMethods.includes(targetFuncName);
    if (
    // Bail if the target doesn't exist on the target. Eg, getAll isn't in Edge.
    !(targetFuncName in (useIndex ? IDBIndex : IDBObjectStore).prototype) ||
        !(isWrite || readMethods.includes(targetFuncName))) {
        return;
    }
    const method = async function (storeName, ...args) {
        // isWrite ? 'readwrite' : undefined gzipps better, but fails in Edge :(
        const tx = this.transaction(storeName, isWrite ? 'readwrite' : 'readonly');
        let target = tx.store;
        if (useIndex)
            target = target.index(args.shift());
        // Must reject if op rejects.
        // If it's a write operation, must reject if tx.done rejects.
        // Must reject with op rejection first.
        // Must resolve with op value.
        // Must handle both promises (no unhandled rejections)
        return (await Promise.all([
            target[targetFuncName](...args),
            isWrite && tx.done,
        ]))[0];
    };
    cachedMethods.set(prop, method);
    return method;
}
replaceTraps((oldTraps) => ({
    ...oldTraps,
    get: (target, prop, receiver) => getMethod(target, prop) || oldTraps.get(target, prop, receiver),
    has: (target, prop) => !!getMethod(target, prop) || oldTraps.has(target, prop),
}));

const advanceMethodProps = ['continue', 'continuePrimaryKey', 'advance'];
const methodMap = {};
const advanceResults = new WeakMap();
const ittrProxiedCursorToOriginalProxy = new WeakMap();
const cursorIteratorTraps = {
    get(target, prop) {
        if (!advanceMethodProps.includes(prop))
            return target[prop];
        let cachedFunc = methodMap[prop];
        if (!cachedFunc) {
            cachedFunc = methodMap[prop] = function (...args) {
                advanceResults.set(this, ittrProxiedCursorToOriginalProxy.get(this)[prop](...args));
            };
        }
        return cachedFunc;
    },
};
async function* iterate(...args) {
    // tslint:disable-next-line:no-this-assignment
    let cursor = this;
    if (!(cursor instanceof IDBCursor)) {
        cursor = await cursor.openCursor(...args);
    }
    if (!cursor)
        return;
    cursor = cursor;
    const proxiedCursor = new Proxy(cursor, cursorIteratorTraps);
    ittrProxiedCursorToOriginalProxy.set(proxiedCursor, cursor);
    // Map this double-proxy back to the original, so other cursor methods work.
    reverseTransformCache.set(proxiedCursor, unwrap(cursor));
    while (cursor) {
        yield proxiedCursor;
        // If one of the advancing methods was not called, call continue().
        cursor = await (advanceResults.get(proxiedCursor) || cursor.continue());
        advanceResults.delete(proxiedCursor);
    }
}
function isIteratorProp(target, prop) {
    return ((prop === Symbol.asyncIterator &&
        instanceOfAny(target, [IDBIndex, IDBObjectStore, IDBCursor])) ||
        (prop === 'iterate' && instanceOfAny(target, [IDBIndex, IDBObjectStore])));
}
replaceTraps((oldTraps) => ({
    ...oldTraps,
    get(target, prop, receiver) {
        if (isIteratorProp(target, prop))
            return iterate;
        return oldTraps.get(target, prop, receiver);
    },
    has(target, prop) {
        return isIteratorProp(target, prop) || oldTraps.has(target, prop);
    },
}));

const DEFAULT_POLL_INTERVAL = 3e4;
const MAX_MUTATION_ATTEMPTS = 3;
const RETRY_BASE_DELAY = 1e3;
const RETRY_MAX_DELAY = 6e4;
class MutationPersistenceError extends Error {
  constructor(message, mutationIds, cause) {
    super(message);
    this.mutationIds = mutationIds;
    this.cause = cause;
    this.name = "MutationPersistenceError";
  }
}
class DataverseSyncDB {
  name;
  version;
  tables;
  MUTATION_QUEUE_NAME = "Mutations";
  ERRORED_MUTATIONS_NAME = "Errored Mutations";
  channel;
  closed = false;
  activeFetchControllers = /* @__PURE__ */ new Set();
  collectionCleanups = /* @__PURE__ */ new Set();
  channelMessageHandler;
  constructor(name, tables, version) {
    this.name = name;
    this.channel = new BroadcastChannel(name);
    this.version = version;
    this.tables = new Map(tables.map((v) => [v.entitySetName, v]));
    this.channelMessageHandler = (event) => {
      if (event.data?.type === "ABORT_ACTIVE_FETCHES") {
        this.abortActiveFetches();
      }
    };
    this.channel.addEventListener("message", this.channelMessageHandler);
  }
  sequence = 0;
  serializeMutation(mutation) {
    return {
      id: mutation.mutationId,
      type: mutation.type,
      value: mutation.modified,
      key: mutation.key,
      entitySetName: mutation.collection.id,
      timestamp: mutation.createdAt.valueOf(),
      sequence: this.sequence++,
      attempts: 0,
      etag: getEtag(mutation.modified)
    };
  }
  db;
  async getDB() {
    if (!this.db) {
      const self = this;
      this.db = await openDB(this.name, this.version, {
        upgrade(database, oldVersion, _newVersion, transaction) {
          for (const storeName of Array.from(database.objectStoreNames)) {
            if (storeName !== self.MUTATION_QUEUE_NAME && storeName !== self.ERRORED_MUTATIONS_NAME) {
              database.deleteObjectStore(storeName);
            }
          }
          let store = database.objectStoreNames.contains(self.MUTATION_QUEUE_NAME) ? transaction.objectStore(self.MUTATION_QUEUE_NAME) : database.createObjectStore(self.MUTATION_QUEUE_NAME, { keyPath: "id" });
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
        }
      });
    }
    return this.db;
  }
  /**
   * Instantly aborts any in-flight remote server GET requests across all collections.
   */
  abortActiveFetches() {
    for (const controller of this.activeFetchControllers) {
      controller.abort("New mutation enqueued");
    }
    this.activeFetchControllers.clear();
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    this.abortActiveFetches();
    for (const cleanup of [...this.collectionCleanups]) cleanup();
    this.collectionCleanups.clear();
    this.channel.removeEventListener("message", this.channelMessageHandler);
    this.channel.close();
    this.db?.close();
    this.db = void 0;
  }
  async flushQueue() {
    await navigator.locks.request(this.name, async () => {
      const db = await this.getDB();
      while (true) {
        const tx = db.transaction(this.MUTATION_QUEUE_NAME, "readonly");
        const index = tx.store.index("by_timestamp");
        const cursor = await index.openCursor(null, "next");
        if (!cursor) break;
        const mutation = cursor.value;
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
            await table.insertRecord(mutation.value);
          } else if (mutation.type === "update") {
            await table.updateRecord(mutation.key, mutation.value, mutation.etag);
          } else if (mutation.type === "delete") {
            await table.deleteRecord(mutation.key, mutation.etag);
          }
          await db.delete(this.MUTATION_QUEUE_NAME, mutation.id);
        } catch (e) {
          if (!navigator.onLine) break;
          console.error(`[dataverse-offline] Failed to flush mutation ${mutation.id}:`, e);
          mutation.error = e;
          mutation.attempts++;
          mutation.lastAttemptAt = Date.now();
          if (mutation.attempts >= MAX_MUTATION_ATTEMPTS) {
            mutation.nextAttemptAt = void 0;
            await db.delete(this.MUTATION_QUEUE_NAME, mutation.id);
            await db.put(this.ERRORED_MUTATIONS_NAME, mutation);
          } else {
            const delay = Math.min(
              RETRY_MAX_DELAY,
              RETRY_BASE_DELAY * 2 ** (mutation.attempts - 1)
            );
            mutation.nextAttemptAt = mutation.lastAttemptAt + delay;
            await db.put(this.MUTATION_QUEUE_NAME, mutation);
            break;
          }
        }
      }
    });
  }
  async getQueueCount() {
    const db = await this.getDB();
    return db.count(this.MUTATION_QUEUE_NAME);
  }
  async getErroredMutations() {
    const db = await this.getDB();
    return db.getAll(this.ERRORED_MUTATIONS_NAME);
  }
  async retryErroredMutation(id) {
    const db = await this.getDB();
    const tx = db.transaction(
      [this.MUTATION_QUEUE_NAME, this.ERRORED_MUTATIONS_NAME],
      "readwrite"
    );
    const mutation = await tx.objectStore(this.ERRORED_MUTATIONS_NAME).get(id);
    if (mutation) {
      mutation.attempts = 0;
      mutation.error = void 0;
      mutation.lastAttemptAt = void 0;
      mutation.nextAttemptAt = void 0;
      await tx.objectStore(this.ERRORED_MUTATIONS_NAME).delete(id);
      await tx.objectStore(this.MUTATION_QUEUE_NAME).put(mutation);
    }
    await tx.done;
    if (mutation && navigator.onLine) await this.flushQueue();
  }
  async discardErroredMutation(id) {
    const db = await this.getDB();
    await db.delete(this.ERRORED_MUTATIONS_NAME, id);
  }
  async queueMutations(mutations) {
    if (mutations.length === 0) return;
    try {
      const db = await this.getDB();
      const storeNames = [
        this.MUTATION_QUEUE_NAME,
        ...new Set(mutations.map((mutation) => mutation.entitySetName))
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
        e
      );
    }
  }
  createCollectionOptions(config) {
    if (this.closed) throw new Error("DataverseSyncDB is closed");
    const {
      table,
      syncInterval = DEFAULT_POLL_INTERVAL,
      readOnlyWhenOffline = false,
      ...rest
    } = config;
    this.tables.set(table.entitySetName, table);
    const pk = table.primaryKey;
    const getKey = (item) => item[pk.key];
    const collectionId = table.entitySetName;
    let pollTimer;
    let syncFromDataverse;
    let syncController;
    let activeSync;
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
        this.activeFetchControllers.delete(syncController);
        syncController = void 0;
        activeSync = void 0;
      });
      await activeSync;
      if (syncQueued && !disposed) {
        syncQueued = false;
        await runSync();
      }
    };
    const scheduleNextSync = (time) => {
      return new Promise((resolve) => {
        if (pollTimer) clearTimeout(pollTimer);
        pollTimer = setTimeout(async () => {
          if (navigator.onLine && document.visibilityState === "visible") {
            await runSync();
            scheduleNextSync(syncInterval);
          }
          resolve();
        }, time);
      });
    };
    const flushAndSync = async () => {
      if (!disposed && document.visibilityState === "visible" && navigator.onLine) {
        await this.flushQueue();
        await scheduleNextSync(50);
      }
    };
    const syncConfig = {
      sync: ({ begin, write, commit, markReady, collection }) => {
        syncFromDataverse = async (signal) => {
          try {
            const records = await table.getRecords(void 0, { signal });
            if (signal.aborted) return;
            const keysToDelete = /* @__PURE__ */ new Set([
              ...collection.keys()
            ]);
            begin();
            for (const record of records) {
              const key = table.getPrimaryId(record);
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
              write({ type: "delete", value: collection.get(key), metadata: { source: "dv" } });
            }
            commit();
            const db = await this.getDB();
            const tx = db.transaction(table.entitySetName, "readwrite");
            await tx.store.clear();
            for (const record of records) {
              tx.store.put(record);
            }
            await tx.done;
          } catch (err) {
            if (err?.name !== "AbortError" && !signal.aborted) {
              console.warn(`[dataverse-offline] Remote sync failed for "${collectionId}":`, err);
            }
          } finally {
            markReady();
          }
        };
        const handleTabMessage = (event) => {
          if (event.data?.type === "MUTATIONS_ADDED") {
            begin();
            for (const mutation of event.data.mutations) {
              if (table.entitySetName === mutation.entitySetName) {
                write({ type: mutation.type, value: mutation.value, metadata: { source: "tab" } });
              }
            }
            commit();
            scheduleNextSync(50);
          }
        };
        this.channel.addEventListener("message", handleTabMessage);
        const syncFromIDB = async () => {
          const db = await this.getDB();
          const cached = await db.getAll(table.entitySetName);
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
      rowUpdateMode: "full"
    };
    const defaultMutation = async ({ transaction }) => {
      if (readOnlyWhenOffline && !navigator.onLine) {
        throw new Error("Collection is read-only while offline");
      }
      this.abortActiveFetches();
      this.channel.postMessage({ type: "ABORT_ACTIVE_FETCHES" });
      const serialized = transaction.mutations.map((v) => this.serializeMutation(v));
      await this.queueMutations(serialized);
      this.channel.postMessage({ type: "MUTATIONS_ADDED", mutations: serialized });
      if (navigator.onLine) {
        await this.flushQueue();
        await scheduleNextSync(100);
      }
    };
    return {
      ...rest,
      id: collectionId,
      getKey,
      sync: syncConfig,
      onInsert: defaultMutation,
      onUpdate: defaultMutation,
      onDelete: defaultMutation
    };
  }
}

export { DataverseSyncDB, MutationPersistenceError, dataverseCollectionOptions };
