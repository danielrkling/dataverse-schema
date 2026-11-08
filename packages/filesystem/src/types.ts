/** Utility types shared across the File System Access database package. */

/**
 * The subset of the File System Access API this package relies on. Real
 * `FileSystemDirectoryHandle` / `FileSystemFileHandle` objects satisfy these
 * interfaces structurally, and tests can supply a lightweight implementation.
 */
export type FsEntry = {
  readonly kind: "file" | "directory";
  readonly name: string;
};

export type FsWritable = {
  write(data: string): Promise<void>;
  close(): Promise<void>;
  abort?(): Promise<void>;
};

export type FsFileHandle = {
  readonly kind: "file";
  readonly name: string;
  getFile(): Promise<{ text(): Promise<string> }>;
  createWritable(options?: { keepExistingData?: boolean }): Promise<FsWritable>;
};

export type FsDirectoryHandle = {
  readonly kind: "directory";
  readonly name: string;
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<FsDirectoryHandle>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FsFileHandle>;
  removeEntry(name: string, options?: { recursive?: boolean }): Promise<void>;
  values?(): AsyncIterable<FsEntry> | AsyncIterableIterator<FsEntry>;
};

/** A record id. File names are derived from it, so ids are normally strings. */
export type RecordId = string | number;

/** The contents of the root `fsdb.json` manifest. */
export type FileSystemManifest = {
  /** Schema/storage version, compared as a string. */
  version: string | number;
  /** Identity of the app/brand that owns the folder. */
  brandId: string;
};

export type ReadOptions = {
  signal?: AbortSignal;
};

export type WriteOptions = ReadOptions & {
  /**
   * Accepted for parity with the other schema packages' mutation options.
   * File-backed records have no server etag, so this value is currently
   * ignored.
   */
  ifMatch?: string;
};

export type DeleteOptions = WriteOptions & {
  /** What to do when the record/file is already gone. Default `"throw"`. */
  ifMissing?: "throw" | "ignore";
  /** Bypass the table's trash setting and delete permanently. */
  permanent?: boolean;
};

/** Revision/etag key hoisted onto read records. */
export const REVISION_KEY = "$rev";

/** A record plus its optimistic-concurrency revision. */
export type WithRevision<T> = T & { [REVISION_KEY]?: string };

/** Soft-deleted record payload stored in `<table>/.meta/trash/`. */
export type TrashEntry<T = unknown> = {
  id: string;
  deletedAt: string;
  data: T;
};

export type TrashEntryInfo = {
  id: string;
  deletedAt: string;
  fileName: string;
};

export type RestoreRecordOptions = WriteOptions & {
  /** Restore a specific trash file instead of the newest one. */
  trashFileName?: string;
  /** What to do when the live record already exists. Default `"throw"`. */
  ifExists?: "throw" | "overwrite";
};

export type HistoryEntryInfo = {
  fileName: string;
  savedAt: string;
};

export type HistoryEntry<T = unknown> = HistoryEntryInfo & {
  data: T;
};

export type RestoreHistoryOptions = WriteOptions & {
  /** What to do when the live record already exists. Default `"overwrite"`. */
  ifExists?: "throw" | "overwrite";
};

export type GenericProperties = Record<string, any>;
