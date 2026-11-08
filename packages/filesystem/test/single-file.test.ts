import { expect, test } from "vitest";
import {
  FileSystemDatabase,
  date,
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

function makeSettings(db: FileSystemDatabase) {
  return db.singleFileTable({
    name: "settings",
    fields: {
      id: primaryKey(),
      key: text("key"),
      value: number("value"),
      changed: date("changed"),
    },
  });
}

test("single-file table stores records in one JSON array file", async () => {
  const { root, db } = await makeDb();
  const Settings = makeSettings(db);
  const changed = new Date("2026-05-06T00:00:00Z");

  await Settings.createRecord({ id: "a", key: "theme", value: 1, changed });
  await Settings.createRecord({ id: "b", key: "size", value: 2 });

  expect(directory(root, "settings").json("data.json")).toEqual([
    { id: "a", key: "theme", value: 1, changed: "2026-05-06T00:00:00.000Z" },
    { id: "b", key: "size", value: 2 },
  ]);

  expect((await Settings.getRecords()).map((setting) => setting.id)).toEqual(["a", "b"]);
  expect(await Settings.getRecord("a")).toMatchObject({ id: "a", key: "theme", value: 1 });
  expect(await Settings.getRecord("missing")).toBeNull();
});

test("single-file table supports update, upsert and delete", async () => {
  const { root, db } = await makeDb();
  const Settings = makeSettings(db);
  await Settings.createRecord({ id: "a", key: "theme", value: 1 });

  expect(await Settings.updateRecord("a", { value: 2 })).toMatchObject({ id: "a", value: 2 });
  expect(await Settings.upsertRecord("b", { key: "size", value: 3 })).toMatchObject({ id: "b", value: 3 });

  const updated = await Settings.upsertRecord("a", { key: "dark" });
  expect(updated).toMatchObject({ id: "a", key: "dark", value: 2 });

  await Settings.deleteRecord("a");
  expect(directory(root, "settings").json("data.json")).toEqual([{ id: "b", key: "size", value: 3 }]);
  await expect(Settings.deleteRecord("a")).rejects.toThrow(/not found/);
  await expect(Settings.deleteRecord("a", { ifMissing: "ignore" })).resolves.toBe("a");
});

test("single-file table can use an explicit data file name", async () => {
  const { root, db } = await makeDb();
  const Table = db.singleFileTable({
    name: "references",
    fileName: "reference-data",
    fields: { id: primaryKey(), name: text("name") },
  });
  await Table.createRecord({ id: "1", name: "A" });
  expect(directory(root, "references").files.has("reference-data.json")).toBe(true);

  expect(() =>
    db.singleFileTable({ name: "fsdb.json", fields: { id: primaryKey() } }),
  ).toThrow(/root manifest file name/);
});

test("single-file table reports malformed contents and missing/duplicate primary keys", async () => {
  const { root, db } = await makeDb();
  const Settings = makeSettings(db);
  const folder = await root.getDirectoryHandle("settings", { create: true });

  folder.files.set("data.json", JSON.stringify({ id: "a" }));
  await expect(Settings.getRecords()).rejects.toThrow(/must contain a JSON array/);

  folder.files.set("data.json", JSON.stringify([{ key: "no id" }]));
  await expect(Settings.getRecords()).rejects.toThrow(/missing primary key "id"/);

  folder.files.set("data.json", JSON.stringify([{ id: "a" }, { id: "a" }]));
  await expect(Settings.getRecords()).rejects.toThrow(/duplicate primary key "a"/);
});

test("single-file table not-found and update semantics", async () => {
  const { db } = await makeDb();
  const Settings = makeSettings(db);

  expect(await Settings.getRecords()).toEqual([]);
  await expect(Settings.updateRecord("a", { value: 1 })).rejects.toThrow(/not found/);
  await expect(Settings.createRecord({ id: "a", key: "theme" })).resolves.toMatchObject({ id: "a" });
  await expect(Settings.createRecord({ id: "a", key: "other" })).rejects.toThrow(/already exists/);
  await expect(Settings.updateRecord("a", { id: "b" } as any)).rejects.toThrow(/cannot change primary key/);
});

test("an empty single-file table (interrupted create) reads as empty", async () => {
  const { root, db } = await makeDb();
  const Settings = makeSettings(db);
  const folder = await root.getDirectoryHandle("settings", { create: true });
  folder.files.set("data.json", "");

  expect(await Settings.getRecords()).toEqual([]);
  expect(await Settings.getRecord("a")).toBeNull();
});
