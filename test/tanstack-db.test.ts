// @vitest-environment node
import { expect, test } from "vitest";
import { DataverseSyncDB } from "../src/tanstack-db";
import { DataverseClient } from "../src/client";
import { DataverseTable, primaryKey, string } from "../src";

// --- serializeMutation proxy stripping ---

test("serializeMutation strips proxies so the payload is structuredClone-safe", () => {
  const table = new DataverseTable({
    client: new DataverseClient({ url: "https://org.crm.dynamics.com/api/data/v9.2" }),
    entitySetName: "contacts",
    logicalName: "contact",
    fields: { id: primaryKey("contactid"), name: string("fullname") },
  });
  const db = new DataverseSyncDB("test-db", [table], 1);

  // Simulate a row that passed through a live-query join: the record itself
  // and its nested values are wrapped in (structurally un-cloneable) proxies.
  const proxiedRow = new Proxy({ id: "guid-1", name: "Ada", nested: { etag: "W/\"1\"" } }, {
    get(target, prop) { return target[prop as keyof typeof target]; },
  });
  const proxiedChanges = new Proxy({ name: "Grace" }, {
    get(target, prop) { return target[prop as keyof typeof target]; },
  });

  const queued = db.serializeMutation({
    mutationId: "m1",
    type: "update",
    key: "guid-1",
    modified: proxiedRow,
    changes: proxiedChanges,
    collection: { id: "contacts" },
    createdAt: new Date(),
  } as any);

  // structuredClone is exactly what IndexedDB/BroadcastChannel do under the
  // hood — this used to throw "could not be cloned" for proxied rows.
  const cloned = structuredClone(queued);
  expect(cloned.value).toEqual({ id: "guid-1", name: "Ada", nested: { etag: "W/\"1\"" } });
  expect(cloned.changes).toEqual({ name: "Grace" });
  expect(cloned.value).not.toBe(proxiedRow);
  db.close();
});
