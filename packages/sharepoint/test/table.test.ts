import { expect, test, vi } from "vitest";
import { SharePointClient } from "../src/client";
import { SharePointTable } from "../src/table";
import { defaultQuery } from "../src/query";
import { InferTable } from "../src/fields";
import { text, number, bool, date, datetime, json, person, lookup } from "../src/fields";
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
            ref: lookup("RefId"),
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
        ref: { id: 2, title: "Project Alpha" },
        "$etag": '"2"',
        "$type": "SP.Data.TasksListItem",
        "$uri": "w",
    });
});

test("field Standard Schemas validate and transform reads and writes", () => {
    const uppercase = {
        "~standard": {
            version: 1,
            vendor: "test",
            validate(value: unknown) {
                return typeof value === "string" && value.length >= 2
                    ? { value: value.toUpperCase() }
                    : { issues: [{ message: "expected at least two characters" }] };
            },
        },
    } as any;
    const Tasks = new SharePointTable({
        client,
        listTitle: "Tasks",
        fields: { id: primaryKey(), title: text("Title", { schema: uppercase }) },
    });

    expect(Tasks.transformItemFromSharePoint({ Id: 1, Title: "ok" }).title).toBe("OK");
    expect(Tasks.transformValueToSharePoint({ title: "go" }).Title).toBe("GO");
    expect(() => Tasks.transformItemFromSharePoint({ Id: 1, Title: "x" })).toThrow("failed schema validation");
    expect(() => Tasks.transformValueToSharePoint({ title: "x" })).toThrow("failed schema validation");
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
    vi.spyOn(Tasks.client, "getRecord").mockResolvedValue({ Id: 12, Title: "x", IsDone: true, __metadata: { etag: '"7"' } });
    const updated = await Tasks.updateRecord(12, { done: true, $etag: '"7"' } as any);
    expect(updated).toMatchObject({ id: 12, done: true, $etag: '"7"' });
    const [, id, value, options] = spy.mock.lastCall!;
    expect(id).toBe(12);
    expect(value).toEqual({
        __metadata: { type: "SP.Data.TasksListItem", etag: '"7"' },
        IsDone: true,
    });
    expect(options).toEqual({ ifMatch: '"7"', signal: undefined });
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
    vi.spyOn(Tasks.client, "getRecord").mockResolvedValue({ Id: 7, IsDone: true, __metadata: { etag: '"2"' } });

    // explicit option wins over the record snapshot's $etag
    await Tasks.updateRecord(7, { done: true, $etag: '"2"' } as any, { ifMatch: '"9"' });
    expect(mergeSpy.mock.lastCall![3]).toMatchObject({ ifMatch: '"9"' });

    // otherwise the record's $etag drives the precondition (exact match ⇒ no 412)
    await Tasks.updateRecord(7, { done: true, $etag: '"2"' } as any);
    expect(mergeSpy.mock.calls.at(-1)![3]).toMatchObject({ ifMatch: '"2"' });

    // missing $etag + missing option → unconditional If-Match: *
    // (a header-less MERGE evaluates an implicit blank etag → 412)
    await Tasks.updateRecord(7, { done: true } as any);
    expect(mergeSpy.mock.calls.at(-1)![3]).toMatchObject({ ifMatch: "*" });

    // delete forwards any etag it is given (server 412s on mismatch)
    await Tasks.deleteRecord(7, { ifMatch: '"2"' });
    expect(deleteSpy.mock.lastCall?.slice(0)).toEqual(["Tasks", 7, { ifMatch: '"2"' }]);
});

// --- phantom T property (parity with the Dataverse package) ---

test("field.T / table.T carry the inferred types for typeof-style inference", () => {
    const Tasks = makeTable();
    // field.T resolves that field's value type (compile-only; phantom runtime):
    void (Tasks.fields.title.T as string);
    // table.T resolves the whole inferred record:
    const record: typeof Tasks.T = { id: 1, title: "x", done: false, n: null, due: null, created: null, meta: null, owner: null, ref: null } as typeof Tasks.T;
    expect(record.id).toBe(1);
    // InferTable alias resolves through the phantom:
    const alias: InferTable<typeof Tasks> = record;
    expect(alias.id).toBe(1);
    // a wrong record shape fails to compile (not asserted — cast safety is the point)
});

// --- default projection: plain fetches always select+expand references ---

test("defaultQuery renders $select for plain fields plus $expand with carve-outs", () => {
    const Tasks = makeTable();
    const query = defaultQuery(Tasks);
    // references never ride a bare $select (`ProjectId` style) — they expand:
    expect(query).toContain("$select=");
    expect(query).toContain("Title");
    expect(query).toContain("OwnerId/Id,OwnerId/Title,OwnerId/EMail");
    expect(query).toContain("RefId/Id,RefId/Title");
    expect(query).toContain("$expand=OwnerId,RefId");
    // no __metadata in $select (legacy surface rejects it as selectable)
    expect(query).not.toContain("__metadata");
});

test("getRecord/getRecords default to the full projection when no query is passed", async () => {
    const Tasks = makeTable();
    const getSpy = vi.spyOn(Tasks.client, "getRecord").mockResolvedValue({ Id: 1, Title: "x", __metadata: { etag: '"1"' } });
    await Tasks.getRecord(1);
    expect(getSpy.mock.calls[0]![2]!.query).toBe(defaultQuery(Tasks));

    const listSpy = vi.spyOn(Tasks.client, "getRecords").mockResolvedValue([]);
    await Tasks.getRecords();
    expect(listSpy.mock.calls[0]![1]!.query).toBe(defaultQuery(Tasks));

    // explicit queries pass through untouched (caller opts out)
    await Tasks.getRecords("$filter=IsDone eq true");
    expect(listSpy.mock.calls[1]![1]!.query).toBe("$filter=IsDone eq true");
});

test("getRecord/getRecords accept a built SPQuery as well as a raw string", async () => {
    const Tasks = makeTable();
    const q = Tasks.query().select((f) => ({ id: f.id, title: f.title }));

    const getSpy = vi.spyOn(Tasks.client, "getRecord").mockResolvedValue({ Id: 1, Title: "x", __metadata: { etag: '"1"' } });
    await Tasks.getRecord(1, q);
    expect(getSpy.mock.calls[0]![2]!.query).toBe(q.build());

    const listSpy = vi.spyOn(Tasks.client, "getRecords").mockResolvedValue([]);
    await Tasks.getRecords(q);
    expect(listSpy.mock.calls[0]![1]!.query).toBe(q.build());
});
