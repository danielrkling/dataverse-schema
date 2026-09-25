/**
 * Minimal promise wrapper over the raw IndexedDB API — covers exactly what
 * SyncEngine needs. Drop-in replacement for the `idb` dependency's surface
 * (openDB, implicit single-store requests, explicit transactions, cursors).
 *
 * Design notes:
 * - `open()` mirrors idb's openDB: upgrade + blocked callbacks, promise
 *   resolves on success, rejects on error, and resolves with the version
 *   number when the connection is superseded by another tab (versionchange).
 * - `req()` wraps a single IDB request into a promise.
 * - `withStore(s)` wraps one or more stores in a transaction and gives the
 *   callback the object stores — requests must be created synchronously
 *   inside the callback before the first await (same constraint as raw IDB).
 */

// --- Request helper ---------------------------------------------------------

/** Wraps a single IDB request into a promise of its result. */
export function req<T = any>(r: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
        r.addEventListener("success", () => resolve(r.result));
        r.addEventListener("error", () => reject(r.error));
    });
}

// --- open -------------------------------------------------------------------

export interface OpenOptions {
    upgrade?: (database: IDBDatabase, oldVersion: number, tx: IDBTransaction) => void | Promise<void>;
    blocked?: (currentVersion: number, blockedVersion: number) => void;
}

/**
 * Opens the database. Behaves like `openDB` from idb:
 * - calls `upgrade` inside the versionchange transaction
 * - calls `blocked` if another tab holds an old-version connection open
 * - rejects on open error; resolves on success
 */
export function open(name: string, version: number, options: OpenOptions = {}): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(name, version);
        request.addEventListener("upgradeneeded", (event) => {
            const db = request.result;
            // Wrap the upgrade callback so it runs inside the versionchange
            // transaction — stores created there are visible to the caller.
            try {
                options.upgrade?.(db, event.oldVersion, request.transaction!);
            } catch (err) {
                request.transaction?.abort();
                reject(err);
            }
        });
        request.addEventListener("blocked", (event) => {
            options.blocked?.(event.oldVersion, event.newVersion ?? version);
        });
        request.addEventListener("success", async () => {
            const db = request.result;
            db.addEventListener("versionchange", () => db.close());
            resolve(db);
        });
        request.addEventListener("error", () => reject(request.error));
    });
}

// --- Transaction helpers ----------------------------------------------------

type StoreMode = "readonly" | "readwrite";

/** Opens a transaction across stores and returns its object stores, plus tx. */
export function withStores(
    db: IDBDatabase,
    names: string | string[],
    mode: StoreMode,
    fn: (stores: { [name: string]: IDBObjectStore }, tx: IDBTransaction) => void,
): Promise<void> {
    const tx = db.transaction(names, mode);
    const storeMap: { [name: string]: IDBObjectStore } = {};
    for (const name of (Array.isArray(names) ? names : [names])) {
        storeMap[name] = tx.objectStore(name);
    }
    // Call fn synchronously — requests must exist before yielding the event
    // loop or the transaction auto-commits (classic IndexedDB constraint).
    fn(storeMap, tx);
    return new Promise((resolve, reject) => {
        tx.addEventListener("complete", () => resolve());
        tx.addEventListener("abort", () => reject(tx.error ?? new Error("Transaction aborted")));
        tx.addEventListener("error", () => reject(tx.error ?? new Error("Transaction error")));
    });
}

// --- Single-request sugar (equivalents of db.get/put/delete/getAll/count) ---

export function get<T = any>(store: IDBObjectStore, key: IDBValidKey): Promise<T | undefined> {
    return req(store.get(key));
}
export function getAll<T = any>(store: IDBObjectStore, range?: IDBKeyRange): Promise<T[]> {
    return req(store.getAll(range));
}
export function put(store: IDBObjectStore, value: any, key?: IDBValidKey): Promise<IDBValidKey> {
    return req(store.put(value, key));
}
export function del(store: IDBObjectStore, key: IDBValidKey): Promise<undefined> {
    return req(store.delete(key));
}
export function count(store: IDBObjectStore, range?: IDBKeyRange): Promise<number> {
    return req(store.count(range));
}

/**
 * Iterates a cursor on an index or store, awaiting each step. Returns the
 * number of visited entries — the callback decides whether to stop early
 * (return "stop") or continue.
 */
export function openCursor(
    source: IDBObjectStore | IDBIndex,
    direction: IDBCursorDirection,
    visit: (cursor: IDBCursorWithValue) => void | "stop",
): Promise<void> {
    return new Promise((resolve, reject) => {
        const request = source.openCursor(null, direction);
        request.addEventListener("success", () => {
            const cursor = request.result;
            if (!cursor) return resolve();
            if (visit(cursor) === "stop") return resolve();
            cursor.continue();
        });
        request.addEventListener("error", () => reject(request.error));
    });
}
