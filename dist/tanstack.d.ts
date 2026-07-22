import { CollectionConfig } from '@tanstack/db';
import { DeleteMutationFn } from '@tanstack/db';
import { InsertMutationFn } from '@tanstack/db';
import { UpdateMutationFn } from '@tanstack/db';
import { UtilsRecord } from '@tanstack/db';
import * as v from 'valibot';

/**
 * Represents an alternate key for a Dataverse entity.  An alternate key is used
 * to uniquely identify a record instead of using its primary key (GUID).
 * It can be a single key-value pair or a combination of multiple key-value pairs.
 */
declare type AlternateKey = `${string}=${string}` | `${string}=${string},${string}=${string}`;

declare class BooleanField extends FieldBase<boolean> {
    kind: "value";
    type: "boolean";
    constructor(name: string, options?: FieldOptions<boolean>);
}

declare class ChoiceField<T extends Record<number, string>> extends FieldBase<T[keyof T]> {
    #private;
    kind: "value";
    type: "choice";
    constructor(name: string, options: T, fieldOptions?: FieldOptions<T[keyof T]>);
    transformValueFromDataverse(value: any): T[keyof T];
    transformValueToDataverse(value: any): number;
}

declare class CollectionIdsProperty extends FieldBase<GUID[]> {
    #private;
    kind: "navigation";
    type: "collectionIds";
    constructor(name: string, getTable: GetTable, options?: FieldOptions<GUID[]>);
    get table(): DataverseTable<{
        id: PrimaryKeyField;
    }>;
    transformValueFromDataverse(value: any): GUID[];
    transformValueToDataverse(): typeof SKIP;
}

declare class CollectionProperty<TProperties extends GenericProperties> extends FieldBase<Infer<TProperties>[]> {
    #private;
    kind: "navigation";
    type: "collection";
    constructor(name: string, getTable: GetTable<DataverseTable<TProperties>>, options?: FieldOptions<Infer<TProperties>[]>);
    get table(): DataverseTable<TProperties>;
    transformValueFromDataverse(value: any): Infer<TProperties>[];
    transformValueToDataverse(): typeof SKIP;
}

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
declare class DataverseClient {
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
    private _getNextLink;
    /**
     * Retrieves a single record by ID.
     *
     * @example
     * const account = await client.getRecord("accounts", "00000000-0000-0000-0000-000000000001",
     *   "$select=name,revenue")
     */
    getRecord(entitySetName: Name, id: DataverseKey, query?: string, etag?: string): Promise<any>;
    /**
     * Retrieves multiple records, automatically following `@odata.nextLink` pagination.
     *
     * @example
     * const accounts = await client.getRecords("accounts",
     *   "$select=name,revenue&$filter=revenue gt 10000")
     */
    getRecords(entitySetName: Name, query?: string): Promise<any[]>;
    /**
     * Creates a record and returns its full representation.
     *
     * @example
     * const newAccount = await client.postRecord("accounts",
     *   { name: "New Account", revenue: 50000 })
     */
    postRecord(entitySetName: Name, value: object, query?: string): Promise<any>;
    /**
     * Creates a record and returns only its GUID (no Prefer header).
     *
     * @example
     * const id = await client.postRecordGetId("accounts",
     *   { name: "New Account" })
     * // id: "00000000-0000-0000-0000-000000000001"
     */
    postRecordGetId(entitySetName: Name, value: object): Promise<GUID>;
    /**
     * Updates an existing record (partial update via PATCH).
     *
     * @example
     * await client.patchRecord("accounts", "00000000-0000-0000-0000-000000000001",
     *   { name: "Updated Name", revenue: 75000 })
     */
    patchRecord(entitySetName: Name, id: string, value: object, query?: string, etag?: string): Promise<any>;
    /**
     * Deletes a record by ID.
     *
     * @example
     * const deletedId = await client.deleteRecord("accounts",
     *   "00000000-0000-0000-0000-000000000001")
     */
    deleteRecord(entitySetName: Name, id: string, etag?: string): Promise<GUID>;
    /**
     * Updates a single property value via PUT.
     *
     * @example
     * await client.updatePropertyValue("accounts",
     *   "00000000-0000-0000-0000-000000000001", "name", "New Name")
     */
    updatePropertyValue(entitySetName: Name, id: string, propertyName: Name, value: any, etag?: string): Promise<GUID>;
    /**
     * Deletes (nulls out) a single property value.
     *
     * @example
     * await client.deletePropertyValue("accounts",
     *   "00000000-0000-0000-0000-000000000001", "emailaddress1")
     */
    deletePropertyValue(entitySetName: Name, id: string, propertyName: Name): Promise<GUID>;
    /**
     * Retrieves a single property value.
     *
     * @example
     * const name = await client.getPropertyValue("accounts",
     *   "00000000-0000-0000-0000-000000000001", "name")
     */
    getPropertyValue(entitySetName: Name, id: string, propertyName: Name): Promise<any>;
    /**
     * Retrieves a property's raw value (e.g. file content) via `/$value`.
     *
     * @example
     * const imageData = await client.getPropertyRawValue("accounts",
     *   "00000000-0000-0000-0000-000000000001", "entityimage")
     */
    getPropertyRawValue(entitySetName: Name, id: string, propertyName: Name): Promise<any>;
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
    updateFileProperty(entitySetName: Name, id: string, propertyName: Name, filename: string, body: string | Blob | BufferSource): Promise<any>;
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
    associateRecord(entitySetName: Name, parentId: string, propertyName: Name, childEntitySetName: Name, childId: string): Promise<GUID>;
    /**
     * Dissociates two records. If childId is omitted, all references are removed.
     *
     * @example
     * await client.dissociateRecord("accounts",
     *   "00000000-0000-0000-0000-000000000001",
     *   "primarycontactid",
     *   "00000000-0000-0000-0000-000000000002")
     */
    dissociateRecord(entitySetName: Name, parentId: string, propertyName: Name, childId?: string): Promise<GUID>;
    /**
     * Retrieves associated records via a collection navigation property.
     *
     * @example
     * const contacts = await client.getAssociatedRecords("accounts",
     *   "00000000-0000-0000-0000-000000000001",
     *   "contact_customer_accounts",
     *   "$select=fullname,email")
     */
    getAssociatedRecords(entitySetName: Name, id: string, navigationPropertyName: Name, query?: string): Promise<any[]>;
    /**
     * Retrieves a single associated record via a single-valued navigation property.
     *
     * @example
     * const contact = await client.getAssociatedRecord("accounts",
     *   "00000000-0000-0000-0000-000000000001",
     *   "primarycontactid",
     *   "$select=fullname,email")
     */
    getAssociatedRecord(entitySetName: Name, id: string, navigationPropertyName: Name, query?: string): Promise<any>;
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
     *   await client.postRecordGetId("accounts", { name: "New" });
     *   await client.patchRecord("accounts", "id", { name: "Updated" });
     * })
     */
    changeset(fn: () => Promise<void>): Promise<void>;
    _processChangeset(resource: string, options: RequestInit): boolean;
}

/** Options for configuring a DataverseClient instance. */
declare type DataverseClientOptions = {
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

export declare type DataverseCollectionConfig<T extends GenericProperties> = {
    id?: string;
    table: DataverseTable<T>;
    query?: QueryForTable<Infer<T>>;
    getKey?: (item: Infer<T>) => string | number;
    onInsert?: InsertMutationFn<Infer<T>>;
    onUpdate?: UpdateMutationFn<Infer<T>>;
    onDelete?: DeleteMutationFn<Infer<T>>;
} & Omit<CollectionConfig<Infer<T>>, "sync" | "getKey" | "onInsert" | "onUpdate" | "onDelete">;

export declare function dataverseCollectionOptions<T extends GenericProperties>(config: DataverseCollectionConfig<T>): CollectionConfig<Infer<T>, string | number, never, DataverseCollectionUtils> & {
    utils: DataverseCollectionUtils;
};

export declare interface DataverseCollectionUtils extends UtilsRecord {
    forceSync: () => Promise<void>;
}

/**
 * Represents a Dataverse key, which can be either a GUID (primary key) or an AlternateKey.
 */
declare type DataverseKey = GUID | AlternateKey | string;

export declare type DataverseOfflineCollectionConfig<T extends GenericProperties> = DataverseCollectionConfig<T> & {
    dbName?: string;
    storeName?: string;
    syncInterval?: number;
    queueStoreName?: string;
};

export declare function dataverseOfflineCollectionOptions<T extends GenericProperties>(config: DataverseOfflineCollectionConfig<T>): CollectionConfig<Infer<T>, string | number, never, DataverseOfflineCollectionUtils> & {
    utils: DataverseOfflineCollectionUtils;
};

export declare interface DataverseOfflineCollectionUtils extends UtilsRecord {
    isOnline: () => boolean;
    getPendingMutations: () => QueuedMutation[];
    forceSync: () => Promise<void>;
    clearLocalData: () => Promise<void>;
}

/**
 * Represents a Dataverse record, which is essentially a JavaScript object
 * with properties corresponding to the columns/attributes in a Dataverse entity.
 * The 'any' type is used here because the structure of a Dataverse record
 * can vary significantly depending on the entity and the selected attributes.
 */
declare type DataverseRecord = Record<string, Primitive>;

/**
 * Represents a Dataverse table (entity) and provides methods for CRUD, querying,
 * navigation properties, actions, functions, and bulk operations.
 *
 * Create instances via the constructor with an options object.
 * All API calls go through the provided {@link DataverseClient}.
 *
 * @template TProperties An object mapping property names to their field definitions.
 *
 * @example
 * const client = new DataverseClient({ url: "https://org.crm.dynamics.com" });
 *
 * const Account = new DataverseTable({
 *   client,
 *   entitySetName: "accounts",
 *   logicalName: "account",
 *   fields: {
 *     id: primaryKey("accountid"),
 *     name: string("name"),
 *     revenue: number("revenue"),
 *     primaryContact: lookup("primarycontactid", () => Contact),
 *   },
 * });
 *
 * // Type-safe queries
 * const record = await Account.getRecord("GUID-HERE");
 * console.log(record.name); // typed as string
 */
declare class DataverseTable<TProperties extends GenericProperties> {
    client: DataverseClient;
    fields: TProperties;
    logicalName: string;
    entitySetName: string;
    name: string;
    kind: "table";
    type: "table";
    schema?: ValidationSchema<Infer<TProperties>>;
    primaryKey: {
        key: string;
        property: PrimaryKeyField;
    };
    /**
     * @param options Options including the DataverseClient, entity set name, logical name, and field definitions.
     */
    constructor(options: DataverseTableOptions<TProperties> & {
        schema?: ValidationSchema<Infer<TProperties>>;
    });
    getSchema(): v.BaseSchema<unknown, Infer<TProperties>, v.BaseIssue<unknown>>;
    getDefault(value?: Partial<Infer<TProperties>>): Infer<TProperties>;
    /**
     * Retrieves a single record by its primary key (GUID) or alternate key.
     * Returns `null` when the record is not found.
     *
     * @param id The primary key GUID, alternate key, or string identifier.
     *
     * @example
     * const account = await Account.getRecord("acme-1234-abcd");
     * if (account) console.log(account.name);
     */
    getRecord(id: DataverseKey): Promise<Infer<TProperties> | null>;
    getAlternateKeys(value: Partial<Infer<TProperties>>): AlternateKey;
    /**
     * Retrieves multiple records from the table, with optional filtering, sorting, and paging.
     *
     * @param queryOptions Optional query parameters (filter, orderby, top).
     *
     * @example
     * const activeAccounts = await Account.getRecords({
     *   filter: "statecode eq 0",
     *   orderby: "name asc",
     *   top: 10,
     * });
     */
    getRecords(queryOptions?: QueryForTable<TProperties>): Promise<Infer<TProperties>[]>;
    /**
     * Retrieves the value of a single property for a record by ID.
     * Works for value properties, lookup IDs, lookups (returns expanded record), and collections.
     *
     * @example
     * const age = await Person.getPropertyValue("age", "some-guid");
     * const address = await Person.getPropertyValue("primaryAddress", "some-guid");
     */
    getPropertyValue<TKey extends keyof TProperties>(key: TKey, id: DataverseKey, queryOptions?: QueryForTable<TProperties>): Promise<Infer<TProperties[TKey]>>;
    /**
     * Updates the value of a single property for a record by ID.
     * For navigation properties, this associates/dissociates related records.
     *
     * @example
     * await Person.updatePropertyValue("age", "some-guid", 35);
     */
    updatePropertyValue<TKey extends keyof TProperties>(key: TKey, id: DataverseKey, value: Infer<TProperties[TKey]>): Promise<GUID>;
    protected updateNavigationProperty(property: GenericNavigationProperty, id: DataverseKey, value: any): Promise<`${string}-${string}-${string}-${string}-${string}` | `${string}-${string}-${string}-${string}-${string}`[] | undefined>;
    /**
     * Links an existing child record to a parent record through a navigation property.
     *
     * @example
     * await Person.associateRecord("primaryAddress", "person-guid", "address-guid");
     */
    associateRecord<TKey extends NarrowKeysByValue<TProperties, GenericNavigationProperty>>(key: TKey, id: DataverseKey, childId: GUID): Promise<GUID>;
    /**
     * Removes the link between a parent and child record through a navigation property.
     * Overloads:
     * - Collection/collectionIds: requires childId
     * - Lookup/lookupId: omits childId (clears the lookup)
     *
     * @example
     * await Person.dissociateRecord("addresses", "person-guid", "address-guid");
     * await Person.dissociateRecord("primaryAddress", "person-guid"); // clears lookup
     */
    dissociateRecord<TKey extends NarrowKeysByValue<TProperties, CollectionProperty<any> | CollectionIdsProperty>>(key: TKey, id: DataverseKey, childId: GUID): Promise<GUID>;
    dissociateRecord<TKey extends NarrowKeysByValue<TProperties, LookupProperty<any> | LookupIdProperty>>(key: TKey, id: DataverseKey): Promise<GUID>;
    /**
     * Creates a new record in Dataverse and returns its generated GUID.
     *
     * @param value The record data (partial — primary key is auto-generated).
     *
     * @example
     * const newId = await Person.insertRecord({ name: "John", age: 30 });
     */
    insertRecord(value: Partial<Infer<TProperties>>): Promise<GUID>;
    /**
     * Updates an existing record by ID. Supports optimistic concurrency via etag.
     *
     * @param id The record's primary key.
     * @param value The fields to update (partial record data).
     * @param etag Optional etag for conditional updates (If-Match header).
     *
     * @example
     * await Person.updateRecord("some-guid", { name: "Jane" });
     * // With etag:
     * await Person.updateRecord("some-guid", { name: "Jane" }, 'W/"123456"');
     */
    updateRecord(id: DataverseKey, value: Partial<Infer<TProperties>>, etag?: string): Promise<GUID>;
    /**
     * Creates or updates a record. If `id` is provided the record is updated;
     * otherwise a new record is created. Navigation properties (collections, lookups)
     * are also synced through nested upserts.
     *
     * @param id The GUID of an existing record, or `undefined` to create new.
     * @param value The record data (partial for updates).
     * @param etag Optional etag for conditional upsert.
     *
     * @example
     * // Create
     * const newId = await Person.upsertRecord(undefined, { name: "John" });
     * // Update
     * await Person.upsertRecord(existingId, { name: "Jane" });
     */
    upsertRecord(id: DataverseKey | undefined, value: Partial<Infer<TProperties>>, etag?: string): Promise<GUID>;
    /**
     * Deletes a record by its primary key. Supports optimistic concurrency via etag.
     *
     * @param id The primary key of the record to delete.
     * @param etag Optional etag for conditional deletion.
     *
     * @example
     * await Person.deleteRecord("some-guid");
     */
    deleteRecord(id: DataverseKey, etag?: string): Promise<GUID>;
    /**
     * Activates a record by setting its `statecode` to 0.
     *
     * @example
     * await Person.activateRecord("some-guid");
     */
    activateRecord(id: DataverseKey): Promise<GUID>;
    /**
     * Deactivates a record by setting its `statecode` to 1.
     *
     * @example
     * await Person.deactivateRecord("some-guid");
     */
    deactivateRecord(id: DataverseKey): Promise<GUID>;
    /**
     * Deletes (clears) the value of a value property for a record. Cannot be used
     * on navigation properties.
     *
     * @example
     * await Person.deletePropertyValue("name", "some-guid");
     */
    deletePropertyValue<TKey extends NarrowKeysByValue<TProperties, GenericValueProperty>>(key: TKey, id: DataverseKey): Promise<GUID>;
    /**
     * Executes a bound Dataverse action on this entity set or a specific record.
     * POST /{entitySet}({id})/Microsoft.Dynamics.CRM.{ActionName}
     *
     * @param actionName The Dataverse action name (without the CRM namespace prefix, e.g. `"GenerateInvoice"`).
     * @param params Optional parameters to pass in the request body.
     * @param id Optional record GUID — if provided, the action is bound to a specific record.
     *
     * @example
     * // Bound to entity set
     * await Account.executeAction("BulkDetectDuplicates", { ... });
     * // Bound to a record
     * await Account.executeAction("CalculatePrice", { discount: 10 }, "record-guid");
     */
    executeAction(actionName: string, params?: Record<string, any>, id?: DataverseKey): Promise<any>;
    /**
     * Executes a bound Dataverse function on a record.
     * GET /{entitySet}({id})/Microsoft.Dynamics.CRM.{FunctionName}(...)
     *
     * @param functionName The Dataverse function name (e.g. `"CalculateActualValueOfOpportunity"`).
     * @param id The record GUID to bind the function to.
     * @param params Optional function parameters (appended as query parameters).
     *
     * @example
     * const result = await Opportunity.executeFunction(
     *   "CalculateActualValueOfOpportunity",
     *   "opportunity-guid",
     * );
     */
    executeFunction(functionName: string, id: DataverseKey, params?: Record<string, any>): Promise<any>;
    /**
     * Creates multiple records in a single API call via `CreateMultiple`.
     *
     * @param records Array of partial records to create.
     *
     * @example
     * await Account.createMultiple([
     *   { name: "Acme" },
     *   { name: "Beta" },
     * ]);
     */
    createMultiple(records: Partial<Infer<TProperties>>[]): Promise<any>;
    /**
     * Updates multiple records in a single API call via `UpdateMultiple`.
     *
     * @param records Array of partial records to update (must include primary key).
     *
     * @example
     * await Account.updateMultiple([
     *   { id: "guid-1", name: "Acme Updated" },
     *   { id: "guid-2", name: "Beta Updated" },
     * ]);
     */
    updateMultiple(records: Partial<Infer<TProperties>>[]): Promise<any>;
    /**
     * Deletes multiple records in a single API call via `DeleteMultiple`.
     *
     * @param ids Array of record GUIDs to delete.
     *
     * @example
     * await Account.deleteMultiple(["guid-1", "guid-2"]);
     */
    deleteMultiple(ids: string[]): Promise<any>;
    /**
     * Extracts the primary key GUID from a record object, or `undefined` if not present.
     *
     * @example
     * const account = await Account.getRecord("some-guid");
     * const pk = Account.getPrimaryId(account); // GUID | undefined
     */
    getPrimaryId(value: Partial<Infer<TProperties>>): GUID | undefined;
    transformValueFromDataverse(value: any): Infer<TProperties>;
    transformValueToDataverse(value: Partial<Infer<TProperties>>, ctx?: TransformContext): Promise<DataverseRecord>;
    /**
     * Creates a new `Table` with only the specified properties. Useful for
     * narrowing the type when querying a subset of columns.
     *
     * @example
     * const NameOnly = Account.pickProperties("name", "id");
     * const records = await NameOnly.getRecords(); // { name: string; id: GUID }[]
     */
    pickProperties<TKeys extends keyof TProperties>(...keys: TKeys[]): DataverseTable<Pick<TProperties, TKeys>>;
    /**
     * Creates a new `DataverseTable` with the specified properties excluded.
     *
     * @example
     * const WithoutSensitive = Person.omitProperties("ssn");
     */
    omitProperties<TKeys extends keyof TProperties>(...keys: TKeys[]): DataverseTable<Omit<TProperties, TKeys>>;
    /**
     * Creates a new `DataverseTable` with additional properties appended.
     *
     * @example
     * const Extended = Account.appendProperties({
     *   customField: string("new_stringcolumn"),
     * });
     * // Extended has all original fields plus `customField`
     */
    appendProperties<TAppendedProperties extends GenericProperties>(properties: TAppendedProperties): DataverseTable<Omit<TProperties, keyof TAppendedProperties> & TAppendedProperties>;
    deleteFile(id: GUID, fieldName: string): Promise<void>;
    downloadImage(id: GUID, fieldName: string): Promise<Blob>;
    deleteImage(id: GUID, fieldName: string): Promise<void>;
    private _afterSave;
    /** Use for type inference: `Infer<typeof Account>` resolves to the record type. */
    T: Infer<TProperties>;
}

declare type DataverseTableOptions<TProperties extends GenericProperties> = {
    client: DataverseClient;
    entitySetName: string;
    logicalName: string;
    fields: TProperties;
    schema?: ValidationSchema<Infer<TProperties>>;
    primaryKey?: {
        key: string;
        property: PrimaryKeyField;
    };
};

declare class DateField extends FieldBase<Date> {
    kind: "value";
    type: "dateOnly";
    constructor(name: string, options?: FieldOptions<Date>);
    transformValueFromDataverse(value: any): Date;
    transformValueToDataverse(value: any): string | null;
}

declare class DateTimeField extends FieldBase<Date> {
    kind: "value";
    type: "date";
    constructor(name: string, options?: FieldOptions<Date>);
    getDefault(): Date;
    transformValueFromDataverse(value: any): Date;
}

declare abstract class FieldBase<T> {
    #private;
    name: string;
    fromDataverseName: string;
    toDataverseName: string;
    kind: string;
    type: string;
    schema: ValidationSchema<T>;
    constructor(name: string, defaults: {
        defaultValue: T;
        schema: ValidationSchema<T>;
    }, options?: FieldOptions<T>);
    getDefault(): T;
    getReadOnly(): boolean;
    transformValueFromDataverse(value: any, ctx?: TransformContext): T;
    transformValueToDataverse(value: any, ctx?: TransformContext): any;
    afterSave?(ctx: TransformContext, value: any): Promise<void>;
}

declare type FieldOptions<T> = {
    default?: T;
    readonly?: boolean;
    schema?: ValidationSchema<T>;
};

declare class FileField extends FieldBase<FileRef | null> {
    type: "file";
    kind: "file";
    constructor(name: string);
    transformValueFromDataverse(value: any, ctx?: TransformContext): FileRef | null;
    transformValueToDataverse(): typeof SKIP;
    afterSave(ctx: TransformContext, value: FileRef): Promise<void>;
}

declare type FileRef = {
    name: string;
    url?: string;
    data?: Blob | null;
};

/**
 * Represents a generic navigation property in a Dataverse entity.  Navigation
 * properties are used to define relationships between entities.
 */
declare type GenericNavigationProperty = CollectionProperty<GenericProperties> | LookupProperty<GenericProperties> | LookupIdProperty | CollectionIdsProperty;

/**
 * Represents a generic object of properties, where the keys are property names
 * and the values are GenericProperty definitions.  This is used to define the
 * structure of a Dataverse entity.
 */
declare type GenericProperties = Record<string, GenericProperty>;

/**
 * Represents a generic property in a Dataverse entity.  A property can be
 * either a navigation property or a value property.
 */
declare type GenericProperty = GenericNavigationProperty | GenericValueProperty;

/**
 * Represents a generic value property in a Dataverse entity.  Value properties
 * store the actual data of an entity, such as strings, numbers, dates, etc.
 */
declare type GenericValueProperty = PrimaryKeyField | StringField | NullableStringField | NumberField | NullableNumberField | BooleanField | DateTimeField | NullableDateTimeField | DateField | NullableDateField | ImageField | ListField<string | number> | FileField | ChoiceField<Record<number, string>> | NullableChoiceField<Record<number, string>>;

declare type GetTable<T = any> = () => T;

/**
 * Represents a GUID (Globally Unique Identifier) string, a standard identifier
 * used extensively in Dataverse (and Microsoft technologies in general).
 * The format is a string with five sections separated by hyphens.
 */
declare type GUID = `${string}-${string}-${string}-${string}-${string}`;

declare class ImageField extends FieldBase<ImageRef | null> {
    kind: "image";
    type: "image";
    constructor(name: string, options?: FieldOptions<ImageRef | null>);
    transformValueFromDataverse(value: any, ctx: TransformContext): ImageRef | null;
    transformValueToDataverse(value: ImageRef | null): Promise<string | null>;
}

declare type ImageRef = {
    readonly url: string;
    readonly fullSizeUrl: string;
    data?: Blob | null;
};

/**
 * Infers the TypeScript type from a Dataverse schema definition.  This is a recursive
 * type that drills down through the schema definition (which can be a Table,
 * GenericProperties, or a Property) to extract the corresponding TypeScript type.
 *
 * @template T The Dataverse schema definition.
 */
declare type Infer<T> = T extends null | undefined ? T : T extends DataverseTable<infer U> ? Infer<U> : T extends CollectionProperty<infer U> ? Infer<U>[] : T extends LookupProperty<infer U> ? Infer<U> | null : T extends FieldBase<infer U> ? U : {
    [K in keyof T]: Infer<T[K]>;
};

declare class ListField<T extends string | number> extends FieldBase<T | null> {
    kind: "value";
    type: "list";
    list: Array<T>;
    constructor(name: string, list: Array<T>, options?: FieldOptions<T | null>);
}

declare class LookupIdProperty extends FieldBase<GUID | null> {
    #private;
    kind: "navigation";
    type: "lookupId";
    navigationName: string;
    constructor(name: string, getTable: GetTable, options?: FieldOptions<GUID | null>);
    get table(): DataverseTable<{
        id: PrimaryKeyField;
    }>;
    transformValueToDataverse(value: any): string | null;
}

declare class LookupProperty<TProperties extends GenericProperties> extends FieldBase<Infer<TProperties> | null> {
    #private;
    kind: "navigation";
    type: "lookup";
    constructor(name: string, getTable: GetTable<DataverseTable<TProperties>>, options?: FieldOptions<Infer<TProperties> | null>);
    get table(): DataverseTable<TProperties>;
    transformValueFromDataverse(value: any): Infer<TProperties> | null;
    transformValueToDataverse(): typeof SKIP;
}

/** A field name can be a string or an object with a name or toString method. */
declare type Name = string | {
    name: string;
} | {
    toString(): string;
};

/**
 * Utility type to narrow down the keys of an object `T`
 * to only those keys whose values are of type `V`.
 *
 * @template T The type of the object.
 * @template V The type of the values to filter for.
 *
 * @example
 * interface MyObject {
 * id: number;
 * name: string;
 * isActive: boolean;
 * email: string;
 * }
 *
 * type StringKeys = NarrowKeysByValue<MyObject, string>;  // "name" | "email"
 */
declare type NarrowKeysByValue<T extends object, V> = {
    [K in keyof T]: T[K] extends V ? K : never;
}[keyof T];

declare type NestedStringArray = Array<string | NestedStringArray>;

declare class NullableChoiceField<T extends Record<number, string>> extends FieldBase<T[keyof T] | null> {
    #private;
    kind: "value";
    type: "choice";
    constructor(name: string, options: T, fieldOptions?: FieldOptions<T[keyof T] | null>);
    transformValueFromDataverse(value: any): T[keyof T] | null;
    transformValueToDataverse(value: any): number | null;
}

declare class NullableDateField extends FieldBase<Date | null> {
    kind: "value";
    type: "dateOnly";
    constructor(name: string, options?: FieldOptions<Date | null>);
    transformValueFromDataverse(value: any): Date | null;
    transformValueToDataverse(value: any): string | null;
}

declare class NullableDateTimeField extends FieldBase<Date | null> {
    kind: "value";
    type: "date";
    constructor(name: string, options?: FieldOptions<Date | null>);
    transformValueFromDataverse(value: any): Date | null;
}

declare class NullableNumberField extends FieldBase<number | null> {
    kind: "value";
    type: "number";
    constructor(name: string, options?: FieldOptions<number | null>);
}

declare class NullableStringField extends FieldBase<string | null> {
    kind: "value";
    type: "string";
    constructor(name: string, options?: FieldOptions<string | null>);
}

declare class NumberField extends FieldBase<number> {
    kind: "value";
    type: "number";
    constructor(name: string, options?: FieldOptions<number>);
    transformValueFromDataverse(value: any): number;
}

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
declare type PreferOption = "return=representation" | "respond-async" | "odata.track-changes" | {
    annotations: "*" | string[];
} | {
    maxPageSize: number;
};

declare class PrimaryKeyField extends FieldBase<GUID> {
    kind: "value";
    type: "primaryKey";
    constructor(name: string, options?: FieldOptions<GUID>);
    getDefault(): GUID;
}

declare type Primitive = string | number | boolean | null;

declare type QueryForTable<T> = {
    orderby?: Partial<Record<keyof T, "asc" | "desc">> | string;
    filter?: string;
    top?: number;
};

export declare type QueuedMutation = {
    id: string;
    type: "insert" | "update" | "delete";
    key: string | number;
    value?: any;
    collectionId: string;
    sequence: number;
    timestamp: number;
};

export declare function replayAllQueues(options: ReplayAllQueuesOptions): Promise<ReplayResult>;

export declare type ReplayAllQueuesOptions = {
    dbName?: string;
    queueStoreName?: string;
    tables: Record<string, DataverseTable<GenericProperties>>;
};

export declare type ReplayResult = {
    succeeded: number;
    failed: number;
    remaining: number;
};

declare const SKIP: unique symbol;

declare class StringField extends FieldBase<string> {
    kind: "value";
    type: "string";
    constructor(name: string, options?: FieldOptions<string>);
    transformValueFromDataverse(value: any): string;
}

declare type TransformContext = {
    table: DataverseTable<any>;
    client: DataverseClient;
    recordId: string;
};

declare type ValidationSchema<T> = v.BaseSchema<T, T, v.BaseIssue<unknown>>;

export { }
