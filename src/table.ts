import { StandardSchemaV1 } from "@standard-schema/spec";
import { DataverseClient } from "./client"; // Assuming this is the path to your client
import { CollectionIdsProperty, CollectionProperty } from "./fields";
import { LookupProperty } from "./fields";
import { LookupIdProperty } from "./fields";
import { PrimaryKeyField } from "./fields";
import { query } from "./query";
import { Schema } from "./schema";
import {
  AlternateKey,
  DataverseKey,
  DataverseRecord,
  GenericNavigationProperty,
  GenericProperties,
  GenericValueProperty,
  GUID,
  Infer,
  NarrowKeysByValue,
} from "./types";
import { Etag } from "./util";

export type QueryForTable<T> = {
  orderby?: Partial<Record<keyof T, "asc" | "desc">> | string;
  filter?: string;
  top?: number;
};

export type DataverseTableOptions<TProperties extends GenericProperties> = {
  client: DataverseClient;
  entitySetName: string;
  logicalName: string;
  fields: TProperties;
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
export class DataverseTable<TProperties extends GenericProperties> extends Schema<
  Infer<TProperties>
> {
  client: DataverseClient;
  fields: TProperties;
  logicalName: string;
  kind = "table" as const;
  type = "table" as const;

  /**
   * @param options Options including the DataverseClient, entity set name, logical name, and field definitions.
   */
  constructor(options: DataverseTableOptions<TProperties>) {
    super(options.entitySetName, null as Infer<TProperties>);
    this.client = options.client;
    this.name = options.entitySetName;
    this.logicalName = options.logicalName;
    this.fields = options.fields;
  }

  getIssues(value: any, path: PropertyKey[] = []): StandardSchemaV1.Issue[] {
    const issues = super.getIssues(value, path);
    if (typeof value !== "object" || value === null) value = {};
    for (const [key, property] of Object.entries(this.fields)) {
      if (!property.getReadOnly())
        issues.push(...property.getIssues(value[key], [...path, key]));
    }
    return issues;
  }

  getDefault(value?: Partial<Infer<TProperties>>): Infer<TProperties> {
    const result = {} as Record<string, any>;
    for (const [key, property] of Object.entries(this.fields)) {
      if (value === undefined || !(key in value)) {
        result[key] = property.getDefault();
      } else {
        result[key] = value[key as keyof typeof value];
      }
    }
    return result as Infer<TProperties>;
  }

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
  async getRecord(id: DataverseKey): Promise<Infer<TProperties> | null> {
    return this.client
      .getRecord(this.name, id, buildQuery(this as unknown as DataverseTable<GenericProperties>))
      .then((v) => this.transformValueFromDataverse(v));
  }

  getAlternateKeys(value: Partial<Infer<TProperties>>): AlternateKey {
    return Object.entries(value)
      .map((kv) => `${this.fields[kv[0]].name}=${kv[1]}`)
      .join(",") as AlternateKey;
  }

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
  async getRecords(
    queryOptions?: QueryForTable<TProperties>,
  ): Promise<Infer<TProperties>[]> {
    return this.client
      .getRecords(this.name, buildQuery(this as unknown as DataverseTable<GenericProperties>, queryOptions as QueryForTable<GenericProperties>))
      .then((values) => values.map((v) => this.transformValueFromDataverse(v)));
  }

  /**
   * Retrieves the value of a single property for a record by ID.
   * Works for value properties, lookup IDs, lookups (returns expanded record), and collections.
   *
   * @example
   * const age = await Person.getPropertyValue("age", "some-guid");
   * const address = await Person.getPropertyValue("primaryAddress", "some-guid");
   */
  async getPropertyValue<TKey extends keyof TProperties>(
    key: TKey,
    id: DataverseKey,
    queryOptions?: QueryForTable<TProperties>,
  ): Promise<Infer<TProperties[TKey]>> {
    const prop = this.fields[key];
    if (prop.kind === "value" || prop.type === "lookupId") {
      return this.client
        .getPropertyValue(this.name, id, prop.name)
        .then((v) => prop.transformValueFromDataverse(v)) as Infer<
        TProperties[TKey]
      >;
    }
    if (prop.type === "collection" || prop.type === "collectionIds") {
      return this.client
        .getAssociatedRecords(
          this.name,
          id,
          prop.name,
          buildQuery(prop.table as DataverseTable<GenericProperties>, queryOptions as QueryForTable<GenericProperties>), // Note: buildQuery needs to handle related table schema
        )
        .then(
          (v) =>
            prop.transformValueFromDataverse(v) as Infer<TProperties[TKey]>,
        );
    }
    if (prop.type === "lookup") {
      return this.client
        .getAssociatedRecord(
          this.name,
          id,
          prop.name,
          buildQuery(prop.table, queryOptions),
        )
        .then(
          (v) =>
            prop.transformValueFromDataverse(v) as Infer<TProperties[TKey]>,
        );
    }
    throw new Error("Invalid Property kind for getPropertyValue");
  }

  /**
   * Updates the value of a single property for a record by ID.
   * For navigation properties, this associates/dissociates related records.
   *
   * @example
   * await Person.updatePropertyValue("age", "some-guid", 35);
   */
  async updatePropertyValue<TKey extends keyof TProperties>(
    key: TKey,
    id: DataverseKey,
    value: Infer<TProperties[TKey]>,
  ): Promise<GUID> {
    const prop = this.fields[key];
    if (prop.kind === "navigation") {
      await this.updateNavigationProperty(prop, id, value);
    } else {
      await this.client.updatePropertyValue(
        this.name,
        id,
        this.fields[key].name,
        prop.transformValueToDataverse(value),
      );
    }
    return id as GUID;
  }

  protected async updateNavigationProperty(
    property: GenericNavigationProperty,
    id: DataverseKey,
    value: any,
  ) {
    if (property.type === "collection" || property.type === "collectionIds") {
      if (Array.isArray(value)) {
        const ids =
          property.type === "collection"
            ? await Promise.all(
                value.map((v: any) => property.table.upsertRecord(undefined, v)),
              )
            : (value as GUID[]);
        return this.client.associateRecordToList(
          this.name,
          id,
          property.name,
          property.table.name,
          property.table.getPrimaryKey().property.name,
          ids,
        );
      }
    }
    if (property.type === "lookup" || property.type == "lookupId") {
      const name =
        property.type === "lookup" ? property.name : property.navigationName;
      if (value === null) {
        return this.client.dissociateRecord(this.name, id, name);
      } else {
        const childId =
          property.type === "lookup"
            ? await property.table.upsertRecord(undefined, value)
            : (value as GUID);
        return this.client.associateRecord(
          this.name,
          id,
          name,
          property.table.name,
          childId,
        );
      }
    }
  }

  /**
   * Links an existing child record to a parent record through a navigation property.
   *
   * @example
   * await Person.associateRecord("primaryAddress", "person-guid", "address-guid");
   */
  async associateRecord<
    TKey extends NarrowKeysByValue<TProperties, GenericNavigationProperty>,
  >(key: TKey, id: DataverseKey, childId: GUID): Promise<GUID> {
    const prop = this.fields[key];
    if (prop.kind === "navigation") {
      return this.client.associateRecord(
        this.name,
        id,
        prop.name,
        prop.table.name,
        childId,
      );
    } else {
      throw new Error("Can only associate to navigation properties");
    }
  }

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
  async dissociateRecord<
    TKey extends NarrowKeysByValue<
      TProperties,
      CollectionProperty<any> | CollectionIdsProperty
    >,
  >(key: TKey, id: DataverseKey, childId: GUID): Promise<GUID>;
  async dissociateRecord<
    TKey extends NarrowKeysByValue<
      TProperties,
      LookupProperty<any> | LookupIdProperty
    >,
  >(key: TKey, id: DataverseKey): Promise<GUID>;
  async dissociateRecord<
    TKey extends NarrowKeysByValue<TProperties, GenericNavigationProperty>,
  >(key: TKey, id: DataverseKey, childId?: GUID): Promise<GUID> {
    const prop = this.fields[key];
    if (prop.kind === "navigation") {
      return this.client.dissociateRecord(this.name, id, prop.name, childId);
    } else {
      throw new Error("Can only dissociate navigation properties");
    }
  }

  /**
   * Creates a new record in Dataverse and returns its generated GUID.
   *
   * @param value The record data (partial — primary key is auto-generated).
   *
   * @example
   * const newId = await Person.insertRecord({ name: "John", age: 30 });
   */
  async insertRecord(value: Partial<Infer<TProperties>>): Promise<GUID> {
    const pkName = this.getPrimaryKey().property.name;
    const record = await this.client.postRecord(
      this.name,
      this.transformValueToDataverse(value),
      query({ select: pkName }),
    );
    return record?.[pkName] as GUID;
  }

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
  async updateRecord(id: DataverseKey, value: Partial<Infer<TProperties>>, etag?: string): Promise<GUID> {
    if (!id) throw new Error("No ID provided")
    await this.client.patchRecord(
      this.name,
      id,
      this.transformValueToDataverse(value),
      "",
      etag,
    );
    return id as GUID;
  }

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
  async upsertRecord(id: DataverseKey | undefined, value: Partial<Infer<TProperties>>, etag?: string): Promise<GUID> {
    const promises: Promise<any>[] = [];
    const pkName = this.getPrimaryKey().property.name;

    if (id) {
      promises.push(
        this.client.patchRecord(
          this.name,
          id,
          this.transformValueToDataverse(value),
          query({ select: pkName }),
          etag,
        ),
      );
    } else {
      const record = await this.client.postRecord(
        this.name,
        this.transformValueToDataverse(value),
        query({ select: pkName }),
      );
      id = record[pkName] as GUID;
    }

    for (const [key, property] of Object.entries(this.fields)) {
      if (property.getReadOnly() || !(key in value)) continue;
      if (property.kind === "navigation" && property.type !== "lookupId") {
        promises.push(
          this.updateNavigationProperty(
            property,
            id,
            value[key as keyof typeof value],
          ),
        );
      }
    }
    await Promise.all(promises);
    return id as GUID;
  }

  /**
   * Deletes a record by its primary key. Supports optimistic concurrency via etag.
   *
   * @param id The primary key of the record to delete.
   * @param etag Optional etag for conditional deletion.
   *
   * @example
   * await Person.deleteRecord("some-guid");
   */
  async deleteRecord(id: DataverseKey, etag?: string): Promise<GUID> {
    return this.client.deleteRecord(this.name, id, etag);
  }

  /**
   * Activates a record by setting its `statecode` to 0.
   *
   * @example
   * await Person.activateRecord("some-guid");
   */
  async activateRecord(id: DataverseKey): Promise<GUID>{
    return this.client.activateRecord(this.name,id)
  }

  /**
   * Deactivates a record by setting its `statecode` to 1.
   *
   * @example
   * await Person.deactivateRecord("some-guid");
   */
  async deactivateRecord(id: DataverseKey): Promise<GUID>{
    return this.client.deactivateRecord(this.name,id)
  }

  /**
   * Deletes (clears) the value of a value property for a record. Cannot be used
   * on navigation properties.
   *
   * @example
   * await Person.deletePropertyValue("name", "some-guid");
   */
  async deletePropertyValue<
    TKey extends NarrowKeysByValue<TProperties, GenericValueProperty>,
  >(key: TKey, id: DataverseKey): Promise<GUID> {
    const prop = this.fields[key];
    if (prop.kind === "value") {
      return this.client.deletePropertyValue(this.name, id, prop.name);
    }
    throw new Error("Cannot delete navigation property values");
  }

  //
  // --- ACTIONS & FUNCTIONS ---
  //

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
  async executeAction(actionName: string, params?: Record<string, any>, id?: DataverseKey): Promise<any> {
    if (id) {
      return this.client.executeBoundAction(this.name, actionName, params, id as string);
    }
    return this.client.executeBoundAction(this.name, actionName, params);
  }

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
  async executeFunction(functionName: string, id: DataverseKey, params?: Record<string, any>): Promise<any> {
    return this.client.executeBoundFunction(this.name, id as string, functionName, params);
  }

  //
  // --- BULK OPERATIONS ---
  //

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
  async createMultiple(records: Partial<Infer<TProperties>>[]): Promise<any> {
    return this.client.createMultiple(
      this.name,
      records.map((r) => this.transformValueToDataverse(r)),
    );
  }

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
  async updateMultiple(records: Partial<Infer<TProperties>>[]): Promise<any> {
    return this.client.updateMultiple(
      this.name,
      records.map((r) => this.transformValueToDataverse(r)),
    );
  }

  /**
   * Deletes multiple records in a single API call via `DeleteMultiple`.
   *
   * @param ids Array of record GUIDs to delete.
   *
   * @example
   * await Account.deleteMultiple(["guid-1", "guid-2"]);
   */
  async deleteMultiple(ids: string[]): Promise<any> {
    return this.client.deleteMultiple(this.name, ids);
  }

  /**
   * Returns the primary key field definition for this table.
   *
   * @example
   * const pk = Account.getPrimaryKey();
   * console.log(pk.key);      // "id"
   * console.log(pk.property.name); // "accountid"
   */
  getPrimaryKey() {
    const result = Object.entries(this.fields).find(
      (f) => f[1].type === "primaryKey",
    );
    if (!result) throw new Error("No Primary Key found in schema");
    return {
      key: result[0],
      property: result[1] as PrimaryKeyField,
    };
  }

  /**
   * Extracts the primary key GUID from a record object, or `undefined` if not present.
   *
   * @example
   * const account = await Account.getRecord("some-guid");
   * const pk = Account.getPrimaryId(account); // GUID | undefined
   */
  getPrimaryId(value: Partial<Infer<TProperties>>): GUID | undefined {
    const { key } = this.getPrimaryKey();
    return value[key as keyof typeof value] as GUID | undefined;
  }

  transformValueFromDataverse(value: any): Infer<TProperties> {
    if (value === null) return null as unknown as Infer<TProperties>;
    const result = {} as Record<PropertyKey, any>;
    for (const [key, property] of Object.entries(this.fields)) {
      result[key] = property.transformValueFromDataverse(value[property.fromDataverseName]);
    }
    result[Etag] = value[Etag];
    return result as Infer<TProperties>;
  }

  transformValueToDataverse(
    value: Partial<Infer<TProperties>>,
  ): DataverseRecord {
    if (value === null) return null as unknown as DataverseRecord;
    const result = {} as Record<string, any>;
    for (const [key, property] of Object.entries(this.fields)) {
      if (property.getReadOnly() || !(key in value)) continue;
      if (property.kind === "value" || property.type === "lookupId") {
        const v = property.transformValueToDataverse(
          value[key as keyof typeof value],
        );
        result[property.toDataverseName] = v;
      }
    }
    return result;
  }

  /**
   * Creates a new `Table` with only the specified properties. Useful for
   * narrowing the type when querying a subset of columns.
   *
   * @example
   * const NameOnly = Account.pickProperties("name", "id");
   * const records = await NameOnly.getRecords(); // { name: string; id: GUID }[]
   */
  pickProperties<TKeys extends keyof TProperties>(
    ...keys: TKeys[]
  ): DataverseTable<Pick<TProperties, TKeys>> {
    const properties = Object.fromEntries(
      Object.entries(this.fields).filter((v) => keys.includes(v[0] as any)),
    ) as Pick<TProperties, TKeys>;
    return new DataverseTable({ client: this.client, entitySetName: this.name, logicalName: this.logicalName, fields: properties });
  }

  /**
   * Creates a new `DataverseTable` with the specified properties excluded.
   *
   * @example
   * const WithoutSensitive = Person.omitProperties("ssn");
   */
  omitProperties<TKeys extends keyof TProperties>(
    ...keys: TKeys[]
  ): DataverseTable<Omit<TProperties, TKeys>> {
    const properties = Object.fromEntries(
      Object.entries(this.fields).filter((v) => !keys.includes(v[0] as any)),
    ) as Omit<TProperties, TKeys>;
    return new DataverseTable({ client: this.client, entitySetName: this.name, logicalName: this.logicalName, fields: properties });
  }

  /**
   * Creates a new `DataverseTable` with additional properties appended.
   *
   * @example
   * const Extended = Account.appendProperties({
   *   customField: string("new_stringcolumn"),
   * });
   * // Extended has all original fields plus `customField`
   */
  appendProperties<TAppendedProperties extends GenericProperties>(
    properties: TAppendedProperties,
  ): DataverseTable<Omit<TProperties, keyof TAppendedProperties> & TAppendedProperties> {
    return new DataverseTable({ client: this.client, entitySetName: this.name, logicalName: this.logicalName, fields: {
      ...this.fields,
      ...properties,
    } as any});
  }

  /** Use for type inference: `Infer<typeof Account>` resolves to the record type. */
  T!: Infer<TProperties>;
}



function buildQuery(
  table: DataverseTable<GenericProperties>,
  q?: QueryForTable<GenericProperties>,
): string {
  return query({
    top: q?.top,
    filter: q?.filter,
    orderby: q?.orderby
      ? Object.entries(q?.orderby ?? {})
          .map(([key, value]) => `${table.fields[key].name} ${value}`)
          .join(",")
      : undefined,
    select: buildSelect(table),
    expand: buildExpand(table),
  });
}

function buildSelect(table: DataverseTable<GenericProperties>): string {
  return Object.values(table.fields)
    .filter((v: any) => v.kind === "value" || v.type === "lookupId" || v.type==="file")
    .map((v: any) =>v.fromDataverseName)
    .join(",");
}

function buildExpand(table: DataverseTable<GenericProperties>, depth = 0): string {
  if (depth > 3) return "";
  return Object.values(table.fields)
    .filter(
      (v: any) =>
        v.kind === "navigation" &&
        v.type !== "lookupId" &&
        v.type !== "collectionIds",
    )
    .map((v: any) => {
      const navProp = v as CollectionProperty<any> | LookupProperty<any>;
      const innerSelect = buildSelect(navProp.table);
      const innerExpand = buildExpand(navProp.table, depth + 1);
      let expandQuery = `$select=${innerSelect}`;
      if (innerExpand) {
        expandQuery += `;$expand=${innerExpand}`;
      }
      return `${navProp.name}(${expandQuery})`;
    })
    .join(",");
}
