import { expect, test } from "vitest";
import * as v from "valibot";
import {
  FileSystemDatabase,
  bool,
  choice,
  date,
  json,
  multiChoice,
  number,
  primaryKey,
  text,
} from "../src";
import { createMemoryRoot, directory } from "./memory-fs";

async function makeDb() {
  const root = createMemoryRoot("acme-db");
  const db = await FileSystemDatabase.initialize(root, { version: 1, brandId: "com.acme.app" });
  return { root, db };
}

function makeTasks(db: FileSystemDatabase) {
  return db.table({
    name: "tasks",
    fields: {
      id: primaryKey(),
      title: text("title"),
      done: bool("done"),
      amount: number("amount"),
      due: date("due"),
      status: choice("status", { choices: ["Draft", "Done"] as const }),
      tags: multiChoice("tags", { choices: ["a", "b"] as const }),
      meta: json("meta"),
    },
  });
}

test("folder table create writes one JSON record file and returns transformed defaults", async () => {
  const { root, db } = await makeDb();
  const Tasks = makeTasks(db);
  const due = new Date("2026-04-05T00:00:00Z");

  const created = await Tasks.createRecord({
    title: "Ship it",
    amount: 3,
    due,
    status: "Draft",
    tags: ["a"],
    meta: { priority: 1 },
  });

  expect(created.id).toMatch(/^[0-9a-f-]{36}$/);
  expect(created.done).toBe(false);
  expect(created.title).toBe("Ship it");
  expect(created.due).toEqual(due);

  const folder = directory(root, "tasks");
  const raw = folder.json(`${created.id}.json`);
  expect(raw).toEqual({
    id: created.id,
    title: "Ship it",
    amount: 3,
    due: "2026-04-05T00:00:00.000Z",
    status: "Draft",
    tags: ["a"],
    meta: { priority: 1 },
  });
});

test("getRecord/getRecords read, derive ids from file names, and sort by id", async () => {
  const { db } = await makeDb();
  const Tasks = makeTasks(db);

  await Tasks.createRecord({ id: "b", title: "B" });
  await Tasks.createRecord({ id: "a", title: "A" });

  expect(await Tasks.getRecord("a")).toMatchObject({ id: "a", title: "A", done: false, tags: [] });
  expect(await Tasks.getRecord("missing")).toBeNull();
  expect((await Tasks.getRecords()).map((task) => task.id)).toEqual(["a", "b"]);
  expect(await Tasks.hasRecord("a")).toBe(true);
  expect(await Tasks.hasRecord("z")).toBe(false);
});

test("updateRecord merges a partial patch; undefined is a no-op and null clears", async () => {
  const { db } = await makeDb();
  const Tasks = makeTasks(db);
  await Tasks.createRecord({ id: "1", title: "A", amount: 5, status: "Draft" });

  const updated = await Tasks.updateRecord("1", { amount: 6, status: null, title: undefined } as any);
  expect(updated).toMatchObject({ id: "1", title: "A", amount: 6, status: null });

  expect(await Tasks.getRecord("1")).toMatchObject({ title: "A", amount: 6, status: null });
  await expect(Tasks.updateRecord("missing", { title: "x" })).rejects.toThrow(/not found/);
});

test("createRecord rejects duplicate ids and updates cannot change the id", async () => {
  const { db } = await makeDb();
  const Tasks = makeTasks(db);
  await Tasks.createRecord({ id: "1", title: "A" });

  await expect(Tasks.createRecord({ id: "1", title: "B" })).rejects.toThrow(/already exists/);
  await expect(Tasks.updateRecord("1", { id: "2" } as any)).rejects.toThrow(/cannot change primary key/);
});

test("upsertRecord creates when missing and merges when present", async () => {
  const { db } = await makeDb();
  const Tasks = makeTasks(db);

  const created = await Tasks.upsertRecord("1", { title: "A" });
  expect(created).toMatchObject({ id: "1", title: "A" });

  const updated = await Tasks.upsertRecord("1", { done: true });
  expect(updated).toMatchObject({ id: "1", title: "A", done: true });
});

test("deleteRecord removes the file and reports missing records", async () => {
  const { root, db } = await makeDb();
  const Tasks = makeTasks(db);
  await Tasks.createRecord({ id: "1", title: "A" });

  expect(await Tasks.deleteRecord("1")).toBe("1");
  expect(await Tasks.getRecord("1")).toBeNull();
  expect(directory(root, "tasks").files.has("1.json")).toBe(false);

  await expect(Tasks.deleteRecord("1")).rejects.toThrow(/not found/);
  await expect(Tasks.deleteRecord("1", { ifMissing: "ignore" })).resolves.toBe("1");
});

test("field names map between TypeScript keys and JSON keys; undeclared keys are dropped", async () => {
  const { root, db } = await makeDb();
  const Tasks = db.table({
    name: "tasks",
    fields: {
      id: primaryKey("recordId"),
      name: text("display_name"),
    },
  });

  const created = await Tasks.createRecord({ id: "x", name: "Hello", unknown: "ignored" } as any);
  expect(created).toMatchObject({ id: "x", name: "Hello" });
  expect(created.$rev).toEqual(expect.any(String));
  expect(directory(root, "tasks").json("x.json")).toEqual({ recordId: "x", display_name: "Hello" });
});

test("record ids with path/space characters are percent-encoded and read back", async () => {
  const { root, db } = await makeDb();
  const Tasks = makeTasks(db);

  const created = await Tasks.createRecord({ id: "a/b c", title: "Odd" });
  expect(created.id).toBe("a/b c");
  expect(directory(root, "tasks").files.has("a%2Fb%20c.json")).toBe(true);
  expect(await Tasks.getRecord("a/b c")).toMatchObject({ id: "a/b c", title: "Odd" });
});

test("unsafe table names and reserved record ids are rejected", async () => {
  const { db } = await makeDb();
  expect(() => db.table({ name: "bad/name", fields: { id: primaryKey() } })).toThrow(/illegal file-name/);
  expect(() => db.table({ name: "fsdb.json", fields: { id: primaryKey() } })).toThrow(/root manifest file name/);

  const Tasks = makeTasks(db);
  await expect(Tasks.createRecord({ id: "CON", title: "reserved" })).rejects.toThrow(/reserved Windows file name/);
});

test("file/table schemas validate reads and writes", async () => {
  const { db } = await makeDb();
  const Tasks = db.table({
    name: "tasks",
    fields: {
      id: primaryKey(),
      title: text("title", { schema: v.pipe(v.string(), v.minLength(2)) }),
      amount: number("amount"),
    },
    schema: v.object({ id: v.string(), title: v.string(), amount: v.nullish(v.number()) }),
  });

  await expect(Tasks.createRecord({ title: "x" })).rejects.toThrow(/failed schema validation/);

  await Tasks.createRecord({ id: "1", title: "ok" });
  expect(await Tasks.getRecord("1")).toMatchObject({ id: "1", title: "ok", amount: null });
});

test("a record file whose id disagrees with its file name throws", async () => {
  const { root, db } = await makeDb();
  const Tasks = makeTasks(db);
  await Tasks.createRecord({ id: "1", title: "A" });

  directory(root, "tasks").files.set("1.json", JSON.stringify({ id: "2", title: "B" }));
  await expect(Tasks.getRecord("1")).rejects.toThrow(/stored under id "1"/);
});

test("table-level validation runs before the record file is written", async () => {
  const { root, db } = await makeDb();
  const Strict = db.table({
    name: "strict",
    fields: { id: primaryKey(), value: number("value") },
    schema: v.object({ id: v.string(), value: v.number() }),
  });

  await expect(Strict.createRecord({ id: "1" })).rejects.toThrow(/failed schema validation/);
  expect(directory(root, "strict").files.has("1.json")).toBe(false);
});

test("a table folder that does not exist reads as empty", async () => {
  const { db } = await makeDb();
  const Tasks = makeTasks(db);
  expect(await Tasks.getRecords()).toEqual([]);
  expect(await Tasks.getRecord("1")).toBeNull();
});

test("empty record files (interrupted creates) are treated as missing", async () => {
  const { root, db } = await makeDb();
  const Tasks = makeTasks(db);
  await Tasks.createRecord({ id: "1", title: "A" });
  directory(root, "tasks").files.set("9.json", "  ");

  expect(await Tasks.getRecord("9")).toBeNull();
  expect((await Tasks.getRecords()).map((task) => task.id)).toEqual(["1"]);
});
