import { expect, test } from "vitest";
import {
  FileSystemDatabase,
  FileSystemManifestError,
  MANIFEST_FILE,
  pickRoot,
} from "../src";
import { createMemoryRoot } from "./memory-fs";

test("initialize writes the root manifest and open verifies it", async () => {
  const root = createMemoryRoot("acme-db");
  const db = await FileSystemDatabase.initialize(root, { version: 1, brandId: "com.acme.app" });

  expect(root.json(MANIFEST_FILE)).toEqual({ version: 1, brandId: "com.acme.app" });
  expect(db.manifest).toEqual({ version: 1, brandId: "com.acme.app" });
  expect(db.root).toBe(root);

  const reopened = await FileSystemDatabase.open(root, { version: "1", brandId: "com.acme.app" });
  expect(reopened.manifest).toEqual({ version: 1, brandId: "com.acme.app" });
});

test("open throws when the manifest is missing", async () => {
  const root = createMemoryRoot("empty");
  await expect(FileSystemDatabase.open(root, { version: 1, brandId: "acme" }))
    .rejects.toThrow(/has no "fsdb\.json" manifest/);
});

test("open throws when version or brandId is inconsistent", async () => {
  const root = createMemoryRoot("acme-db");
  await FileSystemDatabase.initialize(root, { version: 2, brandId: "acme" });

  const versionError = await FileSystemDatabase.open(root, { version: 1, brandId: "acme" })
    .catch((error) => error);
  expect(versionError).toBeInstanceOf(FileSystemManifestError);
  expect(versionError.code).toBe("version");
  expect(versionError.message).toContain('version mismatch');

  const brandError = await FileSystemDatabase.open(root, { version: 2, brandId: "other" })
    .catch((error) => error);
  expect(brandError).toBeInstanceOf(FileSystemManifestError);
  expect(brandError.code).toBe("brand");
  expect(brandError.message).toContain("brand mismatch");
});

test("initialize is idempotent for the same manifest and guards changes", async () => {
  const root = createMemoryRoot("acme-db");
  await FileSystemDatabase.initialize(root, { version: 1, brandId: "acme" });

  // Same manifest: no-op success.
  await expect(FileSystemDatabase.initialize(root, { version: "1", brandId: "acme" })).resolves.toBeInstanceOf(FileSystemDatabase);

  // Different manifest: throws unless overwrite is requested.
  await expect(FileSystemDatabase.initialize(root, { version: 2, brandId: "acme" }))
    .rejects.toThrow(/version mismatch/);

  const overwritten = await FileSystemDatabase.initialize(
    root,
    { version: 2, brandId: "acme-2" },
    { overwrite: true },
  );
  expect(overwritten.manifest).toEqual({ version: 2, brandId: "acme-2" });
});

test("invalid manifest shapes are rejected with an invalid error", async () => {
  const root = createMemoryRoot("acme-db");
  root.files.set(MANIFEST_FILE, JSON.stringify({ version: 1 }));

  const error = await FileSystemDatabase.open(root, { version: 1, brandId: "acme" }).catch((e) => e);
  expect(error).toBeInstanceOf(FileSystemManifestError);
  expect(error.code).toBe("invalid");
  expect(error.message).toContain("brandId");

  root.files.set(MANIFEST_FILE, "{not json");
  const jsonError = await FileSystemDatabase.open(root, { version: 1, brandId: "acme" }).catch((e) => e);
  expect(jsonError).toBeInstanceOf(FileSystemManifestError);
  expect(jsonError.code).toBe("invalid");
  expect(jsonError.message).toContain("is invalid");
});

test("overwrite repairs an invalid existing manifest", async () => {
  const root = createMemoryRoot("acme-db");
  root.files.set(MANIFEST_FILE, "{not json");

  const db = await FileSystemDatabase.initialize(
    root,
    { version: 1, brandId: "acme" },
    { overwrite: true },
  );
  expect(db.manifest).toEqual({ version: 1, brandId: "acme" });
  expect(root.json(MANIFEST_FILE)).toEqual({ version: 1, brandId: "acme" });
});

test("verify re-reads the manifest and catches later changes", async () => {
  const root = createMemoryRoot("acme-db");
  const db = await FileSystemDatabase.initialize(root, { version: 1, brandId: "acme" });
  expect(await db.verify()).toEqual({ version: 1, brandId: "acme" });

  root.files.set(MANIFEST_FILE, JSON.stringify({ version: 2, brandId: "acme" }));
  await expect(db.verify()).rejects.toThrow(/version mismatch/);

  root.files.delete(MANIFEST_FILE);
  await expect(db.verify()).rejects.toThrow(/no longer has/);
});

test("pickRoot reports the API as unavailable outside a File System Access browser", async () => {
  await expect(pickRoot()).rejects.toThrow(/File System Access API is not available/);
});
