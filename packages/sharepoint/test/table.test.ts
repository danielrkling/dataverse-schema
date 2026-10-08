import { expect, test, vi } from "vitest";
import { SharePointClient } from "../src/client";
import { SharePointTable } from "../src/table";
import { text, number, bool, date, datetime, json, person, lookupId } from "../src/fields";
import { primaryKey } from "../src/fields";
import { text as ftext, datetime as fdatetime } from "../src/fields";

// Pure unit tests over the table: transforms, payload building, query string.
// No HTTP.

const client = new SharePointClient({ url: "https://contoso.sharepoint.com/sites/dev", token: "T" });

function makeTable() {
    return new SharePointTable({
        client,
        listTitle: "Tasks",
        listItemEntityTypeFullName: "SP.Data.TasksListItem",
        fields: {
            id: primaryKey(),
            title: text("Title"),
            done: bool("IsDone"),
            n: number("Amount0"),
            due: date("DueDate"),
            created: datetime("Created"),
            meta: json("Meta0"),
            owner: person("OwnerId"),
            ref: lookupId("RefId"),
        },
    });
}

// --- read transforms ---

test("table.fromSharePoint maps fields and hoists __metadata as $-keys", () => {
    const Tasks = makeTable();
    const record = Tasks.transformItemFromSharePoint({
        Id: 12,
        Title: "hello",
        IsDone: null,
        Amount0: "3.5",
        DueDate: "2026-01-02",
        Created: "2026-01-02T03:04:05Z",
        Meta0: null,
        OwnerId: { __metadata: { type: "SP.FieldUserValue" }, Id: 17 },
        RefId: "2;#Project Alpha",
        __metadata: { etag: '"2"', type: "SP.Data.TasksListItem", uri: "w", id: 12 },
        UndeclaredThing: 1, // dropped — not a declared field
    });
    expect(record).toEqual({
        id: 12,
        title: "hello",
        done: false,
        n: 3.5,
        due: new Date("2026-01-02"),
        created: new Date("2026-01-02T03:04:05Z"),
        meta: null,
        owner: { id: 17 },
        ref: { id: 2, name: "Project Alpha" },
        "$etag": '"2"',
        "$type": "SP.Data.TasksListItem",
        "$uri": "w",
    });
});

test("table.toSharePoint maps back and skips $-keys", () => {
    const Tasks = makeTable();
    const wire = Tasks.transformValueToSharePoint({ title: "abc", done: true, n: 4, $etag: '"9"' } as any);
    expect(wire).toEqual({ Title: "abc", IsDone: true, Amount0: 4 });
});

// --- write payload building ---

test("createRecord builds the verbose POST body with __metadata.type", async () => {
    const Tasks = makeTable();
    const spy = vi.spyOn(Tasks.client, "postRecord").mockResolvedValue({ Id: 1, __metadata: { etag: '"1"', type: "SP.Data.TasksListItem" } });
    const value = new Date("2026-02-01T00:00:00Z");
    await Tasks.createRecord({ title: "x", created: value });
    expect(spy.mock.lastCall![0]).toBe("Tasks");
    expect(spy.mock.lastCall![1]).toEqual({
        __metadata: { type: "SP.Data.TasksListItem" },
        Title: "x",
        Created: "2026-02-01T00:00:00.000Z",
    });
});

test("updateRecord builds MERGE with If-Match from the record's $etag", async () => {
    const Tasks = makeTable();
    const spy = vi.spyOn(Tasks.client, "mergeRecord").mockResolvedValue(undefined);
    await Tasks.updateRecord(12, { done: true, $etag: '"7"' } as any);
    const [, id, value, options] = spy.mock.lastCall!;
    expect(id).toBe(12);
    expect(value).toEqual({
        __metadata: { type: "SP.Data.TasksListItem", etag: '"7"' },
        IsDone: true,
    });
    expect(options).toEqual({ ifMatch: '"7"', signal: undefined });
});

// --- SyncTable satisfaction (compile-time assertion surfaced at runtime) ---

test("table structurally satisfies the sync engine SyncTable contract", async () => {
    const { syncTableCompat } = await import("../src");
    expect(syncTableCompat).toBe(true);
});

// --- query builder ---

test("buildQuery renders OData v3 options", () => {
    const Tasks = makeTable();
    expect(Tasks.buildQuery({ select: ["Title", "IsDone"], filter: "IsDone eq true", top: 5, skip: 10 }))
        .toBe("$select=Title,IsDone&$filter=IsDone eq true&$top=5&$skip=10");
    expect(Tasks.buildQuery({ orderBy: [{ name: "Title", direction: "desc" }, { name: "Id" }] }))
        .toBe("$orderby=Title desc,Id");
    expect(Tasks.buildQuery({ expand: ["Field0/Id"] })).toBe("$expand=Field0/Id");
    expect(Tasks.buildQuery({})).toBe("");
});

// --- field factories ---

test("field factories map wire shapes", () => {
    expect(ftext("Title").fromSharePoint(null)).toBe("");
    expect(fdatetime("Created").toSharePoint(new Date("2026-03-05T06:07:08Z") as any)).toBe("2026-03-05T06:07:08.000Z");
    expect(fdatetime("Created").fromSharePoint(null)).toBeNull();
});

// --- concurrency (etag) semantics ---

test("updateRecord etag precedence: explicit ifMatch > $etag; delete passes If-Match", async () => {
    const Tasks = makeTable();
    const mergeSpy = vi.spyOn(Tasks.client, "mergeRecord").mockResolvedValue(undefined);
    const deleteSpy = vi.spyOn(Tasks.client, "deleteRecord").mockResolvedValue("7");

    // explicit option wins over the record snapshot's $etag
    await Tasks.updateRecord(7, { done: true, $etag: '"2"' } as any, { ifMatch: '"9"' });
    expect(mergeSpy.mock.lastCall![3]).toMatchObject({ ifMatch: '"9"' });

    // otherwise the record's $etag drives the precondition (exact match ⇒ no 412)
    await Tasks.updateRecord(7, { done: true, $etag: '"2"' } as any);
    expect(mergeSpy.mock.calls.at(-1)![3]).toMatchObject({ ifMatch: '"2"' });

    // missing $etag + missing option → no If-Match header at all (unconditional)
    await Tasks.updateRecord(7, { done: true } as any);
    expect(mergeSpy.mock.calls.at(-1)![3]).toMatchObject({ ifMatch: undefined });

    // delete forwards any etag it is given (server 412s on mismatch)
    await Tasks.deleteRecord(7, { ifMatch: '"2"' });
    expect(deleteSpy.mock.lastCall?.slice(0)).toEqual(["Tasks", 7, { ifMatch: '"2"' }]);
});
