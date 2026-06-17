import { StandardSchemaV1 } from '@standard-schema/spec';

/** Filters records above a hierarchical position. */
export declare const Above: (field: Name, value: string) => string;

/** Filters records at or above a hierarchical position. */
export declare const AboveOrEqual: (field: Name, value: string) => string;

/**
 * Creates an `aggregate` clause for the `$apply` query option.
 *
 * @example
 * aggregate(average("revenue"), count())
 * // "aggregate(revenue with average as revenue,$count as count)"
 */
export declare function aggregate(...values: string[]): string;

/**
 * Creates an `all` lambda filter for collection navigation properties.
 *
 * @example
 * all("contact_customer_accounts", "a", greaterThan("a", "revenue", 1000))
 * // "contact_customer_accounts/all(a: (a/revenue gt 1000))"
 */
export declare function all(collectionProperty: Name, alias: string, condition: string): string;

/**
 * Represents an alternate key for a Dataverse entity.  An alternate key is used
 * to uniquely identify a record instead of using its primary key (GUID).
 * It can be a single key-value pair or a combination of multiple key-value pairs.
 */
export declare type AlternateKey = `${string}=${string}` | `${string}=${string},${string}=${string}`;

/**
 * Combines filter conditions with logical AND.
 *
 * @example
 * and(equals("statecode", 0), equals("statuscode", 1))
 * // "((statecode eq 0) and (statuscode eq 1))"
 */
export declare function and(...conditions: string[]): string;

/**
 * Creates an `any` lambda filter for collection navigation properties.
 *
 * @example
 * any("contact_customer_accounts", "a", equals("a", "statecode", 0))
 * // "contact_customer_accounts/any(a: (a/statecode eq 0))"
 */
export declare function any(collectionProperty: Name, alias: string, condition: string): string;

/**
 * Creates an ascending order specification.
 *
 * @example
 * asc("name", "createdon")
 * // OrderSpec { fields: ["name", "createdon"], direction: "asc" }
 */
export declare function asc(...fields: Name[]): OrderSpec;

export declare function attachEtag<T>(v: T): T;

/**
 * Creates an `average` aggregation expression for `$apply`.
 *
 * @example
 * average("revenue", "avg_revenue")
 * // "revenue with average as avg_revenue"
 */
export declare function average(field: Name, alias?: string): string;

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

/** Filters between two values. */
export declare const Between: (field: Name, value1: string | number, value2: string | number) => string;

/**
 * Creates a boolean-typed Dataverse column definition.
 *
 * @param name The Dataverse logical name of the column (e.g. `"is_active"`).
 *
 * @example
 * const table = defineTable({
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
export declare function collection<TProperties extends GenericProperties>(name: string, getTable: GetTable<Table<TProperties>>): CollectionProperty<TProperties>;

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
    get table(): Table<{
        id: PrimaryKeyField;
    }>;
    transformValueFromDataverse(value: any): GUID[];
    getIssues(value: any, path?: PropertyKey[]): StandardSchemaV1.Issue[];
}

export declare class CollectionProperty<TProperties extends GenericProperties> extends Schema<Infer<TProperties>[]> {
    #private;
    kind: "navigation";
    type: "collection";
    constructor(name: string, getTable: GetTable<Table<TProperties>>);
    get table(): Table<TProperties>;
    transformValueFromDataverse(value: any): Infer<TProperties>[];
    getIssues(value: any, path?: PropertyKey[]): StandardSchemaV1.Issue[];
}

/**
 * Compares two fields directly using the specified operator (column comparison).
 *
 * @example
 * compare("modifiedon", "gt", "createdon")
 * // "(modifiedon gt createdon)"
 */
export declare function compare(field: Name, operator: string, otherField: Name): string;

/**
 * Creates a FetchXML condition element string.
 *
 * @example
 * condition("statuscode", "eq", 1)
 * // '<condition attribute="statuscode" operator="eq" value="1" />'
 */
export declare function condition(attribute: string, operator: string, value: unknown): string;

/**
 * Creates a `contains` filter for substring matching.
 *
 * @example
 * contains("fullname", "John")
 * // "contains(fullname,'John')"
 */
export declare function contains(field: Name, value: string): string;

/** Filters records containing specified values (multi-select). */
export declare const ContainsValues: (field: Name, values: (string | number)[]) => string;

/**
 * Creates a `$count` aggregation expression for `$apply`.
 *
 * @example
 * count("record_count")
 * // "$count as record_count"
 */
export declare function count(alias?: string): string;

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
 * Creates a date-only column definition (maps to JavaScript `Date`, time portion is zeroed).
 *
 * @param name The Dataverse logical name of the column.
 *
 * @example
 * const table = defineTable({
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
 * const table = defineTable({
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

/**
 * Creates a descending order specification.
 *
 * @example
 * desc("createdon")
 * // OrderSpec { fields: ["createdon"], direction: "desc" }
 */
export declare function desc(...fields: Name[]): OrderSpec;

/** Filters records NOT containing specified values (multi-select). */
export declare const DoesNotContainValues: (field: Name, values: (string | number)[]) => string;

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

/**
 * Creates an `endswith` filter.
 *
 * @example
 * endsWith("email", "@example.com")
 * // "endswith(email,'@example.com')"
 */
export declare function endsWith(field: Name, value: string): string;

/**
 * Builds a FetchXML query for Dataverse with full type support.
 *
 * Use `fetchXml(table)` to create a builder, then chain methods to construct
 * the query. Call `execute()` to run it or `toXml()` to get the raw XML.
 *
 * @example
 * const q = fetchXml(contactTable)
 *   .select(f => ({ name: f.name, email: f.email }))
 *   .where(f => condition(f.status, "eq", 1))
 *   .orderby(f => desc(f.name))
 *   .top(10);
 *
 * const xml = q.toXml();
 * const results = await q.execute();
 */
export declare class EntityQueryBuilder<TProps extends GenericProperties, TResult extends Record<string, any> = {}> {
    private _aliasCounter;
    private _table;
    private _attributes;
    private _links;
    private _isDistinct;
    private _filters;
    private _proxy;
    private _top?;
    private _page?;
    private _pageSize?;
    private _isAggregate;
    private _returnTotalRecordCount;
    private _useRawOrderBy;
    private _lateMaterialize;
    private _aggregateLimit?;
    private _orders;
    private _pagingCookie?;
    private _datasource?;
    private _options?;
    /** @param table The Table definition to build the query against. */
    constructor(table: Table<TProps>);
    private _buildProxy;
    /**
     * Selects specific fields to include in the FetchXML query.
     * The result type is narrowed to only include selected fields.
     *
     * @example
     * fetchXml(contactTable)
     *   .select(f => ({ name: f.name, email: f.email }))
     */
    select<TSelect extends Record<string, keyof TProps>>(selector: (fields: FieldSelector<TProps>) => TSelect): EntityQueryBuilder<TProps, Simplify<TResult & {
        [K in keyof TSelect]: Infer<TProps[TSelect[K]]>;
    }>>;
    /**
     * Adds a filter condition to the FetchXML query.
     * Accepts a raw filter string or a callback that receives a field proxy.
     * Multiple `where()` calls are combined with AND.
     *
     * @example
     * // With callback
     * fetchXml(contactTable).where(f => condition(f.status, "eq", 1))
     *
     * @example
     * // Raw filter string
     * fetchXml(contactTable).where(condition("statuscode", "eq", "1"))
     */
    where(filter: string | ((f: FieldProxy<TProps>) => string)): this;
    /**
     * Adds a link-entity join to another table. The result type merges the
     * joined entity's selected fields.
     *
     * @example
     * fetchXml(contactTable)
     *   .select(f => ({ name: f.name }))
     *   .join("inner", accountTable, a => a.accountid, c => c.parentcustomerid,
     *     q => q.select(a => ({ accountName: a.name })))
     */
    join<TTable extends Table<any>, TFrom extends keyof TTable["fields"], TTo extends keyof TProps, TJoinResult extends Record<string, any>>(linkType: FetchLinkType, table: TTable, from: TFrom, to: TTo, subquery: (q: EntityQueryBuilder<TTable["fields"], {}>) => EntityQueryBuilder<TTable["fields"], TJoinResult>, intersect?: boolean): EntityQueryBuilder<TProps, Simplify<TResult & TJoinResult>>;
    /**
     * Shorthand for `join("inner", ...)`. Adds an inner link-entity join.
     *
     * @example
     * fetchXml(contactTable)
     *   .select(f => ({ name: f.name }))
     *   .innerJoin(accountTable, a => a.accountid, c => c.parentcustomerid,
     *     q => q.select(a => ({ accountName: a.name })))
     */
    innerJoin<TTable extends Table<any>, TFrom extends keyof TTable["fields"], TTo extends keyof TProps, TJoinResult extends Record<string, any>>(table: TTable, from: TFrom, to: TTo, subquery: (q: EntityQueryBuilder<TTable["fields"], {}>) => EntityQueryBuilder<TTable["fields"], TJoinResult>, intersect?: boolean): EntityQueryBuilder<TProps, TResult & TJoinResult extends infer T ? { [Key in keyof T]: (TResult & TJoinResult)[Key]; } : never>;
    /** Enables distinct (deduplicated) results. */
    distinct(): this;
    /** Limits the number of returned records. */
    top(n: number): this;
    /** Sets the page number for paginated results. */
    page(n: number): this;
    /** Sets the number of records per page. */
    pageSize(n: number): this;
    /** Requests the server to include the total record count. */
    returnTotalRecordCount(): this;
    /** Instructs the server to use the raw order-by string. */
    useRawOrderBy(): this;
    /** Enables late materialization for better performance on large datasets. */
    lateMaterialize(): this;
    /** Sets the aggregate limit for grouped results. */
    aggregateLimit(n: number): this;
    /** Sets custom query options. */
    options(value: string): this;
    /** Sets an alternate datasource (e.g. for federated queries). */
    datasource(value: string): this;
    /** Marks the query as an aggregate (grouped) query. */
    aggregate(): this;
    /**
     * Adds ordering to the FetchXML query.
     *
     * @example
     * // With asc/desc helpers
     * fetchXml(contactTable).orderby(f => desc(f.name))
     *
     * @example
     * // With record syntax
     * fetchXml(contactTable).orderby(f => ({ name: 'asc', createdon: 'desc' }))
     *
     * @example
     * // With explicit entity name
     * fetchXml(contactTable).orderby("contact", "createdon", "desc")
     */
    orderby(spec: ((f: FieldProxy<TProps>) => OrderSpec | OrderSpec[] | Record<string, 'asc' | 'desc'>)): this;
    orderby(entityname: string, attribute: string, direction?: 'asc' | 'desc'): this;
    /** Adds a SUM aggregate. Marks the query as aggregate. */
    sum(field: keyof TProps, alias: string): this;
    /** Adds an AVG aggregate. Marks the query as aggregate. */
    avg(field: keyof TProps, alias: string): this;
    /** Adds a MIN aggregate. Marks the query as aggregate. */
    min(field: keyof TProps, alias: string): this;
    /** Adds a MAX aggregate. Marks the query as aggregate. */
    max(field: keyof TProps, alias: string): this;
    /** Adds a COUNT aggregate. Marks the query as aggregate. */
    count(field: keyof TProps, alias: string): this;
    /** Adds a COUNTCOLUMN aggregate with optional distinct flag. Marks the query as aggregate. */
    countColumn(field: keyof TProps, alias: string, distinct?: boolean): this;
    /** Adds a custom row aggregate. */
    rowAggregate(field: keyof TProps, alias: string, rowaggregate: string): this;
    /** Adds a GROUP BY on a field. Marks the query as aggregate. */
    groupBy(field: keyof TProps, alias: string): this;
    /** Adds a GROUP BY with date grouping (e.g. "day", "month", "year"). Marks the query as aggregate. */
    groupByDate(field: keyof TProps, alias: string, dategrouping: string): this;
    /** Sets the paging cookie for navigating paginated results. */
    pagingCookie(cookie: string): this;
    /**
     * Returns the full FetchXML string.
     *
     * @example
     * const xml = fetchXml(contactTable)
     *   .select(f => ({ name: f.name }))
     *   .toXml();
     * // <fetch version="1.0" mapping="logical">
     * //   <entity name="contact">
     * //     <attribute name="fullname" alias="name" />
     * //   </entity>
     * // </fetch>
     */
    toXml(): string;
    /**
     * Returns the URL-encoded query string for use in the Dataverse API.
     *
     * @example
     * fetchXml(contactTable).select(f => ({ name: f.name })).toString()
     * // "fetchXml=%3Cfetch%20version%3D%221.0%22..."
     */
    toString(): string;
    /**
     * Executes the FetchXML query against Dataverse and returns the parsed results.
     *
     * @example
     * const contacts = await fetchXml(contactTable)
     *   .select(f => ({ name: f.name, email: f.email }))
     *   .where(f => condition(f.status, "eq", 1))
     *   .execute();
     * // contacts: Array<{ name: string; email: string }>
     */
    execute(): Promise<TResult[]>;
}

/** Filters records matching the current user's business unit. */
export declare const EqualBusinessId: (field: Name) => string;

/**
 * Creates an `eq` (equals) filter.
 *
 * @example
 * equals("statecode", 0)
 * // "(statecode eq 0)"
 *
 * equals("email", null)
 * // "(email eq null)"
 */
export declare function equals(field: Name, value: string | number | boolean | null): string;

/** Filters records owned by the current user. */
export declare const EqualUserId: (field: Name) => string;

/** Filters records matching the current user's language. */
export declare const EqualUserLanguage: (field: Name) => string;

/** Filters records owned by the user or their hierarchy. */
export declare const EqualUserOrUserHierarchy: (field: Name) => string;

/** Filters records owned by the user, their hierarchy, or their teams. */
export declare const EqualUserOrUserHierarchyAndTeams: (field: Name) => string;

/** Filters records owned by the user or their teams. */
export declare const EqualUserOrUserTeams: (field: Name) => string;

export declare const Etag: unique symbol;

/**
 * Formats a `$expand` query, including nested selects, filters, and expands.
 *
 * @example
 * expand({
 *   primarycontactid: { select: ["fullname", "email"] },
 *   parentcustomerid: {
 *     select: ["name"],
 *     expand: { createdby: { select: ["fullname"] } },
 *   },
 * })
 * // "primarycontactid($select=fullname,email),parentcustomerid($select=name;$expand=createdby($select=fullname))"
 *
 * @example
 * expand("primarycontactid") // simple string passthrough
 */
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

export declare type FetchLinkType = "inner" | "outer" | "any" | "not any" | "all" | "not all" | "exists" | "in";

export declare function fetchOdata<T extends GenericProperties>(table: Table<T>): ODataQuery<T, Infer<T>>;

/**
 * Wraps a raw FetchXML string into the format expected by the Dataverse API.
 * Trims whitespace and compresses tag gaps.
 *
 * @example
 * fetchXML("<fetch version='1.0'><entity name='contact'>...</entity></fetch>")
 * // "fetchXml=<fetch version='1.0'><entity name='contact'>...</entity></fetch>"
 */
export declare function fetchXML(xml: string): string;

/**
 * Creates a new FetchXML query builder for the given table.
 * Returns an `EntityQueryBuilder` that starts with all table fields selected
 * and narrows the result type as you chain methods.
 *
 * @example
 * const results = await fetchXml(contactTable)
 *   .select(f => ({ name: f.name }))
 *   .where(f => condition(f.statecode, "eq", 0))
 *   .execute();
 */
export declare function fetchXml<TProps extends GenericProperties>(table: Table<TProps>): EntityQueryBuilder<TProps, Infer<TProps>>;

export declare type FieldProxy<T extends GenericProperties> = {
    [K in keyof T]: string;
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

/**
 * Combines conditions with a logical AND.
 *
 * @example
 * filterAnd(
 *   condition("statecode", "eq", 0),
 *   condition("statuscode", "eq", 1),
 * )
 */
export declare function filterAnd(...conditions: string[]): string;

/**
 * Combines conditions with a logical OR.
 *
 * @example
 * filterOr(
 *   condition("statecode", "eq", 0),
 *   condition("statecode", "eq", 1),
 * )
 */
export declare function filterOr(...conditions: string[]): string;

/**
 * Creates a formatted-value column definition for retrieving user-localized display values
 * (e.g. for option-set labels). These are read-only.
 *
 * @param name The Dataverse logical name of the column.
 *
 * @example
 * const table = defineTable({
 *   statusLabel: formatted("statuscode"),
 * });
 */
export declare function formatted(name: string): FormattedField;

export declare class FormattedField extends Schema<string | null> {
    kind: "value";
    type: "formatted";
    constructor(name: string);
}

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

/**
 * Creates a `gt` (greater than) filter.
 *
 * @example
 * greaterThan("revenue", 10000)
 * // "(revenue gt 10000)"
 */
export declare function greaterThan(field: Name, value: string | number): string;

/**
 * Creates a `ge` (greater than or equal) filter.
 *
 * @example
 * greaterThanOrEqual("revenue", 10000)
 * // "(revenue ge 10000)"
 */
export declare function greaterThanOrEqual(field: Name, value: string | number): string;

/**
 * Creates a `groupby` clause for the `$apply` query option.
 *
 * @example
 * groupby(["statuscode"], average("revenue"))
 * // "groupby((statuscode),revenue with average as revenue)"
 */
export declare function groupby(values: Name[], aggregations?: string): string;

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

/** Filters records matching any of the specified values (IN clause). */
export declare const In: (field: Name, values: (string | number)[]) => string;

/**
 * Infers the TypeScript type from a Dataverse schema definition.  This is a recursive
 * type that drills down through the schema definition (which can be a Table,
 * GenericProperties, or a Property) to extract the corresponding TypeScript type.
 *
 * @template T The Dataverse schema definition.
 */
export declare type Infer<T> = T extends Table<infer U> ? Infer<U> : T extends GenericProperties ? {
    [K in keyof T]: Infer<T[K]>;
} : T extends CollectionProperty<infer U> ? Infer<U>[] : T extends LookupProperty<infer U> ? Infer<U> | null : T extends Schema<infer U> ? U : never;

/** Filters records in a specific fiscal period. */
export declare const InFiscalPeriod: (field: Name, value: number) => string;

/** Filters records in a specific fiscal period and year. */
export declare const InFiscalPeriodAndYear: (field: Name, fiscalPeriod: number, fiscalYear: number) => string;

/** Filters records in a specific fiscal year. */
export declare const InFiscalYear: (field: Name, value: number) => string;

/** Filters records in or after a specific fiscal period and year. */
export declare const InOrAfterFiscalPeriodAndYear: (field: Name, fiscalPeriod: number, fiscalYear: number) => string;

/** Filters records in or before a specific fiscal period and year. */
export declare const InOrBeforeFiscalPeriodAndYear: (field: Name, fiscalPeriod: number, fiscalYear: number) => string;

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

/**
 * Filter for active records (statecode eq 0).
 *
 * @example
 * isActive()
 * // "statecode eq 0"
 */
export declare function isActive(): string;

/**
 * Filter for inactive records (statecode eq 1).
 *
 * @example
 * isInactive()
 * // "statecode eq 1"
 */
export declare function isInactive(): string;

export declare function isNonEmptyString(value: unknown): value is string;

/**
 * Filter for non-null field values.
 *
 * @example
 * isNotNull("emailaddress1")
 * // "emailaddress1 ne null"
 */
export declare function isNotNull(field: Name): string;

/**
 * Filter for null field values.
 *
 * @example
 * isNull("emailaddress1")
 * // "emailaddress1 eq null"
 */
export declare function isNull(field: Name): string;

export declare function isType(type: Types): Validator<any>;

export declare function isTypeOrNull(type: Types): Validator<any>;

/**
 * Formats an object of key-value pairs for alternate key lookups.
 *
 * @example
 * keys({ name: "John", email: "john@example.com" })
 * // "name='John',email='john@example.com'"
 */
export declare function keys(keyValues: {
    [key: string]: string | number;
}): string;

/** Filters records from the last 7 days. */
export declare const Last7Days: (field: Name) => string;

/** Filters records from the last fiscal period. */
export declare const LastFiscalPeriod: (field: Name) => string;

/** Filters records from the last fiscal year. */
export declare const LastFiscalYear: (field: Name) => string;

/** Filters records from last month. */
export declare const LastMonth: (field: Name) => string;

/** Filters records from last week. */
export declare const LastWeek: (field: Name) => string;

/** Filters records from the last X days. */
export declare const LastXDays: (field: Name, value: number) => string;

/** Filters records from the last X fiscal periods. */
export declare const LastXFiscalPeriods: (field: Name, value: number) => string;

/** Filters records from the last X fiscal years. */
export declare const LastXFiscalYears: (field: Name, value: number) => string;

/** Filters records from the last X hours. */
export declare const LastXHours: (field: Name, value: number) => string;

/** Filters records from the last X months. */
export declare const LastXMonths: (field: Name, value: number) => string;

/** Filters records from the last X weeks. */
export declare const LastXWeeks: (field: Name, value: number) => string;

/** Filters records from the last X years. */
export declare const LastXYears: (field: Name, value: number) => string;

/** Filters records from last year. */
export declare const LastYear: (field: Name) => string;

/**
 * Creates a `lt` (less than) filter.
 *
 * @example
 * lessThan("revenue", 10000)
 * // "(revenue lt 10000)"
 */
export declare function lessThan(field: Name, value: string | number): string;

/**
 * Creates a `le` (less than or equal) filter.
 *
 * @example
 * lessThanOrEqual("revenue", 10000)
 * // "(revenue le 10000)"
 */
export declare function lessThanOrEqual(field: Name, value: string | number): string;

/**
 * Creates a choice/option-set column definition with a fixed set of allowed values.
 *
 * @param name The Dataverse logical name of the column.
 * @param list The array of allowed string or numeric values.
 *
 * @example
 * const table = defineTable({
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
export declare function lookup<TProperties extends GenericProperties>(name: string, getTable: GetTable<Table<TProperties>>): LookupProperty<TProperties>;

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
    get table(): Table<{
        id: PrimaryKeyField;
    }>;
    transformValueToDataverse(value: any): string | null;
}

export declare class LookupProperty<TProperties extends GenericProperties> extends Schema<Infer<TProperties> | null> {
    #private;
    kind: "navigation";
    type: "lookup";
    constructor(name: string, getTable: GetTable<Table<TProperties>>);
    get table(): Table<TProperties>;
    transformValueFromDataverse(value: any): Infer<TProperties> | null;
    getIssues(value: any, path?: PropertyKey[]): StandardSchemaV1.Issue[];
}

export declare function mapChoices(data: any): {
    value: number;
    color: string;
    label: string;
    description: string;
}[];

/**
 * Creates a `max` aggregation expression for `$apply`.
 *
 * @example
 * max("createdon")
 * // "createdon with max as createdon"
 */
export declare function max(field: Name, alias?: string): string;

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

/**
 * Creates a `min` aggregation expression for `$apply`.
 *
 * @example
 * min("createdon")
 * // "createdon with min as createdon"
 */
export declare function min(field: Name, alias?: string): string;

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

declare type NavKeys<T> = {
    [K in keyof T]: T[K] extends LookupProperty<any> | CollectionProperty<any> ? K : never;
}[keyof T];

declare type NestedStringArray = Array<string | NestedStringArray>;

/** Filters records from the next 7 days. */
export declare const Next7Days: (field: Name) => string;

/** Filters records from the next fiscal period. */
export declare const NextFiscalPeriod: (field: Name) => string;

/** Filters records from the next fiscal year. */
export declare const NextFiscalYear: (field: Name) => string;

/** Filters records from next month. */
export declare const NextMonth: (field: Name) => string;

/** Filters records from next week. */
export declare const NextWeek: (field: Name) => string;

/** Filters records from the next X days. */
export declare const NextXDays: (field: Name, value: number) => string;

/** Filters records from the next X fiscal periods. */
export declare const NextXFiscalPeriods: (field: Name, value: number) => string;

/** Filters records from the next X fiscal years. */
export declare const NextXFiscalYears: (field: Name, value: number) => string;

/** Filters records from the next X hours. */
export declare const NextXHours: (field: Name, value: number) => string;

/** Filters records from the next X months. */
export declare const NextXMonths: (field: Name, value: number) => string;

/** Filters records from the next X weeks. */
export declare const NextXWeeks: (field: Name, value: number) => string;

/** Filters records from the next X years. */
export declare const NextXYears: (field: Name, value: number) => string;

/** Filters records from next year. */
export declare const NextYear: (field: Name) => string;

/**
 * Negates a filter condition.
 *
 * @example
 * not(equals("statecode", 0))
 * // "not((statecode eq 0))"
 */
export declare function not(condition: string): string;

/** Filters records NOT between two values. */
export declare const NotBetween: (field: Name, value1: string | number, value2: string | number) => string;

/** Filters records NOT matching the current user's business unit. */
export declare const NotEqualBusinessId: (field: Name) => string;

/**
 * Creates a `ne` (not equals) filter.
 *
 * @example
 * notEquals("statecode", 1)
 * // "(statecode ne 1)"
 */
export declare function notEquals(field: Name, value: string | number | boolean | null): string;

/** Filters records NOT owned by the current user. */
export declare const NotEqualUserId: (field: Name) => string;

/** Filters records NOT in the specified values (NOT IN clause). */
export declare const NotIn: (field: Name, values: (string | number)[]) => string;

/** Filters records NOT under a specific hierarchical node. */
export declare const NotUnder: (field: Name, value: string) => string;

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
 * const table = defineTable({
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
 * const table = defineTable({
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
 * const table = defineTable({
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

declare type ODataFieldProxy<T extends GenericProperties> = {
    [K in keyof T]: T[K] extends LookupProperty<infer P> ? ODataNavProxyValue<P> : T[K] extends CollectionProperty<infer P> ? ODataNavProxyValue<P> : string;
};

declare type ODataLambdaProxy<P extends GenericProperties> = {
    [K in keyof P]: string;
};

declare type ODataNavProxyValue<P extends GenericProperties> = {
    toString(): string;
    any(cb: (proxy: ODataLambdaProxy<P>) => string): string;
    any(alias: string, cb: (proxy: ODataLambdaProxy<P>) => string): string;
    all(cb: (proxy: ODataLambdaProxy<P>) => string): string;
    all(alias: string, cb: (proxy: ODataLambdaProxy<P>) => string): string;
} & ODataFieldProxy<P>;

/**
 * A type-safe OData query builder for Dataverse. Construct OData query strings
 * with `$select`, `$filter`, `$expand`, `$orderby`, `$top`, `$count`, `$apply`,
 * and `$ref` using auto-completing field proxies.
 *
 * Create one via {@link fetchOdata} — never instantiate directly.
 *
 * @template T The table's property definitions.
 * @template TResult The result row shape (narrowed by `.select()`, `.expand()`, etc.).
 *
 * @example
 * const q = fetchOdata(Person)
 *   .select("name", "age")
 *   .where(f => equals(f.name, "John"))
 *   .orderby({ name: "asc" })
 *   .top(10);
 *
 * const results = await q.execute();
 * // results: { name: string; age: number }[]
 */
export declare class ODataQuery<T extends GenericProperties, TResult = Infer<T>> {
    private _table;
    private _fields;
    private _filters;
    private _expands;
    private _orderby;
    private _top?;
    private _includeCount;
    private _apply;
    private _lambdaAliasIndex;
    private _proxy;
    constructor(table: Table<T>);
    private _buildProxy;
    private _buildProxyForTable;
    /**
     * Restricts the returned columns to the specified fields.
     * This narrows the result type to only the selected properties.
     *
     * @param keys One or more value-field keys (navigation properties are excluded).
     *
     * @example
     * const q = fetchOdata(Person).select("name", "age");
     * // TResult → { name: string; age: number }
     */
    select<K extends ValueKeys<T>>(...keys: K[]): ODataQuery<T, {
        [P in K]: Infer<T[P]>;
    }>;
    /**
     * Adds a `$filter` clause. Can be a raw OData filter string or a callback
     * that receives a typed field proxy. Multiple `.where()` calls are combined
     * with `and`.
     *
     * @overload@overload
     * @param filter A raw OData filter string.
     *
     * @overload@overload
     * @param filter A callback receiving a field proxy for type-safe filter construction.
     *
     * @example
     * // String overload:
     * fetchOdata(Person).where("fullname eq 'John'");
     *
     * @example
     * // Callback with field proxy and filter helpers:
     * fetchOdata(Person)
     *   .where(f => and(equals(f.name, "John"), greaterThan(f.age, 20)));
     *
     * @example
     * // Multiple where calls stack additively:
     * fetchOdata(Person)
     *   .where(f => equals(f.name, "John"))
     *   .where(f => greaterThan(f.age, 20));
     * // $filter=(fullname eq 'John') and (person_age gt 20)
     */
    where(filter: string): this;
    where(filter: (f: ODataFieldProxy<T>) => string): this;
    /**
     * Adds a `$expand` clause for a navigation property. The callback receives a
     * nested {@link ODataQuery} scoped to the related table for further `.select()`,
     * `.where()`, `.expand()`, etc.
     *
     * @param key The navigation property key.
     * @param sub A callback to configure the nested query.
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
    expand<K extends string & NavKeys<T>, R>(key: K, sub: (q: ODataQuery<RelatedProps<T, K>>) => ODataQuery<RelatedProps<T, K>, R>): ODataQuery<T, Omit<TResult, K & keyof TResult> & {
        [P in K]: ExpandResult<T, P, R>;
    }>;
    /**
     * Adds a `$orderby` clause. Supports function callback with auto-completing
     * field proxy, `asc`/`desc` helpers, or a simple direction map.
     *
     * @overload@overload
     * @param spec Callback that receives a field proxy and returns an ordering spec.
     *
     * @overload@overload
     * @param keys An object mapping field names to `"asc"` or `"desc"`.
     *
     * @example
     * // Function overload with asc/desc helpers:
     * fetchOdata(Person).orderby(f => asc(f.name, f.age));
     * fetchOdata(Person).orderby(f => desc(f.age));
     *
     * @example
     * // Record overload:
     * fetchOdata(Person).orderby({ name: "asc", age: "desc" });
     */
    orderby(spec: (f: ODataFieldProxy<T>) => OrderSpec | OrderSpec[] | Record<string, "asc" | "desc">): this;
    orderby(keys: {
        [K in keyof T]?: "asc" | "desc";
    }): this;
    /**
     * Limits the number of returned records (`$top`).
     *
     * @example
     * fetchOdata(Person).top(10);
     */
    top(n: number): this;
    /**
     * Includes the total record count in the response (`$count=true`).
     *
     * @example
     * const q = fetchOdata(Person).includeCount();
     * // query string: "$count=true"
     */
    includeCount(): this;
    /**
     * Adds a `$apply` expression for server-side aggregation.
     *
     * @param expression A raw OData `$apply` expression.
     *
     * @example
     * fetchOdata(Person).apply("groupby((person_age),aggregate(person_age with sum as total))");
     */
    apply(expression: string): this;
    /**
     * Adds a `$expand` with `/$ref` to retrieve only the related record IDs
     * instead of full expanded records. The navigation property is removed from
     * the result type.
     *
     * @param key The navigation property key.
     *
     * @example
     * const q = fetchOdata(Person).expandRef("primaryAddress");
     * // query: "$expand=person_Address/$ref"
     * // TResult no longer includes primaryAddress
     */
    expandRef<K extends string & NavKeys<T>>(key: K): ODataQuery<T, Omit<TResult, K & keyof TResult>>;
    private _build;
    toString(): string;
    execute(): Promise<TResult[]>;
}

/** Filters records older than X days. */
export declare const OlderThanXDays: (field: Name, value: number) => string;

/** Filters records older than X hours. */
export declare const OlderThanXHours: (field: Name, value: number) => string;

/** Filters records older than X minutes. */
export declare const OlderThanXMinutes: (field: Name, value: number) => string;

/** Filters records older than X months. */
export declare const OlderThanXMonths: (field: Name, value: number) => string;

/** Filters records older than X weeks. */
export declare const OlderThanXWeeks: (field: Name, value: number) => string;

/** Filters records older than X years. */
export declare const OlderThanXYears: (field: Name, value: number) => string;

/** Filters records on a specific date. */
export declare const On: (field: Name, value: string) => string;

/** Filters records on or after a specific date. */
export declare const OnOrAfter: (field: Name, value: string) => string;

/** Filters records on or before a specific date. */
export declare const OnOrBefore: (field: Name, value: string) => string;

/**
 * Combines filter conditions with logical OR.
 *
 * @example
 * or(equals("statecode", 0), equals("statecode", 1))
 * // "((statecode eq 0) or (statecode eq 1))"
 */
export declare function or(...conditions: string[]): string;

/**
 * Formats a comma-separated list of fields for a `$orderby` query.
 *
 * @example
 * orderby({ name: "asc", createdon: "desc" })
 * // "name asc,createdon desc"
 *
 * @example
 * orderby(["name asc", "createdon desc"])
 * // "name asc,createdon desc"
 */
export declare function orderby(values: {
    [key: string]: "asc" | "desc";
} | string[]): string;

/**
 * Represents an ordered list of fields in a given direction.
 * Created by the `asc()` and `desc()` helpers.
 */
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
 * const table = defineTable({
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

/**
 * Constructs a full OData query string from a structured object.
 *
 * @example
 * query({ select: ['name'], filter: equals('statecode', 0) })
 * // "$select=name&$filter=(statecode%20eq%200)"
 */
export declare function query(queryObj: QueryParams): string;

export declare type QueryForTable<T> = {
    orderby?: Partial<Record<keyof T, "asc" | "desc">> | string;
    filter?: string;
    top?: number;
};

export declare interface QueryParams {
    select?: string;
    expand?: string;
    orderby?: string;
    filter?: string;
    top?: number;
    apply?: string;
}

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

/**
 * Formats a comma-separated list of fields for a `$select` query.
 *
 * @example
 * select("name", "email", "telephone1")
 * // "name,email,telephone1"
 */
export declare function select(...values: (Name)[]): string;

declare type Simplify<T> = {
    [Key in keyof T]: T[Key];
} & {};

/**
 * Creates a `startswith` filter.
 *
 * @example
 * startsWith("fullname", "John")
 * // "startswith(fullname,'John')"
 */
export declare function startsWith(field: Name, value: string): string;

/**
 * Creates a string-typed Dataverse column definition.
 *
 * @param name The Dataverse logical name of the column (e.g. `"fullname"`).
 *
 * @example
 * const table = defineTable({
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

/**
 * Creates a `sum` aggregation expression for `$apply`.
 *
 * @example
 * sum("revenue", "total_revenue")
 * // "revenue with sum as total_revenue"
 */
export declare function sum(field: Name, alias?: string): string;

/**
 * Represents a Dataverse table (entity) and provides methods for CRUD, querying,
 * navigation properties, actions, functions, and bulk operations.
 *
 * Use the {@link table} factory function to create instances. All API calls go
 * through the provided {@link DataverseClient}.
 *
 * @template TProperties An object mapping property names to their field definitions.
 *
 * @example
 * const client = new DataverseClient({ url: "https://org.crm.dynamics.com" });
 *
 * const Account = table(client, "accounts", {
 *   id: primaryKey("accountid"),
 *   name: string("name"),
 *   revenue: number("revenue"),
 *   primaryContact: lookup("primarycontactid", () => Contact),
 * });
 *
 * // Type-safe queries
 * const record = await Account.getRecord("GUID-HERE");
 * console.log(record.name); // typed as string
 */
export declare class Table<TProperties extends GenericProperties> extends Schema<Infer<TProperties>> {
    client: DataverseClient;
    fields: TProperties;
    kind: "table";
    type: "table";
    /**
     * @param client An instance of the DataverseClient for all API operations.
     * @param entitySetName The logical collection name of the Dataverse table (e.g. `"accounts"`).
     * @param props An object mapping property names to field definitions.
     */
    constructor(client: DataverseClient, entitySetName: string, props: TProperties);
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
    pickProperties<TKeys extends keyof TProperties>(...keys: TKeys[]): Table<Pick<TProperties, TKeys>>;
    /**
     * Creates a new `Table` with the specified properties excluded.
     *
     * @example
     * const WithoutSensitive = Person.omitProperties("ssn");
     */
    omitProperties<TKeys extends keyof TProperties>(...keys: TKeys[]): Table<Omit<TProperties, TKeys>>;
    /**
     * Creates a new `Table` with additional properties appended.
     *
     * @example
     * const Extended = Account.appendProperties({
     *   customField: string("new_stringcolumn"),
     * });
     * // Extended has all original fields plus `customField`
     */
    appendProperties<TAppendedProperties extends GenericProperties>(properties: TAppendedProperties): Table<Omit<TProperties, keyof TAppendedProperties> & TAppendedProperties>;
    /** Use for type inference: `Infer<typeof Account>` resolves to the record type. */
    T: Infer<TProperties>;
}

/**
 * Creates a new {@link Table} instance bound to a Dataverse entity set.
 * This is the primary entry point for defining table schemas.
 *
 * @param client The {@link DataverseClient} instance used for all API calls.
 * @param name The logical collection name of the entity (e.g. `"accounts"`).
 * @param properties An object mapping property names to field definitions (`primaryKey`, `string`, `number`, `lookup`, `collection`, etc.).
 *
 * @example
 * const client = new DataverseClient({ url: "https://org.crm.dynamics.com" });
 *
 * const Contact = table(client, "contacts", {
 *   id: primaryKey("contactid"),
 *   fullName: string("fullname"),
 *   email: string("emailaddress1"),
 *   age: number("age"),
 * });
 *
 * // Type-safe CRUD
 * const record = await Contact.getRecord("guid");
 * console.log(record.fullName); // string
 */
export declare function table<TProperties extends GenericProperties>(client: DataverseClient, name: string, properties: TProperties): Table<TProperties>;

/** Filters records in the current fiscal period. */
export declare const ThisFiscalPeriod: (field: Name) => string;

/** Filters records in the current fiscal year. */
export declare const ThisFiscalYear: (field: Name) => string;

/** Filters records from this month. */
export declare const ThisMonth: (field: Name) => string;

/** Filters records from this week. */
export declare const ThisWeek: (field: Name) => string;

/** Filters records from this year. */
export declare const ThisYear: (field: Name) => string;

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

/** Filters records from today. */
export declare const Today: (field: Name) => string;

/** Filters records from tomorrow. */
export declare const Tomorrow: (field: Name) => string;

export declare type Types = "string" | "number" | "bigint" | "boolean" | "symbol" | "undefined" | "object" | "function";

/** Filters records under a specific hierarchical node. */
export declare const Under: (field: Name, value: string) => string;

/** Filters records at or under a specific hierarchical node. */
export declare const UnderOrEqual: (field: Name, value: string) => string;

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

/**
 * Wraps a value in single quotes for OData, unless it's a GUID or date.
 * Escapes existing single quotes.
 *
 * @example
 * wrapString("hello")     // "'hello'"
 * wrapString("it's")      // "'it''s'"
 * wrapString("123e4567-e89b-12d3-a456-426614174000")  // "123e4567-e89b-12d3-a456-426614174000"
 * wrapString("2025-01-01") // "2025-01-01"
 * wrapString(null)        // "null"
 * wrapString(42)          // "42"
 */
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

/** Filters records from yesterday. */
export declare const Yesterday: (field: Name) => string;

export { }
