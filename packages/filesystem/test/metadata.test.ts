import { expect, test } from "vitest";
import { datetime, FileSystemDatabase, primaryKey, text } from "../src";
import { createMemoryRoot, directory } from "./memory-fs";

async function makeDb() {
  const root = createMemoryRoot("acme-db");
  const db = await FileSystemDatabase.initialize(root, { version: 3, brandId: "com.acme.app" });
  return { root, db };
}

test("folder tables create .meta/table.json with layout and feature metadata", async () => {
  const { root, db } = await makeDb();
  const Tasks = db.table({
    name: "tasks",
    trash: true,
    history: { limit: 7 },
    fields: {
      id: primaryKey(),
      title: text("title"),
      createdAt: datetime("createdAt"),
      updatedAt: datetime("updatedAt"),
    },
    timestamps: true,
  });

  const metadata = await Tasks.getMetadata();
  expect(metadata).toMatchObject({
    format: "filesystem-schema/table",
    version: 3,
    kind: "folder",
    brandId: "com.acme.app",
    primaryKey: "id",
    trash: true,
    history: { limit: 7 },
    timestamps: { createdAt: "createdAt", updatedAt: "updatedAt" },
  });
  expect(directory(root, "tasks", ".meta").json("table.json")).toEqual(metadata);
});

test("single-file tables live under a folder with data.json and metadata", async () => {
  const { root, db } = await makeDb();
  const Settings = db.singleFileTable({
    name: "settings",
    schemaVersion: 9,
    fields: { id: primaryKey(), title: text("title") },
  });

  await Settings.createRecord({ id: "a", title: "A" });

  expect(directory(root, "settings").json("data.json")).toEqual([{ id: "a", title: "A" }]);
  expect((await Settings.getMetadata())).toMatchObject({
    version: 9,
    kind: "single-file",
    brandId: "com.acme.app",
    primaryKey: "id",
  });
  expect(directory(root, "settings", ".meta").json("table.json")).toMatchObject({
    kind: "single-file",
  });
});

test("metadata brand/kind/primary-key drift is rejected", async () => {
  const { root, db } = await makeDb();
  const fields = { id: primaryKey(), title: text("title") };
  await db.table({ name: "tasks", fields }).createRecord({ id: "1", title: "A" });

  const metadataFile = directory(root, "tasks", ".meta");
  const original = metadataFile.json("table.json");

  metadataFile.files.set("table.json", JSON.stringify({ ...original, brandId: "other" }));
  await expect(db.table({ name: "tasks", fields }).getMetadata()).rejects.toThrow(
    /belongs to brandId "other"/,
  );

  metadataFile.files.set("table.json", JSON.stringify({ ...original, kind: "single-file" }));
  await expect(db.table({ name: "tasks", fields }).getMetadata()).rejects.toThrow(
    /metadata kind is "single-file"/,
  );

  metadataFile.files.set("table.json", JSON.stringify({ ...original, primaryKey: "key" }));
  await expect(db.table({ name: "tasks", fields }).getMetadata()).rejects.toThrow(
    /metadata primary key is "key"/,
  );
});
