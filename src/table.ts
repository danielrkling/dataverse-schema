import * as v from "valibot"
import { DataverseClient } from "./client";
import { CollectionIdsProperty, CollectionProperty, LookupProperty, LookupIdProperty, PrimaryKeyField, FileField, ImageField } from "./fields";
import { FieldBase, SKIP, TransformContext, ValidationSchema } from "./fieldBase";
function queryString(opts: { select?: string; top?: number; filter?: string; orderby?: string; expand?: string }): string {
  const params = new URLSearchParams()
  if (opts.select) params.set("$select", opts.select)
  if (opts.top !== undefined) params.set("$top", opts.top.toFixed(0))
  if (opts.filter) params.set("$filter", opts.filter)
  if (opts.orderby) params.set("$orderby", opts.orderby)
  if (opts.expand) params.set("$expand", opts.expand)
  return params.toString()
}
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
  schema?: ValidationSchema<Infer<TProperties>>;
  primaryKey?: { key: string; property: PrimaryKeyField };
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
export class DataverseTable<TProperties extends GenericProperties> {
  client: DataverseClient;
  fields: TProperties;
  logicalName: string;
  entitySetName: string;
  name: string;
  kind = "table" as const;
  type = "table" as const;
  schema?: ValidationSchema<Infer<TProperties>>;
  primaryKey: { key: string; property: PrimaryKeyField };

  /**
   * @param options Options including the DataverseClient, entity set name, logical name, and field definitions.
   */
  constructor(options: DataverseTableOptions<TProperties> & { schema?: ValidationSchema<Infer<TProperties>> }) {
    this.client = options.client;
    this.entitySetName = options.entitySetName;
    this.logicalName = options.logicalName;
    this.name = options.entitySetName;
    this.fields = options.fields;
    this.schema = options.schema;
    if (options.primaryKey) {
      this.primaryKey = options.primaryKey;
    } else {
      const pk = Object.entries(this.fields).find((f) => f[1].type === "primaryKey");
      if (!pk) throw new Error("No Primary Key found in schema");
      this.primaryKey = { key: pk[0], property: pk[1] as PrimaryKeyField };
    }
  }

  getSchema(): v.BaseSchema<unknown, Infer<TProperties>, v.BaseIssue<unknown>> {
    if (this.schema) return this.schema
    const shape: Record<string, v.BaseSchema<any, any, any>> = {}
    for (const [key, field] of Object.entries(this.fields)) {
      shape[key] = (field as FieldBase<any>).schema
    }
    return v.object(shape) as any
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
      .getRecord(this.entitySetName, id, buildQuery(this as unknown as DataverseTable<GenericProperties>))
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
      .getRecords(this.entitySetName, buildQuery(this as unknown as DataverseTable<GenericProperties>, queryOptions as QueryForTable<GenericProperties>))
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
        .getPropertyValue(this.entitySetName, id, prop.name)
        .then((v) => prop.transformValueFromDataverse(v)) as Infer<
        TProperties[TKey]
      >;
    }
    if (prop.type === "collection" || prop.type === "collectionIds") {
      return this.client
        .getAssociatedRecords(
          this.entitySetName,
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
          this.entitySetName,
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
        const ctx: TransformContext = { table: this as any, client: this.client, recordId: id as string };
        let v = (prop as FieldBase<any>).transformValueToDataverse(value as any, ctx);
        if (v instanceof Promise) v = await v;
        if (v !== SKIP) {
          await this.client.updatePropertyValue(
            this.entitySetName,
            id,
            this.fields[key].name,
            v,
          );
        }
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
          this.entitySetName,
          id,
          property.name,
          property.table.entitySetName,
          property.table.primaryKey.property.name,
          ids,
        );
      }
    }
    if (property.type === "lookup" || property.type == "lookupId") {
      const name =
        property.type === "lookup" ? property.name : property.navigationName;
      if (value === null) {
        return this.client.dissociateRecord(this.entitySetName, id, name);
      } else {
        const childId =
          property.type === "lookup"
            ? await property.table.upsertRecord(undefined, value)
            : (value as GUID);
        return this.client.associateRecord(
          this.entitySetName,
          id,
          name,
          property.table.entitySetName,
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
        this.entitySetName,
        id,
        prop.name,
        prop.table.entitySetName,
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
      return this.client.dissociateRecord(this.entitySetName, id, prop.name, childId);
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
    const pkName = this.primaryKey.property.name;
    const record = await this.client.postRecord(
      this.entitySetName,
      await this.transformValueToDataverse(value),
      queryString({ select: pkName }),
    );
    const guid = record?.[pkName] as GUID;
    const ctx: TransformContext = { table: this as any, client: this.client, recordId: guid };
    await this._afterSave(ctx, value);
    return guid;
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
    const ctx: TransformContext = { table: this as any, client: this.client, recordId: id as string };
    await this.client.patchRecord(
      this.entitySetName,
      id,
      await this.transformValueToDataverse(value, ctx),
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
    const pkName = this.primaryKey.property.name;

    if (id) {
      const ctx: TransformContext = { table: this as any, client: this.client, recordId: id as string };
      const transformed = await this.transformValueToDataverse(value, ctx);
      promises.push(
        this.client.patchRecord(
          this.entitySetName,
          id,
          transformed,
          queryString({ select: pkName }),
          etag,
        ),
      );
    } else {
      const record = await this.client.postRecord(
        this.entitySetName,
        await this.transformValueToDataverse(value),
        queryString({ select: pkName }),
      );
      id = record[pkName] as GUID;
      const ctx: TransformContext = { table: this as any, client: this.client, recordId: id as string };
      await this._afterSave(ctx, value);
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
    return this.client.deleteRecord(this.entitySetName, id, etag);
  }

  /**
   * Activates a record by setting its `statecode` to 0.
   *
   * @example
   * await Person.activateRecord("some-guid");
   */
  async activateRecord(id: DataverseKey): Promise<GUID>{
    return this.client.activateRecord(this.entitySetName,id)
  }

  /**
   * Deactivates a record by setting its `statecode` to 1.
   *
   * @example
   * await Person.deactivateRecord("some-guid");
   */
  async deactivateRecord(id: DataverseKey): Promise<GUID>{
    return this.client.deactivateRecord(this.entitySetName,id)
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
      return this.client.deletePropertyValue(this.entitySetName, id, prop.name);
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
      return this.client.executeBoundAction(this.entitySetName, actionName, params, id as string);
    }
    return this.client.executeBoundAction(this.entitySetName, actionName, params);
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
    return this.client.executeBoundFunction(this.entitySetName, id as string, functionName, params);
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
      this.entitySetName,
      await Promise.all(records.map((r) => this.transformValueToDataverse(r))),
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
      this.entitySetName,
      await Promise.all(records.map((r) => this.transformValueToDataverse(r))),
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
    return this.client.deleteMultiple(this.entitySetName, ids);
  }

  /**
   * Extracts the primary key GUID from a record object, or `undefined` if not present.
   *
   * @example
   * const account = await Account.getRecord("some-guid");
   * const pk = Account.getPrimaryId(account); // GUID | undefined
   */
  getPrimaryId(value: Partial<Infer<TProperties>>): GUID | undefined {
    return value[this.primaryKey.key as keyof typeof value] as GUID | undefined;
  }

  transformValueFromDataverse(value: any): Infer<TProperties> {
    if (value === null) return null as unknown as Infer<TProperties>;
    const result = {} as Record<PropertyKey, any>;
    const pk = this.primaryKey;
    const recordId = value[pk.property.fromDataverseName] as GUID | undefined;
    const ctx: TransformContext | undefined = recordId ? { table: this as any, client: this.client, recordId } : undefined;
    for (const [key, property] of Object.entries(this.fields)) {
      const raw = value[property.fromDataverseName];
      result[key] = property.transformValueFromDataverse(raw, ctx);
    }
    result[Etag] = value["@odata.etag"];
    return result as Infer<TProperties>;
  }

  async transformValueToDataverse(
    value: Partial<Infer<TProperties>>,
    ctx?: TransformContext,
  ): Promise<DataverseRecord> {
    if (value === null) return null as unknown as DataverseRecord;
    const result = {} as Record<string, any>;
    for (const [key, property] of Object.entries(this.fields)) {
      if (property.getReadOnly() || !(key in value)) continue;
      let v = (property as FieldBase<any>).transformValueToDataverse(
        value[key as keyof typeof value] as any,
        ctx,
      );
      if (v instanceof Promise) v = await v;
      if (v !== SKIP) result[property.toDataverseName] = v;
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
    return new DataverseTable({ client: this.client, entitySetName: this.entitySetName, logicalName: this.logicalName, fields: properties, primaryKey: this.primaryKey });
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
    return new DataverseTable({ client: this.client, entitySetName: this.entitySetName, logicalName: this.logicalName, fields: properties, primaryKey: this.primaryKey });
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
    return new DataverseTable({ client: this.client, entitySetName: this.entitySetName, logicalName: this.logicalName, primaryKey: this.primaryKey, fields: {
      ...this.fields,
      ...properties,
    } as any});
  }

  async deleteFile(id: GUID, fieldName: string): Promise<void> {
    const field = this.fields[fieldName];
    if (!field || field.type !== "file") throw new Error(`"${fieldName}" is not a file column`);
    await this.client.deletePropertyValue(this.entitySetName, id, (field as FileField).name);
  }

  async downloadImage(id: GUID, fieldName: string): Promise<Blob> {
    const field = this.fields[fieldName];
    if (!field || field.type !== "image") throw new Error(`"${fieldName}" is not an image column`);
    const response = await this.client.fetch(`${this.entitySetName}(${id})/${field.name}/$value`, { raw: true });
    if (!response.ok) throw new Error(response.status + "-" + response.statusText);
    return response.blob();
  }

  async deleteImage(id: GUID, fieldName: string): Promise<void> {
    const field = this.fields[fieldName];
    if (!field || field.type !== "image") throw new Error(`"${fieldName}" is not an image column`);
    await this.client.deletePropertyValue(this.entitySetName, id, field.name);
  }

  private async _afterSave(ctx: TransformContext, value: Partial<Infer<TProperties>>): Promise<void> {
    for (const [key, property] of Object.entries(this.fields)) {
      if (property.afterSave) {
        await property.afterSave(ctx, (value as any)[key]);
      }
    }
  }

  /** Use for type inference: `Infer<typeof Account>` resolves to the record type. */
  T!: Infer<TProperties>;
}



function buildQuery(
  table: DataverseTable<GenericProperties>,
  q?: QueryForTable<GenericProperties>,
): string {
  return queryString({
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
    .filter((v: any) => v.kind === "value" || v.type === "lookupId" || v.type==="file" || v.type==="image")
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
export class DataverseIntersectTable<
  T1 extends GenericProperties,
  T2 extends GenericProperties,
> {
  /** Marks this table as an intersect table for FetchXML joins. */
  readonly intersect = true

  /**
   * The intersect table name used in FetchXML `<link-entity name="...">`.
   * This is the Dataverse entity logical name (e.g. `"accountcontact"`).
   * It is NOT an entity set name (no pluralization) — unlike {@link DataverseTable.entitySetName}
   * and {@link DataverseTable.logicalName}, this single `name` serves both roles
   * for intersect table references in FetchXML join syntax.
   */
  readonly name: string

  /** The first related table. */
  readonly table1: DataverseTable<T1>
  /** The second related table. */
  readonly table2: DataverseTable<T2>

  constructor(
    name: string,
    table1: DataverseTable<T1>,
    table2: DataverseTable<T2>,
  ) {
    this.name = name
    this.table1 = table1
    this.table2 = table2
  }
}


