import { expect, test } from "vitest";
import {
  FileSystemDatabase,
  primaryKey,
  text,
  type StorageRetryPolicy,
} from "../src";
import { createMemoryRoot, directory, domError } from "./memory-fs";

const FAST_RETRY = { attempts: 2, delayMs: 0, jitter: false } satisfies StorageRetryPolicy;

async function makeTasks(retry?: StorageRetryPolicy) {
  const root = createMemoryRoot("acme-db");
  const db = await FileSystemDatabase.initialize(root, { version: 1, brandId: "acme" });
  const Tasks = db.table({
    name: "tasks",
    fields: { id: primaryKey(), title: text("title") },
    retry,
  });
  await Tasks.createRecord({ id: "1", title: "A" });
  return { root, db, Tasks, folder: directory(root, "tasks") };
}

test("reads retry transient failures by default when a policy is supplied", async () => {
  const { Tasks, folder } = await makeTasks(FAST_RETRY);
  folder.failNext.getFileHandle = domError("NotReadableError", "flaky read");

  const record = await Tasks.getRecord("1");
  expect(record).toMatchObject({ id: "1", title: "A" });
});

test("directory listings retry transient failures", async () => {
  const { Tasks, folder } = await makeTasks(FAST_RETRY);
  folder.failNext.values = domError("NotReadableError", "flaky listing");

  expect(await Tasks.getRecords()).toHaveLength(1);
});

test("non-transient read failures are not retried", async () => {
  const { Tasks, folder } = await makeTasks(FAST_RETRY);
  folder.failNext.getFileHandle = domError("NotAllowedError", "permission denied");

  // If the read were retried, the one-shot failure would be gone and the
  // second attempt would succeed — this rejection proves it was not.
  await expect(Tasks.getRecord("1")).rejects.toMatchObject({ code: "permission-denied" });
});

test("retryReads:false disables read retries", async () => {
  const { Tasks, folder } = await makeTasks({ ...FAST_RETRY, retryReads: false });
  folder.failNext.getFileHandle = domError("NotReadableError", "flaky read");

  await expect(Tasks.getRecord("1")).rejects.toMatchObject({ code: "io-error" });
});

test("shouldRetry can veto a retry", async () => {
  const { Tasks, folder } = await makeTasks({
    ...FAST_RETRY,
    shouldRetry: () => false,
  });
  folder.failNext.getFileHandle = domError("NotReadableError", "flaky read");

  await expect(Tasks.getRecord("1")).rejects.toMatchObject({ code: "io-error" });
});

test("writes are not retried by default, even when reads are", async () => {
  const { Tasks, folder } = await makeTasks(FAST_RETRY);
  folder.failNext.createWritable = domError("NoModificationAllowedError", "locked");

  // A retry would consume the one-shot failure and succeed; rejection proves
  // the default write policy did not retry.
  await expect(Tasks.updateRecord("1", { title: "B" })).rejects.toMatchObject({
    code: "locked",
    operation: "write",
  });
});

test("writes retry only when retryWrites is explicitly enabled", async () => {
  const { Tasks, folder } = await makeTasks({ ...FAST_RETRY, retryWrites: true });
  folder.failNext.createWritable = domError("NoModificationAllowedError", "locked");

  const updated = await Tasks.updateRecord("1", { title: "B" });
  expect(updated).toMatchObject({ id: "1", title: "B" });
});

test("deletes are not retried by default", async () => {
  const { Tasks, folder } = await makeTasks(FAST_RETRY);
  folder.failNext.removeEntry = domError("NoModificationAllowedError", "locked");

  await expect(Tasks.deleteRecord("1")).rejects.toMatchObject({ code: "locked", operation: "delete" });
});

test("deletes retry when retryDeletes is enabled", async () => {
  const { Tasks, folder } = await makeTasks({ ...FAST_RETRY, retryDeletes: true });
  folder.failNext.removeEntry = domError("NoModificationAllowedError", "locked");

  await expect(Tasks.deleteRecord("1")).resolves.toBe("1");
  expect(await Tasks.getRecord("1")).toBeNull();
});

test("retry policy is inherited from the database and can be disabled per table", async () => {
  const root = createMemoryRoot("acme-db");
  const db = await FileSystemDatabase.initialize(
    root,
    { version: 1, brandId: "acme" },
    { retry: FAST_RETRY },
  );
  const fields = { id: primaryKey(), title: text("title") };
  const inherited = db.table({ name: "inherited", fields });
  const disabled = db.table({ name: "disabled", fields, retry: false });

  await inherited.createRecord({ id: "1", title: "A" });
  await disabled.createRecord({ id: "1", title: "A" });

  directory(root, "inherited").failNext.getFileHandle = domError("NotReadableError");
  directory(root, "disabled").failNext.getFileHandle = domError("NotReadableError");

  await expect(inherited.getRecord("1")).resolves.toMatchObject({ id: "1" });
  await expect(disabled.getRecord("1")).rejects.toMatchObject({ code: "io-error" });
});

test("manifest reads use the retry policy supplied to open", async () => {
  const root = createMemoryRoot("acme-db");
  await FileSystemDatabase.initialize(root, { version: 1, brandId: "acme" });
  root.failNext.getFileHandle = domError("NotReadableError", "flaky manifest");

  const db = await FileSystemDatabase.open(root, {
    version: 1,
    brandId: "acme",
    retry: FAST_RETRY,
  });
  expect(db.manifest).toEqual({ version: 1, brandId: "acme" });
});
