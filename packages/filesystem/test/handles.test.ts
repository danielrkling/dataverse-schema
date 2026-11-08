import { expect, test, vi } from "vitest";
import { indexedDB as fakeIndexedDB } from "fake-indexeddb";
import {
  FileSystemDatabase,
  clearStoredHandles,
  createIndexedDbHandleStore,
  deleteDirectoryHandle,
  getStoredHandle,
  initializeStoredDatabase,
  listStoredHandles,
  loadDirectoryHandle,
  openStoredDatabase,
  resolveRootHandle,
  saveDirectoryHandle,
  tryLoadRootHandle,
  tryOpenStoredDatabase,
  type HandleStore,
  type StoredHandleRecord,
} from "../src";
import type { FsDirectoryHandle } from "../src/types";
import { createMemoryRoot } from "./memory-fs";

function createMemoryHandleStore(): HandleStore {
  const records = new Map<string, StoredHandleRecord>();
  return {
    async get(key) {
      return records.get(key) ?? null;
    },
    async set(record) {
      records.set(record.key, record);
    },
    async delete(key) {
      records.delete(key);
    },
    async list() {
      return [...records.values()];
    },
    async clear() {
      records.clear();
    },
  };
}

function withPermission(
  handle: FsDirectoryHandle,
  permission: PermissionState,
  requested: PermissionState = permission,
) {
  return Object.assign(handle, {
    queryPermission: vi.fn(async () => permission),
    requestPermission: vi.fn(async () => requested),
  });
}

test("stores, loads, lists and deletes directory handles", async () => {
  const store = createMemoryHandleStore();
  const root = createMemoryRoot("acme-data");

  const saved = await saveDirectoryHandle("acme", root, { store });
  expect(saved).toMatchObject({ key: "acme", name: "acme-data", kind: "directory" });

  expect(await loadDirectoryHandle("acme", { store })).toBe(root);
  expect(await getStoredHandle("acme", { store })).toMatchObject({ key: "acme", name: "acme-data" });
  expect(await loadDirectoryHandle("missing", { store })).toBeNull();

  expect(await listStoredHandles({ store })).toEqual([
    expect.objectContaining({ key: "acme", name: "acme-data", kind: "directory" }),
  ]);
  // metadata listing never exposes the handle itself
  expect(await listStoredHandles({ store })).not.toHaveProperty("0.handle");

  await deleteDirectoryHandle("acme", { store });
  expect(await loadDirectoryHandle("acme", { store })).toBeNull();

  await saveDirectoryHandle("a", createMemoryRoot("a"), { store });
  await saveDirectoryHandle("b", createMemoryRoot("b"), { store });
  await clearStoredHandles({ store });
  expect(await listStoredHandles({ store })).toEqual([]);
});

test("resolveRootHandle returns a permitted stored handle without picking", async () => {
  const store = createMemoryHandleStore();
  const root = withPermission(createMemoryRoot("acme-data"), "granted");
  await saveDirectoryHandle("acme", root, { store });
  const pick = vi.fn(async () => createMemoryRoot("picked"));

  expect(await resolveRootHandle("acme", { store, pick })).toBe(root);
  expect(pick).not.toHaveBeenCalled();
});

test("resolveRootHandle picks and saves when nothing is stored", async () => {
  const store = createMemoryHandleStore();
  const picked = createMemoryRoot("picked");
  const pick = vi.fn(async () => picked);

  expect(await resolveRootHandle("acme", { store, pick })).toBe(picked);
  expect(pick).toHaveBeenCalledTimes(1);
  expect(await loadDirectoryHandle("acme", { store })).toBe(picked);
});

test("resolveRootHandle falls back to the picker when stored permission is denied", async () => {
  const store = createMemoryHandleStore();
  const stored = withPermission(createMemoryRoot("stored"), "denied", "denied");
  await saveDirectoryHandle("acme", stored, { store });
  const picked = createMemoryRoot("picked");
  const pick = vi.fn(async () => picked);

  expect(await resolveRootHandle("acme", { store, pick })).toBe(picked);
  expect(pick).toHaveBeenCalledTimes(1);
  expect(await loadDirectoryHandle("acme", { store })).toBe(picked);
});

test("resolveRootHandle can avoid requesting permission (silent startup path)", async () => {
  const store = createMemoryHandleStore();
  const stored = withPermission(createMemoryRoot("stored"), "prompt", "granted");
  await saveDirectoryHandle("acme", stored, { store });
  const picked = createMemoryRoot("picked");

  const resolved = await resolveRootHandle("acme", {
    store,
    requestPermission: false,
    pick: async () => picked,
  });

  expect(resolved).toBe(picked);
  expect((stored as any).requestPermission).not.toHaveBeenCalled();
});

test("tryLoadRootHandle is silent and returns null when permission is not granted", async () => {
  const store = createMemoryHandleStore();
  const stored = withPermission(createMemoryRoot("stored"), "prompt", "granted");
  await saveDirectoryHandle("acme", stored, { store });

  expect(await tryLoadRootHandle("acme", { store })).toBeNull();
  expect((stored as any).requestPermission).not.toHaveBeenCalled();
});

test("tryLoadRootHandle returns a currently permitted stored handle", async () => {
  const store = createMemoryHandleStore();
  const stored = withPermission(createMemoryRoot("stored"), "granted");
  await saveDirectoryHandle("acme", stored, { store });

  expect(await tryLoadRootHandle("acme", { store })).toBe(stored);
});

test("tryOpenStoredDatabase returns null instead of picking when nothing usable is stored", async () => {
  const store = createMemoryHandleStore();

  expect(await tryOpenStoredDatabase("acme", { version: 1, brandId: "acme" }, { store })).toBeNull();

  const root = createMemoryRoot("acme-data");
  await FileSystemDatabase.initialize(root, { version: 1, brandId: "acme" });
  await saveDirectoryHandle("acme", root, { store });

  const db = await tryOpenStoredDatabase("acme", { version: 1, brandId: "acme" }, { store });
  expect(db?.root).toBe(root);
});

test("openStoredDatabase resolves the saved handle and verifies the manifest", async () => {
  const store = createMemoryHandleStore();
  const root = createMemoryRoot("acme-data");
  await FileSystemDatabase.initialize(root, { version: 1, brandId: "acme" });
  await saveDirectoryHandle("acme", root, { store });

  const db = await openStoredDatabase(
    "acme",
    { version: 1, brandId: "acme" },
    { store, pick: async () => { throw new Error("picker should not be called"); } },
  );
  expect(db.root).toBe(root);
  expect(db.manifest).toEqual({ version: 1, brandId: "acme" });
});

test("initializeStoredDatabase provisions a picked root and saves it", async () => {
  const store = createMemoryHandleStore();
  const root = createMemoryRoot("new-data");

  const db = await initializeStoredDatabase(
    "acme",
    { version: 1, brandId: "acme" },
    {},
    { store, pick: async () => root },
  );

  expect(db.root).toBe(root);
  expect(await loadDirectoryHandle("acme", { store })).toBe(root);
  expect(root.json("fsdb.json")).toEqual({ version: 1, brandId: "acme" });
});

test("the IndexedDB handle store persists cloneable handle records", async () => {
  const factory = fakeIndexedDB as unknown as IDBFactory;
  const store = createIndexedDbHandleStore({
    factory,
    databaseName: `filesystem-schema-test-${crypto.randomUUID()}`,
  });
  const handle = { kind: "directory", name: "indexed-root" } as unknown as FsDirectoryHandle;

  await saveDirectoryHandle("acme", handle, { store });
  const loaded = await loadDirectoryHandle("acme", { store });
  expect(loaded).toEqual(expect.objectContaining({ kind: "directory", name: "indexed-root" }));

  expect(await listStoredHandles({ store })).toEqual([
    expect.objectContaining({ key: "acme", name: "indexed-root" }),
  ]);
  await deleteDirectoryHandle("acme", { store });
  expect(await loadDirectoryHandle("acme", { store })).toBeNull();
});
