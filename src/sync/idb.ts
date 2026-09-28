/**
 * Minimal promise wrapper over the raw IndexedDB API — a drop-in replacement
 * for the parts of the `idb` package that SyncEngine uses. Zero dependencies.
 *
 * What is implemented (and deliberately not more):
 * - `openDB(name, version, { upgrade, blocked })` with idb-compatible callbacks
 * - implicit per-call requests on the database (`db.get/put/delete/getAll/count`)
 * - explicit transactions with promisified object stores and `tx.done`
 * - promisified `openCursor` (first cursor entry — the flush loop re-opens a
 *   fresh transaction per iteration, so `continue()` is not needed here)
 *
 * Note: `openDB` does NOT auto-close on `versionchange` — SyncEngine attaches
 * its own handler to track the new version before closing.
 */

/** Wraps a single IDB request into a promise of its result. */
function req<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/** Resolves when the transaction commits; rejects on abort/error. */
function txDone(tx: IDBTransaction): Promise<void> {
    return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error ?? new Error("Transaction aborted"));
        tx.onerror = () => reject(tx.error ?? new Error("Transaction error"));
    });
}

/** A promisified view of an IDBObjectStore (or of an index via .index()). */
export class Store {
    // IDBObjectStore or IDBIndex — both share get/getAll/openCursor; the
    // store-only methods (put/add/delete/clear/index) throw at runtime when
    // called on an index, so a typed union would demand dead narrowings here.
    private readonly bare: any;
    constructor(bare: IDBObjectStore | IDBIndex) {
        this.bare = bare;
    }

    get<T = any>(key: IDBValidKey): Promise<T | undefined> {
        return req(this.bare.get(key));
    }
    getAll<T = any>(range?: IDBKeyRange | null): Promise<T[]> {
        return req(this.bare.getAll(range as IDBValidKey | undefined));
    }
    put(value: any, key?: IDBValidKey): Promise<IDBValidKey> {
        return req(this.bare.put(value, key));
    }
    add(value: any, key?: IDBValidKey): Promise<IDBValidKey> {
        return req(this.bare.add(value, key));
    }
    delete(key: IDBValidKey): Promise<undefined> {
        return req(this.bare.delete(key));
    }
    count(range?: IDBKeyRange | null): Promise<number> {
        return req(this.bare.count(range as IDBValidKey | undefined));
    }
    clear(): Promise<undefined> {
        return req(this.bare.clear());
    }
    index(name: string): Store {
        return new Store(this.bare.index(name));
    }
    /**
     * Opens a cursor and resolves with the first entry's cursor (or undefined
     * when the source is empty). Callers that need to keep iterating can call
     * cursor.continue() themselves.
     */
    openCursor(range?: IDBKeyRange | null, direction?: IDBCursorDirection): Promise<any> {
        return req(this.bare.openCursor(range ?? undefined, direction));
    }
}

/** A promisified transaction: promisified stores plus a `done` promise. */
export class Tx {
    /** Promisified store when the transaction covers exactly one store. */
    readonly store: Store
    readonly done: Promise<void>

    constructor(private readonly bare: IDBTransaction, readonly names: string[]) {
        this.store = this.objectStore(names[0]);
        this.done = txDone(bare);
    }

    objectStore(name: string): Store {
        return new Store(this.bare.objectStore(name));
    }
}

/** A promisified IDBDatabase: convenience single-request methods plus transactions. */
export class Database {
    constructor(private readonly bare: IDBDatabase) {}

    get version(): number {
        return this.bare.version;
    }
    get objectStoreNames(): DOMStringList {
        return this.bare.objectStoreNames;
    }
    close(): void {
        this.bare.close();
    }
    addEventListener(type: string, listener: (event: any) => void): void {
        this.bare.addEventListener(type, listener as EventListener);
    }
    transaction(names: string | string[], mode: IDBTransactionMode): Tx {
        return new Tx(this.bare.transaction(names, mode), Array.isArray(names) ? names : [names]);
    }

    // Convenience single-request methods (each opens its own transaction,
    // same as idb's db.get/put/delete/getAll/count).

    get<T = any>(storeName: string, key: IDBValidKey): Promise<T | undefined> {
        return this.transaction(storeName, "readonly").objectStore(storeName).get(key);
    }
    getAll<T = any>(storeName: string): Promise<T[]> {
        return this.transaction(storeName, "readonly").objectStore(storeName).getAll();
    }
    put(storeName: string, value: any): Promise<IDBValidKey> {
        return this.transaction(storeName, "readwrite").objectStore(storeName).put(value);
    }
    delete(storeName: string, key: IDBValidKey): Promise<undefined> {
        return this.transaction(storeName, "readwrite").objectStore(storeName).delete(key);
    }
    count(storeName: string): Promise<number> {
        return this.transaction(storeName, "readonly").objectStore(storeName).count();
    }
}

export interface OpenOptions {
    upgrade?: (database: IDBDatabase, oldVersion: number, newVersion: number, transaction: IDBTransaction) => void;
    blocked?: (currentVersion: number, blockedVersion: number) => void;
}

/**
 * Opens the database, mirroring idb's openDB:
 * - `upgrade` runs inside the versionchange transaction
 * - `blocked` fires when another tab holds an old-version connection open
 * - rejects if opening fails (or the upgrade callback throws/aborts)
 */
export function openDB(name: string, version: number, options: OpenOptions = {}): Promise<Database> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(name, version);
        request.onupgradeneeded = (event) => {
            try {
                options.upgrade?.(request.result, event.oldVersion, event.newVersion ?? version, request.transaction!);
            } catch (err) {
                // Fail the open so callers don't get a half-migrated DB.
                request.transaction?.abort();
                reject(err instanceof Error ? err : new Error(String(err)));
            }
        };
        request.onblocked = (event) => {
            options.blocked?.(event.oldVersion, event.newVersion ?? version);
        };
        request.onsuccess = () => resolve(new Database(request.result));
        request.onerror = () => reject(request.error);
    });
}
