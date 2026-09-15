export { SyncEngine, type SyncEngineOptions, type ConflictDetails, type FieldDiff, type FieldDiffStatus, type RetryOptions } from "./queue";
export { MutationPersistenceError, type QueuedMutation } from "./types";
export { isConcurrencyError, isKeyViolation, serializeError } from "./classifiers";
export { DATVERSE_ERROR_CODES, interpretError, isDeterministicFailure } from "./error-codes";
export type { ErrorCategory, ErrorGuidance } from "./error-codes";
export { isMetaKey, isMetaOnly, plainClone, valuesEqual } from "./util";
