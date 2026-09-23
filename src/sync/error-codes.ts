import { DataverseHttpError } from "dataverse-schema";
import { isKeyViolation } from "./classifiers";

/**
 * Curated sub-set of the Dataverse Web API error-code table
 * (https://learn.microsoft.com/en-us/power-apps/developer/data-platform/reference/web-service-error-codes)
 * covering the codes most relevant to offline mutation processing: uniqueness
 * violations, missing records and duplicate detection.
 */
export const DATVERSE_ERROR_CODES: Record<string, { name: string; meaning: string }> = {
    "0x80060892": {
        name: "DuplicateRecordEntityKey",
        meaning: "Entity key violated: a record with the same unique key values already exists.",
    },
    "0x80040333": {
        name: "DuplicateRecordsFound",
        meaning: "Duplicate detection stopped the create/update: a duplicate of this record already exists.",
    },
    "0x80060891": {
        name: "RecordNotFoundByEntityKey",
        meaning: "No record exists with the specified key values (alternate-key reference resolves to nothing).",
    },
};

/** What category a mutation failure falls into, for resolution UIs. */
export type ErrorCategory =
    /** Optimistic-concurrency failure: etag no longer matches (resolvable by force/rebase). */
    | "concurrency"
    /** Unique-key or duplicate detection violation (payload must be edited or discarded). */
    | "key-violation"
    /** The target record no longer exists (update/delete on a deleted record). */
    | "missing-record"
    /** Request rejected as malformed/invalid (payload problem, not a race). */
    | "validation"
    /** Server throttling — the retry cycle should just keep trying. */
    | "throttled"
    /** Auth token problem — a fresh token should fix it. */
    | "identity"
    /** Insufficient privileges — requires admin/user action, not a payload fix. */
    | "permission"
    /** Server-side fault (5xx) or transient network failure — retry is the right move. */
    | "transient"
    /** Anything not otherwise classified. */
    | "unknown";

/** Interpretation of a mutation failure, for resolution UIs and retry policy. */
export type ErrorGuidance = {
    category: ErrorCategory;
    /**
     * The documented Dataverse code name when known — e.g.
     * `DuplicateRecordEntityKey` for `0x80060892`.
     */
    codeName?: string;
    /** The raw hex code as returned by the server, when available. */
    code?: string;
    /** Human-readable resolution hint for a dashboard. */
    resolution: string;
    /**
     * Deterministic failures cannot behave differently on a retry: re-applying
     * them wastes a request cycle per retry. Getting past one requires a
     * server-side change (revert, recreate) or an operator resolution (force,
     * rebase, edited payload). Transient failures keep the retry/backoff cycle.
     */
    deterministic: boolean;
};

/** Extracts the helper fields from a DataverseHttpError or a serialized/stored error. */
function readError(error: unknown): { status?: number; body?: unknown } {
    if (error instanceof DataverseHttpError) return { status: error.status, body: error.body };
    const shaped = error as { status?: unknown; body?: unknown } | undefined;
    if (!shaped || typeof shaped !== "object") return {};
    const status = typeof shaped.status === "number" ? shaped.status : undefined;
    return { status, body: shaped.body };
}

/**
 * Interprets a mutation failure (a live `DataverseHttpError` or a serialized
 * error restored from the errored store) into a {@link ErrorGuidance} for
 * dashboards and retry policy. Guidance-based classification is the source of
 * truth for the flush loop's deterministic skip; the standalone helpers
 * {@link isConcurrencyError} and {@link isKeyViolation} delegate to the same
 * logic for simple yes/no questions.
 */
export function interpretError(error: unknown): ErrorGuidance {
    const { status, body } = readError(error);
    const bodyCode = (body as { code?: unknown } | undefined)?.code;
    const code = typeof bodyCode === "string" ? bodyCode.toLowerCase() : undefined;
    const documented = code ? DATVERSE_ERROR_CODES[code] : undefined;
    const transient: { category: ErrorCategory; resolution: string; deterministic: boolean } = {
        category: "transient",
        resolution: "Network failure (no HTTP status reached the client); the retry cycle is the correct treatment.",
        deterministic: false,
    };

    const classified: { category: ErrorCategory; resolution: string; deterministic: boolean } | undefined =
        isKeyViolation(error)
            ? {
                category: "key-violation",
                resolution: "A record with these unique-key values already exists. Edit the key values locally or discard the mutation; Force/Rebase cannot resolve a uniqueness constraint.",
                deterministic: true,
            }
            : status === 412
                ? {
                    category: "concurrency",
                    resolution: "The server record changed since the mutation was built. Review getConflictDetails, then force (overwrite) or retry with a fresh etag (rebase).",
                    deterministic: true,
                }
                : (documented?.name === "RecordNotFoundByEntityKey" || status === 404)
                    ? {
                        category: "missing-record",
                        resolution: "The target record no longer exists server-side. Discard the mutation (or recreate the record first).",
                        deterministic: true,
                    }
                    : status === 429
                        ? {
                            category: "throttled",
                            resolution: "Dataverse throttled the request; the retry/backoff cycle is the correct treatment. No action needed.",
                            deterministic: false,
                        }
                        : status === 401
                            ? {
                                category: "identity",
                                resolution: "Auth token rejected. Once the app re-authenticates, retry — the payload itself is fine.",
                                deterministic: false,
                            }
                            : status === 403
                                ? {
                                    category: "permission",
                                    resolution: "Insufficient privileges for this operation. Requires a permission change (or a different user); retrying alone cannot help.",
                                    deterministic: true,
                                }
                                : (status === undefined)
                                    // No HTTP status reached the client at all — treat as a
                                    // transport failure, which the retry cycle is built for.
                                    ? { ...transient, deterministic: false }
                                    : status >= 500
                                        ? {
                                            category: "transient",
                                            resolution: "Server-side fault; retrying via the normal backoff cycle should succeed once the fault clears.",
                                            deterministic: false,
                                        }
                                        : status >= 400
                                            ? {
                                                category: "validation",
                                                resolution: "Dataverse rejected the request itself (typically an unknown/malformed property or business rule). Correct the mutation payload; identical retries fail identically.",
                                                deterministic: true,
                                            }
                                            : undefined;

    return {
        category: classified?.category ?? transient.category,
        resolution: classified?.resolution ?? transient.resolution,
        deterministic: classified?.deterministic ?? transient.deterministic,
        codeName: documented?.name,
        code,
    };
}

/** Convenience determination (see {@link interpretError}). */
export function isDeterministicFailure(error: unknown): boolean {
    return interpretError(error).deterministic;
}
