import { expect, test, vi, beforeEach, afterEach } from "vitest";
import { SharePointClient } from "../src/client";
import { SharePointTable } from "../src/table";
import { choice, multiChoice, document, text, number, primaryKey, choice as choiceFactory } from "../src/fields";

// Pure unit tests: URL/header/payload building for choice + document flows.
// No HTTP (global fetch stubbed).

const mock = vi.fn();
const BLOB = new Blob(["hello sharepoint"], { type: "text/plain" });

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

// --- choice transforms ---

test("choice reads nullable strings, multiChoice splits on ';#'", () => {
    const c = choiceFactory("Pick0", { choices: ["A", "B"] });
    expect(c.choices).toEqual(["A", "B"]);
    expect(c.fromSharePoint("A")).toBe("A");
    expect(c.fromSharePoint("")).toBeNull();
    expect(c.fromSharePoint(null)).toBeNull();

    const m = multiChoice("Pick0");
    expect(m.fromSharePoint("")).toEqual([]);
    expect(m.fromSharePoint(null)).toEqual([]);
    expect(m.fromSharePoint("A;#B;#C")).toEqual(["A", "B", "C"]);
    expect(m.fromSharePoint(["A", "B"])).toEqual(["A", "B"]);
    expect(m.toSharePoint(["A", "B", "C"])).toBe("A;#B;#C");
});

// --- document library reads ---

test("fileRefFromWire absolutizes FileRef and picks FileLeafRef", () => {
    const client = new SharePointClient({ url: "https://contoso.sharepoint.com/sites/dev", token: "T" });
    const Docs = new SharePointTable({
        client,
        listTitle: "Documents",
        fields: { id: primaryKey(), file: document() },
    });
    const record = Docs.transformItemFromSharePoint({
        Id: 5,
        FileLeafRef: "doc.pdf",
        FileRef: "/sites/dev/Documents/doc.pdf",
        __metadata: { etag: '"1"', type: "SP.Data.DocumentsItem" },
    });
    expect(record.file).toEqual({
        name: "doc.pdf",
        url: "https://contoso.sharepoint.com/sites/dev/Documents/doc.pdf",
    });
});

// --- document library create with content ---

test("create with file content uploads via Files/Add, merges metadata, then fetches the item", async () => {
    const Docs = new SharePointTable({
        client: new SharePointClient({ url: "https://x", token: "T" }),
        listTitle: "Documents",
        listItemEntityTypeFullName: "SP.Data.DocumentsListItem",
        rootFolderUrl: "/Documents",
        fields: {
            id: primaryKey(),
            file: document(),
            title: text("Title"),
            size: number("SizeKB"),
        },
    });

    mock.mockImplementation(async (url: string, init: RequestInit) => {
        const u = decodeURIComponent(url);
        if (u.includes("Files/Add")) {
            // body must be the raw binary, not JSON.stringify'd metadata
            expect(init.body).toBe(BLOB);
            const headers = init.headers as Record<string, string>;
            expect(headers["Content-Type"]).toBe("application/octet-stream");
            return jsonResponse({ d: { ServerRelativeUrl: "/Documents", ListItemAllFields: { Id: 99 } } });
        }
        if (u.includes("RootFolder")) return jsonResponse({ d: { ServerRelativeUrl: "/Documents" } });
        if (u.includes("Items(99)") && (init.method ?? "GET") === "GET") {
            return jsonResponse({ d: { Id: 99, FileLeafRef: "report.pdf", FileRef: "/Documents/report.pdf", Title: null, SizeKB: 12, __metadata: { etag: '"2"', type: "SP.Data.DocumentsListItem" } } });
        }
        if (u.includes("Items(99)") && (init.headers as any)?.["X-HTTP-Method"] === "MERGE") {
            mergeCaptured = JSON.parse(init.body as string);
            mergeHeaders = init.headers as Record<string, string>;
            return new Response(null, { status: 204 });
        }
        throw new Error(`Unexpected fetch: ${u}`);
    });
    let mergeCaptured: unknown;
    let mergeHeaders: Record<string, string> | undefined;

    const record = await Docs.createRecord({ file: { name: "report.pdf", data: BLOB }, title: "Q3", size: 12 } as any);

    // metadata MERGE onto the created item happened with the right headers
    expect(mergeCaptured).toEqual({
        __metadata: { type: "SP.Data.DocumentsListItem" },
        Title: "Q3",
        SizeKB: 12,
    });
    expect(mergeHeaders?.["X-HTTP-Method"]).toBe("MERGE");

    // returned record is the fetched item, file url absolutized
    expect(record.id).toBe(99);
    expect(record.file).toEqual({ name: "report.pdf", url: "https://x/Documents/report.pdf" });

});

// --- document library update with content ---

test("update MERGEs metadata then overwrites the file content via Files/Add", async () => {
    const Docs = new SharePointTable({
        client: new SharePointClient({ url: "https://x", token: "T" }),
        listTitle: "Documents",
        listItemEntityTypeFullName: "SP.Data.DocumentsListItem",
        rootFolderUrl: "/Documents",
        fields: { id: primaryKey(), file: document(), title: text("Title") },
    });
    stubRoutes([
        [`Items(5)`, new Response(null, { status: 204 })],
        [`Files/Add(url=%27report.pdf%27,overwrite=true)`, { d: { ServerRelativeUrl: "/Documents/report.pdf", ListItemAllFields: { Id: 5 } } }],
    ] as any);
    const mergeSpyBody: any[] = [];
    const addSpyBody: any[] = [];
    mock.mockImplementation(async (url: string, init: RequestInit) => {
        const u = decodeURIComponent(url);
        if (u.includes("Files/Add")) { addSpyBody.push(init.body); return jsonResponse({ d: { ListItemAllFields: { Id: 5 } } }); }
        if (u.includes("Items(5)")) { mergeSpyBody.push(init.body); return new Response(null, { status: 204 }); }
        throw new Error(`Unexpected fetch: ${u}`);
    });

    await Docs.updateRecord(5, { file: { name: "report.pdf", data: BLOB }, title: "Q3" } as any);

    // MERGE carries the item body (metadata only), then content overwrite
    expect(JSON.parse(mergeSpyBody[0])).toEqual({ __metadata: { type: "SP.Data.DocumentsListItem" }, Title: "Q3" });
    expect(addSpyBody[0]).toBe(BLOB);
    expect(addSpyBody).toHaveLength(1);
});

// --- update without content mid-metadata merge doesn't touch files ---

test("update without file content issues no Files/Add", async () => {
    const Docs = new SharePointTable({
        client: new SharePointClient({ url: "https://x", token: "T" }),
        listTitle: "Documents",
        listItemEntityTypeFullName: "SP.Data.DocumentsListItem",
        rootFolderUrl: "/Documents",
        fields: { id: primaryKey(), file: document(), title: text("Title") },
    });
    stubRoutes([[`Items(5)`, new Response(null, { status: 204 })]]);
    await Docs.updateRecord(5, { title: "Q3" } as any);
    expect(mock.mock.calls.every(([u]) => !String(u).includes("Files/Add"))).toBe(true);
});

test("document read throws when the item has no file channel (wrong list type)", () => {
    const Docs = new SharePointTable({
        client: new SharePointClient({ url: "https://contoso.sharepoint.com/sites/dev", token: "T" }),
        listTitle: "NotADocLib",
        fields: { id: primaryKey(), file: document() },
    });
    expect(() => Docs.transformItemFromSharePoint({ Id: 5 })).toThrow("no file channel");
});
