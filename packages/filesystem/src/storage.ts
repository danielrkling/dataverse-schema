import {
  FileSystemStorageError,
  isStorageError,
  throwStorageError,
  toStorageError,
  type FileSystemOperation,
  type FileSystemStorageErrorContext,
} from "./errors";
import { withStorageRetry, type StorageRetryPolicy } from "./retry";
import type { FsDirectoryHandle, FsEntry, FsWritable, ReadOptions, RecordId } from "./types";

/** The root manifest file every database folder must contain. */
export const MANIFEST_FILE = "fsdb.json";

/** Extension used for one-record-per-file tables. */
export const JSON_EXTENSION = ".json";

/** Optional caller context attached to storage failures. */
export type StorageContext = Partial<Omit<FileSystemStorageErrorContext, "operation">> & {
  operation?: FileSystemOperation;
  retry?: StorageRetryPolicy;
};

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
const ILLEGAL_SEGMENT_CHARS = /[\u0000-\u001f<>:"/\\|?*]/;

/**
 * Rejects anything that is not a safe, portable single path segment. Folder
 * names, single-file table names, and derived record file names all go through
 * this — silently letting the OS sanitize a name would make later reads point
 * at a different file.
 */
export function assertSafeSegment(name: string, label = "name"): string {
  if (!name) throw new Error(`${label} must not be empty`);
  if (name === "." || name === "..") throw new Error(`${label} "${name}" is not a safe path segment`);
  if (ILLEGAL_SEGMENT_CHARS.test(name)) {
    throw new Error(`${label} "${name}" contains an illegal file-name character (<>:"/\\|?* or a control character)`);
  }
  if (/[. ]$/.test(name)) {
    throw new Error(`${label} "${name}" must not end with a dot or space`);
  }
  const base = name.split(".")[0] ?? "";
  if (WINDOWS_RESERVED.test(base)) {
    throw new Error(`${label} "${name}" is a reserved Windows file name (base name "${base}")`);
  }
  return name;
}

/** Ensures a caller-provided file name ends in `.json`. */
export function ensureJsonFileName(name: string, label = "file name"): string {
  const value = name.endsWith(JSON_EXTENSION) ? name : `${name}${JSON_EXTENSION}`;
  return assertSafeSegment(value, label);
}

function encodeIdChar(char: string): string {
  // encodeURIComponent leaves a handful of characters that Windows rejects
  // (notably `*`). Percent-encode those too so every id is portable.
  return `%${char.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`;
}

/** File name for a record id (`<encoded id>.json`). */
export function recordFileName(id: RecordId): string {
  const raw = String(id);
  if (raw.length === 0) throw new Error("record id must not be empty");
  const encoded = encodeURIComponent(raw).replace(/[!'()*]/g, encodeIdChar);
  return assertSafeSegment(`${encoded}${JSON_EXTENSION}`, `record id "${raw}"`);
}

/** Inverse of {@link recordFileName}; null for non-record files. */
export function recordIdFromFileName(fileName: string): string | null {
  if (!fileName.endsWith(JSON_EXTENSION)) return null;
  const encoded = fileName.slice(0, -JSON_EXTENSION.length);
  try {
    return decodeURIComponent(encoded);
  } catch {
    throw new Error(`table folder contains an invalid record file name: "${fileName}"`);
  }
}

/** Encoded id segment (no `.json`) used for per-record subfolders. */
export function recordIdSegment(id: RecordId): string {
  return recordFileName(id).slice(0, -JSON_EXTENSION.length);
}

/** A collision-resistant JSON file name for trash/history snapshots. */
export function uniqueJsonFileName(): string {
  const random = Math.random().toString(36).slice(2, 10);
  return assertSafeSegment(`${Date.now()}-${random}${JSON_EXTENSION}`, "snapshot file name");
}

/**
 * A non-cryptographic content revision used for optimistic concurrency.
 * FNV-1a over the UTF-16 code units plus the length; it only needs to detect
 * changes, not resist deliberate collisions.
 */
export function revisionOfText(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${text.length.toString(36)}-${(hash >>> 0).toString(36)}`;
}

export function isNotFoundError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (((error as { name?: unknown }).name === "NotFoundError") ||
      (error as { code?: unknown }).code === "ENOENT")
  );
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    const abortError = new Error("The operation was aborted");
    abortError.name = "AbortError";
    throw abortError;
  }
}

function storageContext(
  operation: FileSystemOperation,
  fileName: string,
  context: StorageContext = {},
): FileSystemStorageErrorContext {
  return {
    operation: context.operation ?? operation,
    path: context.path ?? fileName,
    table: context.table,
    recordId: context.recordId,
    root: context.root,
  };
}

/** Parses JSON with a context-rich error message. */
export function parseJsonText(text: string, label: string): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid JSON in ${label}: ${detail}`);
  }
}

/** Reads a file as text, or null when it does not exist. */
export async function readTextFile(
  directory: FsDirectoryHandle,
  fileName: string,
  options: ReadOptions = {},
  context: StorageContext = {},
): Promise<string | null> {
  throwIfAborted(options.signal);
  const details = storageContext("read", fileName, context);
  return withStorageRetry(
    details.operation,
    async () => {
      try {
        const handle = await directory.getFileHandle(fileName);
        throwIfAborted(options.signal);
        const file = await handle.getFile();
        return await file.text();
      } catch (error) {
        if (isNotFoundError(error)) return null;
        throwStorageError(error, details);
      }
    },
    context.retry,
    options.signal,
  );
}

/** Best-effort removal of an empty file left behind by a failed create. */
async function removeEmptyFile(directory: FsDirectoryHandle, fileName: string): Promise<void> {
  try {
    const handle = await directory.getFileHandle(fileName);
    const content = await (await handle.getFile()).text();
    if (content === "") await directory.removeEntry(fileName);
  } catch {
    // The target is locked, read-only, gone, or the cleanup is not permitted.
    // Surface the original write error instead.
  }
}

/**
 * Writes a file using `createWritable` (the browser's atomic temp-file write).
 * The parent directory must already exist.
 *
 * On failure the writable is aborted (best effort) so a partially-written temp
 * file is discarded, then a structured {@link FileSystemStorageError} is thrown.
 * If the target was newly created and remains empty, it is removed so a failed
 * create does not leave a record file that later reads must reject.
 */
export async function writeTextFile(
  directory: FsDirectoryHandle,
  fileName: string,
  text: string,
  options: ReadOptions = {},
  context: StorageContext = {},
): Promise<void> {
  throwIfAborted(options.signal);
  const details = storageContext("write", fileName, context);
  return withStorageRetry(
    details.operation,
    async () => {
      let writable: FsWritable | undefined;
      try {
        const handle = await directory.getFileHandle(fileName, { create: true });
        writable = await handle.createWritable();
        await writable.write(text);
        throwIfAborted(options.signal);
        await writable.close();
      } catch (error) {
        try {
          await writable?.abort?.();
        } catch {
          // best-effort cleanup; surface the original error
        }
        await removeEmptyFile(directory, fileName);
        throwStorageError(error, details);
      }
    },
    context.retry,
    options.signal,
  );
}

/** True when a file with this name exists in the directory. */
export async function fileExists(
  directory: FsDirectoryHandle,
  fileName: string,
  options: ReadOptions = {},
  context: StorageContext = {},
): Promise<boolean> {
  throwIfAborted(options.signal);
  const details = storageContext("read", fileName, context);
  return withStorageRetry(
    details.operation,
    async () => {
      try {
        await directory.getFileHandle(fileName);
        return true;
      } catch (error) {
        if (isNotFoundError(error)) return false;
        throwStorageError(error, details);
      }
    },
    context.retry,
    options.signal,
  );
}

/** Deletes a file; returns false when it was already missing. */
export async function removeFile(
  directory: FsDirectoryHandle,
  fileName: string,
  options: ReadOptions = {},
  context: StorageContext = {},
): Promise<boolean> {
  throwIfAborted(options.signal);
  const details = storageContext("delete", fileName, context);
  let attempt = 0;
  return withStorageRetry(
    details.operation,
    async () => {
      attempt += 1;
      try {
        await directory.removeEntry(fileName);
        return true;
      } catch (error) {
        if (isNotFoundError(error)) {
          // A retried delete may have already committed before surfacing a
          // transient failure; treat the subsequent "not found" as success.
          return attempt > 1;
        }
        throwStorageError(error, details);
      }
    },
    context.retry,
    options.signal,
  );
}

/** Gets (and optionally creates) a sub-directory. */
export async function getSubdirectory(
  parent: FsDirectoryHandle,
  name: string,
  options: { create?: boolean; signal?: AbortSignal } = {},
  context: StorageContext = {},
): Promise<FsDirectoryHandle> {
  throwIfAborted(options.signal);
  const segment = assertSafeSegment(name, "directory name");
  const details = storageContext(options.create ? "create-directory" : "read", segment, context);
  return withStorageRetry(
    details.operation,
    async () => {
      try {
        return await parent.getDirectoryHandle(segment, { create: options.create });
      } catch (error) {
        throwStorageError(error, details);
      }
    },
    context.retry,
    options.signal,
  );
}

/** Gets a sub-directory, or null when it does not exist. */
export async function trySubdirectory(
  parent: FsDirectoryHandle,
  name: string,
  options: ReadOptions = {},
  context: StorageContext = {},
): Promise<FsDirectoryHandle | null> {
  try {
    return await getSubdirectory(parent, name, { ...options, create: false }, context);
  } catch (error) {
    if (isNotFoundError(error) || isStorageError(error, "not-found")) return null;
    throw error;
  }
}

/** Lists every direct child entry of a directory. */
export async function listDirectory(
  directory: FsDirectoryHandle,
  options: ReadOptions = {},
  context: StorageContext = {},
): Promise<FsEntry[]> {
  throwIfAborted(options.signal);
  const details = storageContext("list", context.path ?? directory.name, context);
  if (typeof directory.values !== "function") {
    throw new FileSystemStorageError(
      `Failed to list "${details.path}": ${directory.name} does not support values() — the File System Access API directory iterator is required`,
      "unsupported",
      details,
    );
  }
  return withStorageRetry(
    details.operation,
    async () => {
      const entries: FsEntry[] = [];
      try {
        for await (const entry of directory.values!()) {
          throwIfAborted(options.signal);
          entries.push({ kind: entry.kind, name: entry.name });
        }
        return entries;
      } catch (error) {
        throwStorageError(error, details);
      }
    },
    context.retry,
    options.signal,
  );
}
