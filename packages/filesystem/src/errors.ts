/**
 * Structured storage errors for File System Access operations.
 *
 * The browser throws `DOMException`s with terse names (`NotAllowedError`,
 * `NoModificationAllowedError`, ...), and a shared/network file server adds
 * permission, read-only, lock, and I/O failures on top. Every storage helper
 * wraps those into a {@link FileSystemStorageError} with the operation, path,
 * table/record context, and a stable `code` that callers can branch on.
 */

export type FileSystemErrorCode =
  | "not-found"
  | "permission-denied"
  | "read-only"
  | "locked"
  | "quota-exceeded"
  | "invalid-state"
  | "io-error"
  | "type-mismatch"
  | "invalid-data"
  | "unsupported"
  | "conflict"
  | "unknown";

export type FileSystemOperation =
  | "read"
  | "write"
  | "delete"
  | "list"
  | "create-directory"
  | "read-manifest"
  | "write-manifest";

export type FileSystemStorageErrorContext = {
  operation: FileSystemOperation;
  /** Path relative to the database root, e.g. `"tasks/abc.json"`. */
  path?: string;
  table?: string;
  recordId?: string;
  root?: string;
};

const OPERATION_LABELS: Record<FileSystemOperation, string> = {
  read: "read",
  write: "write",
  delete: "delete",
  list: "list",
  "create-directory": "create directory",
  "read-manifest": "read manifest",
  "write-manifest": "write manifest",
};

const CODE_MESSAGES: Record<FileSystemErrorCode, string> = {
  "not-found": "the item was not found",
  "permission-denied": "permission was denied",
  "read-only": "the share is read-only",
  locked: "the file is locked by another process or the share is read-only",
  "quota-exceeded": "the storage quota was exceeded",
  "invalid-state": "the file handle is in an invalid state",
  "io-error": "the underlying storage reported an I/O error (is the network share connected?)",
  "type-mismatch": "a file and a directory have the same name",
  "invalid-data": "the data could not be encoded or decoded",
  unsupported: "the operation is not supported by this browser or handle",
  conflict: "the record changed since it was read",
  unknown: "the storage operation failed",
};

export class FileSystemStorageError extends Error {
  readonly code: FileSystemErrorCode;
  readonly operation: FileSystemOperation;
  readonly path: string | undefined;
  readonly table: string | undefined;
  readonly recordId: string | undefined;
  readonly root: string | undefined;
  /** The original DOMException / Error, if any. */
  readonly originalError: unknown;

  constructor(
    message: string,
    code: FileSystemErrorCode,
    context: FileSystemStorageErrorContext,
    originalError?: unknown,
  ) {
    super(message);
    this.name = "FileSystemStorageError";
    this.code = code;
    this.operation = context.operation;
    this.path = context.path;
    this.table = context.table;
    this.recordId = context.recordId;
    this.root = context.root;
    this.originalError = originalError;
    if (originalError !== undefined) {
      (this as { cause?: unknown }).cause = originalError;
    }
  }
}

export function isAbortError(error: unknown): boolean {
  return (
    (typeof error === "object" &&
      error !== null &&
      (error as { name?: unknown }).name === "AbortError") ||
    (typeof error === "object" && error !== null && (error as { code?: unknown }).code === "ABORT_ERR")
  );
}

/** Thrown when an `ifMatch` revision no longer matches the stored record. */
export class FileSystemConflictError extends FileSystemStorageError {
  readonly expectedRevision: string;
  readonly actualRevision: string;

  constructor(
    context: FileSystemStorageErrorContext,
    expectedRevision: string,
    actualRevision: string,
  ) {
    super(
      `Conflict on "${context.path ?? context.table ?? "record"}": expected revision "${expectedRevision}" but found "${actualRevision}"`,
      "conflict",
      context,
    );
    this.name = "FileSystemConflictError";
    this.expectedRevision = expectedRevision;
    this.actualRevision = actualRevision;
  }
}

function errorName(error: unknown): string | undefined {
  return typeof error === "object" && error !== null
    ? (error as { name?: unknown }).name as string | undefined
    : undefined;
}

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null
    ? (error as { code?: unknown }).code as string | undefined
    : undefined;
}

/** Maps a DOMException/Node error onto the library's stable error codes. */
export function classifyStorageError(error: unknown): FileSystemErrorCode {
  const name = errorName(error);
  const code = errorCode(error);

  if (name === "NotFoundError" || code === "ENOENT") return "not-found";
  if (name === "NotAllowedError" || name === "SecurityError" || code === "EACCES" || code === "EPERM") {
    return "permission-denied";
  }
  if (name === "NoModificationAllowedError" || name === "InvalidModificationError" || code === "EBUSY" || code === "ETXTBSY") {
    return "locked";
  }
  if (code === "EROFS") return "read-only";
  if (name === "QuotaExceededError" || code === "ENOSPC") return "quota-exceeded";
  if (name === "InvalidStateError") return "invalid-state";
  if (name === "NotReadableError" || name === "NetworkError" || name === "OperationError" || code === "EIO") {
    return "io-error";
  }
  if (name === "TypeMismatchError" || code === "EISDIR" || code === "ENOTDIR" || code === "EEXIST") {
    return "type-mismatch";
  }
  if (name === "DataError" || name === "EncodingError" || code === "EILSEQ") return "invalid-data";
  if (name === "NotSupportedError" || code === "ENOTSUP" || code === "EOPNOTSUPP") return "unsupported";
  return "unknown";
}

function originalMessage(error: unknown): string | undefined {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return undefined;
}

function formatStorageMessage(
  code: FileSystemErrorCode,
  context: FileSystemStorageErrorContext,
  error: unknown,
): string {
  const target = context.path ?? context.table ?? "storage";
  const scope = context.table && context.recordId
    ? ` (table "${context.table}", record "${context.recordId}")`
    : context.table
      ? ` (table "${context.table}")`
      : context.root
        ? ` (root "${context.root}")`
        : "";
  const detail = originalMessage(error);
  const suffix = detail ? ` (${detail})` : "";
  return `Failed to ${OPERATION_LABELS[context.operation]} "${target}"${scope}: ${CODE_MESSAGES[code]}${suffix}`;
}

/**
 * Converts a raw storage failure into a {@link FileSystemStorageError}.
 * Abort errors pass through unchanged so callers can keep using standard
 * cancellation semantics.
 */
export function toStorageError(
  error: unknown,
  context: FileSystemStorageErrorContext,
): unknown {
  if (isAbortError(error)) return error;
  if (error instanceof FileSystemStorageError) return error;
  const code = classifyStorageError(error);
  return new FileSystemStorageError(formatStorageMessage(code, context, error), code, context, error);
}

export function throwStorageError(
  error: unknown,
  context: FileSystemStorageErrorContext,
): never {
  throw toStorageError(error, context);
}

/** True when the error is a structured storage failure with this code. */
export function isStorageError(error: unknown, code?: FileSystemErrorCode): error is FileSystemStorageError {
  return error instanceof FileSystemStorageError && (code === undefined || error.code === code);
}

/**
 * Failures that are often worth retrying with backoff on a shared/network
 * drive. Permission, quota, read-only, and not-found failures are not
 * transient and should surface to the user instead.
 */
export function isRetryableStorageError(error: unknown): error is FileSystemStorageError {
  return isStorageError(error) &&
    (error.code === "locked" || error.code === "io-error" || error.code === "invalid-state");
}
