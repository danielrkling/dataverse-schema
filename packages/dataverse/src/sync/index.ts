/**
 * `dataverse-schema/sync` — the offline engine plus the Dataverse adapter and
 * error classifiers. Importing this entry does not pull in `@tanstack/db`;
 * the collection adapters live in `dataverse-schema/sync/tanstack`.
 */
export {
    SyncEngine,
    type SyncEngineOptions,
    type ConflictDetails,
    type FieldDiff,
    type FieldDiffStatus,
    type RetryOptions,
    type SyncTable,
    type EtagReader,
} from "./engine";
export { dataverseSyncEngine } from "./adapter";
export { MutationPersistenceError, type QueuedMutation } from "./types";
export { isConcurrencyError, isKeyViolation, serializeError } from "./classifiers";
export { DATVERSE_ERROR_CODES, interpretError, isDeterministicFailure } from "./error-codes";
export type { ErrorCategory, ErrorGuidance } from "./error-codes";
export { isMetaKey, isMetaOnly, plainClone, valuesEqual } from "./util";
