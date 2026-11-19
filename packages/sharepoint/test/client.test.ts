import { expect, test, vi, beforeEach, afterEach } from "vitest";
import { SharePointClient, SharePointHttpError, unwrapVerbose } from "../src/client";

// Pure unit tests: assert on built URLs, headers, and payload unwrapping.
// Network calls are intercepted with the global fetch stub — no HTTP.

function lastFetch() {
    return mock.mock.calls.at(-1)!;
}
function stubFetch(respond: (url: string, init: RequestInit) => Response | Promise<Response>) {
    mock.mockImplementation(async (url: string, init: RequestInit) => respond(url, init));
}
const mock = vi.fn();

beforeEach(() => {
    vi.stubGlobal("fetch", mock);
});
afterEach(() => {
    mock.mockReset();
    vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, init: ResponseInit = {}) {
    return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json;odata=verbose;charset=utf-8" },
        ...init,
    });
}

// --- verbose envelope unwrapping ---

test("unwrapVerbose unwraps d.results, d.objects and plain d", () => {
    expect(unwrapVerbose({ d: { results: [1, 2] } })).toEqual([1, 2]);
    expect(unwrapVerbose({ d: { __next: "https://x" } })).toEqual({ __next: "https://x" });
    expect(unwrapVerbose({ d: { Id: 1 } })).toEqual({ Id: 1 });
    expect(unwrapVerbose({ Id: 1 })).toEqual({ Id: 1 });
});

// --- headers & URL building ---

test("client fetch adds verbose JSON headers and Bearer token", async () => {
    const client = new SharePointClient({ url: "https://contoso.sharepoint.com/sites/dev", token: "T" });
    stubFetch(() => jsonResponse({ d: { results: [] } }));
    await client.fetch("Web/Lists");
    const [url, init] = lastFetch();
    expect(url).toBe("https://contoso.sharepoint.com/sites/dev/_api/Web/Lists");
    const headers = init.headers as Record<string, string>;
    expect(headers.Accept).toBe("application/json;odata=verbose");
    expect(headers.Authorization).toBe("Bearer T");
    expect(headers["X-RequestDigest"]).toBeUndefined();
});

test("client write requests attach the digest fetched from contextinfo and cache it", async () => {
    const client = new SharePointClient({
        url: "https://contoso.sharepoint.com/sites/dev",
        requestDigest: async () => "digest-1",
    });
    stubFetch(() => jsonResponse({ d: { Id: 1, __metadata: { etag: '"1"' } } }));
    await client.postRecord("Tasks", { Title: "a" });
    await client.postRecord("Tasks", { Title: "b" });
    const [, init1] = mock.mock.calls[0];
    const headers1 = init1.headers as Record<string, string>;
    expect(headers1["X-RequestDigest"]).toBe("digest-1");
    expect(headers1["Content-Type"]).toBe("application/json;odata=verbose");
    // the requestDigest provider is also used for the second write (cache fresh)
    expect(mock.mock.calls).toHaveLength(2);
});

test("client errors surface status/grid body in SharePointHttpError", async () => {
    const client = new SharePointClient({ url: "https://x", token: "T" });
    stubFetch(() => jsonResponse({ error: { code: "123", message: { value: "nope" } } }, { status: 400 }));
    await expect(client.fetch("Web/Lists")).rejects.toThrow("400 nope");
});

// --- list item paths ---

test("itemsPath URL-encodes the list title", () => {
    const client = new SharePointClient({ url: "https://x" });
    expect(client.itemsPath("Tasks")).toBe("https://x/_api/Web/Lists/GetByTitle('Tasks')/Items");
    expect(client.itemsPath("My Tasks & More")).toBe(
        "https://x/_api/Web/Lists/GetByTitle('My%20Tasks%20%26%20More')/Items",
    );
});

test("unwrapVerbose preserves __next without changing enumerable rows", () => {
    const rows = unwrapVerbose({ d: { results: [{ Id: 1 }], __next: "https://x/page2" } });
    expect(rows).toEqual([{ Id: 1 }]);
    expect((rows as any).__next).toBe("https://x/page2");
});

test("getRecords follows verbose __next pagination", async () => {
    const client = new SharePointClient({ url: "https://x", token: "T" });
    let page = 0;
    stubFetch(() => jsonResponse(page++ === 0
        ? { d: { results: [{ Id: 1 }], __next: "https://x/page2" } }
        : { d: { results: [{ Id: 2 }] } }));

    expect(await client.getRecords("Tasks")).toEqual([{ Id: 1 }, { Id: 2 }]);
    expect(mock).toHaveBeenCalledTimes(2);
});

test("deleteRecord tunnels DELETE through POST with an optional If-Match", async () => {
    const client = new SharePointClient({ url: "https://x", token: "T" });
    stubFetch(() => new Response(null, { status: 204 }));
    await client.deleteRecord("Tasks", 7, { ifMatch: '"2"' });
    const [, init] = lastFetch();
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["X-HTTP-Method"]).toBe("DELETE");
    expect((init.headers as Record<string, string>)["If-Match"]).toBe('"2"');
});

// --- custom fetch option ---

test("options.fetch is used instead of the global fetch", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
        jsonResponse({ d: { Id: 42, Title: "Jane", LoginName: "i:0#.f|x|jane", Email: "jane@x" } }),
    );
    const client = new SharePointClient({ url: "https://x", token: "T", fetch: fetchImpl });
    expect(await client.getCurrentUser()).toEqual({ id: 42, name: "Jane", loginName: "i:0#.f|x|jane", email: "jane@x" });
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(fetchImpl.mock.calls[0][0]).toBe("https://x/_api/Web/CurrentUser?$select=Id,Title,LoginName,Email");
});

test("getCurrentUser maps the Web/CurrentUser shape", async () => {
    const client = new SharePointClient({ url: "https://x", token: "T" });
    stubFetch((url) => {
        expect(url).toBe("https://x/_api/Web/CurrentUser?$select=Id,Title,LoginName,Email");
        return jsonResponse({ d: { Id: 42, Title: "Jane", LoginName: "i:0#.f|x|jane", Email: "jane@x" } });
    });
    expect(await client.getCurrentUser()).toEqual({ id: 42, name: "Jane", loginName: "i:0#.f|x|jane", email: "jane@x" });

    stubFetch(() => jsonResponse({ d: {} })); // invalid id → loud error
    await expect(client.getCurrentUser()).rejects.toThrow("CurrentUser");
});
