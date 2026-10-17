import { DataverseHttpError } from "../client";

/**
 * Reduces a thrown error to a structured-clone-safe plain object before it is
 * persisted into the IndexedDB errored store. Besides keeping the `put` from
 * throwing (`DataverseHttpError.response` holds a live `Response` object,
 * which cannot be cloned), this preserves the HTTP status as an own property
 * so conflict detection keeps working after a page reload — once the error
 * has passed through IndexedDB, `instanceof DataverseHttpError` no longer
 * holds (the class identity is not restored), only the data survives.
 */
export function serializeError(error: unknown): Record<string, unknown> {
    if (error instanceof DataverseHttpError) {
        return {
            name: error.name,
            message: error.message,
            status: error.status,
            statusText: error.statusText,
            body: error.body,
        };
    }
    if (error instanceof Error) {
        return { name: error.name, message: error.message };
    }
    return { name: "UnknownError", value: error };
}

const KEY_VIOLATION_CODES = new Set([
    "0x80060892", // DuplicateRecordEntityKey
    "0x80040333", // DuplicateRecordsFound
]);
const DUPLICATE_KEY_MESSAGE = /duplicate record cannot be created|same value for .* already exists/i;

/**
 * Returns true when the error is a Dataverse 412 (Precondition Failed)
 * response — an optimistic-concurrency failure meaning the server's etag no
 * longer matches the etag the mutation was built against. Such mutations are
 * moved to the errored store and can be re-applied with `force` or
 * `useFreshEtag` retry options (see `SyncEngine.retryErroredMutation`).
 *
 * Because stored errors are serialized plain objects ({@link serializeError}),
 * detection cannot rely on `instanceof` alone — it also matches the persisted
 * `status` property shape, so an error read back after a page reload is still
 * recognized.
 *
 * Duplicate-key violations can surface as 412s too, but they are NOT
 * concurrency failures — Force only removes the `If-Match` precondition and
 * cannot make a record unique, and rebasing onto the server's etag changes
 * nothing either. Those are excluded here so resolution UIs don't offer
 * Force/Rebase for them; use {@link isKeyViolation} to detect them instead.
 */
export function isConcurrencyError(error: unknown): boolean {
    const status = (error as { status?: unknown } | undefined)?.status;
    if (status !== 412) return false;
    return !isKeyViolation(error);
}

/**
 * Returns true when a Dataverse error is a unique-key / duplicate-detection
 * violation (e.g. `DuplicateRecordEntityKey`, `0x80060892`: "Entity Key {0}
 * violated. A record with the same value for {1} already exists."), or the
 * classic duplicate-detection result (`DuplicateRecordsFound`,
 * `0x80040333`). These failures are deterministic — the same payload will
 * keep failing no matter when it is retried and no matter which etag it
 * carries — so they skip the retry cycle entirely and move straight to the
 * errored store. Resolution is never automatic: the payload must be edited
 * (different key values) or discarded.
 */
export function isKeyViolation(error: unknown): boolean {
    if (error instanceof DataverseHttpError) {
        // Reconstruct the serialized shape to share one code path.
        error = { body: error.body };
    }
    const body = (error as { body?: { code?: unknown; message?: unknown } } | undefined)?.body as
        { code?: unknown; message?: unknown } | undefined;
    const code = typeof body?.code === "string" ? body.code.toLowerCase() : undefined;
    if (code && KEY_VIOLATION_CODES.has(code)) return true;
    const message = typeof body?.message === "string" ? body.message : undefined;
    // Some duplicate-detection paths return a zero/empty code; fall back to
    // the canonical message fragment of DuplicateRecordEntityKey.
    return typeof message === "string" && DUPLICATE_KEY_MESSAGE.test(message);
}
