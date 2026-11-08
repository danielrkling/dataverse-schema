import { expect, test } from "vitest";
import {
  FileSystemDatabase,
  datetime,
  primaryKey,
  text,
} from "../src";
import { createMemoryRoot, directory } from "./memory-fs";

const delay = (ms = 5) => new Promise((resolve) => setTimeout(resolve, ms));

async function makeTasks(options: { trash?: boolean; history?: any; timestamps?: any } = {}) {
  const root = createMemoryRoot("acme-db");
  const db = await FileSystemDatabase.initialize(root, { version: 1, brandId: "acme" });
  const Tasks = db.table({
    name: "tasks",
    fields: { id: primaryKey(), title: text("title") },
    ...options,
  });
  return { root, db, Tasks };
}

test("soft delete moves a folder record to .trash and restore brings it back", async () => {
  const { root, Tasks } = await makeTasks({ trash: true });
  await Tasks.createRecord({ id: "1", title: "A" });

  await Tasks.deleteRecord("1");
  expect(await Tasks.getRecord("1")).toBeNull();
  expect(directory(root, "tasks").files.has("1.json")).toBe(false);

  const trash = await Tasks.listTrash();
  expect(trash).toHaveLength(1);
  expect(trash[0]).toMatchObject({ id: "1" });
  expect(directory(root, "tasks", ".meta", "trash").files.size).toBe(1);

  const restored = await Tasks.restoreRecord("1");
  expect(restored).toMatchObject({ id: "1", title: "A" });
  expect(restored.$rev).toEqual(expect.any(String));
  expect(await Tasks.listTrash()).toEqual([]);
  expect(await Tasks.getRecord("1")).toMatchObject({ title: "A" });
});

test("restore refuses to overwrite a live record unless asked", async () => {
  const { Tasks } = await makeTasks({ trash: true });
  await Tasks.createRecord({ id: "1", title: "A" });
  await Tasks.deleteRecord("1");
  await Tasks.createRecord({ id: "1", title: "New" });

  await expect(Tasks.restoreRecord("1")).rejects.toThrow(/already exists/);
  const restored = await Tasks.restoreRecord("1", { ifExists: "overwrite" });
  expect(restored).toMatchObject({ title: "A" });
});

test("permanent deletes bypass trash and purge clears trash entries", async () => {
  const { Tasks } = await makeTasks({ trash: true });
  await Tasks.createRecord({ id: "1", title: "A" });
  await Tasks.createRecord({ id: "2", title: "B" });

  await Tasks.deleteRecord("2", { permanent: true });
  expect((await Tasks.listTrash()).map((entry) => entry.id)).toEqual([]);

  await Tasks.deleteRecord("1");
  expect((await Tasks.listTrash()).map((entry) => entry.id)).toEqual(["1"]);
  expect(await Tasks.purgeTrash("1")).toBe(1);
  expect(await Tasks.listTrash()).toEqual([]);
});

test("single-file tables support soft delete and restore", async () => {
  const root = createMemoryRoot("acme-db");
  const db = await FileSystemDatabase.initialize(root, { version: 1, brandId: "acme" });
  const Settings = db.singleFileTable({
    name: "settings",
    trash: true,
    fields: { id: primaryKey(), title: text("title") },
  });
  await Settings.createRecord({ id: "a", title: "A" });
  await Settings.createRecord({ id: "b", title: "B" });

  await Settings.deleteRecord("a");
  expect((await Settings.getRecords()).map((record) => record.id)).toEqual(["b"]);
  expect((await Settings.listTrash())[0]).toMatchObject({ id: "a" });

  expect(await Settings.restoreRecord("a")).toMatchObject({ title: "A" });
  expect((await Settings.getRecords()).map((record) => record.id)).toEqual(["a", "b"]);
});

test("history keeps the requested number of prior versions and can restore one", async () => {
  const { Tasks } = await makeTasks({ history: { limit: 2 } });
  await Tasks.createRecord({ id: "1", title: "A" });

  await delay();
  await Tasks.updateRecord("1", { title: "B" });
  await delay();
  await Tasks.updateRecord("1", { title: "C" });

  let history = await Tasks.listHistory("1");
  expect(history).toHaveLength(2);
  expect(history.map((entry) => entry.savedAt)).toEqual(
    [...history.map((entry) => entry.savedAt)].sort().reverse(),
  );

  await delay();
  await Tasks.updateRecord("1", { title: "D" });
  history = await Tasks.listHistory("1");
  expect(history).toHaveLength(2); // oldest pruned

  const restored = await Tasks.restoreHistory("1", history[0]!.fileName);
  expect(restored).toMatchObject({ title: "C" });
  expect((await Tasks.getRecord("1"))?.title).toBe("C");
});

test("permanent deletes can still leave a history snapshot", async () => {
  const { Tasks } = await makeTasks({ history: true });
  await Tasks.createRecord({ id: "1", title: "A" });
  await delay();
  await Tasks.updateRecord("1", { title: "B" });
  await Tasks.deleteRecord("1", { permanent: true });

  expect(await Tasks.getRecord("1")).toBeNull();
  const history = await Tasks.listHistory("1");
  expect(history).toHaveLength(2);
  expect(history.some((entry) => entry.fileName)).toBe(true);
});

test("single-file tables keep per-record history", async () => {
  const root = createMemoryRoot("acme-db");
  const db = await FileSystemDatabase.initialize(root, { version: 1, brandId: "acme" });
  const Settings = db.singleFileTable({
    name: "settings",
    history: true,
    fields: { id: primaryKey(), title: text("title") },
  });
  await Settings.createRecord({ id: "a", title: "A" });
  await delay();
  await Settings.updateRecord("a", { title: "B" });

  const history = await Settings.listHistory("a");
  expect(history).toHaveLength(1);
  expect(await Settings.restoreHistory("a", history[0]!.fileName)).toMatchObject({ title: "A" });
});

test("managed timestamps are set on create and refreshed on update", async () => {
  const root = createMemoryRoot("acme-db");
  const db = await FileSystemDatabase.initialize(root, { version: 1, brandId: "acme" });
  const Tasks = db.table({
    name: "tasks",
    timestamps: true,
    fields: {
      id: primaryKey(),
      title: text("title"),
      createdAt: datetime("createdAt"),
      updatedAt: datetime("updatedAt"),
    },
  });

  const created = await Tasks.createRecord({ id: "1", title: "A" });
  expect(created.createdAt).toBeInstanceOf(Date);
  expect(created.updatedAt).toBeInstanceOf(Date);
  const originalCreatedAt = created.createdAt!.getTime();

  await delay();
  const updated = await Tasks.updateRecord("1", {
    title: "B",
    createdAt: new Date(0),
  } as any);
  expect(updated.createdAt!.getTime()).toBe(originalCreatedAt);
  expect(updated.updatedAt!.getTime()).toBeGreaterThan(updated.createdAt!.getTime());

  const raw = directory(root, "tasks").json("1.json");
  expect(raw.createdAt).toBe(new Date(originalCreatedAt).toISOString());
  expect(raw.updatedAt).toBe(updated.updatedAt!.toISOString());
});

test("timestamps require the managed fields to be declared", async () => {
  const root = createMemoryRoot("acme-db");
  const db = await FileSystemDatabase.initialize(root, { version: 1, brandId: "acme" });
  expect(() =>
    db.table({
      name: "tasks",
      timestamps: true,
      fields: { id: primaryKey(), title: text("title") },
    }),
  ).toThrow(/timestamps field "createdAt" is not declared/);
});
