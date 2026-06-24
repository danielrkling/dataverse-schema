import { StandardSchemaV1 } from '@standard-schema/spec';

export declare function Above(field: Name, value: string): FilterExpr;

export declare function AboveOrEqual(field: Name, value: string): FilterExpr;

/**
 * Represents a server-side aggregation expression usable in OData `$apply` and FetchXML.
 * Created via factory functions like `sum()`, `min()`, `max()`, `count()`.
 */
export declare class Aggregation<TValue = number> {
    readonly operation: string;
    readonly field?: string | undefined;
    readonly alias?: string | undefined;
    constructor(operation: string, field?: string | undefined, alias?: string | undefined);
    /** OData format (e.g. `"title with average as avg_title"`). */
    toOdata(alias?: string): string;
    /** FetchXML format (e.g. `name="title" alias="avg_title" aggregate="avg"`). */
    toXml(alias?: string): string;
    toString(): string;
}

export declare function all<P extends GenericProperties>(proxy: ODataCollectionNavProxy<P>, condition: (x: ODataLambdaProxy<P>) => string | FilterExpr): FilterExpr;

/**
 * Represents an alternate key for a Dataverse entity.  An alternate key is used
 * to uniquely identify a record instead of using its primary key (GUID).
 * It can be a single key-value pair or a combination of multiple key-value pairs.
 */
export declare type AlternateKey = `${string}=${string}` | `${string}=${string},${string}=${string}`;

export declare function and(...conditions: (FilterExpr | string)[]): FilterExpr;

export declare function any<P extends GenericProperties>(proxy: ODataCollectionNavProxy<P>, condition: (x: ODataLambdaProxy<P>) => string | FilterExpr): FilterExpr;

/** Proxy type for `orderby` after `apply()`, mapping alias names to FieldRefs. */
declare type ApplyAliasProxy<R extends Record<string, any>> = {
    [K in keyof R]: FieldRef<R[K], K extends string ? K : never>;
};

/** Extract the result type from an `apply()` record. */
declare type ApplyResultType<R extends Record<string, GroupByExpr<any> | Aggregation<any>>> = {
    [K in keyof R]: R[K] extends GroupByExpr<infer V> ? V : R[K] extends Aggregation<infer V> ? V : never;
};

declare type ApplyResultType_2<R extends Record<string, GroupByExpr<any> | Aggregation<any>>> = {
    [K in keyof R]: R[K] extends GroupByExpr<infer V> ? V : R[K] extends Aggregation<infer V> ? V : never;
};

export declare function asc(...fields: Name[]): OrderSpec;

export declare function attachEtag<T>(v: T): T;

/** Average aggregation. `average(field)` or `average("field_name")`. */
export declare function average<TValue>(name: FieldRef<TValue>, alias?: string): Aggregation<TValue>;

export declare function average(name: string, alias?: string): Aggregation<number>;

/**
 * Creates a data URL from a base64 encoded image string.
 *
 * @param base64 The base64 encoded image string.
 * @returns A data URL representing the image.
 *
 * @example
 * // Create a data URL from a base64 string:
 * const base64String = "iVBORw0KGgoAAAANSUhEUg..."; // A long base64 string
 * const imageUrl = base64ImageToURL(base64String);
 * // returns "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg..."
 */
export declare function base64ImageToURL(base64: string): string;

export declare function Between(field: Name, value1: string | number, value2: string | number): FilterExpr;

/**
 * Creates a boolean-typed Dataverse column definition.
 *
 * @param name The Dataverse logical name of the column (e.g. `"is_active"`).
 *
 * @example
 * const table = new DataverseTable({
 *   isActive: boolean("is_active"),
 * });
 * // Infer<typeof table>["isActive"] → boolean
 */
export declare function boolean(name: string): BooleanField;

export declare class BooleanField extends Schema<boolean> {
    kind: "value";
    type: "boolean";
    constructor(name: string);
}

/**
 * Creates a one-to-many (collection) navigation property definition. The related records
 * can be expanded via OData `$expand` or fetched through the table API.
 *
 * @param name The Dataverse logical name of the collection navigation property.
 * @param getTable A thunk that returns the related table definition.
 *
 * @example
 * const Address = table(client, "addresses", { id: primaryKey("addressid"), street: string("street"), ... });
 * const Person = table(client, "people", {
 *   id: primaryKey("personid"),
 *   addresses: collection("person_addresses", () => Address),
 * });
 * // Infer<typeof Person>["addresses"] → { id: GUID; street: string }[]
 */
export declare function collection<TProperties extends GenericProperties>(name: string, getTable: GetTable<DataverseTable<TProperties>>): CollectionProperty<TProperties>;

/**
 * Creates a collection-of-IDs navigation property definition. Unlike a full collection,
 * this only stores the related record IDs (GUIDs), not the full records.
 *
 * @param name The Dataverse logical name of the navigation property.
 * @param getTable A thunk that returns the related table definition.
 *
 * @example
 * const Address = table(client, "addresses", { id: primaryKey("addressid"), ... });
 * const Person = table(client, "people", {
 *   id: primaryKey("personid"),
 *   addressIds: collectionIds("person_addresses", () => Address),
 * });
 * // Infer<typeof Person>["addressIds"] → `${string}-${string}-${string}-${string}-${string}`[]
 */
export declare function collectionIds(name: string, getTable: GetTable): CollectionIdsProperty;

export declare class CollectionIdsProperty extends Schema<GUID[]> {
    #private;
    kind: "navigation";
    type: "collectionIds";
    constructor(name: string, getTable: GetTable);
    get table(): DataverseTable<{
        id: PrimaryKeyField;
    }>;
    transformValueFromDataverse(value: any): GUID[];
    getIssues(value: any, path?: PropertyKey[]): StandardSchemaV1.Issue[];
}

declare type CollectionKeys<T> = {
    [K in keyof T]: T[K] extends CollectionProperty<any> ? K : never;
}[keyof T];

export declare class CollectionProperty<TProperties extends GenericProperties> extends Schema<Infer<TProperties>[]> {
    #private;
    kind: "navigation";
    type: "collection";
    constructor(name: string, getTable: GetTable<DataverseTable<TProperties>>);
    get table(): DataverseTable<TProperties>;
    transformValueFromDataverse(value: any): Infer<TProperties>[];
    getIssues(value: any, path?: PropertyKey[]): StandardSchemaV1.Issue[];
}

export declare function compare(field: Name, operator: string, otherField: Name): FilterExpr;

export declare function contains(field: Name, value: string): FilterExpr;

export declare function ContainsValues(field: Name, values: (string | number)[]): FilterExpr;

/** Count aggregation. `count()` for OData, `count(field)` or `count(field, alias)` for FetchXML. */
export declare function count(alias?: string): Aggregation<number>;

export declare function count(field: string, alias?: string): Aggregation<number>;

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
    fetch(resource: string, options?: RequestInit): Promise<any>;
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
export declare type DataverseClientOptions = {
    /** Base URL of the Dataverse environment (defaults to `location.origin`). */
    url?: string;
    /** Bearer token for authentication. */
    token?: string;
    /** Azure AD object ID to impersonate (sets CallerObjectId header). */
    impersonateByAAId?: string;
    /** Dataverse user ID to impersonate (sets MSCRMCallerID header). */
    impersonateByUserId?: string;
    /** Additional headers to include on every request. */
    headers?: Record<string, string>;
};

/**
 * Represents a Dataverse many-to-many intersect (association) table.
 *
 * This is a simple descriptor for use with FetchXML's {@link EntityQueryBuilder.through through()}
 * method. It does NOT extend {@link DataverseTable} — it is not a queryable entity on its own.
 *
 * @example
 * const AccountContact = new DataverseIntersectTable("accountcontact", Account, Contact);
 *
 * // Use in FetchXML via through():
 * fetchXml(Account)
 *   .select(f => ({ name: f.name }))
 *   .through(AccountContact, sub =>
 *     sub.select(f => ({ accountName: f.name }))
 *   )
 */
export declare class DataverseIntersectTable<T1 extends GenericProperties, T2 extends GenericProperties> {
    /** Marks this table as an intersect table for FetchXML joins. */
    readonly intersect = true;
    /**
     * The intersect table name used in FetchXML `<link-entity name="...">`.
     * This is the Dataverse entity logical name (e.g. `"accountcontact"`).
     * It is NOT an entity set name (no pluralization) — unlike {@link DataverseTable.entitySetName}
     * and {@link DataverseTable.logicalName}, this single `name` serves both roles
     * for intersect table references in FetchXML join syntax.
     */
    readonly name: string;
    /** The first related table. */
    readonly table1: DataverseTable<T1>;
    /** The second related table. */
    readonly table2: DataverseTable<T2>;
    constructor(name: string, table1: DataverseTable<T1>, table2: DataverseTable<T2>);
}

/**
 * Represents a Dataverse key, which can be either a GUID (primary key) or an AlternateKey.
 */
export declare type DataverseKey = GUID | AlternateKey | string;

/**
 * Represents a Dataverse record, which is essentially a JavaScript object
 * with properties corresponding to the columns/attributes in a Dataverse entity.
 * The 'any' type is used here because the structure of a Dataverse record
 * can vary significantly depending on the entity and the selected attributes.
 */
export declare type DataverseRecord = Record<string, Primitive>;

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
export declare class DataverseTable<TProperties extends GenericProperties> extends Schema<Infer<TProperties>> {
    client: DataverseClient;
    fields: TProperties;
    logicalName: string;
    entitySetName: string;
    kind: "table";
    type: "table";
    /**
     * @param options Options including the DataverseClient, entity set name, logical name, and field definitions.
     */
    constructor(options: DataverseTableOptions<TProperties>);
    getIssues(value: any, path?: PropertyKey[]): StandardSchemaV1.Issue[];
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
     * Returns the primary key field definition for this table.
     *
     * @example
     * const pk = Account.getPrimaryKey();
     * console.log(pk.key);      // "id"
     * console.log(pk.property.name); // "accountid"
     */
    getPrimaryKey(): {
        key: string;
        property: PrimaryKeyField;
    };
    /**
     * Extracts the primary key GUID from a record object, or `undefined` if not present.
     *
     * @example
     * const account = await Account.getRecord("some-guid");
     * const pk = Account.getPrimaryId(account); // GUID | undefined
     */
    getPrimaryId(value: Partial<Infer<TProperties>>): GUID | undefined;
    transformValueFromDataverse(value: any): Infer<TProperties>;
    transformValueToDataverse(value: Partial<Infer<TProperties>>): DataverseRecord;
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
    /** Use for type inference: `Infer<typeof Account>` resolves to the record type. */
    T: Infer<TProperties>;
}

export declare type DataverseTableOptions<TProperties extends GenericProperties> = {
    client: DataverseClient;
    entitySetName: string;
    logicalName: string;
    fields: TProperties;
};

/**
 * Creates a date-only column definition (maps to JavaScript `Date`, time portion is zeroed).
 *
 * @param name The Dataverse logical name of the column.
 *
 * @example
 * const table = new DataverseTable({
 *   birthDate: date("birthdate"),
 * });
 * // Infer<typeof table>["birthDate"] → Date
 */
export declare function date(name: string): DateField;

export declare class DateField extends Schema<Date> {
    kind: "value";
    type: "dateOnly";
    constructor(name: string);
    transformValueFromDataverse(value: any): Date;
    transformValueToDataverse(value: any): string | null;
}

/**
 * Creates a date-time column definition (maps to JavaScript `Date`).
 *
 * @param name The Dataverse logical name of the column.
 *
 * @example
 * const table = new DataverseTable({
 *   createdAt: datetime("createdon"),
 * });
 * // Infer<typeof table>["createdAt"] → Date
 */
export declare function datetime(name: string): DateTimeField;

export declare class DateTimeField extends Schema<Date> {
    kind: "value";
    type: "date";
    constructor(name: string);
    getDefault(): Date;
    transformValueFromDataverse(value: any): Date;
}

export declare function desc(...fields: Name[]): OrderSpec;

export declare function DoesNotContainValues(field: Name, values: (string | number)[]): FilterExpr;

/**
 * Creates a validator function that checks if a string is a valid email address.
 * Uses a basic email validation regex.
 *
 * @returns A validator function that returns "Invalid email format" if the string is not a valid email address, otherwise undefined.
 *
 * @example
 * // Create an email validator:
 * const isEmail = email();
 *
 * // Validate an email address:
 * isEmail("test@example.com"); // returns undefined (valid)
 * isEmail("invalid");        // returns "Invalid email format" (invalid)
 * isEmail("test@.com");       // returns "Invalid email format" (invalid)
 */
export declare function email(): Validator<string>;

export declare function endsWith(field: Name, value: string): FilterExpr;

/**
 * Builds a FetchXML query for Dataverse with full type support.
 *
 * Use `fetchXml(table)` to create a builder, then chain methods to construct
 * the query. Call `execute()` to run it or `toXml()` to get the raw XML.
 *
 * When `select()` is not called, all value/lookupId/file fields are
 * automatically included. Each result from `execute()` includes an `Etag`
 * symbol property for optimistic concurrency.
 *
 * @example
 * const q = fetchXml(contactDataverseTable)
 *   .select(f => ({ name: f.name, email: f.email }))
 *   .where(f => eq(f.status, 1))
 *   .orderby(f => f.name, "desc")
 *   .top(10);
 *
 * const xml = q.toXml();
 * const results = await q.execute();
 */
export declare class EntityQueryBuilder<TProps extends GenericProperties, TResult extends Record<string, any> = {}> {
    private _linkAlias;
    private _table;
    private _attributes;
    private _links;
    private _isDistinct;
    private _filters;
    private _proxy;
    private _top?;
    private _isAggregate;
    private _useRawOrderBy;
    private _lateMaterialize;
    private _aggregateLimit?;
    private _orders;
    private _datasource?;
    private _options?;
    /** @param table The DataverseTable definition to build the query against. */
    constructor(table: DataverseTable<TProps>, _linkAlias?: {
        value: number;
    });
    private _getEffectiveAttributes;
    private _buildProxy;
    /**
     * Selects specific fields to include in the FetchXML query.
     * The result type is narrowed to only include selected fields.
     * When this method is not called, all value/lookupId/file fields
     * are automatically included via `_getEffectiveAttributes()`.
     *
     * Use `apply()` instead for aggregate queries.
     *
     * @example
     * fetchXml(contactDataverseTable)
     *   .select(f => ({ name: f.name, email: f.email }))
     */
    select<R extends Record<string, keyof TProps>>(selector: (fields: FieldSelector<TProps>) => R): EntityQueryBuilder<TProps, {
        [K in keyof R]: Infer<TProps[R[K]]>;
    }>;
    /**
     * Adds grouping and aggregation to the FetchXML query.
     * The callback receives a field proxy and must return a record where:
     * - Values created with `groupby()` define grouping fields
     * - Values created with `sum()`, `average()`, `min()`, `max()`, `count()` define aggregations
     *
     * Record keys become the alias names in the response.
     *
     * @example
     * fetchXml(Account).apply(v => ({
     *   city: groupby(v.city),
     *   total: sum(v.revenue),
     *   cnt: count(),
     * }))
     */
    apply<R extends Record<string, GroupByExpr<any> | Aggregation<any>>>(expr: (f: FieldProxy<TProps>) => R): Omit<EntityQueryBuilder<TProps, ApplyResultType_2<R>>, 'select'>;
    /**
     * Adds a filter condition to the FetchXML query.
     * Accepts a raw filter string or a callback that receives a field proxy.
     * Multiple `where()` calls are combined with AND.
     *
     * @example
     * // With typed filter function
     * fetchXml(contactDataverseTable).where(f => eq(f.status, 1))
     *
     * @example
     * // Raw filter string
     * fetchXml(contactDataverseTable).where(eq("statuscode", "1"))
     */
    where(filter: string | FilterExpr | ((f: FieldProxy<TProps>) => string | FilterExpr)): this;
    /**
     * Adds a link-entity join to another table. The result type merges the
     * joined entity's selected fields.
     *
     * For filter-only link types (`any`, `not any`, `all`, `not all`,
     * `exists`, `in`), only filters are rendered inside `<link-entity>`;
     * `<attribute>` and `<order>` elements are skipped.
     *
     * @example
     * fetchXml(contactDataverseTable)
     *   .select(f => ({ name: f.name }))
     *   .join("inner", accountDataverseTable, a => a.accountid, c => c.parentcustomerid,
     *     q => q.select(a => ({ accountName: a.name })))
     */
    join<TDataverseTable extends DataverseTable<any>, TFrom extends keyof TDataverseTable["fields"], TTo extends keyof TProps, TJoinResult extends Record<string, any>>(linkType: FetchLinkType, table: TDataverseTable, from: TFrom, to: TTo, subquery: (q: EntityQueryBuilder<TDataverseTable["fields"], {}>) => EntityQueryBuilder<TDataverseTable["fields"], TJoinResult>, intersect?: boolean): EntityQueryBuilder<TProps, Simplify<TResult & TJoinResult>>;
    /**
     * Shorthand for `join("inner", ...)`. Adds an inner link-entity join.
     *
     * @example
     * fetchXml(contactDataverseTable)
     *   .select(f => ({ name: f.name }))
     *   .innerJoin(accountDataverseTable, a => a.accountid, c => c.parentcustomerid,
     *     q => q.select(a => ({ accountName: a.name })))
     */
    innerJoin<TDataverseTable extends DataverseTable<any>, TFrom extends keyof TDataverseTable["fields"], TTo extends keyof TProps, TJoinResult extends Record<string, any>>(table: TDataverseTable, from: TFrom, to: TTo, subquery: (q: EntityQueryBuilder<TDataverseTable["fields"], {}>) => EntityQueryBuilder<TDataverseTable["fields"], TJoinResult>, intersect?: boolean): EntityQueryBuilder<TProps, TResult & TJoinResult extends infer T ? { [Key in keyof T]: (TResult & TJoinResult)[Key]; } : never>;
    /**
     * Auto-joins through a DataverseIntersectTable intersect table, detecting
     * which side matches the current query and which is the target.
     * Creates both join legs (source → intersect, intersect → target) so the
     * subquery receives the target table's builder directly.
     *
     * @example
     * fetchXml(Person)
     *   .select(f => ({ name: f.name }))
     *   .through(PersonAccount, sub =>
     *     sub.select(f => ({ accountName: f.name }))
     *   )
     */
    through<T2 extends GenericProperties, TJoinResult extends Record<string, any>>(intersectTable: DataverseIntersectTable<TProps, T2>, subquery: (q: EntityQueryBuilder<T2, {}>) => EntityQueryBuilder<T2, TJoinResult>): EntityQueryBuilder<TProps, Simplify<TResult & TJoinResult>>;
    through<T1 extends GenericProperties, TJoinResult extends Record<string, any>>(intersectTable: DataverseIntersectTable<T1, TProps>, subquery: (q: EntityQueryBuilder<T1, {}>) => EntityQueryBuilder<T1, TJoinResult>): EntityQueryBuilder<TProps, Simplify<TResult & TJoinResult>>;
    /** Enables distinct (deduplicated) results. */
    distinct(): this;
    /** Limits the number of returned records. */
    top(n: number): this;
    /**
     * Adds ordering to the FetchXML query.
     * Matches the OData syntax: pass a field selector callback and optional direction.
     *
     * @example
     * fetchXml(contactDataverseTable).orderby(f => f.name);
     * fetchXml(contactDataverseTable).orderby(f => f.name, "desc");
     *
     * @example
     * // With explicit entity name (for cross-entity ordering)
     * fetchXml(contactDataverseTable).orderby("contact", "createdon", "desc")
     */
    orderby(fieldSelector: (f: FieldProxy<TProps>) => string, direction?: 'asc' | 'desc'): this;
    orderby(entityname: string, attribute: string, direction?: 'asc' | 'desc'): this;
    /**
     * Returns the full FetchXML string.
     *
     * @example
     * const xml = fetchXml(contactDataverseTable)
     *   .select(f => ({ name: f.name }))
     *   .toXml();
     * // <fetch version="1.0" mapping="logical">
     * //   <entity name="contact">
     * //     <attribute name="fullname" alias="name" />
     * //   </entity>
     * // </fetch>
     */
    toXml(): string;
    private static _isFilterOnlyLinkType;
    private _renderLinkEntity;
    /**
     * Returns the URL-encoded query string for use in the Dataverse API.
     *
     * @example
     * fetchXml(contactDataverseTable).select(f => ({ name: f.name })).toString()
     * // "fetchXml=%3Cfetch%20version%3D%221.0%22..."
     */
    toString(): string;
    /**
     * Executes the FetchXML query against Dataverse and returns the parsed results.
     *
     * Each result object includes an `Etag` symbol property (import from
     * `dataverse-schema`) holding the `@odata.etag` value for optimistic
     * concurrency. When `select()` is not called, value/lookupId/file fields
     * are auto-included; missing API fields fall back to the field default.
     *
     * @example
     * const contacts = await fetchXml(contactDataverseTable)
     *   .select(f => ({ name: f.name, email: f.email }))
     *   .where(f => eq(f.status, 1))
     *   .execute();
     * // contacts: Array<{ name: string; email: string }>
     *
     * @example
     * // With optional execute parameters
     * const contacts = await fetchXml(contactDataverseTable)
     *   .select(f => ({ name: f.name }))
     *   .execute({ useRawOrderBy: true, aggregateLimit: 5000 });
     */
    execute(options?: ExecuteOptions): Promise<TResult[]>;
    private _buildAliasInfo;
    private _collectAliases;
}

export declare function eq(field: Name, value: FilterValue): FilterExpr;

export declare function EqualBusinessId(field: Name): FilterExpr;

export declare function EqualUserId(field: Name): FilterExpr;

export declare function EqualUserLanguage(field: Name): FilterExpr;

export declare function EqualUserOrUserHierarchy(field: Name): FilterExpr;

export declare function EqualUserOrUserHierarchyAndTeams(field: Name): FilterExpr;

export declare function EqualUserOrUserTeams(field: Name): FilterExpr;

export declare const Etag: unique symbol;

declare type ExecuteOptions = {
    datasource?: string;
    lateMaterialize?: boolean;
    aggregateLimit?: number;
    useRawOrderBy?: boolean;
    options?: string;
};

export declare function expand(values: string | ExpandObject): string;

export declare interface ExpandObject {
    [key: string]: ExpandValue;
}

declare type ExpandResult<T, K extends keyof T, R> = T[K] extends CollectionProperty<any> ? R[] : (R | null);

export declare type ExpandValue = string | {
    select?: (Name)[];
    expand?: ExpandObject;
    filter?: string;
    orderby?: {
        [key: string]: "asc" | "desc";
    };
};

export declare type FetchLinkType = "inner" | "outer" | "any" | "not any" | "all" | "not all" | "exists" | "in" | "matchfirstrowusingcrossapply";

export declare function fetchOdata<T extends GenericProperties>(table: DataverseTable<T>): ODataQuery<T, Infer<T>>;

/**
 * Creates a new FetchXML query builder for the given table.
 * Returns an `EntityQueryBuilder` that starts with all table fields selected
 * and narrows the result type as you chain methods.
 *
 * @example
 * const results = await fetchXml(contactDataverseTable)
 *   .select(f => ({ name: f.name }))
 *   .where(f => eq(f.statecode, 0))
 *   .execute();
 */
export declare function fetchXml<TProps extends GenericProperties>(table: DataverseTable<TProps>): EntityQueryBuilder<TProps, Infer<TProps>>;

export declare type FieldProxy<T extends GenericProperties> = {
    [K in keyof T]: FieldRef<Infer<T[K]>, K extends string ? K : never>;
};

/**
 * Phantom branded string that carries the inferred TypeScript type of a Dataverse field.
 * At runtime it is just a string (the OData field name).
 */
export declare type FieldRef<T, K extends string = string> = string & {
    __fieldType: T;
    __key: K;
};

declare type FieldSelector<TProps extends GenericProperties> = {
    [K in keyof TProps]: K;
};

/**
 * Creates a file column definition. File columns are read-only and store the file name.
 *
 * @param name The Dataverse logical name of the file column.
 */
export declare function file(name: string): FileField;

export declare class FileField extends Schema<string> {
    type: "file";
    kind: "file";
    constructor(name: string);
}

export declare class FilterExpr {
    private node;
    constructor(node: FilterNode);
    toString(): string;
    toOdata(): string;
    toFetchXml(): string;
}

declare type FilterNode = {
    type: "comparison";
    field: string;
    operator: string;
    value: FilterValue;
} | {
    type: "null";
    field: string;
    positive: boolean;
} | {
    type: "contains";
    field: string;
    value: string;
} | {
    type: "startsWith";
    field: string;
    value: string;
} | {
    type: "endsWith";
    field: string;
    value: string;
} | {
    type: "compare";
    field: string;
    operator: string;
    otherField: string;
} | {
    type: "lambda";
    field: string;
    operator: "any" | "all";
    alias: string;
    condition: string;
} | {
    type: "fn";
    field: string;
    fnName: string;
    operator: string;
    values: FilterValue[];
} | {
    type: "raw";
    value: string;
} | {
    type: "and";
    conditions: FilterExpr[];
} | {
    type: "or";
    conditions: FilterExpr[];
} | {
    type: "not";
    condition: FilterExpr;
};

declare type FilterValue = string | number | boolean | null;

/**
 * Creates a formatted-value column definition for retrieving user-localized display values
 * (e.g. for option-set labels). These are read-only.
 *
 * @param name The Dataverse logical name of the column.
 *
 * @example
 * const table = new DataverseTable({
 *   statusLabel: formatted("statuscode"),
 * });
 */
export declare function formatted(name: string): FormattedField;

export declare class FormattedField extends Schema<string | null> {
    kind: "value";
    type: "formatted";
    constructor(name: string);
}

export declare function ge(field: Name, value: string | number): FilterExpr;

/**
 * Represents a generic navigation property in a Dataverse entity.  Navigation
 * properties are used to define relationships between entities.
 */
export declare type GenericNavigationProperty = CollectionProperty<GenericProperties> | LookupProperty<GenericProperties> | LookupIdProperty | CollectionIdsProperty;

/**
 * Represents a generic object of properties, where the keys are property names
 * and the values are GenericProperty definitions.  This is used to define the
 * structure of a Dataverse entity.
 */
export declare type GenericProperties = Record<string, GenericProperty>;

/**
 * Represents a generic property in a Dataverse entity.  A property can be
 * either a navigation property or a value property.
 */
export declare type GenericProperty = GenericNavigationProperty | GenericValueProperty;

/**
 * Represents a generic value property in a Dataverse entity.  Value properties
 * store the actual data of an entity, such as strings, numbers, dates, etc.
 */
export declare type GenericValueProperty = PrimaryKeyField | StringField | NullableStringField | NumberField | NullableNumberField | BooleanField | DateTimeField | NullableDateTimeField | DateField | NullableDateField | ImageField | ListField<string | number> | FileField;

export declare function getEtag(v: any): string | undefined;

/**
 * Constructs a URL to retrieve an image from Dataverse.
 *
 * @param entity The logical name of the entity the image belongs to.
 * @param name The name of the image attribute.
 * @param id The ID of the entity record.
 * @returns A URL string to download the image.
 *
 * @example
 * // Get the URL for a contact's profile image:
 * const imageUrl = getImageUrl("contact", "entityimage", "12345");
 * // returns "/Image/download.aspx?Entity=contact&Attribute=entityimage&Id=12345&Full=true"
 */
export declare function getImageUrl(entity: string, name: string, id: string): string;

/** Extracts the string name from a FieldName type. */
export declare function getName(name: Name): string;

export declare type GetTable<T = any> = () => T;

/** Group a field inside an `apply()` expression. */
export declare function groupby<TValue>(ref: FieldRef<TValue>): GroupByExpr<TValue>;

export declare function groupby(ref: string): GroupByExpr<unknown>;

/**
 * Represents a field used for grouping inside an `apply()` expression.
 * Created via the `groupby()` helper function.
 */
export declare class GroupByExpr<TValue = unknown> {
    private __type;
    readonly field: string;
    constructor(field: string);
}

export declare function gt(field: Name, value: string | number): FilterExpr;

/**
 * Represents a GUID (Globally Unique Identifier) string, a standard identifier
 * used extensively in Dataverse (and Microsoft technologies in general).
 * The format is a string with five sections separated by hyphens.
 */
export declare type GUID = `${string}-${string}-${string}-${string}-${string}`;

/**
 * Creates an image column definition.
 *
 * @param name The Dataverse logical name of the image column.
 */
export declare function image(name: string): ImageField;

export declare class ImageField extends Schema<string | null> {
    kind: "value";
    type: "image";
    constructor(name: string);
}

export declare function In(field: Name, values: (string | number)[]): FilterExpr;

/**
 * Infers the TypeScript type from a Dataverse schema definition.  This is a recursive
 * type that drills down through the schema definition (which can be a Table,
 * GenericProperties, or a Property) to extract the corresponding TypeScript type.
 *
 * @template T The Dataverse schema definition.
 */
export declare type Infer<T> = T extends DataverseTable<infer U> ? Infer<U> : T extends GenericProperties ? {
    [K in keyof T]: Infer<T[K]>;
} : T extends CollectionProperty<infer U> ? Infer<U>[] : T extends LookupProperty<infer U> ? Infer<U> | null : T extends Schema<infer U> ? U : never;

export declare function InFiscalPeriod(field: Name, value: number): FilterExpr;

export declare function InFiscalPeriodAndYear(field: Name, fiscalPeriod: number, fiscalYear: number): FilterExpr;

export declare function InFiscalYear(field: Name, value: number): FilterExpr;

export declare function InOrAfterFiscalPeriodAndYear(field: Name, fiscalPeriod: number, fiscalYear: number): FilterExpr;

export declare function InOrBeforeFiscalPeriodAndYear(field: Name, fiscalPeriod: number, fiscalYear: number): FilterExpr;

/**
 * Creates a validator function that checks if a value is an integer.  It can validate both numbers and strings.
 *
 * @returns A validator function that returns "Must be an integer" if the value is not an integer, otherwise undefined.
 *
 * @example
 * // Create an integer validator:
 * const isInteger = integer();
 *
 * // Validate a number:
 * isInteger(10);     // returns undefined (valid)
 * isInteger(10.5);   // returns "Must be an integer" (invalid)
 *
 * // Validate a string:
 * isInteger("10");   // returns undefined (valid)
 * isInteger("10.5"); // returns "Must be an integer" (invalid)
 * isInteger("abc");  // returns "Must be an integer" (invalid)
 */
export declare function integer(): Validator<number | string>;

export declare function isActive(): FilterExpr;

export declare function isInactive(): FilterExpr;

export declare function isNonEmptyString(value: unknown): value is string;

export declare function isNotNull(field: Name): FilterExpr;

export declare function isNull(field: Name): FilterExpr;

export declare function isType(type: Types): Validator<any>;

export declare function isTypeOrNull(type: Types): Validator<any>;

export declare function keys(keyValues: {
    [key: string]: string | number;
}): string;

export declare function Last7Days(field: Name): FilterExpr;

export declare function LastFiscalPeriod(field: Name): FilterExpr;

export declare function LastFiscalYear(field: Name): FilterExpr;

export declare function LastMonth(field: Name): FilterExpr;

export declare function LastWeek(field: Name): FilterExpr;

export declare function LastXDays(field: Name, value: number): FilterExpr;

export declare function LastXFiscalPeriods(field: Name, value: number): FilterExpr;

export declare function LastXFiscalYears(field: Name, value: number): FilterExpr;

export declare function LastXHours(field: Name, value: number): FilterExpr;

export declare function LastXMonths(field: Name, value: number): FilterExpr;

export declare function LastXWeeks(field: Name, value: number): FilterExpr;

export declare function LastXYears(field: Name, value: number): FilterExpr;

export declare function LastYear(field: Name): FilterExpr;

export declare function le(field: Name, value: string | number): FilterExpr;

/**
 * Creates a choice/option-set column definition with a fixed set of allowed values.
 *
 * @param name The Dataverse logical name of the column.
 * @param list The array of allowed string or numeric values.
 *
 * @example
 * const table = new DataverseTable({
 *   gender: list("gendercode", [1, 2]),
 * });
 * // Infer<typeof table>["gender"] → 1 | 2 | null
 */
export declare function list<T extends string | number>(name: string, list: Array<T>): ListField<T>;

export declare class ListField<T extends string | number> extends Schema<T | null> {
    kind: "value";
    type: "list";
    list: Array<T>;
    constructor(name: string, list: Array<T>);
}

/**
 * Creates a many-to-one (lookup) navigation property definition. The related record
 * can be expanded via OData `$expand` or fetched through the table API.
 *
 * @param name The Dataverse logical name of the lookup column.
 * @param getTable A thunk that returns the related table definition.
 *
 * @example
 * const Address = table(client, "addresses", { id: primaryKey("addressid"), ... });
 * const Person = table(client, "people", {
 *   id: primaryKey("personid"),
 *   primaryAddress: lookup("primaryaddressid", () => Address),
 * });
 * // Infer<typeof Person>["primaryAddress"] → { id: GUID; ... } | null
 */
export declare function lookup<TProperties extends GenericProperties>(name: string, getTable: GetTable<DataverseTable<TProperties>>): LookupProperty<TProperties>;

/**
 * Creates a lookup-ID navigation property definition. This stores only the foreign-key
 * GUID of the related record (not the full expanded record).
 *
 * @param name The Dataverse logical name of the lookup column.
 * @param getTable A thunk that returns the related table definition.
 *
 * @example
 * const Address = table(client, "addresses", { id: primaryKey("addressid"), ... });
 * const Person = table(client, "people", {
 *   id: primaryKey("personid"),
 *   primaryAddressId: lookupId("primaryaddressid", () => Address),
 * });
 * // Infer<typeof Person>["primaryAddressId"] → `${string}-${string}-${string}-${string}-${string}` | null
 */
export declare function lookupId(name: string, getTable: GetTable): LookupIdProperty;

export declare class LookupIdProperty extends Schema<GUID | null> {
    #private;
    kind: "navigation";
    type: "lookupId";
    navigationName: string;
    constructor(name: string, getTable: GetTable);
    get table(): DataverseTable<{
        id: PrimaryKeyField;
    }>;
    transformValueToDataverse(value: any): string | null;
}

declare type LookupKeys<T> = {
    [K in keyof T]: T[K] extends LookupProperty<any> ? K : never;
}[keyof T];

export declare class LookupProperty<TProperties extends GenericProperties> extends Schema<Infer<TProperties> | null> {
    #private;
    kind: "navigation";
    type: "lookup";
    constructor(name: string, getTable: GetTable<DataverseTable<TProperties>>);
    get table(): DataverseTable<TProperties>;
    transformValueFromDataverse(value: any): Infer<TProperties> | null;
    getIssues(value: any, path?: PropertyKey[]): StandardSchemaV1.Issue[];
}

export declare function lt(field: Name, value: string | number): FilterExpr;

export declare function mapChoices(data: any): {
    value: number;
    color: string;
    label: string;
    description: string;
}[];

/** Maximum aggregation. */
export declare function max<TValue>(name: FieldRef<TValue>, alias?: string): Aggregation<TValue>;

export declare function max(name: string, alias?: string): Aggregation<number>;

/**
 * Creates a validator function that checks if the length of a value is less than or equal to a maximum length.
 *
 * @param max The maximum length.
 * @returns A validator function that returns an error message if the length is greater than the maximum, otherwise undefined.
 *
 * @example
 * // Create a maxLength validator:
 * const maxLength10 = maxLength(10);
 *
 * // Validate a string:
 * maxLength10("hello");         // returns undefined (valid)
 * maxLength10("hello world!"); // returns "Length more than 10" (invalid)
 *
 * // Validate an array:
 * maxLength10([1, 2, 3, 4, 5]);   // returns undefined (valid)
 * maxLength10([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]); // returns "Length more than 10" (invalid)
 */
export declare function maxLength(max: number): (v: {
    length: number;
}) => string | undefined;

/**
 * Creates a validator function that checks if a number is less than or equal to a maximum value.
 *
 * @param max The maximum value.
 * @returns A validator function that returns an error message if the number is greater than the maximum, otherwise undefined.
 *
 * @example
 * // Create a maxValue validator:
 * const maxAge65 = maxValue(65);
 *
 * // Validate an age:
 * maxAge65(40); // returns undefined (valid)
 * maxAge65(70); // returns "Must be no more than 65" (invalid)
 */
export declare function maxValue(max: number): Validator<number>;

/**
 * Retains references to previous recrods if ETag value is unchanged
 *
 * @param prevRecords
 * @param newRecords
 * @returns
 */
export declare function mergeRecords<T>(prevRecords: T[], newRecords: T[]): T[];

/** Minimum aggregation. */
export declare function min<TValue>(name: FieldRef<TValue>, alias?: string): Aggregation<TValue>;

export declare function min(name: string, alias?: string): Aggregation<number>;

/**
 * Creates a validator function that checks if the length of a value is greater than or equal to a minimum length.
 *
 * @param min The minimum length.
 * @returns A validator function that returns an error message if the length is less than the minimum, otherwise undefined.
 *
 * @example
 * // Create a minLength validator:
 * const minLength5 = minLength(5);
 *
 * // Validate a string:
 * minLength5("hello");       // returns undefined (valid)
 * minLength5("hi");          // returns "Length less than 5" (invalid)
 *
 * // Validate an array:
 * minLength5([1, 2, 3, 4, 5]); // returns undefined (valid)
 * minLength5([1, 2, 3]);       // returns "Length less than 5" (invalid)
 */
export declare function minLength(min: number): (v: {
    length: number;
}) => string | undefined;

/**
 * Creates a validator function that checks if a number is greater than or equal to a minimum value.
 *
 * @param min The minimum value.
 * @returns A validator function that returns an error message if the number is less than the minimum, otherwise undefined.
 *
 * @example
 * // Create a minValue validator:
 * const minAge18 = minValue(18);
 *
 * // Validate an age:
 * minAge18(21); // returns undefined (valid)
 * minAge18(15); // returns "Must be at least 18" (invalid)
 */
export declare function minValue(min: number): Validator<number>;

/** A field name can be a string or an object with a name or toString method. */
export declare type Name = string | {
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
export declare type NarrowKeysByValue<T extends object, V> = {
    [K in keyof T]: T[K] extends V ? K : never;
}[keyof T];

export declare function ne(field: Name, value: FilterValue): FilterExpr;

declare type NestedStringArray = Array<string | NestedStringArray>;

export declare function Next7Days(field: Name): FilterExpr;

export declare function NextFiscalPeriod(field: Name): FilterExpr;

export declare function NextFiscalYear(field: Name): FilterExpr;

export declare function NextMonth(field: Name): FilterExpr;

export declare function NextWeek(field: Name): FilterExpr;

export declare function NextXDays(field: Name, value: number): FilterExpr;

export declare function NextXFiscalPeriods(field: Name, value: number): FilterExpr;

export declare function NextXFiscalYears(field: Name, value: number): FilterExpr;

export declare function NextXHours(field: Name, value: number): FilterExpr;

export declare function NextXMonths(field: Name, value: number): FilterExpr;

export declare function NextXWeeks(field: Name, value: number): FilterExpr;

export declare function NextXYears(field: Name, value: number): FilterExpr;

export declare function NextYear(field: Name): FilterExpr;

export declare function not(condition: FilterExpr | string): FilterExpr;

export declare function NotBetween(field: Name, value1: string | number, value2: string | number): FilterExpr;

export declare function NotEqualBusinessId(field: Name): FilterExpr;

export declare function NotEqualUserId(field: Name): FilterExpr;

export declare function NotIn(field: Name, values: (string | number)[]): FilterExpr;

export declare function NotUnder(field: Name, value: string): FilterExpr;

/**
 * Creates a nullable date-only column definition (allows `null`).
 *
 * @param name The Dataverse logical name of the column.
 */
export declare function nullableDate(name: string): NullableDateField;

export declare class NullableDateField extends Schema<Date | null> {
    kind: "value";
    type: "dateOnly";
    constructor(name: string);
    transformValueFromDataverse(value: any): Date | null;
    transformValueToDataverse(value: any): string | null;
}

/**
 * Creates a nullable date-time column definition (allows `null`).
 *
 * @param name The Dataverse logical name of the column.
 */
export declare function nullableDateTime(name: string): NullableDateTimeField;

export declare class NullableDateTimeField extends Schema<Date | null> {
    kind: "value";
    type: "date";
    constructor(name: string);
    transformValueFromDataverse(value: any): Date | null;
}

/**
 * Creates a nullable number column definition (allows `null`).
 *
 * @param name The Dataverse logical name of the column.
 *
 * @example
 * const table = new DataverseTable({
 *   age: nullableNumber("person_age"),
 * });
 * // Infer<typeof table>["age"] → number | null
 */
export declare function nullableNumber(name: string): NullableNumberField;

export declare class NullableNumberField extends Schema<number | null> {
    kind: "value";
    type: "number";
    constructor(name: string);
}

/**
 * Creates a nullable string column definition (allows `null`).
 *
 * @param name The Dataverse logical name of the column.
 *
 * @example
 * const table = new DataverseTable({
 *   middleName: nullableString("middlename"),
 * });
 * // Infer<typeof table>["middleName"] → string | null
 */
export declare function nullableString(name: string): NullableStringField;

export declare class NullableStringField extends Schema<string | null> {
    kind: "value";
    type: "string";
    constructor(name: string);
}

/**
 * Creates a number-typed Dataverse column definition.
 *
 * @param name The Dataverse logical name of the column (e.g. `"person_age"`).
 *
 * @example
 * const table = new DataverseTable({
 *   age: number("person_age"),
 * });
 * // Infer<typeof table>["age"] → number
 */
export declare function number(name: string): NumberField;

export declare class NumberField extends Schema<number> {
    kind: "value";
    type: "number";
    constructor(name: string);
    transformValueFromDataverse(value: any): number;
}

/**
 * Creates a validator function that checks if a value is a number. It can validate both numbers and strings.
 *
 * @returns A validator function that returns "Must be a number" if the value is not a number, otherwise undefined.
 *
 * @example
 * // Create a numeric validator:
 * const isNumeric = numeric();
 *
 * // Validate a number:
 * isNumeric(10);     // returns undefined (valid)
 * isNumeric(10.5);   // returns undefined (valid)
 *
 * // Validate a string:
 * isNumeric("10");   // returns undefined (valid)
 * isNumeric("10.5"); // returns undefined (valid)
 * isNumeric("abc");  // returns "Must be a number" (invalid)
 */
export declare function numeric(): Validator<number | string>;

declare type ODataCollectionNavProxy<P extends GenericProperties> = {
    toString(): string;
} & ODataFieldProxy<P>;

declare type ODataFieldProxy<T extends GenericProperties> = {
    [K in keyof T]: T[K] extends CollectionProperty<infer P> ? ODataCollectionNavProxy<P> : T[K] extends LookupProperty<infer P> ? ODataLookupNavProxy<P> : FieldRef<Infer<T[K]>, K extends string ? K : never>;
};

declare type ODataLambdaProxy<P extends GenericProperties> = {
    [K in keyof P]: string;
};

declare type ODataLookupNavProxy<P extends GenericProperties> = {
    toString(): string;
} & ODataFieldProxy<P>;

/**
 * A type-safe OData query builder for Dataverse.
 *
 * Create one via {@link fetchOdata} — never instantiate directly.
 *
 * @example
 * const q = fetchOdata(Person)
 *   .select("name", "age")
 *   .filter(f => equals(f.name, "John"))
 *   .orderby(f => f.name)
 *   .top(10);
 *
 * const results = await q.execute();
 */
export declare class ODataQuery<T extends GenericProperties, TResult = Infer<T>> {
    private _table;
    private _fields;
    private _selectedKeys;
    private _filters;
    private _expands;
    private _orderby;
    private _top?;
    private _apply;
    private _isApply;
    private _expandMode;
    private _proxy;
    private _applyAliasProxy;
    constructor(table: DataverseTable<T>);
    private _buildProxy;
    private _buildProxyForDataverseTable;
    /**
     * Selects all value columns (no-args) or restricts to the specified fields.
     *
     * @example
     * fetchOdata(Person).select();
     * fetchOdata(Person).select("name", "age");
     */
    select(): ODataQuery<T, Infer<T>>;
    select<K extends ValueKeys<T>>(...keys: K[]): ODataQuery<T, {
        [P in K]: Infer<T[P]>;
    }>;
    /**
     * Adds a `$filter` clause. Can be a raw string or a callback receiving a
     * typed field proxy. Multiple `.filter()` calls stack with `and`.
     *
     * @example
     * fetchOdata(Person).filter(f => eq(f.name, "John"));
     *
     * @example
     * // Multiple calls stack:
     * fetchOdata(Person)
     *   .filter(f => equals(f.name, "John"))
     *   .filter(f => greaterThan(f.age, 20));
     */
    filter(filter: string): this;
    filter(filter: FilterExpr): this;
    filter(filter: (f: ODataFieldProxy<T>) => string | FilterExpr): this;
    /**
     * Adds a `$expand` clause for a navigation property.
     *
     * @example
     * fetchOdata(Person)
     *   .select("name")
     *   .expand("primaryAddress", sub => sub.select("street", "zip"));
     *
     * @example
     * // Nested expand:
     * fetchOdata(Person)
     *   .expand("primaryAddress", sub =>
     *     sub.expand("location", sub2 => sub2.select("name"))
     *   );
     */
    expand<K extends CollectionKeys<T>, R>(key: K, sub?: (q: Omit<ODataQuery<RelatedProps<T, K>>, 'apply'>) => ODataQuery<RelatedProps<T, K>, R>): ODataQuery<T, Omit<TResult, K & keyof TResult> & {
        [P in K]: ExpandResult<T, P, R>;
    }>;
    expand<K extends LookupKeys<T>, R>(key: K, sub?: (q: Omit<ODataQuery<RelatedProps<T, K>>, 'orderby' | 'top' | 'apply'>) => ODataQuery<RelatedProps<T, K>, R>): ODataQuery<T, Omit<TResult, K & keyof TResult> & {
        [P in K]: ExpandResult<T, P, R>;
    }>;
    /**
     * Adds a `$orderby` clause.
     *
     * After `select()`: use a field selector callback.
     * After `apply()`: use a field selector callback with alias names.
     *
     * Multiple calls accumulate.
     *
     * @example
     * fetchOdata(Person).orderby(f => f.name);
     * fetchOdata(Person).orderby(f => f.age, "desc");
     * fetchOdata(Person).apply(v => ({ total: sum(v.age) })).orderby(r => r.total, "desc");
     */
    orderby(fieldSelector: (f: ODataFieldProxy<T>) => string, direction?: "asc" | "desc"): this;
    orderby(alias: string, direction?: "asc" | "desc"): this;
    /** Limits the number of returned records (`$top`). */
    top(n: number): this;
    /**
     * Adds a `$apply` expression for server-side aggregation and grouping.
     * The callback receives a field proxy and must return a record where:
     * - Values created with `groupby()` define grouping fields
     * - Values created with `sum()`, `average()`, `min()`, `max()`, `count()` define aggregations
     *
     * Record keys become the alias names in the response.
     *
     * @example
     * fetchOdata(Person).apply(v => ({
     *   age: groupby(v.age),
     *   total: sum(v.age),
     *   average: average(v.age),
     * }));
     *
     * @example
     * // Aggregate without grouping:
     * fetchOdata(Person).apply(v => ({
     *   total: sum(v.age),
     *   cnt: count(),
     * }));
     */
    apply<R extends Record<string, GroupByExpr<any> | Aggregation<any>>>(expr: (f: ODataFieldProxy<T>) => R): Omit<ODataQuery<T, ApplyResultType<R>>, 'select' | 'expand'> & {
        orderby(fieldSelector: (f: ApplyAliasProxy<ApplyResultType<R>>) => string, direction?: "asc" | "desc"): ODataQuery<T, ApplyResultType<R>>;
        orderby(alias: string, direction?: "asc" | "desc"): ODataQuery<T, ApplyResultType<R>>;
    };
    private _build;
    toString(): string;
    private _partialTransform;
    execute(): Promise<TResult[]>;
}

export declare function OlderThanXDays(field: Name, value: number): FilterExpr;

export declare function OlderThanXHours(field: Name, value: number): FilterExpr;

export declare function OlderThanXMinutes(field: Name, value: number): FilterExpr;

export declare function OlderThanXMonths(field: Name, value: number): FilterExpr;

export declare function OlderThanXWeeks(field: Name, value: number): FilterExpr;

export declare function OlderThanXYears(field: Name, value: number): FilterExpr;

export declare function On(field: Name, value: string): FilterExpr;

export declare function OnOrAfter(field: Name, value: string): FilterExpr;

export declare function OnOrBefore(field: Name, value: string): FilterExpr;

export declare function or(...conditions: (FilterExpr | string)[]): FilterExpr;

export declare function orderby(values: {
    [key: string]: "asc" | "desc";
} | string[]): string;

export declare class OrderSpec {
    readonly fields: string[];
    readonly direction: "asc" | "desc";
    constructor(fields: string[], direction: "asc" | "desc");
    toString(): string;
}

export declare function parseDateOnly(dateString: string): Date;

export declare function pattern(regex: RegExp, message?: string): Validator<string>;

/**
 * Creates a primary key (GUID) column definition for a Dataverse table.
 *
 * @param name The Dataverse logical name of the primary key column (e.g. `"contactid"`).
 *
 * @example
 * const table = new DataverseTable({
 *   id: primaryKey("contactid"),
 * });
 * // Infer<typeof table>["id"] → `${string}-${string}-${string}-${string}-${string}`
 */
export declare function primaryKey(name: string): PrimaryKeyField;

export declare class PrimaryKeyField extends Schema<GUID> {
    kind: "value";
    type: "primaryKey";
    constructor(name: string);
    getDefault(): GUID;
}

export declare type Primitive = string | number | boolean | null;

export declare type QueryForTable<T> = {
    orderby?: Partial<Record<keyof T, "asc" | "desc">> | string;
    filter?: string;
    top?: number;
};

declare type RelatedProps<T, K extends keyof T> = T[K] extends LookupProperty<infer P> ? P : T[K] extends CollectionProperty<infer P> ? P : never;

export declare function required(): (v: any) => "Required" | undefined;

/**
 * Retrieves the roles assigned to a user in Azure Active Directory (AAD).
 *
 * @param aadId - The AAD Directory Object ID of the user whose roles need to be fetched.
 * @returns  A promise that resolves to a Set of role names associated with the user.
 */
export declare function RetrieveAadUserRoles(client: DataverseClient, aadId: string): Promise<Set<string>>;

export declare function RetrieveChoices(client: DataverseClient, name: string): Promise<{
    value: number;
    color: string;
    label: string;
    description: string;
}[]>;

/**
 * Retrieves the total record count for a specific entity in the system.
 *
 * @param  logicalName - The logical name of the entity whose total record count is to be fetched.
 * @returns  A promise that resolves to the total record count for the specified entity.
 */
export declare function RetrieveTotalRecordCount(client: DataverseClient, logicalName: string): Promise<number>;

/**
 * Base class for all Dataverse schema properties. Implements the StandardSchemaV1 interface
 * for validation and transformation.
 *
 * @template T The TypeScript type of the property's value (e.g. `string`, `number`, `Date`).
 *
 * @example
 * // Custom string property with a regex validator
 * class SSNField extends Schema<string> {
 *   constructor(name: string) {
 *     super(name, "");
 *     this.check((v) => /^\d{3}-\d{2}-\d{4}$/.test(v) ? undefined : "Invalid SSN");
 *   }
 * }
 */
export declare class Schema<T> implements StandardSchemaV1<T> {
    #private;
    name: string;
    toDataverseName: string;
    fromDataverseName: string;
    kind: string;
    type: string;
    /**
     * @param name The Dataverse logical name of the column/attribute.
     * @param defaultValue The default value used when no value is provided.
     */
    constructor(name: string, defaultValue: T);
    /**
     * Overrides the default value for this property.
     *
     * @example
     * const field = new StringField("firstname").setDefault("John");
     * field.getDefault(); // "John"
     */
    setDefault(value: T): this;
    /**
     * Returns the default value for this property.
     */
    getDefault(): T;
    /**
     * Marks this property as read-only. Read-only properties are excluded
     * when transforming data for Dataverse (e.g. they won't be sent in create/update).
     *
     * @param value Whether the property should be read-only. Defaults to `true`.
     *
     * @example
     * const field = new StringField("createdby").setReadOnly(true);
     * field.getReadOnly(); // true
     */
    setReadOnly(value?: boolean): this;
    /**
     * Returns whether this property is read-only.
     */
    getReadOnly(): boolean;
    /**
     * Adds a validation function to this property. Validators run during
     * {@link validate} and {@link parse}. A validator returns `undefined` if valid,
     * or an error message string if invalid.
     *
     * @example
     * const field = new StringField("zip").check((v) =>
     *   /^\d{5}(-\d{4})?$/.test(v) ? undefined : "Invalid ZIP code"
     * );
     * field.parse("12345"); // ok
     * field.parse("abc");   // throws
     */
    check(v: Validator<T>): this;
    /**
     * Adds a "required" validator that rejects `null` or `undefined` values.
     *
     * @example
     * const field = new StringField("email").required();
     * field.validate(null);  // { issues: [{ message: "Required" }] }
     * field.validate("a@b"); // { value: "a@b" }
     */
    required(): this;
    /**
     * Transforms a raw value from Dataverse into the property's TypeScript type.
     * Override this in subclasses for custom deserialization (e.g. string → Date).
     *
     * @param value The raw value from the Dataverse API.
     * @returns The typed value.
     *
     * @example
     * // A custom date-only field
     * class DateOnlyField extends Schema<Date> {
     *   transformValueFromDataverse(value: any): Date {
     *     return new Date(value + "T00:00:00Z");
     *   }
     * }
     */
    transformValueFromDataverse(value: any): T;
    /**
     * Transforms the property's value into a format suitable for Dataverse.
     * Override this in subclasses for custom serialization (e.g. Date → string).
     *
     * @param value The property value to send to Dataverse.
     * @returns The serialized value.
     *
     * @example
     * class DateOnlyField extends Schema<Date> {
     *   transformValueToDataverse(value: Date): string {
     *     return value.toISOString().slice(0, 10);
     *   }
     * }
     */
    transformValueToDataverse(value: any): any;
    getIssues(value: unknown, path?: PropertyKey[]): StandardSchemaV1.Issue[];
    /**
     * Validates a value against this property's validators. Returns either
     * `{ value }` on success or `{ issues }` on failure.
     *
     * @example
     * const field = new StringField("email").required();
     * field.validate("test@example.com"); // { value: "test@example.com" }
     * field.validate(null);               // { issues: [{ message: "Required", path: [] }] }
     */
    validate(value: unknown, path?: PropertyKey[]): StandardSchemaV1.Result<T>;
    /**
     * Validates a value and returns it if valid, or throws if invalid.
     * This is a convenience wrapper around {@link validate}.
     *
     * @throws {Error} If validation fails, the error message contains the JSON-serialized issues.
     *
     * @example
     * const field = new StringField("age").check((v) =>
     *   Number(v) >= 0 ? undefined : "Must be non-negative"
     * );
     * field.parse("25");  // "25"
     * field.parse("-1");  // throws Error("[{\"message\":\"Must be non-negative\",\"path\":[]}]")
     */
    parse(value: unknown): T;
    /**
     * Provides access to the standard schema properties for this property.
     * This is a computed property.
     *
     * @returns An object containing the standard schema properties, including version, vendor, and a validation function.
     */
    get ["~standard"](): StandardSchemaV1.Props<T>;
}

export declare function select(...values: (Name)[]): string;

declare type Simplify<T> = {
    [Key in keyof T]: T[Key];
} & {};

export declare function startsWith(field: Name, value: string): FilterExpr;

/**
 * Creates a string-typed Dataverse column definition.
 *
 * @param name The Dataverse logical name of the column (e.g. `"fullname"`).
 *
 * @example
 * const table = new DataverseTable({
 *   name: string("fullname"),
 * });
 * // Infer<typeof table>["name"] → string
 */
export declare function string(name: string): StringField;

export declare class StringField extends Schema<string> {
    kind: "value";
    type: "string";
    constructor(name: string);
    transformValueFromDataverse(value: any): string;
}

/** Sum aggregation. */
export declare function sum<TValue>(name: FieldRef<TValue>, alias?: string): Aggregation<TValue>;

export declare function sum(name: string, alias?: string): Aggregation<number>;

export declare function ThisFiscalPeriod(field: Name): FilterExpr;

export declare function ThisFiscalYear(field: Name): FilterExpr;

export declare function ThisMonth(field: Name): FilterExpr;

export declare function ThisWeek(field: Name): FilterExpr;

export declare function ThisYear(field: Name): FilterExpr;

/**
 * Converts a File object to a base64 encoded string.
 *
 * @param file The File object to convert.
 * @returns A promise that resolves to the base64 encoded string, or rejects with an error.
 *
 * @example
 * // Convert a file to base64:
 * const myFile = document.getElementById('myFile').files[0];
 * toBase64(myFile)
 * .then(base64String => console.log(base64String))
 * .catch(error => console.error(error));
 */
export declare function toBase64(file: File): Promise<string>;

export declare function toDateOnly(date: Date): string | null;

export declare function Today(field: Name): FilterExpr;

export declare function Tomorrow(field: Name): FilterExpr;

export declare type Types = "string" | "number" | "bigint" | "boolean" | "symbol" | "undefined" | "object" | "function";

export declare function Under(field: Name, value: string): FilterExpr;

export declare function UnderOrEqual(field: Name, value: string): FilterExpr;

export declare type Validator<T> = (value: T) => void | undefined | string;

declare type ValueKeys<T> = {
    [K in keyof T]: T[K] extends LookupProperty<any> | CollectionProperty<any> ? never : K;
}[keyof T];

/**
 * Retrieves the identity information of the currently authenticated user.
 *
 * @returns A promise that resolves to an object containing the BusinessUnitId, UserId, and OrganizationId
 * of the currently authenticated user.
 */
export declare function WhoAmI(client: DataverseClient): Promise<{
    BusinessUnitId: GUID;
    UserId: GUID;
    OrganizationId: GUID;
}>;

export declare function wrapString(value: unknown): string;

/**
 * Creates an XML string from a template string array, removing unnecessary whitespace.
 *
 * @param raw The template string array.
 * @param values The values to interpolate into the template string.
 * @returns A compact XML string.
 *
 * @example
 * // Create a simple XML string:
 * const myXml = xml`
 * <root>
 * <element>Hello</element>
 * </root>
 * `;
 * // returns "<root><element>Hello</element></root>"
 */
export declare function xml(raw: TemplateStringsArray, ...values: unknown[]): string;

export declare function Yesterday(field: Name): FilterExpr;

export { }
