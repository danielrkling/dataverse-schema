// @vitest-environment node
import { expect, test } from "vitest";
import * as root from "../src";
import * as sync from "../src/sync";
import * as tanstack from "../src/sync/tanstack";

// The published package exposes three entries: ".", "./sync" and
// "./sync/tanstack". Keep the boundary intact so the root entry never carries
// the IndexedDB engine (or accidentally forces the optional @tanstack/db peer).

test("root entry exposes the Dataverse API but not the offline engine", () => {
  expect(typeof root.DataverseClient).toBe("function");
  expect(typeof root.DataverseTable).toBe("function");
  expect("SyncEngine" in root).toBe(false);
  expect("dataverseSyncEngine" in root).toBe(false);
  expect("offlineCollectionOptions" in root).toBe(false);
});

test("sync entry exposes the engine and Dataverse adapter", () => {
  expect(typeof sync.SyncEngine).toBe("function");
  expect(typeof sync.dataverseSyncEngine).toBe("function");
  expect(typeof sync.MutationPersistenceError).toBe("function");
  expect(typeof sync.interpretError).toBe("function");
  expect(typeof sync.plainClone).toBe("function");
});

test("sync/tanstack entry exposes the collection factories", () => {
  expect(typeof tanstack.syncCollectionOptions).toBe("function");
  expect(typeof tanstack.offlineCollectionOptions).toBe("function");
  expect(typeof tanstack.readonlyStorageCollectionOptions).toBe("function");
  expect(typeof tanstack.serializeMutation).toBe("function");
});
