// @vitest-environment node
import { expect, test } from "vitest";
import { DataverseSyncDB } from "../src/tanstack-db";
import { DataverseClient } from "../src/client";
import { DataverseTable, file, image, primaryKey, string } from "../src";

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

test("serializeMutation preserves binary payloads (file/image upload channels)", async () => {
  const table = new DataverseTable({
    client: new DataverseClient({ url: "https://org.crm.dynamics.com/api/data/v9.2" }),
    entitySetName: "accounts",
    logicalName: "account",
    fields: { id: primaryKey("accountid"), photo: image("entityimage"), doc: file("myfile") },
  });
  const db = new DataverseSyncDB("test-db-bin", [table], 1);

  const blob = new Blob(["binary"], { type: "image/png" });
  const queued = db.serializeMutation({
    mutationId: "m2",
    type: "update",
    key: "guid-2",
    modified: { id: "guid-2", photo: { data: blob }, doc: { name: "report.pdf", data: blob } },
    changes: { photo: { data: blob }, doc: { name: "report.pdf", data: blob } },
    collection: { id: "accounts" },
    createdAt: new Date(),
  } as any);

  const cloned = structuredClone(queued);
  // The Blob must survive as a Blob, not be degraded to {} — otherwise the
  // `value.data instanceof Blob` check in the field afterSave hooks fails and
  // the upload silently never happens.
  expect(cloned.changes.photo.data).toBeInstanceOf(Blob);
  expect(cloned.changes.doc.data).toBeInstanceOf(Blob);
  expect(cloned.changes.doc.name).toBe("report.pdf");
  await expect(cloned.changes.photo.data.text()).resolves.toBe("binary");
  db.close();
});
