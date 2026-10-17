import { expect, test, vi, beforeEach, afterEach } from "vitest";
import { SharePointClient } from "../src/client";
import { SharePointTable } from "../src/table";
import { comments, primaryKey, text } from "../src/fields";
import { defaultQuery } from "../src/query";

// Pure unit tests: comments channel (item-level REST surface, no column).
// No HTTP (global fetch stubbed).

const mock = vi.fn();

beforeEach(() => vi.stubGlobal("fetch", mock));
afterEach(() => {
    mock.mockReset();
    vi.unstubAllGlobals();
});

function jsonResponse(body: unknown) {
    return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json;odata=verbose;charset=utf-8" },
    });
}
function stubRoutes(routes: Array<[string, unknown]>) {
    mock.mockImplementation(async (url: string, init: RequestInit) => {
        const d = decodeURIComponent(url);
        for (const [fragment, body] of routes) {
            if (d.includes(fragment)) {
                return body instanceof Response ? body : jsonResponse(body);
            }
        }
        throw new Error(`Unexpected fetch: ${url}`);
    });
}

const WIRE_COMMENT = {
    __metadata: { type: "Microsoft.SharePoint.Comments.comment" },
    id: "7",
    text: "Commenting in lists is cool!",
    author: { id: 6, name: "Ganesh Sanap", email: "gsanap@contoso.onmicrosoft.com", loginName: "i:0#.f|membership|gsanap" },
    createdDate: "2021-01-09T08:18:31.3Z",
    isReply: false,
    itemId: 1,
    likeCount: 0,
    parentId: "0",
    replyCount: 0,
    mentions: { results: [{ email: "a@contoso.com", name: "Ann" }] },
};

function Tasks() {
    return new SharePointTable({
        client: new SharePointClient({ url: "https://x", token: "T" }),
        listTitle: "Tasks",
        listItemEntityTypeFullName: "SP.Data.TasksListItem",
        fields: {
            id: primaryKey(),
            title: text("Title"),
            feed: comments(),
        },
    });
}

// --- field transforms ---

test("comments field never rides the item wire (toSharePoint undefined, fromSharePoint throws)", () => {
    const field = comments();
    expect(field.type).toBe("comments");
    expect(field.toSharePoint([])).toBeUndefined();
    expect(() => field.fromSharePoint(null)).toThrow("does not ride the item wire");
});

// --- query projection ---

test("defaultQuery and select() exclude the comments field (no $select presence)", () => {
    const table = Tasks();
    expect(defaultQuery(table)).toBe("$select=Id,Title");
});

test("query builder select() skips comments in $select but keeps other fields", async () => {
    const table = Tasks();
    const q = table.query().select((f) => ({ id: f.id, feed: f.feed, title: f.title })).build();
    expect(q).toBe("$select=Id,Title");
});

// --- reads ---

test("getRecord populates the comments field via a follow-up Comments call", async () => {
    const table = Tasks();
    stubRoutes([
        ["Items(12)/Comments", { d: { results: [WIRE_COMMENT] } }],
        ["Items(12)", { d: { Id: 12, Title: "T", __metadata: { etag: '"1"', type: "SP.Data.TasksListItem" } } }],
    ]);
    const record = await table.getRecord(12);
    expect(record!.feed).toHaveLength(1);
    const c = record!.feed![0];
    expect(c).toEqual({
        id: "7",
        text: "Commenting in lists is cool!",
        author: { id: 6, name: "Ganesh Sanap", email: "gsanap@contoso.onmicrosoft.com" },
        createdDate: new Date("2021-01-09T08:18:31.3Z"),
        parentId: "0",
        isReply: false,
        replyCount: 0,
        likeCount: 0,
        mentions: [{ email: "a@contoso.com", name: "Ann" }],
    });
});

test("getRecords leaves the comments key absent (N+1 follow-up calls are not made)", async () => {
    const table = Tasks();
    stubRoutes([
        ["Items", { d: { results: [{ Id: 12, Title: "T", __metadata: { etag: '"1"' } }] } }],
    ]);
    const records = await table.getRecords();
    expect(records).toHaveLength(1);
    expect(records[0].feed).toBeUndefined();
});

test("getComments flattens the verbose comment surface", async () => {
    const table = Tasks();
    stubRoutes([["Items(12)/Comments", { d: { results: [WIRE_COMMENT] } }]]);
    const list = await table.getComments(12);
    expect(list[0].id).toBe("7");
    expect(list[0].createdDate).toBeInstanceOf(Date);
});

// --- writes ---

test("addComment posts the Microsoft.SharePoint.Comments.comment body and flattens the response", async () => {
    const table = Tasks();
    stubRoutes([["Items(12)/Comments", WIRE_COMMENT]]);
    const created = await table.addComment(12, "Commenting in lists is cool!");
    const [, init] = mock.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(init.method).toBe("POST");
    expect(body.__metadata).toEqual({ type: "Microsoft.SharePoint.Comments.comment" });
    expect(body.text).toBe("Commenting in lists is cool!");
    expect(created.id).toBe("7");
});

test("addComment with mentions sends the Collection(Identity) results envelope", async () => {
    const table = Tasks();
    stubRoutes([["Items(12)/Comments", WIRE_COMMENT]]);
    await table.addComment(12, "Hey @mention{0}!", ["a@contoso.com"]);
    const body = JSON.parse(mock.mock.calls[0][1].body);
    expect(body.mentions).toEqual({
        __metadata: { type: "Collection(Microsoft.SharePoint.Comments.Client.Identity)" },
        results: ["a@contoso.com"],
    });
});

test("deleteComment tunnels DELETE through POST on the comment resource", async () => {
    const table = Tasks();
    stubRoutes([["Items(12)/Comments(7)", {}]]);
    await table.deleteComment(12, "7");
    const [url, init] = mock.mock.calls[0];
    expect(decodeURIComponent(url)).toContain("Items(12)/Comments(7)");
    expect(init.method).toBe("POST");
    expect(init.headers["X-HTTP-Method"]).toBe("DELETE");
});

// --- item-body guard ---

test("createRecord/updateRecord throw when a comments value is passed in the record", async () => {
    const table = Tasks();
    stubRoutes([
        ["Items", { d: { Id: 12, Title: "T", __metadata: { etag: '"1"' } } }],
        ["Items(12)", { d: { Id: 12, Title: "T", __metadata: { etag: '"2"' } } }],
    ]);
    await expect(table.createRecord({ title: "T", feed: [] } as any)).rejects.toThrow("append-only");
    await expect(table.updateRecord(12, { title: "T2", feed: [{ id: "1" }] as any })).rejects.toThrow("append-only");
    // a spread of a getRecords shape (comments absent) passes through fine
    await expect(table.updateRecord(12, { title: "T3" })).resolves.toBeUndefined();
    expect(JSON.parse(mock.mock.calls.at(-1)![1].body).Title).toBe("T3");
});
