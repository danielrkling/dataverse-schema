/**
 * Opt-in retry policy for storage operations.
 *
 * Reads are idempotent, so a supplied policy retries transient read failures by
 * default. Writes and deletes are NOT retried unless explicitly enabled: a
 * failed `close()`/`removeEntry()` has an ambiguous commit outcome, and blindly
 * repeating it can overwrite another client's work on a shared drive.
 */

import type { FileSystemOperation, FileSystemStorageError } from "./errors";
import { isRetryableStorageError } from "./errors";

export type StorageRetryPolicy = {
  /** Total attempts, including the first. Default `3`. Set `1` to disable. */
  attempts?: number;
  /** Initial backoff delay in ms. Default `50`. */
  delayMs?: number;
  /** Upper bound for the backoff delay in ms. Default `1000`. */
  maxDelayMs?: number;
  /** Exponential backoff multiplier. Default `2`. */
  backoff?: number;
  /** Add 50–100% random jitter to each delay. Default `true`. */
  jitter?: boolean;
  /**
   * Retry reads, listings, manifest reads, and idempotent directory creation.
   * Default `true` when a policy is supplied.
   */
  retryReads?: boolean;
  /**
   * Retry write/manifest-write operations. Default `false`. Only enable if
   * your write is safe to repeat after an ambiguous commit.
   */
  retryWrites?: boolean;
  /**
   * Retry delete operations. Default `false`. A delete that actually committed
   * can surface as "not found" on the retry.
   */
  retryDeletes?: boolean;
  /** Additional per-error filter, applied after the transient-code check. */
  shouldRetry?: (error: FileSystemStorageError, operation: FileSystemOperation) => boolean;
};

const READ_OPERATIONS = new Set<FileSystemOperation>([
  "read",
  "list",
  "read-manifest",
  // Creating a directory is idempotent and safe to repeat.
  "create-directory",
]);
const WRITE_OPERATIONS = new Set<FileSystemOperation>(["write", "write-manifest"]);
const DELETE_OPERATIONS = new Set<FileSystemOperation>(["delete"]);

function operationEnabled(policy: StorageRetryPolicy, operation: FileSystemOperation): boolean {
  if (READ_OPERATIONS.has(operation)) return policy.retryReads !== false;
  if (WRITE_OPERATIONS.has(operation)) return policy.retryWrites === true;
  if (DELETE_OPERATIONS.has(operation)) return policy.retryDeletes === true;
  return false;
}

function abortError(): Error {
  const error = new Error("The operation was aborted");
  error.name = "AbortError";
  return error;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) {
    if (signal?.aborted) return Promise.reject(abortError());
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      reject(abortError());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Runs one storage operation under a retry policy. Only structured storage
 * errors with transient codes (`locked`, `io-error`, `invalid-state`) are
 * retried, and only when the operation category is enabled by the policy.
 */
export async function withStorageRetry<T>(
  operation: FileSystemOperation,
  run: () => Promise<T>,
  policy: StorageRetryPolicy | undefined,
  signal?: AbortSignal,
): Promise<T> {
  if (!policy || !operationEnabled(policy, operation)) return run();

  const attempts = Math.max(1, Math.floor(policy.attempts ?? 3));
  if (attempts === 1) return run();

  const initialDelay = Math.max(0, policy.delayMs ?? 50);
  const maxDelay = Math.max(initialDelay, policy.maxDelayMs ?? 1000);
  const backoff = Math.max(1, policy.backoff ?? 2);
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    if (signal?.aborted) throw abortError();
    try {
      return await run();
    } catch (error) {
      lastError = error;
      if (attempt >= attempts) break;
      if (!isRetryableStorageError(error)) break;
      if (policy.shouldRetry && !policy.shouldRetry(error, operation)) break;
      const base = Math.min(maxDelay, initialDelay * Math.pow(backoff, attempt - 1));
      const delay = policy.jitter === false ? base : base * (0.5 + Math.random() * 0.5);
      await sleep(delay, signal);
    }
  }
  throw lastError;
}
