import type { DataverseTable, GenericProperties } from "../index";
import type { QueuedMutation } from "./types";
import { DEFAULT_QUEUE_STORE } from "./types";
import { getAllFromIDB, deleteManyFromIDB } from "./idb";
import { compactMutations } from "./compact";

const TYPE_ORDER: Record<string, number> = { insert: 0, update: 1, delete: 2 };

function sortByType(mutations: QueuedMutation[]): QueuedMutation[] {
  return [...mutations].sort((a, b) => {
    const typeDiff = TYPE_ORDER[a.type] - TYPE_ORDER[b.type];
    if (typeDiff !== 0) return typeDiff;
    return a.sequence - b.sequence;
  });
}

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

  if (allMutations.length === 0) {
    return { succeeded: 0, failed: 0, remaining: 0 };
  }

  // Compact: merge consecutive mutations on the same record
  const compacted = compactMutations(allMutations);

  // Sort: inserts first (FK-safe), then by sequence
  const sorted = sortByType(compacted);

  const succeeded: QueuedMutation[] = [];
  const failed: QueuedMutation[] = [];

  for (const mutation of sorted) {
    const table = tables[mutation.collectionId];
    if (!table) {
      console.warn(
        `[replayAllQueues] no table found for collection "${mutation.collectionId}", skipping mutation ${mutation.id}`,
      );
      failed.push(mutation);
      continue;
    }

    try {
      switch (mutation.type) {
        case "insert":
          await table.insertRecord(mutation.value);
          break;
        case "update":
          await table.updateRecord(mutation.key as string, mutation.value);
          break;
        case "delete":
          await table.deleteRecord(mutation.key as string);
          break;
      }
      succeeded.push(mutation);
    } catch (err) {
      console.warn(`[replayAllQueues] failed to replay mutation ${mutation.id} on "${mutation.collectionId}":`, err);
      failed.push(mutation);
    }
  }

  await deleteManyFromIDB(
    dbName,
    queueStoreName,
    succeeded.map((m) => m.id),
  );

  const remaining = allMutations.length - succeeded.length;
  return {
    succeeded: succeeded.length,
    failed: failed.length,
    remaining,
  };
}
