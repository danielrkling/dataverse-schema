import { expect, test } from "vitest";
import {
  FileSystemConflictError,
  FileSystemDatabase,
  FileSystemStorageError,
  isRetryableStorageError,
  primaryKey,
  text,
} from "../src";
import { createMemoryRoot } from "./memory-fs";

async function makeTasks() {
  const root = createMemoryRoot("acme-db");
  const db = await FileSystemDatabase.initialize(root, { version: 1, brandId: "acme" });
  const Tasks = db.table({
    name: "tasks",
    fields: { id: primaryKey(), title: text("title") },
  });
  return { root, db, Tasks };
}

test("records carry a revision and unchanged reads keep it stable", async () => {
  const { Tasks } = await makeTasks();
  const created = await Tasks.createRecord({ id: "1", title: "A" });
  expect(created.$rev).toEqual(expect.any(String));

  const first = await Tasks.getRecord("1");
  const second = await Tasks.getRecord("1");
  expect(first?.$rev).toBe(created.$rev);
  expect(second?.$rev).toBe(first?.$rev);
});

test("updates with a stale revision throw a conflict and do not write", async () => {
  const { Tasks } = await makeTasks();
  await Tasks.createRecord({ id: "1", title: "A" });
  const stale = await Tasks.getRecord("1");

  const updated = await Tasks.updateRecord("1", { title: "B" });
  expect(updated.$rev).not.toBe(stale?.$rev);

  const error = await Tasks.updateRecord("1", { title: "C" }, { ifMatch: stale!.$rev })
    .catch((e) => e);
  expect(error).toBeInstanceOf(FileSystemConflictError);
  expect(error).toBeInstanceOf(FileSystemStorageError);
  expect(error).toMatchObject({
    code: "conflict",
    expectedRevision: stale!.$rev,
    actualRevision: updated.$rev,
    path: "tasks/1.json",
  });
  expect(isRetryableStorageError(error)).toBe(false);
  expect(await Tasks.getRecord("1")).toMatchObject({ title: "B" });
});

test("a fresh revision succeeds and ifMatch '*' bypasses the check", async () => {
  const { Tasks } = await makeTasks();
  await Tasks.createRecord({ id: "1", title: "A" });
  const fresh = await Tasks.getRecord("1");

  expect(await Tasks.updateRecord("1", { title: "B" }, { ifMatch: fresh!.$rev }))
    .toMatchObject({ title: "B" });
  expect(await Tasks.updateRecord("1", { title: "C" }, { ifMatch: "*" }))
    .toMatchObject({ title: "C" });
});

test("deletes honor ifMatch revisions", async () => {
  const { Tasks } = await makeTasks();
  await Tasks.createRecord({ id: "1", title: "A" });
  const stale = await Tasks.getRecord("1");
  await Tasks.updateRecord("1", { title: "B" });

  await expect(Tasks.deleteRecord("1", { ifMatch: stale!.$rev })).rejects.toMatchObject({
    code: "conflict",
    operation: "delete",
  });
  expect(await Tasks.getRecord("1")).not.toBeNull();

  const fresh = await Tasks.getRecord("1");
  await expect(Tasks.deleteRecord("1", { ifMatch: fresh!.$rev })).resolves.toBe("1");
  expect(await Tasks.getRecord("1")).toBeNull();
});

test("single-file tables use a file-level revision", async () => {
  const root = createMemoryRoot("acme-db");
  const db = await FileSystemDatabase.initialize(root, { version: 1, brandId: "acme" });
  const Settings = db.singleFileTable({
    name: "settings",
    fields: { id: primaryKey(), title: text("title") },
  });

  await Settings.createRecord({ id: "a", title: "A" });
  await Settings.createRecord({ id: "b", title: "B" });
  const stale = await Settings.getRecord("a");
  expect(stale?.$rev).toEqual(expect.any(String));

  await Settings.updateRecord("b", { title: "B2" });
  await expect(Settings.updateRecord("a", { title: "A2" }, { ifMatch: stale!.$rev }))
    .rejects.toMatchObject({ code: "conflict", path: "settings/data.json" });

  const fresh = await Settings.getRecord("a");
  await expect(Settings.updateRecord("a", { title: "A2" }, { ifMatch: fresh!.$rev }))
    .resolves.toMatchObject({ title: "A2" });
});

test("batch reads include revisions for every record", async () => {
  const { Tasks } = await makeTasks();
  await Tasks.createRecord({ id: "1", title: "A" });
  await Tasks.createRecord({ id: "2", title: "B" });

  const records = await Tasks.getRecords();
  expect(records).toHaveLength(2);
  for (const record of records) expect(record.$rev).toEqual(expect.any(String));
  expect(records[0]!.$rev).not.toBe(records[1]!.$rev);
});
