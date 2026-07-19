import { expect, test, vi, beforeEach } from "vitest";
import { DataverseClient } from "../src/client";
import {
  DataverseTable,
  primaryKey,
  string,
  number,
  lookupId,
  Infer,
} from "../src";
import { BASE_URL } from "./mocks/handlers";
import { http, HttpResponse } from "msw";
import { server } from "./mocks/server";

const client = new DataverseClient({ url: BASE_URL });

const Account = new DataverseTable({
  client,
  entitySetName: "accounts",
  logicalName: "account",
  fields: {
    id: primaryKey("accountid"),
    name: string("name"),
    revenue: number("revenue"),
  },
});

const Contact = new DataverseTable({
  client,
  entitySetName: "contacts",
  logicalName: "contact",
  fields: {
    id: primaryKey("contactid"),
    fullname: string("fullname"),
    accountId: lookupId("parentid", () => Account),
  },
});

// --- dataverseCollectionOptions ---

test("dataverseCollectionOptions returns correct config shape", async () => {
  const { dataverseCollectionOptions } = await import("../src/tanstack/collection");
  const config = dataverseCollectionOptions({ table: Account });

  expect(config.id).toBe("accounts");
  expect(config.sync).toBeDefined();
  expect(config.sync.sync).toBeTypeOf("function");
  expect(config.onInsert).toBeTypeOf("function");
  expect(config.onUpdate).toBeTypeOf("function");
  expect(config.onDelete).toBeTypeOf("function");
  expect(config.utils).toBeDefined();
  expect(config.utils.forceSync).toBeTypeOf("function");
});

test("dataverseCollectionOptions uses custom id", async () => {
  const { dataverseCollectionOptions } = await import("../src/tanstack/collection");
  const config = dataverseCollectionOptions({ table: Account, id: "my-accounts" });
  expect(config.id).toBe("my-accounts");
});

test("dataverseCollectionOptions getKey defaults to PK", async () => {
  const { dataverseCollectionOptions } = await import("../src/tanstack/collection");
  const config = dataverseCollectionOptions({ table: Account }) as any;
  const record = { id: "test-guid", name: "Acme", revenue: 1000 };
  expect(config.getKey(record)).toBe("test-guid");
});

test("dataverseCollectionOptions getKey uses custom function", async () => {
  const { dataverseCollectionOptions } = await import("../src/tanstack/collection");
  const config = dataverseCollectionOptions({
    table: Account,
    getKey: (item: any) => item.name,
  }) as any;
  const record = { id: "test-guid", name: "Acme", revenue: 1000 };
  expect(config.getKey(record)).toBe("Acme");
});

// --- insert handler ---

test("onInsert calls table.insertRecord and returns GUID", async () => {
  const { dataverseCollectionOptions } = await import("../src/tanstack/collection");
  const config = dataverseCollectionOptions({ table: Account }) as any;

  const mockGuid = "mocked-guid-123";
  const insertSpy = vi.spyOn(Account, "insertRecord").mockResolvedValue(mockGuid as any);

  const result = await config.onInsert({
    transaction: {
      mutations: [
        { modified: { id: "new-1", name: "New Corp", revenue: 100 } },
      ],
    },
  });

  expect(insertSpy).toHaveBeenCalledWith({ id: "new-1", name: "New Corp", revenue: 100 });
  expect(result).toEqual([mockGuid]);

  insertSpy.mockRestore();
});

// --- update handler ---

test("onUpdate calls table.updateRecord", async () => {
  const { dataverseCollectionOptions } = await import("../src/tanstack/collection");
  const config = dataverseCollectionOptions({ table: Account }) as any;

  const updateSpy = vi.spyOn(Account, "updateRecord").mockResolvedValue("guid" as any);

  const result = await config.onUpdate({
    transaction: {
      mutations: [
        { key: "rec-1", changes: { name: "Updated" } },
      ],
    },
  });

  expect(updateSpy).toHaveBeenCalledWith("rec-1", { name: "Updated" });
  expect(result).toEqual(["rec-1"]);

  updateSpy.mockRestore();
});

// --- delete handler ---

test("onDelete calls table.deleteRecord", async () => {
  const { dataverseCollectionOptions } = await import("../src/tanstack/collection");
  const config = dataverseCollectionOptions({ table: Account }) as any;

  const deleteSpy = vi.spyOn(Account, "deleteRecord").mockResolvedValue("guid" as any);

  const result = await config.onDelete({
    transaction: {
      mutations: [{ key: "rec-1" }],
    },
  });

  expect(deleteSpy).toHaveBeenCalledWith("rec-1");
  expect(result).toEqual(["rec-1"]);

  deleteSpy.mockRestore();
});

// --- user-provided handlers override defaults ---

test("user-provided onInsert overrides default", async () => {
  const { dataverseCollectionOptions } = await import("../src/tanstack/collection");
  const customHandler = vi.fn().mockResolvedValue(["custom"]);
  const insertSpy = vi.spyOn(Account, "insertRecord");

  const config = dataverseCollectionOptions({
    table: Account,
    onInsert: customHandler,
  }) as any;

  await config.onInsert({
    transaction: { mutations: [{ modified: { id: "x" } }] },
  });

  expect(customHandler).toHaveBeenCalled();
  expect(insertSpy).not.toHaveBeenCalled();

  insertSpy.mockRestore();
});

// --- sync function ---

test("sync function fetches records and calls write/commit/markReady", async () => {
  server.use(
    http.get(`${BASE_URL}/api/data/v9.2/accounts`, () => {
      return HttpResponse.json({
        value: [
          { accountid: "a1", name: "Acme", revenue: 1000 },
          { accountid: "a2", name: "Beta", revenue: 2000 },
        ],
      });
    }),
  );

  const { dataverseCollectionOptions } = await import("../src/tanstack/collection");
  const config = dataverseCollectionOptions({ table: Account }) as any;

  const begin = vi.fn();
  const write = vi.fn();
  const commit = vi.fn();
  const markReady = vi.fn();

  // Call the sync function
  const cleanup = config.sync.sync({ begin, write, commit, markReady } as any);

  // Wait for the async sync to complete
  await vi.waitFor(() => {
    expect(markReady).toHaveBeenCalled();
  });

  expect(begin).toHaveBeenCalled();
  expect(write).toHaveBeenCalledTimes(2);
  expect(write).toHaveBeenCalledWith({
    type: "insert",
    value: expect.objectContaining({ name: "Acme" }),
  });
  expect(write).toHaveBeenCalledWith({
    type: "insert",
    value: expect.objectContaining({ name: "Beta" }),
  });
  expect(commit).toHaveBeenCalled();

  // Cleanup interval
  if (typeof cleanup === "function") cleanup();
});

// --- dataverseOfflineCollectionOptions ---

test("dataverseOfflineCollectionOptions returns correct config shape", async () => {
  const { dataverseOfflineCollectionOptions } = await import("../src/tanstack/offline-collection");
  const config = dataverseOfflineCollectionOptions({ table: Account });

  expect(config.id).toBe("accounts");
  expect(config.sync).toBeDefined();
  expect(config.onInsert).toBeTypeOf("function");
  expect(config.onUpdate).toBeTypeOf("function");
  expect(config.onDelete).toBeTypeOf("function");
  expect(config.utils).toBeDefined();
  expect(config.utils.isOnline).toBeTypeOf("function");
  expect(config.utils.forceSync).toBeTypeOf("function");
  expect(config.utils.clearLocalData).toBeTypeOf("function");
  expect(config.utils.getPendingMutations).toBeTypeOf("function");
});

test("dataverseOfflineCollectionOptions uses custom dbName and storeName", async () => {
  const { dataverseOfflineCollectionOptions } = await import("../src/tanstack/offline-collection");
  const config = dataverseOfflineCollectionOptions({
    table: Account,
    dbName: "my-app",
    storeName: "acc-store",
  });
  expect(config.id).toBe("accounts");
});

test("utils.isOnline returns navigator.onLine", async () => {
  const { dataverseOfflineCollectionOptions } = await import("../src/tanstack/offline-collection");
  const config = dataverseOfflineCollectionOptions({ table: Account }) as any;
  expect(config.utils.isOnline()).toBe(navigator.onLine);
});
