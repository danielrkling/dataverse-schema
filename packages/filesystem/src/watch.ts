/**
 * Chromium `FileSystemObserver` integration for live change detection.
 *
 * The observer reports raw filesystem changes; the table wrappers turn them
 * into record-level events (`created` / `updated` / `deleted` / `moved`).
 * There is no fallback polling — callers on unsupported browsers should poll
 * `getRecords()` themselves.
 */

import type { FsDirectoryHandle, FsFileHandle } from "./types";

export type FileSystemObserverChangeType =
  | "appeared"
  | "disappeared"
  | "modified"
  | "moved"
  | "unknown";

export type FileSystemObserverRecord = {
  changedHandle: {
    readonly kind: "file" | "directory";
    readonly name: string;
  };
  relativePathComponents?: readonly string[];
  type: FileSystemObserverChangeType;
};

export type FileSystemObserverLike = {
  observe(
    handle: FsDirectoryHandle | FsFileHandle,
    options?: { recursive?: boolean },
  ): Promise<void> | void;
  unobserve?(handle: FsDirectoryHandle | FsFileHandle): Promise<void> | void;
  disconnect(): void;
};

type FileSystemObserverConstructor = new (
  callback: (records: FileSystemObserverRecord[]) => void,
) => FileSystemObserverLike;

type ObserverGlobal = typeof globalThis & {
  FileSystemObserver?: FileSystemObserverConstructor;
};

export type RecordWatchEventType = "created" | "updated" | "deleted" | "moved" | "unknown";

export type TableWatchEvent<TRecord> = {
  type: RecordWatchEventType;
  fileName: string;
  id?: string;
  record?: TRecord;
};

export type TableWatchOptions = {
  /** Read the changed record and include it in the event. Default `true`. */
  loadRecord?: boolean;
  /** Passed to `FileSystemObserver.observe`. Default `false`. */
  recursive?: boolean;
  signal?: AbortSignal;
  onError?: (error: unknown) => void;
};

export function isFileSystemObserverSupported(): boolean {
  return typeof (globalThis as ObserverGlobal).FileSystemObserver === "function";
}

function createObserver(callback: (records: FileSystemObserverRecord[]) => void): FileSystemObserverLike {
  const Constructor = (globalThis as ObserverGlobal).FileSystemObserver;
  if (typeof Constructor !== "function") {
    throw new Error(
      "FileSystemObserver is not available — live watching requires a Chromium browser with FileSystemObserver support",
    );
  }
  return new Constructor(callback);
}

function abortError(): Error {
  const error = new Error("The operation was aborted");
  error.name = "AbortError";
  return error;
}

function reportError(error: unknown, onError?: (error: unknown) => void): void {
  if (onError) {
    onError(error);
    return;
  }
  // A watcher has no promise for the caller to await; keep the failure visible.
  if (typeof console !== "undefined" && typeof console.error === "function") {
    console.error("[filesystem-schema] watcher callback failed", error);
  }
}

export type ObserveHandleOptions = {
  recursive?: boolean;
  signal?: AbortSignal;
  onError?: (error: unknown) => void;
};

/**
 * Observes a directory or file and returns a disposer. The callback may return
 * a promise; rejected callbacks are routed to `onError`.
 */
export async function observeHandle(
  handle: FsDirectoryHandle | FsFileHandle,
  onChange: (record: FileSystemObserverRecord) => void | Promise<void>,
  options: ObserveHandleOptions = {},
): Promise<() => void> {
  if (options.signal?.aborted) throw abortError();
  const observer = createObserver((records) => {
    for (const record of records) {
      try {
        const result = onChange(record);
        if (result instanceof Promise) {
          void result.catch((error) => reportError(error, options.onError));
        }
      } catch (error) {
        reportError(error, options.onError);
      }
    }
  });

  try {
    await observer.observe(handle, { recursive: options.recursive ?? false });
  } catch (error) {
    observer.disconnect();
    throw error;
  }

  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    options.signal?.removeEventListener("abort", stop);
    observer.disconnect();
  };
  if (options.signal) {
    options.signal.addEventListener("abort", stop, { once: true });
    if (options.signal.aborted) stop();
  }
  return stop;
}

export function mapObserverChangeType(type: FileSystemObserverChangeType): RecordWatchEventType {
  switch (type) {
    case "appeared":
      return "created";
    case "disappeared":
      return "deleted";
    case "modified":
      return "updated";
    case "moved":
      return "moved";
    default:
      return "unknown";
  }
}
