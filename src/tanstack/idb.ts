function openIDB(
  dbName: string,
  storeName: string,
  version: number = 1,
): Promise<IDBDatabase> {
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

export async function getAllFromIDB<T>(dbName: string, storeName: string): Promise<T[]> {
  const db = await openIDB(dbName, storeName);
  try {
    return await new Promise<T[]>((resolve, reject) => {
      const tx = db.transaction(storeName, "readonly");
      const store = tx.objectStore(storeName);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result as T[]);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

export async function getFromIDB<T>(
  dbName: string,
  storeName: string,
  key: string | number,
): Promise<T | undefined> {
  const db = await openIDB(dbName, storeName);
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(storeName, "readonly");
      const store = tx.objectStore(storeName);
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result as T | undefined);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

export async function putToIDB<T extends Record<string, any>>(
  dbName: string,
  storeName: string,
  item: T,
): Promise<void> {
  const db = await openIDB(dbName, storeName);
  try {
    await new Promise<void>((resolve, reject) => {
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

/**
 * Enqueues items with monotonically increasing `sequence` values, computed
 * inside a single readwrite transaction. IndexedDB serializes transactions
 * per store, so concurrent enqueues from multiple tabs can never observe the
 * same max sequence — each tab's items get distinct, ordered sequences.
 */
export async function enqueueToIDB<T extends { id: string; sequence?: number }>(
  dbName: string,
  storeName: string,
  items: Array<Omit<T, "sequence">>,
): Promise<void> {
  if (items.length === 0) return;
  const db = await openIDB(dbName, storeName);
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(storeName, "readwrite");
      const store = tx.objectStore(storeName);

      let maxSeq = 0;
      const cursorRequest = store.openCursor();
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (cursor) {
          const value = cursor.value as { sequence?: unknown };
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

export async function putAllToIDB<T extends Record<string, any>>(
  dbName: string,
  storeName: string,
  items: T[],
  keyPath: string = "id",
): Promise<void> {
  const db = await openIDB(dbName, storeName);
  try {
    await new Promise<void>((resolve, reject) => {
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

export async function deleteFromIDB(
  dbName: string,
  storeName: string,
  key: string | number,
): Promise<void> {
  const db = await openIDB(dbName, storeName);
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(storeName, "readwrite");
      const store = tx.objectStore(storeName);
      store.delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function deleteManyFromIDB(
  dbName: string,
  storeName: string,
  keys: Array<string | number>,
): Promise<void> {
  const db = await openIDB(dbName, storeName);
  try {
    await new Promise<void>((resolve, reject) => {
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

export async function clearIDBStore(dbName: string, storeName: string): Promise<void> {
  const db = await openIDB(dbName, storeName);
  try {
    await new Promise<void>((resolve, reject) => {
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

/**
 * Deletes every record where `record[keyPath] === value`. Used to remove only
 * one collection's mutations from the shared queue store.
 */
export async function deleteWhereFromIDB(
  dbName: string,
  storeName: string,
  keyPath: string,
  value: string | number,
): Promise<void> {
  const db = await openIDB(dbName, storeName);
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(storeName, "readwrite");
      const store = tx.objectStore(storeName);
      const request = store.openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          if ((cursor.value as Record<string, unknown>)[keyPath] === value) {
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
