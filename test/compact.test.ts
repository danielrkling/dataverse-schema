import { expect, test } from "vitest";
import { compactMutations } from "../src/tanstack/compact";
import type { QueuedMutation } from "../src/tanstack/types";

function q(overrides: Partial<QueuedMutation> & { id: string }): QueuedMutation {
  return {
    type: "insert",
    key: "rec-1",
    value: {},
    collectionId: "accounts",
    sequence: 1,
    timestamp: Date.now(),
    ...overrides,
  };
}

// --- insert merging ---

test("compact: single insert passes through", () => {
  const mutations = [q({ id: "1", type: "insert", value: { id: "rec-1", name: "Acme" } })];
  const result = compactMutations(mutations);
  expect(result).toHaveLength(1);
  expect(result[0].type).toBe("insert");
  expect(result[0].value).toEqual({ id: "rec-1", name: "Acme" });
});

test("compact: insert + update merges into single insert", () => {
  const mutations = [
    q({ id: "1", type: "insert", sequence: 1, value: { id: "rec-1", name: "Acme" } }),
    q({ id: "2", type: "update", sequence: 2, value: { revenue: 500 } }),
  ];
  const result = compactMutations(mutations);
  expect(result).toHaveLength(1);
  expect(result[0].type).toBe("insert");
  expect(result[0].value).toEqual({ id: "rec-1", name: "Acme", revenue: 500 });
});

test("compact: insert + multiple updates merges all values", () => {
  const mutations = [
    q({ id: "1", type: "insert", sequence: 1, value: { id: "rec-1", name: "Acme" } }),
    q({ id: "2", type: "update", sequence: 2, value: { revenue: 500 } }),
    q({ id: "3", type: "update", sequence: 3, value: { name: "Acme Corp" } }),
  ];
  const result = compactMutations(mutations);
  expect(result).toHaveLength(1);
  expect(result[0].type).toBe("insert");
  expect(result[0].value).toEqual({ id: "rec-1", name: "Acme Corp", revenue: 500 });
  expect(result[0].sequence).toBe(3);
});

test("compact: insert + delete cancels out", () => {
  const mutations = [
    q({ id: "1", type: "insert", sequence: 1, value: { id: "rec-1", name: "Acme" } }),
    q({ id: "2", type: "delete", sequence: 2 }),
  ];
  const result = compactMutations(mutations);
  expect(result).toHaveLength(0);
});

// --- update merging ---

test("compact: multiple updates merge into single update", () => {
  const mutations = [
    q({ id: "1", type: "update", sequence: 1, value: { name: "Acme" } }),
    q({ id: "2", type: "update", sequence: 2, value: { revenue: 500 } }),
  ];
  const result = compactMutations(mutations);
  expect(result).toHaveLength(1);
  expect(result[0].type).toBe("update");
  expect(result[0].value).toEqual({ name: "Acme", revenue: 500 });
  expect(result[0].sequence).toBe(2);
});

// --- update + delete ---

test("compact: update + delete becomes single delete", () => {
  const mutations = [
    q({ id: "1", type: "update", sequence: 1, value: { name: "Acme" } }),
    q({ id: "2", type: "delete", sequence: 2 }),
  ];
  const result = compactMutations(mutations);
  expect(result).toHaveLength(1);
  expect(result[0].type).toBe("delete");
});

// --- delete + insert ---

test("compact: delete + insert becomes single insert", () => {
  const mutations = [
    q({ id: "1", type: "delete", sequence: 1 }),
    q({ id: "2", type: "insert", sequence: 2, value: { id: "rec-1", name: "New" } }),
  ];
  const result = compactMutations(mutations);
  expect(result).toHaveLength(1);
  expect(result[0].type).toBe("insert");
  expect(result[0].value).toEqual({ id: "rec-1", name: "New" });
});

test("compact: delete + insert + update merges into single insert", () => {
  const mutations = [
    q({ id: "1", type: "delete", sequence: 1 }),
    q({ id: "2", type: "insert", sequence: 2, value: { id: "rec-1", name: "New" } }),
    q({ id: "3", type: "update", sequence: 3, value: { revenue: 100 } }),
  ];
  const result = compactMutations(mutations);
  expect(result).toHaveLength(1);
  expect(result[0].type).toBe("insert");
  expect(result[0].value).toEqual({ id: "rec-1", name: "New", revenue: 100 });
});

// --- multi-record ---

test("compact: mutations on different records stay independent", () => {
  const mutations = [
    q({ id: "1", key: "rec-1", type: "insert", sequence: 1, value: { id: "rec-1", name: "Acme" } }),
    q({ id: "2", key: "rec-2", type: "insert", sequence: 2, value: { id: "rec-2", name: "Beta" } }),
    q({ id: "3", key: "rec-1", type: "update", sequence: 3, value: { revenue: 500 } }),
    q({ id: "4", key: "rec-2", type: "update", sequence: 4, value: { revenue: 200 } }),
  ];
  const result = compactMutations(mutations);
  expect(result).toHaveLength(2);

  const rec1 = result.find((m) => m.key === "rec-1");
  expect(rec1!.type).toBe("insert");
  expect(rec1!.value).toEqual({ id: "rec-1", name: "Acme", revenue: 500 });

  const rec2 = result.find((m) => m.key === "rec-2");
  expect(rec2!.type).toBe("insert");
  expect(rec2!.value).toEqual({ id: "rec-2", name: "Beta", revenue: 200 });
});

// --- multi-collection ---

test("compact: mutations on different collections stay independent", () => {
  const mutations = [
    q({ id: "1", collectionId: "accounts", key: "acc-1", type: "insert", sequence: 1, value: { id: "acc-1", name: "Acme" } }),
    q({ id: "2", collectionId: "contacts", key: "con-1", type: "insert", sequence: 2, value: { id: "con-1", name: "John" } }),
    q({ id: "3", collectionId: "accounts", key: "acc-1", type: "update", sequence: 3, value: { revenue: 500 } }),
    q({ id: "4", collectionId: "contacts", key: "con-1", type: "update", sequence: 4, value: { email: "j@x.com" } }),
  ];
  const result = compactMutations(mutations);
  expect(result).toHaveLength(2);

  const acc = result.find((m) => m.collectionId === "accounts");
  expect(acc!.type).toBe("insert");
  expect(acc!.value).toEqual({ id: "acc-1", name: "Acme", revenue: 500 });

  const con = result.find((m) => m.collectionId === "contacts");
  expect(con!.type).toBe("insert");
  expect(con!.value).toEqual({ id: "con-1", name: "John", email: "j@x.com" });
});

// --- sequence ordering ---

test("compact: preserves correct order when inserts are interleaved", () => {
  const mutations = [
    q({ id: "1", key: "acc-1", collectionId: "accounts", type: "insert", sequence: 1, value: { id: "acc-1" } }),
    q({ id: "2", key: "con-1", collectionId: "contacts", type: "insert", sequence: 2, value: { id: "con-1", accountid: "acc-1" } }),
    q({ id: "3", key: "acc-1", collectionId: "accounts", type: "update", sequence: 3, value: { name: "Acme" } }),
  ];
  const result = compactMutations(mutations);
  expect(result).toHaveLength(2);

  // After compaction: acc-1 becomes insert(seq 3), con-1 stays insert(seq 2)
  // Final sort by type (both insert) then by sequence: con-1(2) before acc-1(3)
  const conIdx = result.findIndex((m) => m.collectionId === "contacts");
  const accIdx = result.findIndex((m) => m.collectionId === "accounts");
  expect(conIdx).toBeLessThan(accIdx);
});

// --- edge cases ---

test("compact: empty array returns empty array", () => {
  expect(compactMutations([])).toEqual([]);
});

test("compact: single mutation passes through", () => {
  const mutations = [q({ id: "1", type: "update", value: { name: "x" } })];
  const result = compactMutations(mutations);
  expect(result).toHaveLength(1);
  expect(result[0].id).toBe("1");
});

test("compact: double delete stays as delete", () => {
  const mutations = [
    q({ id: "1", type: "delete", sequence: 1 }),
    q({ id: "2", type: "delete", sequence: 2 }),
  ];
  const result = compactMutations(mutations);
  expect(result).toHaveLength(1);
  expect(result[0].type).toBe("delete");
});
