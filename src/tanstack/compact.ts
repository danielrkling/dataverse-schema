import type { QueuedMutation } from "./types";

type Mutable<T> = { -readonly [P in keyof T]: T[P] };

/**
 * Compacts a list of mutations by collapsing multiple operations on the
 * same record into a single final operation.
 *
 * Rules (applied in sequence order per record):
 *   - insert + update(s)       → single insert with merged values
 *   - insert + delete          → cancelled out (removed entirely)
 *   - update(s)                → single update with merged changes
 *   - update + delete          → single delete
 *   - delete + insert          → single insert (final state wins)
 *   - delete + update(s)       → single delete (can't update a deleted record)
 *   - double insert            → keeps the last insert
 *   - double delete            → keeps single delete
 */
export function compactMutations(mutations: QueuedMutation[]): QueuedMutation[] {
  const groups = new Map<string, QueuedMutation[]>();

  for (const m of mutations) {
    const key = `${m.collectionId}::${m.key}`;
    let group = groups.get(key);
    if (!group) {
      group = [];
      groups.set(key, group);
    }
    group.push(m);
  }

  const compacted: QueuedMutation[] = [];

  for (const group of groups.values()) {
    group.sort((a, b) => a.sequence - b.sequence);

    let result: Mutable<QueuedMutation> | null = null;

    for (const m of group) {
      if (!result) {
        result = { ...m };
        continue;
      }

      if (result.type === "insert") {
        if (m.type === "insert") {
          result = { ...m };
        } else if (m.type === "update") {
          result = { ...result, value: { ...result.value, ...m.value }, sequence: m.sequence };
        } else if (m.type === "delete") {
          result = null;
        }
      } else if (result.type === "update") {
        if (m.type === "update") {
          result = { ...result, value: { ...result.value, ...m.value }, sequence: m.sequence };
        } else if (m.type === "delete") {
          result = { ...m };
        }
      } else if (result.type === "delete") {
        if (m.type === "insert") {
          result = { ...m };
        } else if (m.type === "update") {
          // Can't update a deleted record — keep the delete
        } else if (m.type === "delete") {
          // No-op — already deleting
        }
      }
    }

    if (result) {
      compacted.push(result as QueuedMutation);
    }
  }

  compacted.sort((a, b) => a.sequence - b.sequence);
  return compacted;
}
