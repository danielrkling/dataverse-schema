import { DataverseClient } from './client';
import { ODataTableQueryOptions } from './query/odata/builder';
import { CollectionIdsProperty, CollectionProperty, LookupProperty, LookupIdProperty, PrimaryKeyField, TransformContext, ValidationSchema } from './fields';
import { AlternateKey, DataverseKey, DataverseRecord, GenericNavigationProperty, GenericProperties, GenericValueProperty, GUID, Infer, NarrowKeysByValue } from './types';
import * as v from "valibot";
export type TableRequestOptions = {
    pageSize?: number;
    signal?: AbortSignal;
};
export type DataverseTableOptions<TProperties extends GenericProperties> = {
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
export declare class DataverseTable<TProperties extends GenericProperties> {
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
    getRecord(id: DataverseKey, options?: {
        signal?: AbortSignal;
    }): Promise<Infer<TProperties> | null>;
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
    getRecords(queryOptions?: ODataTableQueryOptions, options?: TableRequestOptions): Promise<Infer<TProperties>[]>;
    /**
     * Iterates over records one at a time, lazily following `@odata.nextLink` pagination.
     * Each record is transformed like {@link getRecords}. Records within a page are
     * yielded synchronously once the page arrives; only page boundaries trigger HTTP
     * requests. A `break` stops further requests.
     *
     * @param queryOptions Optional query parameters (filter, orderby, top).
     * @param options Optional page-size control.
     *
     * @example
     * for await (const account of Account.iterateRecords({ filter: "statecode eq 0" }, { pageSize: 100 })) {
     *   console.log(account.name);
     * }
     */
    iterateRecords(queryOptions?: ODataTableQueryOptions, options?: TableRequestOptions): AsyncGenerator<Infer<TProperties>>;
    /**
     * Iterates over pages of records, lazily following `@odata.nextLink` pagination.
     * Each yielded page is transformed like {@link getRecords}. The next page is
     * only fetched when the consumer requests it, so `break` stops further requests.
     * Prefer this over {@link iterateRecords} when you want to iterate a page's
     * array synchronously.
     *
     * @param queryOptions Optional query parameters (filter, orderby, top).
     * @param options Optional page-size control.
     *
     * @example
     * for await (const page of Account.iteratePages({ filter: "statecode eq 0" }, { pageSize: 100 })) {
     *   for (const account of page) console.log(account.name);
     * }
     */
    iteratePages(queryOptions?: ODataTableQueryOptions, options?: TableRequestOptions): AsyncGenerator<Infer<TProperties>[]>;
    /**
     * Retrieves the value of a single property for a record by ID.
     * Works for value properties, lookup IDs, lookups (returns expanded record), and collections.
     *
     * @example
     * const age = await Person.getPropertyValue("age", "some-guid");
     * const address = await Person.getPropertyValue("primaryAddress", "some-guid");
     */
    getPropertyValue<TKey extends keyof TProperties>(key: TKey, id: DataverseKey, queryOptions?: ODataTableQueryOptions): Promise<Infer<TProperties[TKey]>>;
    /**
     * Updates the value of a single property for a record by ID.
     * For navigation properties, this associates/dissociates related records.
     *
     * @example
     * await Person.updatePropertyValue("age", "some-guid", 35);
     */
    updatePropertyValue<TKey extends keyof TProperties>(key: TKey, id: DataverseKey, value: Infer<TProperties[TKey]>): Promise<GUID>;
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
/**
 * Represents a Dataverse many-to-many intersect (association) table.
 *
 * This is a simple descriptor for use with FetchXML's {@link EntityQueryBuilder.join join()}
 * method. It does NOT extend {@link DataverseTable} — it is not a queryable entity on its own.
 *
 * @example
 * const AccountContact = new DataverseIntersectTable("accountcontact", Account, Contact);
 *
 * // Use in FetchXML via join():
 * fetchXml(Account)
 *   .select(f => ({ name: f.name }))
 *   .join("inner", AccountContact, sub =>
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
