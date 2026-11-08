/**
 * Persisting File System Access handles in IndexedDB so an app can re-open the
 * same root folder on the next visit without showing the picker again.
 *
 * Browsers persist `FileSystemDirectoryHandle` values via structured clone,
 * but usually restore them with `permission: "prompt"`. Permission must be
 * re-requested from a user gesture — {@link resolveRootHandle} tries the stored
 * handle first and falls back to the picker when permission is unavailable.
 */

import {
  FileSystemDatabase,
  ensurePermission,
  pickRoot,
  type DirectoryPickerOptions,
  type FileSystemDatabaseOptions,
  type InitializeOptions,
} from "./database";
import type { FileSystemManifest, FsDirectoryHandle } from "./types";

export const HANDLE_STORE_DATABASE = "filesystem-schema";
const HANDLE_STORE_NAME = "handles";
const HANDLE_STORE_VERSION = 1;

export type StoredHandleRecord = {
  /** Caller-chosen key, e.g. the brand id or database name. */
  key: string;
  handle: FsDirectoryHandle;
  name: string;
  kind: "directory";
  savedAt: number;
};

export type StoredHandleInfo = Omit<StoredHandleRecord, "handle">;

export type HandleStore = {
  get(key: string): Promise<StoredHandleRecord | null>;
  set(record: StoredHandleRecord): Promise<void>;
  delete(key: string): Promise<void>;
  list(): Promise<StoredHandleRecord[]>;
  clear(): Promise<void>;
};

export type IndexedDbHandleStoreOptions = {
  /** IndexedDB database name. Default `"filesystem-schema"`. */
  databaseName?: string;
  /** Inject an IDBFactory for tests/non-browser environments. */
  factory?: IDBFactory;
};

export type HandleStoreOptions = IndexedDbHandleStoreOptions & {
  /** Use a custom store instead of IndexedDB (tests, alternative persistence). */
  store?: HandleStore;
};

function assertKey(key: string): string {
  if (!key || key.trim() === "") throw new Error("stored handle key must be a non-empty string");
  return key;
}

function openHandleDatabase(options: IndexedDbHandleStoreOptions): Promise<IDBDatabase> {
  const factory = options.factory ?? globalThis.indexedDB;
  if (!factory) {
    return Promise.reject(
      new Error(
        "IndexedDB is not available — pass a custom HandleStore or a factory for handle persistence",
      ),
    );
  }
  return new Promise((resolve, reject) => {
    const request = factory.open(options.databaseName ?? HANDLE_STORE_DATABASE, HANDLE_STORE_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(HANDLE_STORE_NAME)) {
        db.createObjectStore(HANDLE_STORE_NAME, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("failed to open the handle store"));
    request.onblocked = () =>
      reject(new Error("the handle store upgrade is blocked by another tab"));
  });
}

function runTransaction<T>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T> | void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    let result: T;
    const transaction = db.transaction(HANDLE_STORE_NAME, mode);
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("handle store transaction failed"));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("handle store transaction was aborted"));
    try {
      const request = run(transaction.objectStore(HANDLE_STORE_NAME));
      if (request) {
        request.onsuccess = () => {
          result = request.result;
        };
        request.onerror = () =>
          reject(request.error ?? new Error("handle store request failed"));
      }
    } catch (error) {
      transaction.abort();
      reject(error);
    }
  });
}

/** IndexedDB-backed handle store (the default). */
export function createIndexedDbHandleStore(
  options: IndexedDbHandleStoreOptions = {},
): HandleStore {
  return {
    async get(key) {
      const db = await openHandleDatabase(options);
      try {
        const value = await runTransaction<StoredHandleRecord | undefined>(
          db,
          "readonly",
          (store) => store.get(assertKey(key)) as IDBRequest<StoredHandleRecord | undefined>,
        );
        return value ?? null;
      } finally {
        db.close();
      }
    },

    async set(record) {
      const db = await openHandleDatabase(options);
      try {
        await runTransaction(db, "readwrite", (store) => {
          store.put({ ...record, key: assertKey(record.key) });
        });
      } finally {
        db.close();
      }
    },

    async delete(key) {
      const db = await openHandleDatabase(options);
      try {
        await runTransaction(db, "readwrite", (store) => {
          store.delete(assertKey(key));
        });
      } finally {
        db.close();
      }
    },

    async list() {
      const db = await openHandleDatabase(options);
      try {
        return await runTransaction<StoredHandleRecord[]>(db, "readonly", (store) =>
          store.getAll() as IDBRequest<StoredHandleRecord[]>,
        );
      } finally {
        db.close();
      }
    },

    async clear() {
      const db = await openHandleDatabase(options);
      try {
        await runTransaction(db, "readwrite", (store) => {
          store.clear();
        });
      } finally {
        db.close();
      }
    },
  };
}

function resolveStore(options: HandleStoreOptions): HandleStore {
  return options.store ?? createIndexedDbHandleStore(options);
}

/**
 * Saves a directory handle under a stable key. Calling it again with the same
 * key replaces the previous handle.
 */
export async function saveDirectoryHandle(
  key: string,
  handle: FsDirectoryHandle,
  options: HandleStoreOptions = {},
): Promise<StoredHandleRecord> {
  if (!handle || handle.kind !== "directory") {
    throw new Error("only FileSystemDirectoryHandle values can be stored as a database root");
  }
  const record: StoredHandleRecord = {
    key: assertKey(key),
    handle,
    name: handle.name,
    kind: "directory",
    savedAt: Date.now(),
  };
  await resolveStore(options).set(record);
  return record;
}

/** Loads a previously saved handle, or null when the key has no entry. */
export async function loadDirectoryHandle(
  key: string,
  options: HandleStoreOptions = {},
): Promise<FsDirectoryHandle | null> {
  return (await resolveStore(options).get(assertKey(key)))?.handle ?? null;
}

/** Loads the full stored record (handle + metadata), or null. */
export async function getStoredHandle(
  key: string,
  options: HandleStoreOptions = {},
): Promise<StoredHandleRecord | null> {
  return resolveStore(options).get(assertKey(key));
}

/** Removes one stored handle. */
export async function deleteDirectoryHandle(
  key: string,
  options: HandleStoreOptions = {},
): Promise<void> {
  await resolveStore(options).delete(assertKey(key));
}

/** Lists stored handle metadata without exposing the handles themselves. */
export async function listStoredHandles(
  options: HandleStoreOptions = {},
): Promise<StoredHandleInfo[]> {
  const records = await resolveStore(options).list();
  return records.map(({ handle: _handle, ...info }) => info);
}

/** Clears every stored handle. */
export async function clearStoredHandles(options: HandleStoreOptions = {}): Promise<void> {
  await resolveStore(options).clear();
}

export type LoadRootHandleOptions = HandleStoreOptions & {
  /** Permission mode to check. Default `"readwrite"`. */
  mode?: "read" | "readwrite";
  /**
   * Request permission when the stored handle is in the `"prompt"` state.
   * Default `false` for silent startup loads; enable only from a user gesture.
   */
  requestPermission?: boolean;
};

/**
 * Loads a stored root handle only when it is currently permitted. Returns null
 * instead of opening the picker — useful for silent auto-load on startup before
 * showing a visible "reconnect" action.
 */
export async function tryLoadRootHandle(
  key: string,
  options: LoadRootHandleOptions = {},
): Promise<FsDirectoryHandle | null> {
  const stored = await loadDirectoryHandle(key, options);
  if (!stored) return null;
  const permitted = await ensurePermission(stored, options.mode ?? "readwrite", {
    request: options.requestPermission === true,
  });
  return permitted ? stored : null;
}

export type ResolveRootHandleOptions = LoadRootHandleOptions & {
  /** Picker used when there is no stored handle or permission is unavailable. */
  pick?: () => Promise<FsDirectoryHandle>;
  /** Save a newly picked handle. Default `true`. */
  savePicked?: boolean;
};

/**
 * Returns the stored root handle when it is still permitted; otherwise asks the
 * user to pick a folder and saves the new handle.
 *
 * Permission requests generally require a user gesture (e.g. call this from a
 * button click on app startup), so keep `requestPermission: false` for silent
 * background loads and use {@link tryLoadRootHandle} instead when you do not
 * want the picker to open automatically.
 */
export async function resolveRootHandle(
  key: string,
  options: ResolveRootHandleOptions = {},
): Promise<FsDirectoryHandle> {
  const stored = await tryLoadRootHandle(key, {
    ...options,
    // Resolving is allowed to prompt; silent startup should use tryLoadRootHandle.
    requestPermission: options.requestPermission !== false,
  });
  if (stored) return stored;

  const picker = options.pick ?? (() => pickRoot({ mode: options.mode ?? "readwrite" } satisfies DirectoryPickerOptions));
  const handle = await picker();
  if (options.savePicked !== false) {
    await saveDirectoryHandle(key, handle, options);
  }
  return handle;
}

/**
 * Resolves a stored/picked root and opens the database. The stored handle must
 * contain a manifest consistent with `databaseOptions.version`/`brandId`.
 */
export async function openStoredDatabase(
  key: string,
  databaseOptions: FileSystemDatabaseOptions,
  handleOptions: ResolveRootHandleOptions = {},
): Promise<FileSystemDatabase> {
  const root = await resolveRootHandle(key, handleOptions);
  return FileSystemDatabase.open(root, databaseOptions);
}

/**
 * Loads and opens a stored database without picking a folder. Returns null when
 * there is no stored handle or it is not currently permitted.
 */
export async function tryOpenStoredDatabase(
  key: string,
  databaseOptions: FileSystemDatabaseOptions,
  handleOptions: LoadRootHandleOptions = {},
): Promise<FileSystemDatabase | null> {
  const root = await tryLoadRootHandle(key, handleOptions);
  if (!root) return null;
  return FileSystemDatabase.open(root, databaseOptions);
}

/** Resolves a stored/picked root, provisions the manifest, and returns the database. */
export async function initializeStoredDatabase(
  key: string,
  manifest: FileSystemManifest,
  databaseOptions: InitializeOptions = {},
  handleOptions: ResolveRootHandleOptions = {},
): Promise<FileSystemDatabase> {
  const root = await resolveRootHandle(key, handleOptions);
  return FileSystemDatabase.initialize(root, manifest, databaseOptions);
}
