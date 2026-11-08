import { expect, test } from "vitest";
import {
  FileSystemDatabase,
  FileSystemStorageError,
  isStorageError,
  primaryKey,
  text,
} from "../src";
import { createMemoryRoot, directory, domError } from "./memory-fs";

async function makeTasks() {
  const root = createMemoryRoot("acme-db");
  const db = await FileSystemDatabase.initialize(root, { version: 1, brandId: "acme" });
  const Tasks = db.table({
    name: "tasks",
    fields: { id: primaryKey(), title: text("title") },
  });
  await Tasks.createRecord({ id: "1", title: "A" });
  return { root, db, Tasks, folder: directory(root, "tasks") };
}

test("a locked/read-only write is reported with code, path, table and record context", async () => {
  const { Tasks, folder } = await makeTasks();
  folder.failures.createWritable = domError("NoModificationAllowedError", "file is locked");

  const error = await Tasks.updateRecord("1", { title: "B" }).catch((e) => e);
  expect(error).toBeInstanceOf(FileSystemStorageError);
  expect(error).toMatchObject({
    name: "FileSystemStorageError",
    code: "locked",
    operation: "write",
    path: "tasks/1.json",
    table: "tasks",
    recordId: "1",
  });
  expect(error.message).toContain("locked by another process or the share is read-only");
  expect(error.originalError).toBeInstanceOf(Error);

  // the failed write did not replace the stored record
  expect(await Tasks.getRecord("1")).toMatchObject({ id: "1", title: "A" });
});

test("permission failures on reads are structured", async () => {
  const { Tasks, folder } = await makeTasks();
  folder.failures.getFileHandle = domError("NotAllowedError", "permission denied");

  const error = await Tasks.getRecord("1").catch((e) => e);
  expect(isStorageError(error, "permission-denied")).toBe(true);
  expect(error).toMatchObject({
    operation: "read",
    path: "tasks/1.json",
    table: "tasks",
    recordId: "1",
  });
  expect(error.message).toContain("permission was denied");
});

test("delete failures are structured and leave the record in place", async () => {
  const { Tasks, folder } = await makeTasks();
  folder.failures.removeEntry = domError("NoModificationAllowedError", "read-only share");

  const error = await Tasks.deleteRecord("1").catch((e) => e);
  expect(error).toMatchObject({ code: "locked", operation: "delete", path: "tasks/1.json" });
  expect(await Tasks.getRecord("1")).not.toBeNull();
});

test("directory listing failures are structured", async () => {
  const { Tasks, folder } = await makeTasks();
  folder.failures.values = domError("NotReadableError", "network share disconnected");

  const error = await Tasks.getRecords().catch((e) => e);
  expect(error).toMatchObject({ code: "io-error", operation: "list", path: "tasks", table: "tasks" });
  expect(error.message).toContain("network share connected");
});

test("manifest write failures carry root/manifest context", async () => {
  const root = createMemoryRoot("acme-db");
  root.failures.createWritable = domError("QuotaExceededError", "quota full");

  const error = await FileSystemDatabase.initialize(root, { version: 1, brandId: "acme" }).catch((e) => e);
  expect(error).toMatchObject({
    code: "quota-exceeded",
    operation: "write-manifest",
    path: "fsdb.json",
    root: "acme-db",
  });
  expect(error.message).toContain('root "acme-db"');
});

test("single-file table write failures carry the table-folder path and record id", async () => {
  const root = createMemoryRoot("acme-db");
  const db = await FileSystemDatabase.initialize(root, { version: 1, brandId: "acme" });
  const Settings = db.singleFileTable({
    name: "settings",
    fields: { id: primaryKey(), title: text("title") },
  });
  await Settings.createRecord({ id: "1", title: "A" });
  directory(root, "settings").failures.createWritable = domError(
    "NoModificationAllowedError",
    "locked",
  );

  const error = await Settings.updateRecord("1", { title: "B" }).catch((e) => e);
  expect(error).toMatchObject({
    code: "locked",
    operation: "write",
    path: "settings/data.json",
    table: "settings",
    recordId: "1",
  });
});

test("a failed create removes the empty target file", async () => {
  const { Tasks, folder } = await makeTasks();
  folder.failures.close = domError("NotReadableError", "network share disconnected");

  const error = await Tasks.createRecord({ id: "2", title: "B" }).catch((e) => e);
  expect(error).toMatchObject({ code: "io-error", operation: "write", path: "tasks/2.json" });
  expect(folder.files.has("2.json")).toBe(false);
});

test("abort errors pass through unchanged (standard cancellation semantics)", async () => {
  const { Tasks } = await makeTasks();
  const controller = new AbortController();
  controller.abort();

  const error = await Tasks.getRecords({ signal: controller.signal }).catch((e) => e);
  expect(error).toMatchObject({ name: "AbortError" });
  expect(error).not.toBeInstanceOf(FileSystemStorageError);
});
