import type { ListItemId } from "./types";

/**
 * SharePoint legacy REST API error (`_api/web` — OData v3).
 * Error bodies are verbose JSON: `{ error: { code, message: { value } } }`;
 * a plain string body is also possible.
 */
export class SharePointHttpError extends Error {
    constructor(
        message: string,
        readonly status: number,
        readonly statusText: string,
        readonly body: unknown,
        readonly response?: Response,
    ) {
        super(message);
        this.name = "SharePointHttpError";
    }
}

/** Options for configuring a SharePointClient instance. */
export type SharePointClientOptions = {
    /**
     * Base URL of the SharePoint site (web) — e.g. `"https://contoso.sharepoint.com/sites/dev"`.
     * Defaults to `location.origin` in the browser.
     */
    url?: string;
    /** Bearer access token (app-only or delegated). When present, `X-RequestDigest` is not attached. */
    token?: string;
    /**
     * Resolves the form-digest value required for writes under cookie-based
     * auth (e.g. SPFx provides it via `this.context.pageContext.web
     * .getFormDigestToken()`). The client caches the resolved digest until its
     * expiry (default 25 minutes — SharePoint issues 30-minute digests).
     */
    requestDigest?: () => Promise<string>;
    /** Additional headers merged into every request. */
    headers?: Record<string, string>;
};

export type RequestOptions = { signal?: AbortSignal };
export type QueryRequestOptions = RequestOptions & { query?: string };
export type GetRecordOptions = QueryRequestOptions;
export type UpsertRecordOptions = QueryRequestOptions & { ifMatch?: string };
export type DeleteRecordOptions = RequestOptions & { ifMatch?: string };

/**
 * How stale the accepted form digest is before the client refreshes it.
 * SharePoint digests last 30 minutes; refresh 5 minutes early.
 */
const DIGEST_REFRESH_MARGIN_MS = 5 * 60 * 1000;
const DIGEST_MAX_AGE_MS = 30 * 60 * 1000;

/**
 * Low-level HTTP client for the SharePoint legacy REST API (`_api/web`,
 * OData v3). All responses use the `application/json;odata=verbose` payload
 * (`d` envelope, `__metadata.etag`, `d.__next` pagination).
 *
 * @example
 * const client = new SharePointClient({
 *   url: "https://contoso.sharepoint.com/sites/dev",
 *   token: "eyJ...", // or: requestDigest: () => context.pageContext.web.getFormDigestToken()
 * });
 */
export class SharePointClient {
    options: Required<Pick<SharePointClientOptions, "url">> & Omit<SharePointClientOptions, "url">;

    /** @param options Connection and authentication options. */
    constructor(options: SharePointClientOptions = {}) {
        const defaultUrl = typeof location !== "undefined" ? location.origin : undefined;
        const url = options.url ?? defaultUrl;
        if (!url) throw new Error("A SharePoint site URL is required outside a browser");
        this.options = { ...options, url: url.replace(/\/+$/, "") };
        this._digestFetched = 0;
        this._cachedDigest = undefined;
    }

    /** Site-scoped `_api` base path (e.g. `https://site/_api`). */
    get api(): string {
        return `${this.options.url}/_api`;
    }

    /** The `web` entry used for list endpoints. */
    resource(path: string, query?: string): string {
        const base = /^https?:\/\//i.test(path) ? path : `${this.api}${path.startsWith("/") ? "" : "/"}${path}`;
        if (!query) return base;
        return `${base}${query.startsWith("?") ? query : `?${query}`}`;
    }

    /**
     * Core HTTP fetch for all SharePoint REST calls. Applies verbose-JSON
     * headers, auth (Bearer or form digest on writes), unwraps the v3 `d`
     * envelope, and normalizes errors into {@link SharePointHttpError}.
     *
     * @example
     * await client.fetch("_api/web/lists")
     */
    async fetch(resource: string, options: RequestInit & { raw?: boolean } = {}): Promise<any> {
        const { raw, ...fetchOptions } = options;
        // Bare paths are `_api`-scoped (the only REST surface this client
        // serves); absolute URLs (e.g. from next links) pass through, and paths
        // that already carry `_api` are honored as-is.
        const url = /^https?:\/\//i.test(resource)
            ? resource
            : resource.replace(/^\/+/, "").startsWith("_api/")
                ? `${this.options.url}/${resource}`.replace(/\/_api\/\/_api\//, "/_api/")
                : `${this.api}${resource.startsWith("/") ? "" : "/"}${resource}`;

        const { token, requestDigest, headers: baseHeaders } = this.options;
        const method = (fetchOptions.method ?? "GET").toUpperCase();
        const isWrite = method !== "GET" && method !== "HEAD";

        const headers: Record<string, string> = {
            // Verbose JSON is the legacy REST contract; v4 "minimalMetadata"
            // responses break the __metadata.etag / d-envelope assumptions.
            ...(raw ? {} : {
                Accept: "application/json;odata=verbose",
                ...(!isWrite ? {} : { "Content-Type": "application/json;odata=verbose" }),
            }),
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...baseHeaders,
            ...fetchOptions.headers,
        } as Record<string, string>;

        // Cookie-auth writes need the form digest; Bearer-auth writes don't.
        if (isWrite && !token && requestDigest) {
            headers["X-RequestDigest"] = await this.getFormDigest();
        }

        const response = await fetch(url, { ...fetchOptions, headers });

        if (raw) return response;

        if (response.status === 204) return;

        const isJson = (response.headers.get("Content-Type") ?? "").includes("json");
        if (!response.ok) {
            const body = isJson ? await response.json() : await response.text();
            const message =
                isJson && body?.error?.message?.value
                    ? `${response.status} ${body.error.message.value}`
                    : `${response.status} ${response.statusText}`;
            throw new SharePointHttpError(message, response.status, response.statusText, body, response);
        }
        if (!isJson) return response.text();

        const data = await response.json();
        return unwrapVerbose(data);
    }

    /**
     * Fetches (and caches) the form-digest value required for writes under
     * cookie-based auth. Prefers the caller-provided `requestDigest` provider
     * (e.g. SPFx `this.context.pageContext.web.getFormDigestToken()`); falls
     * back to calling `/_api/contextinfo` (which doesn't itself need a
     * digest). Digests last 30 minutes; the cached value is refreshed
     * 5 minutes early. Never used when a Bearer `token` is configured.
     */
    async getFormDigest(): Promise<string> {
        if (
            this._cachedDigest &&
            Date.now() - this._digestFetched < DIGEST_MAX_AGE_MS - DIGEST_REFRESH_MARGIN_MS
        ) {
            return this._cachedDigest;
        }
        if (this.options.requestDigest) {
            const digest = await this.options.requestDigest();
            this._cachedDigest = digest;
            this._digestFetched = Date.now();
            return digest;
        }
        const response = await fetch(`${this.api}/contextinfo`, {
            method: "POST",
            headers: {
                Accept: "application/json;odata=verbose",
                ...this.options.headers,
            },
        });
        if (!response.ok) {
            throw new SharePointHttpError(
                `${response.status} ${response.statusText}`,
                response.status,
                response.statusText,
                await response.text(),
                response,
            );
        }
        const data = await response.json();
        const digest =
            data?.d?.GetContextWebInformation?.FormDigestValue ?? data?.GetContextWebInformation?.FormDigestValue;
        if (typeof digest !== "string" || !digest) {
            throw new SharePointHttpError(
                "contextinfo did not return a form digest value",
                response.status,
                response.statusText,
                data,
                response,
            );
        }
        this._cachedDigest = digest;
        this._digestFetched = Date.now();
        return digest;
    }

    private _cachedDigest: string | undefined;
    private _digestFetched: number;

    //
    // --- RECORDS (list items) ---

    /** The REST collection path for a list's items: `_api/web/Lists/GetByTitle('<title>')/Items`. */
    itemsPath(listTitle: string): string {
        return `${this.api}/Web/Lists/GetByTitle('${encodeURIComponent(listTitle)}')/Items`;
    }

    /**
     * Retrieves a single list item by id.
     *
     * @example
     * await client.getRecord("Tasks", 12, "/?$select=Title")
     */
    async getRecord(listTitle: string, id: ListItemId | number, options: GetRecordOptions = {}) {
        const resource = `${this.itemsPath(listTitle)}(${id})${this._q(options.query)}`;
        try {
            return await this.fetch(resource, { signal: options.signal });
        } catch (error: any) {
            if (error?.status === 404) return null;
            throw error;
        }
    }

    /**
     * Retrieves multiple list items (follows `d.__next` pagination).
     *
     * @example
     * await client.getRecords("Tasks", "$select=Title&$top=10")
     */
    async getRecords(
        listTitle: string,
        options: QueryRequestOptions = {},
    ): Promise<any[]> {
        const results: any[] = [];
        for await (const page of this.iteratePages(listTitle, options)) {
            results.push(...page);
        }
        return results;
    }

    async *iterateRecords(
        listTitle: string,
        options: QueryRequestOptions = {},
    ): AsyncGenerator<any> {
        for await (const page of this.iteratePages(listTitle, options)) {
            yield* page;
        }
    }

    async *iteratePages(
        listTitle: string,
        options: QueryRequestOptions = {},
    ): AsyncGenerator<any[]> {
        let next = `${this.itemsPath(listTitle)}${this._q(options.query)}`;
        while (next) {
            const result = await this.fetch(next, { signal: options.signal });
            yield result?.results ?? (Array.isArray(result) ? result : result ? [result] : []);
            // Verbose pagination: `d.__next` holds the full next URL.
            next = result?.__next;
        }
    }

    /**
     * Creates a list item. SharePoint v3 has no `Prefer: return=representation`;
     * the created item (with its `__metadata.etag` and `Id`) is returned in the
     * response body directly.
     */
    async postRecord(listTitle: string, value: object, options: QueryRequestOptions = {}) {
        return this.fetch(this.itemsPath(listTitle) + this._q(options.query), {
            method: "POST",
            body: JSON.stringify(toVerboseBody(value)),
            signal: options.signal,
        });
    }

    /**
     * Partial update via the legacy `POST` + `X-HTTP-Method: MERGE` pattern.
     * MERGE keeps properties the payload doesn't carry, so a full entity body
     * is not required; include the item's `__metadata` (type + etag) in
     * `value.__metadata` for the optimistic concurrency check, or pass
     * `options.ifMatch` explicitly.
     *
     * @example
     * await client.mergeRecord("Tasks", 12, {
     *   __metadata: { type: "SP.Data.TasksListItem", etag: '"2"' },
     *   Status: "Done",
     * });
     */
    async mergeRecord(listTitle: string, id: ListItemId | number, value: object, options: UpsertRecordOptions = {}) {
        const headers: Record<string, string> = {
            "X-HTTP-Method": "MERGE",
        };
        if (options.ifMatch) headers["If-Match"] = options.ifMatch;
        const resource = `${this.itemsPath(listTitle)}(${id})${this._q(options.query)}`;
        try {
            return await this.fetch(resource, {
                method: "POST",
                headers,
                body: JSON.stringify(toVerboseBody(value)),
                signal: options.signal,
            });
        } catch (error: any) {
            if (error?.status === 404) return null;
            throw error;
        }
    }

    /**
     * Deletes a list item via `POST` + `X-HTTP-Method: DELETE`.
     *
     * @example
     * await client.deleteRecord("Tasks", 12, { ifMatch: '"2"' });
     */
    async deleteRecord(listTitle: string, id: ListItemId | number, options: DeleteRecordOptions = {}): Promise<ListItemId> {
        const headers: Record<string, string> = {};
        if (options.ifMatch) headers["If-Match"] = options.ifMatch;
        const resource = `${this.itemsPath(listTitle)}(${id})`;
        await this.fetch(resource, { method: "POST", headers, signal: options.signal });
        return String(id) as ListItemId;
    }

    /** Attaches a query string safely (avoids double `?`). */
    _q(query?: string): string {
        if (!query) return "";
        return query.startsWith("?") ? query : `?${query}`;
    }

    /**
     * Uploads a file into a folder (document library root or sub-folder) via
     * `Files/Add`. Creates the list item along with the content; the response
     * carries the created `File`, including `ListItemAllFields.Id` for a
     * follow-up metadata MERGE.
     *
     * @example
     * const file = await client.addFile("/Shared Documents", "report.pdf", blob);
     * // file.ListItemAllFields.Id → the list item Id for metadata updates
     */
    async addFile(
        folderServerRelativeUrl: string,
        fileName: string,
        content: Blob | ArrayBuffer | Uint8Array,
        options: { overwrite?: boolean; signal?: AbortSignal } = {},
    ) {
        const resource =
            `Web/GetFolderByServerRelativeUrl('${encodePath(folderServerRelativeUrl)}')` +
            `/Files/Add(url='${encodeURIComponent(fileName)}',overwrite='${options.overwrite ?? true}')`;
        return this.fetch(resource, {
            method: "POST",
            headers: { "Content-Type": "application/octet-stream" },
            body: content as any,
            signal: options.signal,
        });
    }

    /**
     * Downloads a file's content by server-relative path via `GetFileByServerRelativeUrl'\)'$value`.
     *
     * @example
     * const blob = await client.getFileContent("/Shared Documents/report.pdf");
     */
    async getFileContent(serverRelativeUrl: string, options: RequestOptions = {}): Promise<Response> {
        return this.fetch(
            `Web/GetFileByServerRelativeUrl('${encodePath(serverRelativeUrl)}')/$value`,
            { raw: true, signal: options.signal },
        );
    }

    /** Inline lists metadata (types, fields) for schema discovery. */
    async getLists(options: QueryRequestOptions = {}) {
        return this.fetch(`${this.api}/Web/Lists${this._q(options.query)}`, { signal: options.signal });
    }

    /** The library/list root folder's server-relative URL (used for file upload). */
    async getRootFolder(listTitle: string): Promise<string> {
        const folder = await this.fetch(`Web/Lists/GetByTitle('${encodeURIComponent(listTitle)}')/RootFolder?$select=ServerRelativeUrl`);
        const value = typeof folder === "object" && folder ? (folder as any).ServerRelativeUrl : undefined;
        if (typeof value !== "string" || !value) {
            throw new Error(`List "${listTitle}" did not return a RootFolder ServerRelativeUrl`);
        }
        return value;
    }

    /**
     * The current authenticated user (cookie session or Bearer identity):
     * the `Web/CurrentUser` REST surface.
     *
     * @example
     * const me = await client.getCurrentUser(); // { id, name, loginName, email }
     */
    async getCurrentUser(): Promise<{ id: number; name: string; loginName: string; email: string }> {
        const data = await this.fetch("Web/CurrentUser?$select=Id,Title,LoginName,Email") ?? {};
        const id = Number((data as any).Id);
        if (!Number.isInteger(id) || id < 1) {
            throw new SharePointHttpError(
                "CurrentUser did not return a valid Id",
                200,
                "OK",
                data,
            );
        }
        return {
            id,
            name: String((data as any).Title ?? ""),
            loginName: String((data as any).LoginName ?? ""),
            email: String((data as any).Email ?? ""),
        };
    }
}

/** Converts `X-HTTP-Method`-unfriendly content — verbose v3 wants every string value plain. */
function toVerboseBody(value: object): object {
    // Dates must be serialized as `YYYY-MM-DDTHH:mm:ss` ISO strings —
    // JSON.stringify already does that for Date instances.
    return value;
}

/**
 * Percent-encodes each path segment but keeps `/` separators intact.
 * `encodeURIComponent` would destroy the server-relative path semantics.
 */
function encodePath(serverRelativeUrl: string): string {
    return serverRelativeUrl.split("/").map(encodeURIComponent).join("/");
}

/**
 * Unwraps the OData v3 verbose envelope: `{ d: { results: [...] }}` → array,
 * `{ d: {...} }` → record. Non-verbose payloads pass through unchanged so
 * callers stay safe if a tenant returns minimal-metadata.
 */
export function unwrapVerbose(data: any): any {
    if (data && typeof data === "object" && "d" in data) {
        const d = data.d;
        if (d && typeof d === "object" && Array.isArray((d as any).results)) return (d as any).results;
        if (d && typeof d === "object" && "results" in (d as any)) return (d as any).results;
        return d;
    }
    return data;
}
