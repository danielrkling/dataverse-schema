export { SyncEngine, type SyncEngineOptions, type ConflictDetails, type FieldDiff, type FieldDiffStatus, type RetryOptions, type SyncTable, type EtagReader } from "./engine";
export { serializeError, isConcurrencyError, isDeterministicFailure } from "./errors";
export { MutationPersistenceError, type QueuedMutation } from "./types";
export { isMetaKey, isMetaOnly, plainClone, valuesEqual } from "./util";
