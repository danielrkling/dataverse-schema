import { DataverseKey, GUID } from './types';
import { Name } from './util';
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
export type PreferOption = "return=representation" | "respond-async" | "odata.track-changes" | {
    annotations: "*" | string[];
} | {
    maxPageSize: number;
};
export type RequestOptions = {
    signal?: AbortSignal;
};
export type QueryRequestOptions = RequestOptions & {
    query?: string;
};
export type GetRecordOptions = QueryRequestOptions & {
    etag?: string;
};
export type PatchRecordOptions = QueryRequestOptions & {
    etag?: string;
};
export type DeleteRecordOptions = RequestOptions & {
    etag?: string;
};
export type PostRecordOptions = QueryRequestOptions & {
    returnRepresentation?: boolean;
};
export declare class DataverseHttpError extends Error {
    readonly status: number;
    readonly statusText: string;
    readonly body: unknown;
    readonly response?: Response | undefined;
    constructor(message: string, status: number, statusText: string, body: unknown, response?: Response | undefined);
}
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
export declare class DataverseClient {
    options: DataverseClientOptions;
    /** @param options Connection and authentication options. */
    constructor(options?: DataverseClientOptions);
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
    fetch(resource: string, options?: RequestInit & {
        raw?: boolean;
    }): Promise<any>;
    private _resolvePrefer;
    private _iteratePages;
    private _resource;
    /**
     * Retrieves a single record by ID.
     *
     * @example
     * const account = await client.getRecord("accounts", "00000000-0000-0000-0000-000000000001",
     *   "$select=name,revenue")
     */
    getRecord(entitySetName: Name, id: DataverseKey, options?: GetRecordOptions): Promise<any>;
    /**
     * Retrieves multiple records, automatically following `@odata.nextLink` pagination.
     *
     * @example
     * const accounts = await client.getRecords("accounts",
     *   "$select=name,revenue&$filter=revenue gt 10000")
     */
    getRecords(entitySetName: Name, options?: QueryRequestOptions & {
        pageSize?: number;
    }): Promise<any[]>;
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
    iterateRecords(entitySetName: Name, options?: QueryRequestOptions & {
        pageSize?: number;
    }): AsyncGenerator<any>;
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
    iteratePages(entitySetName: Name, options?: QueryRequestOptions & {
        pageSize?: number;
    }): AsyncGenerator<any[]>;
    /**
     * Creates a record and returns its full representation by default.
     * Pass `returnRepresentation: false` to return only the generated GUID.
     *
     * @example
     * const newAccount = await client.postRecord("accounts",
     *   { name: "New Account", revenue: 50000 })
     * const id = await client.postRecord("accounts", { name: "New Account" },
     *   { returnRepresentation: false })
     */
    postRecord(entitySetName: Name, value: object, options: PostRecordOptions & {
        returnRepresentation: false;
    }): Promise<GUID>;
    postRecord(entitySetName: Name, value: object, options?: PostRecordOptions): Promise<any>;
    /**
     * Updates an existing record (partial update via PATCH).
     *
     * @example
     * await client.patchRecord("accounts", "00000000-0000-0000-0000-000000000001",
     *   { name: "Updated Name", revenue: 75000 })
     */
    patchRecord(entitySetName: Name, id: string, value: object, options?: PatchRecordOptions): Promise<any>;
    /**
     * Deletes a record by ID.
     *
     * @example
     * const deletedId = await client.deleteRecord("accounts",
     *   "00000000-0000-0000-0000-000000000001")
     */
    deleteRecord(entitySetName: Name, id: string, options?: DeleteRecordOptions): Promise<GUID>;
    /**
     * Updates a single property value via PUT.
     *
     * @example
     * await client.updatePropertyValue("accounts",
     *   "00000000-0000-0000-0000-000000000001", "name", "New Name")
     */
    updatePropertyValue(entitySetName: Name, id: string, propertyName: Name, value: any, options?: RequestOptions & {
        etag?: string;
    }): Promise<GUID>;
    /**
     * Deletes (nulls out) a single property value.
     *
     * @example
     * await client.deletePropertyValue("accounts",
     *   "00000000-0000-0000-0000-000000000001", "emailaddress1")
     */
    deletePropertyValue(entitySetName: Name, id: string, propertyName: Name, options?: RequestOptions): Promise<GUID>;
    /**
     * Retrieves a single property value.
     *
     * @example
     * const name = await client.getPropertyValue("accounts",
     *   "00000000-0000-0000-0000-000000000001", "name")
     */
    getPropertyValue(entitySetName: Name, id: string, propertyName: Name, options?: RequestOptions): Promise<any>;
    /**
     * Retrieves a property's raw value (e.g. file content) via `/$value`.
     *
     * @example
     * const imageData = await client.getPropertyRawValue("accounts",
     *   "00000000-0000-0000-0000-000000000001", "entityimage")
     */
    getPropertyRawValue(entitySetName: Name, id: string, propertyName: Name, options?: RequestOptions): Promise<any>;
    /**
     * Returns the URL for a property's raw value.
     *
     * @example
     * const url = client.getPropertyRawValueURL("accounts",
     *   "00000000-0000-0000-0000-000000000001", "entityimage")
     */
    getPropertyRawValueURL(entitySetName: Name, id: string, propertyName: Name): string;
    /**
     * Returns the full-size image download URL.
     *
     * @example
     * const url = client.getImageFullSizeURL("accounts",
     *   "00000000-0000-0000-0000-000000000001", "entityimage")
     */
    getImageFullSizeURL(entitySetName: Name, id: string, propertyName: Name): string;
    /**
     * Returns the legacy image download URL.
     *
     * @example
     * const url = client.getImageDownloadURL("accounts",
     *   "00000000-0000-0000-0000-000000000001", "entityimage")
     */
    getImageDownloadURL(entitySetName: Name, id: string, propertyName: Name): string;
    /**
     * Uploads a file to a file property.
     *
     * @example
     * await client.updateFileProperty("accounts",
     *   "00000000-0000-0000-0000-000000000001",
     *   "myfile", "report.pdf", fileBlob)
     */
    updateFileProperty(entitySetName: Name, id: string, propertyName: Name, filename: string, body: string | Blob | BufferSource, options?: RequestOptions): Promise<any>;
    /**
     * Activates a record (sets statecode to 0).
     *
     * @example
     * await client.activateRecord("accounts",
     *   "00000000-0000-0000-0000-000000000001")
     */
    activateRecord(entitySetName: Name, id: string): Promise<GUID>;
    /**
     * Deactivates a record (sets statecode to 1).
     *
     * @example
     * await client.deactivateRecord("accounts",
     *   "00000000-0000-0000-0000-000000000001")
     */
    deactivateRecord(entitySetName: Name, id: string): Promise<GUID>;
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
    associateRecord(entitySetName: Name, parentId: string, propertyName: Name, childEntitySetName: Name, childId: string, options?: RequestOptions): Promise<GUID>;
    /**
     * Dissociates two records. If childId is omitted, all references are removed.
     *
     * @example
     * await client.dissociateRecord("accounts",
     *   "00000000-0000-0000-0000-000000000001",
     *   "primarycontactid",
     *   "00000000-0000-0000-0000-000000000002")
     */
    dissociateRecord(entitySetName: Name, parentId: string, propertyName: Name, childId?: string, options?: RequestOptions): Promise<GUID>;
    /**
     * Retrieves associated records via a collection navigation property.
     *
     * @example
     * const contacts = await client.getAssociatedRecords("accounts",
     *   "00000000-0000-0000-0000-000000000001",
     *   "contact_customer_accounts",
     *   "$select=fullname,email")
     */
    getAssociatedRecords(entitySetName: Name, id: string, navigationPropertyName: Name, options?: QueryRequestOptions & {
        pageSize?: number;
    }): Promise<any[]>;
    /**
     * Retrieves a single associated record via a single-valued navigation property.
     *
     * @example
     * const contact = await client.getAssociatedRecord("accounts",
     *   "00000000-0000-0000-0000-000000000001",
     *   "primarycontactid",
     *   "$select=fullname,email")
     */
    getAssociatedRecord(entitySetName: Name, id: string, navigationPropertyName: Name, options?: QueryRequestOptions): Promise<any>;
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
    associateRecordToList(entitySetName: Name, parentId: string, propertyName: Name, childEntitySetName: Name, childPrimaryKeyName: Name, childIds: string[]): Promise<GUID[]>;
    /**
     * Executes an unbound Dataverse action (POST).
     *
     * @example
     * const result = await client.executeAction("WinQuote", {
     *   QuoteClose: { ... },
     *   Status: 4,
     * })
     */
    executeAction(actionName: string, params?: Record<string, any>): Promise<any>;
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
    executeBoundAction(entitySetName: Name, actionName: string, params?: Record<string, any>, id?: string): Promise<any>;
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
    executeFunction(functionName: string, params?: Record<string, any>): Promise<any>;
    /**
     * Executes a bound Dataverse function on a specific record (GET).
     *
     * @example
     * const result = await client.executeBoundFunction("accounts",
     *   "00000000-0000-0000-0000-000000000001",
     *   "CalculateDepreciation",
     *   { Year: 2025 })
     */
    executeBoundFunction(entitySetName: Name, id: string, functionName: string, params?: Record<string, any>): Promise<any>;
    /**
     * Creates multiple records in a single API call using CreateMultiple.
     *
     * @example
     * await client.createMultiple("accounts", [
     *   { name: "Account 1" },
     *   { name: "Account 2" },
     * ])
     */
    createMultiple(entitySetName: Name, records: Record<string, any>[]): Promise<any>;
    /**
     * Updates multiple records in a single API call using UpdateMultiple.
     *
     * @example
     * await client.updateMultiple("accounts", [
     *   { accountid: "id1", name: "Updated 1" },
     *   { accountid: "id2", name: "Updated 2" },
     * ])
     */
    updateMultiple(entitySetName: Name, records: Record<string, any>[]): Promise<any>;
    /**
     * Deletes multiple records in a single API call by their IDs.
     *
     * @example
     * await client.deleteMultiple("accounts", [
     *   "00000000-0000-0000-0000-000000000001",
     *   "00000000-0000-0000-0000-000000000002",
     * ])
     */
    deleteMultiple(entitySetName: Name, ids: string[]): Promise<any>;
    _batchTxs: NestedStringArray | null;
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
    batch(fn: () => Promise<void>): Promise<any>;
    _processBatch(resource: string, options: RequestInit): boolean;
    _changeSetTxs: NestedStringArray | null;
    /**
     * Groups multiple write operations into a change set within a batch.
     * All changes in a change set are committed atomically.
     * If not already inside a batch, automatically wraps one.
     *
     * @example
     * await client.changeset(async () => {
     *   await client.postRecord("accounts", { name: "New" }, { returnRepresentation: false });
     *   await client.patchRecord("accounts", "id", { name: "Updated" });
     * })
     */
    changeset(fn: () => Promise<void>): Promise<void>;
    _processChangeset(resource: string, options: RequestInit): boolean;
}
type NestedStringArray = Array<string | NestedStringArray>;
export {};
