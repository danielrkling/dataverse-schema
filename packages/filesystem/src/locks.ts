import type { FsDirectoryHandle } from "./types";

/** In-process fallback used where Web Locks are unavailable (tests, workers, older browsers). */
const fallbackLocks = new WeakMap<object, Map<string, Promise<void>>>();

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    const error = new Error("The operation was aborted");
    error.name = "AbortError";
    throw error;
  }
}

/**
 * Serializes a complete read/check/write critical section. Web Locks coordinate
 * tabs using the same database folder; the fallback coordinates table instances
 * sharing a root handle in the current JavaScript realm.
 */
export async function withFileSystemLock<T>(
  root: FsDirectoryHandle,
  key: string,
  signal: AbortSignal | undefined,
  task: () => Promise<T>,
): Promise<T> {
  throwIfAborted(signal);
  const lockManager = globalThis.navigator?.locks;
  if (lockManager?.request) {
    return lockManager.request(
      `filesystem-schema:${root.name}:${key}`,
      { mode: "exclusive", ...(signal ? { signal } : {}) },
      task,
    );
  }

  let locks = fallbackLocks.get(root);
  if (!locks) {
    locks = new Map<string, Promise<void>>();
    fallbackLocks.set(root, locks);
  }
  const previous = locks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const tail = new Promise<void>((resolve) => { release = resolve; });
  locks.set(key, tail);
  await previous;
  throwIfAborted(signal);
  try {
    return await task();
  } finally {
    release();
    if (locks.get(key) === tail) locks.delete(key);
  }
}
