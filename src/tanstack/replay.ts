import type { DataverseKey, DataverseTable, GenericProperties } from "dataverse-schema";
import type { QueuedMutation } from "./types";
import { DEFAULT_QUEUE_STORE } from "./types";
import { getAllFromIDB, deleteManyFromIDB, putToIDB } from "./idb";
import { compactMutationsWithConsumed } from "./compact";
import { withLock, replayLockName } from "./coordination";

const TYPE_ORDER: Record<string, number> = { insert: 0, update: 1, delete: 2 };

/** After this many consecutive failures, a mutation starts backing off. */
export const MAX_RETRIES = 6;

/** Exponential backoff: 2^(attempts-1) seconds, capped at 5 minutes. */
export function backoffDelayMs(attempts: number): number {
  return Math.min(2 ** (attempts - 1) * 1000, 5 * 60 * 1000);
}

function sortByType(mutations: QueuedMutation[]): QueuedMutation[] {
  return [...mutations].sort((a, b) => {
    const typeDiff = TYPE_ORDER[a.type] - TYPE_ORDER[b.type];
    if (typeDiff !== 0) return typeDiff;
    return a.sequence - b.sequence;
  });
}

export type ReplayMutationsOptions = {
  dbName?: string;
  queueStoreName?: string;
  tables: Record<string, DataverseTable<GenericProperties>>;
  /** Restrict the replay to one collection's mutations. */
  collectionId?: string;
};

export type ReplayAllQueuesOptions = {
  dbName?: string;
  queueStoreName?: string;
  tables: Record<string, DataverseTable<GenericProperties>>;
};

export type ReplayResult = {
  succeeded: number;
  failed: number;
  remaining: number;
};

/**
 * Replays queued mutations for one or all collections. Callers are expected to
 * hold the collection's replay lock (see `withLock` / `replayLockName`).
 *
 * Insert replay is an idempotent upsert: when a record with the same key
 * already exists, the insert becomes an update instead of failing with a
 * duplicate-key error (which could otherwise stick a crashed-tab queue forever).
 *
 * Failed mutations record `attempts`/`lastAttemptAt` and, once they exceed
 * `MAX_RETRIES`, are skipped while inside their backoff window — so an
 * interrupted or persistently failing item doesn't hammer the server every
 * cycle. The counters persist in IDB, so the backoff survives reloads.
 */
export async function replayMutations(
  options: ReplayMutationsOptions,
): Promise<ReplayResult> {
  const {
    dbName = "dataverse-schema",
    queueStoreName = DEFAULT_QUEUE_STORE,
    tables,
    collectionId,
  } = options;

  let allMutations: QueuedMutation[];
  try {
    allMutations = await getAllFromIDB<QueuedMutation>(dbName, queueStoreName);
  } catch {
    return { succeeded: 0, failed: 0, remaining: 0 };
  }

  if (allMutations.length === 0) {
    return { succeeded: 0, failed: 0, remaining: 0 };
  }

  const scope = collectionId
    ? allMutations.filter((m) => m.collectionId === collectionId)
    : allMutations;

  if (scope.length === 0) {
    return { succeeded: 0, failed: 0, remaining: 0 };
  }

  // Compact: merge consecutive mutations on the same record, tracking every
  // original id consumed by each compacted result (including cancelled groups).
  const { mutations: compacted, groups } = compactMutationsWithConsumed(scope);

  const now = Date.now();
  const succeeded: QueuedMutation[] = [];
  const failed: QueuedMutation[] = [];

  // Ids consumed by compaction (merged away or cancelled out) are always
  // removed. Succeeded results are removed after the run; failed results stay
  // in the store with updated backoff counters.
  const consumedIds = new Set<string>();
  for (const group of groups) {
    if (!group.result) {
      for (const id of group.ids) consumedIds.add(id);
    } else {
      for (const id of group.ids) {
        if (id !== group.result.id) consumedIds.add(id);
      }
    }
  }

  const sorted = sortByType(compacted);

  for (const mutation of sorted) {
    const table = tables[mutation.collectionId];
    if (!table) {
      console.warn(
        `[replay] no table found for collection "${mutation.collectionId}", skipping mutation ${mutation.id}`,
      );
      failed.push(mutation);
      continue;
    }

    const attempts = mutation.attempts ?? 0;

    // Backoff: skip mutations still inside their backoff window.
    if (
      attempts >= MAX_RETRIES &&
      mutation.lastAttemptAt != null &&
      now - mutation.lastAttemptAt < backoffDelayMs(attempts)
    ) {
      continue;
    }

    try {
      switch (mutation.type) {
        case "insert": {
          const existing = await table.getRecord(mutation.key as DataverseKey);
          if (existing != null) {
            await table.updateRecord(mutation.key as DataverseKey, mutation.value);
          } else {
            await table.insertRecord(mutation.value);
          }
          break;
        }
        case "update":
          await table.updateRecord(mutation.key as DataverseKey, mutation.value);
          break;
        case "delete":
          await table.deleteRecord(mutation.key as DataverseKey);
          break;
      }
      succeeded.push(mutation);
    } catch (err) {
      console.warn(`[replay] failed to replay mutation ${mutation.id} on "${mutation.collectionId}":`, err);
      failed.push({
        ...mutation,
        attempts: attempts + 1,
        lastAttemptAt: now,
      });
    }
  }

  const successKeys = succeeded.map((m) => m.id);
  if (successKeys.length > 0 || consumedIds.size > 0) {
    await deleteManyFromIDB(dbName, queueStoreName, [...consumedIds, ...successKeys]);
  }

  for (const mutation of failed) {
    await putToIDB(dbName, queueStoreName, mutation);
  }

  // Still-queued after the run: everything in scope minus what was removed
  // (succeeded results and consumed/compacted-away mutations).
  const remaining = scope.length - succeeded.length - consumedIds.size;
  return {
    succeeded: succeeded.length,
    failed: failed.length,
    remaining,
  };
}

/**
 * Replays all queued mutations across every collection, processing each
 * collection under its own lock so concurrent tabs don't replay the same
 * mutations twice. Collections whose lock is held by another tab are left for
 * the lock holder (their mutations count toward `remaining`).
 */
export async function replayAllQueues(options: ReplayAllQueuesOptions): Promise<ReplayResult> {
  const {
    dbName = "dataverse-schema",
    queueStoreName = DEFAULT_QUEUE_STORE,
    tables,
  } = options;

  let allMutations: QueuedMutation[];
  try {
    allMutations = await getAllFromIDB<QueuedMutation>(dbName, queueStoreName);
  } catch {
    return { succeeded: 0, failed: 0, remaining: 0 };
  }

  const byCollection = new Map<string, QueuedMutation[]>();
  for (const m of allMutations) {
    const list = byCollection.get(m.collectionId) ?? [];
    list.push(m);
    byCollection.set(m.collectionId, list);
  }

  let succeeded = 0;
  let failed = 0;
  let remaining = 0;

  for (const [collectionId, mutations] of byCollection) {
    const result = await withLock(
      replayLockName(dbName, collectionId),
      async () => replayMutations({ dbName, queueStoreName, tables, collectionId }),
    );

    if (result) {
      succeeded += result.succeeded;
      failed += result.failed;
      remaining += result.remaining;
    } else {
      // Lock held by another tab — its replay will handle these mutations.
      remaining += mutations.length;
    }
  }

  return { succeeded, failed, remaining };
}
