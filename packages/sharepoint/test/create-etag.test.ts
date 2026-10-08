import { expect, test, vi } from "vitest";
import { SharePointClient } from "../src/client";
import { SharePointTable } from "../src/table";
import { document, people, lookup, primaryKey, text } from "../src/fields";

// Reproduction of the etag failure on the two-step doc-lib create:
// Files/Add creates the item (and churns its etag), then the metadata MERGE
// must be UNCONDITIONAL (If-Match: *) — a preconditioned merge there makes no
// semantic sense and SharePoint may evaluate a stale implicit etag.

function Docs() {
    return new SharePointTable({
        client: new SharePointClient({ url: "https://x", token: "T" }),
        listTitle: "JCR",
        listItemEntityTypeFullName: "SP.Data.JCRItem",
        rootFolderUrl: "/sites/dev/JCR",
        fields: {
            id: primaryKey(),
            file: document("FileLeafRef"),
            title: text("Title"),
            project: lookup("Project"),
            concurCodes: people("Concur_x0020_Codes"),
        },
    });
}

const BLOB = new Blob(["doc"], { type: "application/pdf" });

test("create with content: metadata MERGE is unconditional (If-Match: *)", async () => {
    const DocsT = Docs();
    const calls: Array<{ url: string; headers: Record<string, string>; body?: any }> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
        const u = decodeURIComponent(url);
        calls.push({ url: u, headers: (init.headers ?? {}) as Record<string, string>, body: init.body });
        if (u.includes("Files/Add")) {
            // current tenants carry the item id on the Add response:
            return new Response(JSON.stringify({ d: { ServerRelativeUrl: "/sites/dev/JCR/doc.pdf", ListItemAllFields: { Id: 42 } } }), {
                status: 200,
                headers: { "Content-Type": "application/json;odata=verbose;charset=utf-8" },
            });
        }
        // MERGE:
        return new Response(null, { status: 204 });
    }));

    await DocsT.createRecord({
        file: { name: "doc.pdf", data: BLOB },
        title: "Q3 Review",
        project: { id: 3 },
        concurCodes: [{ id: 7 }],
    } as any);

    const merge = calls.find((c) => c.headers["X-HTTP-Method"] === "MERGE")!;
    expect(merge).toBeDefined();
    expect(merge.headers["If-Match"]).toBe("*"); // ← the fix: not preconditioned, not absent-by-accident
    expect(JSON.parse(merge.body)).toEqual({
        __metadata: { type: "SP.Data.JCRItem" },
        Title: "Q3 Review",
        ProjectId: 3,
        "Concur_x0020_CodesId": { results: [7] },
    });
});
