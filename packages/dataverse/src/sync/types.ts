export type QueuedMutation = {
    id: string;
    type: "insert" | "update" | "delete";
    key: string;
    value?: any;
    changes: any;
    /** Backend table/entity-set identifier used to route the mutation. */
    entitySetName: string;
    /** Local collection/cache store. Defaults to entitySetName for legacy queued mutations. */
    collectionId?: string;
    timestamp: number;
    sequence: number;
    attempts: number;
    ifMatch?: string;
    /**
     * When true, the mutation is retried without an `If-Match` precondition:
     * updates become overwrite-if-exists (`If-Match: *`) and deletes run
     * unconditionally. Used to force a mutation that previously failed with a
     * 412 concurrency conflict (see the adapter's isConcurrencyError).
     */
    force?: boolean;
    lastAttemptAt?: number;
    nextAttemptAt?: number;
    error?: any
};

export class MutationPersistenceError extends Error {
    constructor(
        message: string,
        readonly mutationIds: string[],
        readonly cause: unknown,
    ) {
        super(message, { cause });
        this.name = "MutationPersistenceError";
    }
}
