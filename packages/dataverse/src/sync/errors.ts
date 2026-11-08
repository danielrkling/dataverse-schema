/**
 * Generic, product-agnostic default error handling for SyncEngine's flush
 * loop. The Dataverse adapter overrides the classifier via SyncEngineOptions
 * with its richer error-code table and duplicate-key semantics.
 *
 * These helpers duck-type the HTTP error shape `{ status, body }`, so they
 * work with any backend's HTTP error class — live or serialized-from-IDB.
 */

/**
 * Reduces a thrown error to a structured-clone-safe plain object before it is
 * persisted into the IndexedDB errored store. HTTP error objects often carry
 * non-cloneable fields (e.g. a live `Response`), so the status/body are
 * preserved as own properties — once the error has passed through IndexedDB
 * only the data survives.
 */
export function serializeError(error: unknown): Record<string, unknown> {
    const shaped = error as { status?: unknown; statusText?: unknown; body?: unknown; message?: string; name?: string } | undefined;
    if (shaped && typeof shaped === "object" && typeof shaped.status === "number") {
        return {
            name: shaped.name ?? "HttpError",
            message: shaped.message,
            status: shaped.status,
            statusText: shaped.statusText,
            body: shaped.body,
        };
    }
    if (error instanceof Error) {
        return { name: error.name, message: error.message };
    }
    return { name: "UnknownError", value: error };
}

/**
 * Returns true when the error is a 412 (Precondition Failed) response —
 * an optimistic-concurrency failure meaning the server's etag no longer
 * matches the etag the mutation was built against.
 */
export function isConcurrencyError(error: unknown): boolean {
    return (error as { status?: unknown } | undefined)?.status === 412;
}

/**
 * Generic status-based deterministic-failure heuristic: statuses that cannot
 * behave differently on a retry (malformed request 400/412/404, permission
 * 403) are deterministic; throttling (429), auth (401), server faults (5xx)
 * and transport failures are retried by the backoff cycle.
 */
export function isDeterministicFailure(error: unknown): boolean {
    const status = (error as { status?: unknown } | undefined)?.status;
    if (typeof status !== "number") return false; // transport failure → retry
    if (status === 412 || status === 404) return true;
    if (status === 429 || status === 401) return false;
    if (status === 403) return true;
    return status >= 400 && status < 500;
}
