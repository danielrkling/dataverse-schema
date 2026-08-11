import { DataverseKey, GUID } from "./types";
import { getName, Name } from "./util";
import { wrapString } from "./util";

const parenthesesRegEx = /\(([^)]+)\)/;

/**
 * A single Prefer value — either a raw string or a structured object
 * for annotations and page size.
 *
 * @example
 * // String form
 * const options: PreferOption[] = ["return=representation", "odata.track-changes"];
 *
 * @example
 * // Object form for annotations
 * const options: PreferOption[] = [{ annotations: "*" }];
 *
 * @example
 * // Object form for page size
 * const options: PreferOption[] = [{ maxPageSize: 500 }];
 */
export type PreferOption =
    | "return=representation"
    | "respond-async"
    | "odata.track-changes"
    | { annotations: "*" | string[] }
    | { maxPageSize: number };

/** Options for configuring a DataverseClient instance. */
export type DataverseClientOptions = {
    /** Base URL of the Dataverse environment (defaults to `location.origin`). */
    url?: string;
    /** Bearer token for authentication. */
    token?: string;
    /** Azure AD object ID to impersonate (sets CallerObjectId header). */
    impersonateByAAId?: string;
    /** Dataverse user ID to impersonate (sets MSCRMCallerID header). */
    impersonateByUserId?: string;
    /**
     * OData Prefer header values. Accepts an array of strings or structured objects.
     *
     * @example
     * ```ts
     * prefer: ["return=representation", { annotations: "*" }, { maxPageSize: 500 }]
     * ```
     */
    prefer?: PreferOption[];
    /** Use `"Strong"` to bypass caching and get the latest version. */
    consistency?: "Strong";
    /** Solution unique name — associates the request with an unmanaged solution. */
    solutionUniqueName?: string;
    /** Set to `true` to enable duplicate detection on create/update. */
    suppressDuplicateDetection?: boolean;
    /** Set to `true` to bypass custom plug-in execution (requires prvBypassCustomPlugins privilege). */
    bypassCustomPluginExecution?: boolean;
    /** Additional headers to include on every request. */
    headers?: Record<string, string>;
};

/**
 * Low-level HTTP client for the Dataverse Web API (v9.2).
 * Provides CRUD, batch, action, function, and bulk operation methods.
 *
 * @example
 * const client = new DataverseClient({
 *   url: "https://org.crm.dynamics.com",
 *   token: "eyJ...",
 * });
 *
 * @example
 * // With impersonation
 * const client = new DataverseClient({
 *   url: "https://org.crm.dynamics.com",
 *   impersonateByUserId: "00000000-0000-0000-0000-000000000001",
 * });
 */
export class DataverseClient {
    options: DataverseClientOptions;

    /** @param options Connection and authentication options. */
    constructor(options: DataverseClientOptions = {}) {
        this.options = {
            url: location.origin,
            ...options,
        };
    }

    /**
     * Core HTTP fetch method for all Dataverse API calls.
     * Automatically prepends the API base path, applies auth headers,
     * handles 204/304 responses, and extracts OData-EntityId from POST headers.
     *
     * @example
     * await client.fetch("accounts?$select=name&$top=5")
     *
     * @example
     * await client.fetch("accounts", {
     *   method: "POST",
     *   body: JSON.stringify({ name: "New Account" }),
     * })
     */
    async fetch(resource: string, options: RequestInit & { raw?: boolean } = {}): Promise<any> {
        if (this._processChangeset(resource, options)) return;
        if (this._processBatch(resource, options)) return;
        const { raw, ...fetchOptions } = options;
        // Handle full URLs from @odata.nextLink
        const url = resource.startsWith("http") ? resource : `${this.options.url}/api/data/v9.2/${resource}`;

        const {
            headers, impersonateByAAId, impersonateByUserId, token,
            prefer, consistency, solutionUniqueName,
            suppressDuplicateDetection, bypassCustomPluginExecution,
        } = this.options;

        const response = await fetch(url, {
            ...fetchOptions,
            headers: {
                "OData-MaxVersion": "4.0",
                "OData-Version": "4.0",
                Accept: "application/json",
                "Content-Type": "application/json; charset=utf-8",
                "If-None-Match": "null",
                ...(impersonateByUserId ? { MSCRMCallerID: impersonateByUserId } : {}),
                ...(impersonateByAAId ? { CallerObjectId: impersonateByAAId } : {}),
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
                ...(prefer?.length ? { Prefer: this._resolvePrefer(prefer) } : {}),
                ...(consistency ? { Consistency: consistency } : {}),
                ...(solutionUniqueName ? { "MSCRM.SolutionUniqueName": solutionUniqueName } : {}),
                ...(suppressDuplicateDetection !== undefined ? { "MSCRM.SuppressDuplicateDetection": String(suppressDuplicateDetection) } : {}),
                ...(bypassCustomPluginExecution !== undefined ? { "MSCRM.BypassCustomPluginExecution": String(bypassCustomPluginExecution) } : {}),
                ...headers,
                ...fetchOptions.headers,
            },
        });

        if (raw) return response;

        if (response.status === 204) {
            // No Content
            const entityId = response.headers.get("OData-EntityId");
            if (entityId) return parenthesesRegEx.exec(entityId)?.[1];
            return;
        }

        if (response.status === 304) {
            // Not Modified (conditional GET)
            return null;
        }

        if (response.headers.get("Content-Type")?.includes("application/json")) {
            const data = await response.json();
            if (data.error) {
                if (data.error.code === "0x80060891") return null; // Record not Found
                throw data.error;
            }
            return data;
        }

        if (!response.ok) {
            throw new Error(response.status + "-" + response.statusText);
        }

        return await response.text();
    }

    //
    // --- PRIVATE HELPER METHODS ---
    //

    private _resolvePrefer(prefer: PreferOption[]): string {
        return prefer
            .map((p) => {
                if (typeof p === "string") return p;
                if ("annotations" in p) {
                    const v = Array.isArray(p.annotations) ? p.annotations.join(",") : p.annotations;
                    return `odata.include-annotations="${v}"`;
                }
                if ("maxPageSize" in p) return `odata.maxpagesize=${p.maxPageSize}`;
                return "";
            })
            .filter(Boolean)
            .join(",");
    }

    private async *_iteratePages(
        resource: string,
        pageSize?: number,
    ): AsyncGenerator<any[]> {
        const extraHeaders: Record<string, string> = {};
        if (pageSize) {
            const basePrefer = this._resolvePrefer(this.options.prefer ?? []);
            extraHeaders["Prefer"] = basePrefer
                ? `${basePrefer},odata.maxpagesize=${pageSize}`
                : `odata.maxpagesize=${pageSize}`;
        }
        let nextLink: string | undefined = resource;
        while (nextLink) {
            const result = await this.fetch(nextLink, { headers: extraHeaders });
            yield result.value;
            nextLink = result["@odata.nextLink"];
        }
    }

    //
    // --- PUBLIC API METHODS ---
    //

    /**
     * Retrieves a single record by ID.
     *
     * @example
     * const account = await client.getRecord("accounts", "00000000-0000-0000-0000-000000000001",
     *   "$select=name,revenue")
     */
    async getRecord(entitySetName: Name, id: DataverseKey, query: string = "", etag?: string) {
        const resource = `${getName(entitySetName)}(${id})?${query}`;
        if (etag) {
            return this.fetch(resource, { headers: { "If-None-Match": etag } as Record<string, string> });
        }
        return this.fetch(resource);
    }

    /**
     * Retrieves multiple records, automatically following `@odata.nextLink` pagination.
     *
     * @example
     * const accounts = await client.getRecords("accounts",
     *   "$select=name,revenue&$filter=revenue gt 10000")
     */
    async getRecords(entitySetName: Name, query: string = ""): Promise<any[]> {
        const results: any[] = [];
        for await (const page of this.iteratePages(entitySetName, query)) {
            results.push(...page);
        }
        return results;
    }

    /**
     * Iterates over records one at a time, lazily following `@odata.nextLink` pagination.
     * Records within a page are yielded synchronously once the page arrives; only page
     * boundaries trigger HTTP requests. A `break` stops further requests.
     *
     * @param entitySetName The entity set to query (e.g. `"accounts"`).
     * @param query OData query string (e.g. `"$select=name&$top=10"`).
     * @param options Optional page-size control.
     *
     * @example
     * for await (const account of client.iterateRecords("accounts", "$select=name", { pageSize: 100 })) {
     *   console.log(account.name);
     * }
     */
    async *iterateRecords(
        entitySetName: Name,
        query: string = "",
        options?: { pageSize?: number },
    ): AsyncGenerator<any> {
        for await (const page of this.iteratePages(entitySetName, query, options)) {
            yield* page;
        }
    }

    /**
     * Iterates over pages of records, lazily following `@odata.nextLink` pagination.
     * The next page is only fetched when the consumer requests it, so `break`
     * stops further requests. Prefer this over {@link iterateRecords} when you
     * want to iterate a page's array synchronously.
     *
     * @param entitySetName The entity set to query (e.g. `"accounts"`).
     * @param query OData query string (e.g. `"$select=name&$top=10"`).
     * @param options Optional page-size control.
     *
     * @example
     * for await (const page of client.iteratePages("accounts", "$select=name", { pageSize: 100 })) {
     *   for (const account of page) console.log(account.name);
     * }
     */
    async *iteratePages(
        entitySetName: Name,
        query: string = "",
        options?: { pageSize?: number },
    ): AsyncGenerator<any[]> {
        yield* this._iteratePages(`${entitySetName}?${query}`, options?.pageSize);
    }

    /**
     * Creates a record and returns its full representation.
     *
     * @example
     * const newAccount = await client.postRecord("accounts",
     *   { name: "New Account", revenue: 50000 })
     */
    async postRecord(entitySetName: Name, value: object, query: string = "") {
        return this.fetch(`${getName(entitySetName)}?${query}`, {
            method: "POST",
            headers: { Prefer: "return=representation" },
            body: JSON.stringify(value),
        });
    }

    /**
     * Creates a record and returns only its GUID (no Prefer header).
     *
     * @example
     * const id = await client.postRecordGetId("accounts",
     *   { name: "New Account" })
     * // id: "00000000-0000-0000-0000-000000000001"
     */
    async postRecordGetId(entitySetName: Name, value: object): Promise<GUID> {
        return this.fetch(getName(entitySetName), {
            method: "POST",
            body: JSON.stringify(value),
        });
    }

    /**
     * Updates an existing record (partial update via PATCH).
     *
     * @example
     * await client.patchRecord("accounts", "00000000-0000-0000-0000-000000000001",
     *   { name: "Updated Name", revenue: 75000 })
     */
    async patchRecord(entitySetName: Name, id: string, value: object, query: string = "", etag?: string) {
        const extraHeaders: Record<string, string> = { Prefer: "return=representation" };
        if (etag) extraHeaders["If-Match"] = etag;
        return this.fetch(`${getName(entitySetName)}(${id})?${query}`, {
            method: "PATCH",
            headers: extraHeaders,
            body: JSON.stringify(value),
        });
    }

    /**
     * Deletes a record by ID.
     *
     * @example
     * const deletedId = await client.deleteRecord("accounts",
     *   "00000000-0000-0000-0000-000000000001")
     */
    async deleteRecord(entitySetName: Name, id: string, etag?: string): Promise<GUID> {
        const options: RequestInit = { method: "DELETE" };
        if (etag) options.headers = { "If-Match": etag } as Record<string, string>;
        await this.fetch(`${getName(entitySetName)}(${id})`, options);
        return id as GUID;
    }

    /**
     * Updates a single property value via PUT.
     *
     * @example
     * await client.updatePropertyValue("accounts",
     *   "00000000-0000-0000-0000-000000000001", "name", "New Name")
     */
    async updatePropertyValue(entitySetName: Name, id: string, propertyName: Name, value: any, etag?: string): Promise<GUID> {
        const options: RequestInit = {
            method: "PUT",
            body: JSON.stringify({ value }),
        };
        if (etag) options.headers = { "If-Match": etag } as Record<string, string>;
        await this.fetch(`${getName(entitySetName)}(${id})/${getName(propertyName)}`, options);
        return id as GUID;
    }

    /**
     * Deletes (nulls out) a single property value.
     *
     * @example
     * await client.deletePropertyValue("accounts",
     *   "00000000-0000-0000-0000-000000000001", "emailaddress1")
     */
    async deletePropertyValue(entitySetName: Name, id: string, propertyName: Name): Promise<GUID> {
        await this.fetch(`${getName(entitySetName)}(${id})/${getName(propertyName)}`, {
            method: "DELETE",
        });
        return id as GUID;
    }

    /**
     * Retrieves a single property value.
     *
     * @example
     * const name = await client.getPropertyValue("accounts",
     *   "00000000-0000-0000-0000-000000000001", "name")
     */
    async getPropertyValue(entitySetName: Name, id: string, propertyName: Name): Promise<any> {
        return this.fetch(`${getName(entitySetName)}(${id})/${getName(propertyName)}`).then((r) => r.value);
    }

    /**
     * Retrieves a property's raw value (e.g. file content) via `/$value`.
     *
     * @example
     * const imageData = await client.getPropertyRawValue("accounts",
     *   "00000000-0000-0000-0000-000000000001", "entityimage")
     */
    async getPropertyRawValue(entitySetName: Name, id: string, propertyName: Name): Promise<any> {
        return this.fetch(`${getName(entitySetName)}(${id})/${getName(propertyName)}/$value`);
    }

    /**
     * Returns the URL for a property's raw value.
     *
     * @example
     * const url = client.getPropertyRawValueURL("accounts",
     *   "00000000-0000-0000-0000-000000000001", "entityimage")
     */
    getPropertyRawValueURL(entitySetName: Name, id: string, propertyName: Name): string {
        return `${this.options.url}/api/data/v9.2/${getName(entitySetName)}(${id})/${getName(propertyName)}/$value`;
    }

    /**
     * Returns the full-size image download URL.
     *
     * @example
     * const url = client.getImageFullSizeURL("accounts",
     *   "00000000-0000-0000-0000-000000000001", "entityimage")
     */
    getImageFullSizeURL(entitySetName: Name, id: string, propertyName: Name): string {
        return `${this.options.url}/api/data/v9.2/${getName(entitySetName)}(${id})/${getName(propertyName)}/$value?size=full`;
    }

    /**
     * Returns the legacy image download URL.
     *
     * @example
     * const url = client.getImageDownloadURL("accounts",
     *   "00000000-0000-0000-0000-000000000001", "entityimage")
     */
    getImageDownloadURL(entitySetName: Name, id: string, propertyName: Name): string {
        return `${this.options.url}/Image/download.aspx?Entity=${getName(entitySetName)}&Attribute=${getName(propertyName)}&Id=${id}&Full=true`;
    }

    /**
     * Uploads a file to a file property.
     *
     * @example
     * await client.updateFileProperty("accounts",
     *   "00000000-0000-0000-0000-000000000001",
     *   "myfile", "report.pdf", fileBlob)
     */
    async updateFileProperty(entitySetName: Name, id: string, propertyName: Name, filename: string, body: string | Blob | BufferSource) {
        return this.fetch(`${getName(entitySetName)}(${id})/${getName(propertyName)}`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/octet-stream",
                "x-ms-file-name": filename,
            },
            body,
        });
    }

    // fetchBlob removed — use fetch(resource, { raw: true }).then(r => r.blob())

    /**
     * Activates a record (sets statecode to 0).
     *
     * @example
     * await client.activateRecord("accounts",
     *   "00000000-0000-0000-0000-000000000001")
     */
    async activateRecord(entitySetName: Name, id: string): Promise<GUID> {
        return this.updatePropertyValue(entitySetName, id, "statecode", 0);
    }

    /**
     * Deactivates a record (sets statecode to 1).
     *
     * @example
     * await client.deactivateRecord("accounts",
     *   "00000000-0000-0000-0000-000000000001")
     */
    async deactivateRecord(entitySetName: Name, id: string): Promise<GUID> {
        return this.updatePropertyValue(entitySetName, id, "statecode", 1);
    }

    /**
     * Associates two records via a navigation property.
     *
     * @example
     * await client.associateRecord("accounts",
     *   "00000000-0000-0000-0000-000000000001",
     *   "primarycontactid",
     *   "contacts",
     *   "00000000-0000-0000-0000-000000000002")
     */
    async associateRecord(
        entitySetName: Name,
        parentId: string,
        propertyName: Name,
        childEntitySetName: Name,
        childId: string,
    ): Promise<GUID> {
        await this.fetch(`${getName(entitySetName)}(${parentId})/${getName(propertyName)}/$ref`, {
            method: "PUT",
            body: JSON.stringify({
                "@odata.id": `${this.options.url}/api/data/v9.2/${getName(childEntitySetName)}(${childId})`,
            }),
        });
        return childId as GUID;
    }

    /**
     * Dissociates two records. If childId is omitted, all references are removed.
     *
     * @example
     * await client.dissociateRecord("accounts",
     *   "00000000-0000-0000-0000-000000000001",
     *   "primarycontactid",
     *   "00000000-0000-0000-0000-000000000002")
     */
    async dissociateRecord(entitySetName: Name, parentId: string, propertyName: Name, childId?: string): Promise<GUID> {
        const resource = `${getName(entitySetName)}(${parentId})/${getName(propertyName)}${childId ? `(${childId})` : ""}/$ref`;
        await this.fetch(resource, { method: "DELETE" });
        return (childId ?? parentId) as GUID;
    }

    /**
     * Retrieves associated records via a collection navigation property.
     *
     * @example
     * const contacts = await client.getAssociatedRecords("accounts",
     *   "00000000-0000-0000-0000-000000000001",
     *   "contact_customer_accounts",
     *   "$select=fullname,email")
     */
    async getAssociatedRecords(
        entitySetName: Name,
        id: string,
        navigationPropertyName: Name,
        query: string = "",
    ): Promise<any[]> {
        const resource = `${getName(entitySetName)}(${id})/${getName(navigationPropertyName)}?${query}`;
        return this.fetch(resource).then((r) => r.value);
    }

    /**
     * Retrieves a single associated record via a single-valued navigation property.
     *
     * @example
     * const contact = await client.getAssociatedRecord("accounts",
     *   "00000000-0000-0000-0000-000000000001",
     *   "primarycontactid",
     *   "$select=fullname,email")
     */
    async getAssociatedRecord(entitySetName: Name, id: string, navigationPropertyName: Name, query: string = "") {
        const resource = `${getName(entitySetName)}(${id})/${getName(navigationPropertyName)}?${query}`;
        return this.fetch(resource);
    }

    /**
     * Synchronizes a list of associated records: adds new ones and removes ones
     * no longer in the list.
     *
     * @example
     * await client.associateRecordToList("accounts",
     *   "00000000-0000-0000-0000-000000000001",
     *   "contact_customer_accounts",
     *   "contacts",
     *   "contactid",
     *   ["id1", "id2", "id3"])
     */
    async associateRecordToList(
        entitySetName: Name,
        parentId: string,
        propertyName: Name,
        childEntitySetName: Name,
        childPrimaryKeyName: Name,
        childIds: string[],
    ): Promise<GUID[]> {
        const currentAssociated = await this.getAssociatedRecords(
            entitySetName,
            parentId,
            propertyName,
            `$select=${getName(childPrimaryKeyName)}`,
        );
        const currentIds = currentAssociated.map((r) => r[getName(childPrimaryKeyName)]);

        const promises: Promise<any>[] = [];

        // Associate new records
        for (const id of childIds) {
            if (!currentIds.includes(id)) {
                promises.push(this.associateRecord(entitySetName, parentId, propertyName, childEntitySetName, id));
            }
        }

        // Dissociate old records
        for (const id of currentIds) {
            if (!childIds.includes(id)) {
                promises.push(this.dissociateRecord(entitySetName, parentId, propertyName, id));
            }
        }

        await Promise.all(promises);
        return childIds as GUID[];
    }

    //
    // --- ACTIONS (POST - have side effects) ---
    //

    /**
     * Executes an unbound Dataverse action (POST).
     *
     * @example
     * const result = await client.executeAction("WinQuote", {
     *   QuoteClose: { ... },
     *   Status: 4,
     * })
     */
    async executeAction(actionName: string, params?: Record<string, any>): Promise<any> {
        return this.fetch(actionName, {
            method: "POST",
            body: params ? JSON.stringify(params) : undefined,
        });
    }

    /**
     * Executes a bound Dataverse action on a specific record or entity set (POST).
     *
     * @example
     * // Bound to a record
     * await client.executeBoundAction("accounts",
     *   "WinQuote", { Status: 4 },
     *   "00000000-0000-0000-0000-000000000001")
     *
     * @example
     * // Bound to an entity set (no id)
     * await client.executeBoundAction("accounts", "BulkDelete", { Query: ... })
     */
    async executeBoundAction(
        entitySetName: Name,
        actionName: string,
        params?: Record<string, any>,
        id?: string,
    ): Promise<any> {
        const path = id
            ? `${getName(entitySetName)}(${id})/Microsoft.Dynamics.CRM.${actionName}`
            : `${getName(entitySetName)}/Microsoft.Dynamics.CRM.${actionName}`;
        return this.fetch(path, {
            method: "POST",
            body: params ? JSON.stringify(params) : undefined,
        });
    }

    //
    // --- FUNCTIONS (GET - no side effects) ---
    //

    /**
     * Executes an unbound Dataverse function (GET).
     *
     * @example
     * const result = await client.executeFunction("WhoAmI")
     *
     * @example
     * const result = await client.executeFunction("CalculateTotalTime",
     *   { Start: "2025-01-01", End: "2025-12-31" })
     */
    async executeFunction(functionName: string, params?: Record<string, any>): Promise<any> {
        const paramString = params
            ? `(${Object.entries(params).map(([k, v]) => `${k}=${wrapString(v)}`).join(",")})`
            : "()";
        return this.fetch(`${functionName}${paramString}`);
    }

    /**
     * Executes a bound Dataverse function on a specific record (GET).
     *
     * @example
     * const result = await client.executeBoundFunction("accounts",
     *   "00000000-0000-0000-0000-000000000001",
     *   "CalculateDepreciation",
     *   { Year: 2025 })
     */
    async executeBoundFunction(
        entitySetName: Name,
        id: string,
        functionName: string,
        params?: Record<string, any>,
    ): Promise<any> {
        const paramString = params
            ? `(${Object.entries(params).map(([k, v]) => `${k}=${wrapString(v)}`).join(",")})`
            : "()";
        return this.fetch(
            `${getName(entitySetName)}(${id})/Microsoft.Dynamics.CRM.${functionName}${paramString}`
        );
    }

    //
    // --- BULK OPERATIONS ---
    //

    /**
     * Creates multiple records in a single API call using CreateMultiple.
     *
     * @example
     * await client.createMultiple("accounts", [
     *   { name: "Account 1" },
     *   { name: "Account 2" },
     * ])
     */
    async createMultiple(entitySetName: Name, records: Record<string, any>[]): Promise<any> {
        return this.fetch(
            `${getName(entitySetName)}/Microsoft.Dynamics.CRM.CreateMultiple`,
            { method: "POST", body: JSON.stringify({ Targets: records }) },
        );
    }

    /**
     * Updates multiple records in a single API call using UpdateMultiple.
     *
     * @example
     * await client.updateMultiple("accounts", [
     *   { accountid: "id1", name: "Updated 1" },
     *   { accountid: "id2", name: "Updated 2" },
     * ])
     */
    async updateMultiple(entitySetName: Name, records: Record<string, any>[]): Promise<any> {
        return this.fetch(
            `${getName(entitySetName)}/Microsoft.Dynamics.CRM.UpdateMultiple`,
            { method: "POST", body: JSON.stringify({ Targets: records }) },
        );
    }

    /**
     * Deletes multiple records in a single API call by their IDs.
     *
     * @example
     * await client.deleteMultiple("accounts", [
     *   "00000000-0000-0000-0000-000000000001",
     *   "00000000-0000-0000-0000-000000000002",
     * ])
     */
    async deleteMultiple(entitySetName: Name, ids: string[]): Promise<any> {
        const targets = ids.map(id => ({
            "@odata.id": `${this.options.url}/api/data/v9.2/${getName(entitySetName)}(${id})`,
        }));
        return this.fetch(
            `${getName(entitySetName)}/Microsoft.Dynamics.CRM.DeleteMultiple`,
            { method: "POST", body: JSON.stringify({ Targets: targets }) },
        );
    }

    _batchTxs: NestedStringArray | null = null;

    /**
     * Groups multiple requests into a batch for improved performance.
     * All fetch() calls inside the callback are collected and sent as a single
     * HTTP request.
     *
     * @example
     * await client.batch(async () => {
     *   await client.getRecord("accounts", "id1", "$select=name");
     *   await client.getRecord("accounts", "id2", "$select=name");
     * })
     */
    async batch(fn: () => Promise<void>) {
        if (this._batchTxs) throw new Error("Cannot nest batches")
        let tx: NestedStringArray | null = [];
        this._batchTxs = tx;
        try {
            await fn();
        } finally {
            tx = this._batchTxs;
            this._batchTxs = null;
        }
        if (!tx) return;

        const batchId = crypto.randomUUID();

        const body = [tx.map((v, i) => [`--batch_${batchId}`, v]), `--batch_${batchId}--`].flat(10).join("\n");

        const result = await this.fetch("$batch", {
            method: "POST",
            headers: {
                "Content-Type": `multipart/mixed; boundary="batch_${batchId}"`,
            },
            body,
        });

        return result
    }

    _processBatch(resource: string, options: RequestInit): boolean {
        if (!this._batchTxs) return false;

        this._batchTxs.push([
            `${options.method} /api/data/v9.2/${resource} HTTP/1.1`,
            `Content-Type: ${(options.headers as Record<string, string>)?.["Content-Type"]}`,
            "",
            options.body?.toString() ?? "",
        ]);

        return true;
    }

    _changeSetTxs: NestedStringArray | null = null;

    /**
     * Groups multiple write operations into a change set within a batch.
     * All changes in a change set are committed atomically.
     * If not already inside a batch, automatically wraps one.
     *
     * @example
     * await client.changeset(async () => {
     *   await client.postRecordGetId("accounts", { name: "New" });
     *   await client.patchRecord("accounts", "id", { name: "Updated" });
     * })
     */
    async changeset(fn: () => Promise<void>): Promise<void> {
        if (this._changeSetTxs) throw new Error("Cannot nest changesets")
        if (!this._batchTxs) return this.batch(()=>this.changeset(fn))
        this._changeSetTxs = [];
        try {
            await fn();
        } finally {
            const id = crypto.randomUUID();
            this._batchTxs!.push([
                `Content-Type: multipart/mixed; boundary="changeset_${id}"`,
                "",
                this._changeSetTxs.map((v, i) => [
                    `--changeset_${id}`,
                    `Content-Type: application/http`,
                    `Content-Transfer-Encoding: binary`,
                    `Content-ID: ${i + 1}`,
                    "",
                    v,
                ]),
                `--changeset_${id}--`,
            ]);
            this._changeSetTxs = null;
        }
    }

    _processChangeset(resource: string, options: RequestInit): boolean {
        if (!this._batchTxs) return false;
        if (!this._changeSetTxs) return false;

        // console.log("processChangeset", resource, options)

        this._changeSetTxs.push([
            `${options.method} /api/data/v9.2/${resource} HTTP/1.1`,
            `Content-Type: application/json; type=entry`,
            "",
            options.body?.toString() ?? "",
        ]);

        return true;
    }
}

type NestedStringArray = Array<string | NestedStringArray>;
