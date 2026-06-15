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

/**
 * Represents a Dataverse table and provides methods for interacting with it.
 * This class now depends on a DataverseClient instance for all its operations.
 *
 * @template TProperties An object defining the properties of the table.
 */
export class Table<TProperties extends GenericProperties> extends Schema<
  Infer<TProperties>
> {
  client: DataverseClient;
  fields: TProperties;
  kind = "table" as const;
  type = "table" as const;

  /**
   * Creates a new Table instance.
   *
   * @param client An instance of the DataverseClient to use for all API operations.
   * @param entitySetName The entity set name of the Dataverse table.
   * @param props An object defining the properties of the table.
   */
  constructor(
    client: DataverseClient,
    entitySetName: string,
    props: TProperties,
  ) {
    super(entitySetName, null as Infer<TProperties>);
    this.client = client;
    this.name = entitySetName;
    this.fields = props;
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
   * Retrieves a single record from the table by its ID.
   */
  async getRecord(id: DataverseKey): Promise<Infer<TProperties> | null> {
    return this.client
      .getRecord(this.name, id, buildQuery(this))
      .then((v) => this.transformValueFromDataverse(v));
  }

  getAlternateKeys(value: Partial<Infer<TProperties>>): AlternateKey {
    return Object.entries(value)
      .map((kv) => `${this.fields[kv[0]].name}=${kv[1]}`)
      .join(",") as AlternateKey;
  }

  /**
   * Retrieves multiple records from the table, optionally with a query.
   */
  async getRecords(
    queryOptions?: QueryForTable<TProperties>,
  ): Promise<Infer<TProperties>[]> {
    return this.client
      .getRecords(this.name, buildQuery(this, queryOptions))
      .then((values) => values.map((v) => this.transformValueFromDataverse(v)));
  }

  /**
   * Retrieves the value of a specific property for a record.
   */
  async getPropertyValue<TKey extends keyof TProperties>(
    key: TKey,
    id: GUID,
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
          buildQuery(prop.table, queryOptions), // Note: buildQuery needs to handle related table schema
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
   * Updates the value of a specific property for a record.
   */
  async updatePropertyValue<TKey extends keyof TProperties>(
    key: TKey,
    id: GUID,
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
    return id;
  }

  protected async updateNavigationProperty(
    property: GenericNavigationProperty,
    id: GUID,
    value: any,
  ) {
    if (property.type === "collection" || property.type === "collectionIds") {
      if (Array.isArray(value)) {
        const ids =
          property.type === "collection"
            ? await Promise.all(
                value.map((v: any) => property.table.saveRecord(v)),
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
            ? await property.table.saveRecord(value)
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
   * Associates a child record with a parent record through a navigation property.
   */
  async associateRecord<
    TKey extends NarrowKeysByValue<TProperties, GenericNavigationProperty>,
  >(key: TKey, id: GUID, childId: GUID): Promise<GUID> {
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
   * Dissociates a child record from a parent record through a navigation property.
   */
  async dissociateRecord<
    TKey extends NarrowKeysByValue<
      TProperties,
      CollectionProperty<any> | CollectionIdsProperty
    >,
  >(key: TKey, id: GUID, childId: GUID): Promise<GUID>;
  async dissociateRecord<
    TKey extends NarrowKeysByValue<
      TProperties,
      LookupProperty<any> | LookupIdProperty
    >,
  >(key: TKey, id: GUID): Promise<GUID>;
  async dissociateRecord<
    TKey extends NarrowKeysByValue<TProperties, GenericNavigationProperty>,
  >(key: TKey, id: GUID, childId?: GUID): Promise<GUID> {
    const prop = this.fields[key];
    if (prop.kind === "navigation") {
      return this.client.dissociateRecord(this.name, id, prop.name, childId);
    } else {
      throw new Error("Can only dissociate navigation properties");
    }
  }

  async postRecord(value: Partial<Infer<TProperties>>): Promise<GUID> {
    const pkName = this.getPrimaryKey().property.name;
    const record = await this.client.postRecord(
      this.name,
      this.transformValueToDataverse(value),
      query({ select: pkName }),
    );
    return record?.[pkName] as GUID;
  }

  async patchRecord(id: GUID, value: Partial<Infer<TProperties>>): Promise<GUID> {
    if (!id) throw new Error("No ID provided")
    await this.client.patchRecord(
      this.name,
      id,
      this.transformValueToDataverse(value)
    );
    return id;
  }

  /**
   * Saves a record to the table. Handles both creating new records and updating existing ones.
   */
  async saveRecord(value: Partial<Infer<TProperties>>): Promise<GUID> {
    const promises: Promise<any>[] = [];
    const pkName = this.getPrimaryKey().property.name;
    let id = this.getPrimaryId(value);

    if (id) {
      promises.push(
        this.client.patchRecord(
          this.name,
          id,
          this.transformValueToDataverse(value),
          query({ select: pkName }),
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
    return id;
  }

  /**
   * Deletes a record from the table by its ID.
   */
  async deleteRecord(id: GUID): Promise<GUID> {
    return this.client.deleteRecord(this.name, id);
  }

  async activateRecord(id: GUID): Promise<GUID>{
    return this.client.activateRecord(this.name,id)
  }

    async deactivateRecord(id: GUID): Promise<GUID>{
    return this.client.deactivateRecord(this.name,id)
  }

  /**
   * Deletes the value of a specific property for a record.
   */
  async deletePropertyValue<
    TKey extends NarrowKeysByValue<TProperties, GenericValueProperty>,
  >(key: TKey, id: GUID): Promise<GUID> {
    const prop = this.fields[key];
    if (prop.kind === "value") {
      return this.client.deletePropertyValue(this.name, id, prop.name);
    }
    throw new Error("Cannot delete navigation property values");
  }

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
   * Creates a new Table instance with a subset of the original table's properties.
   */
  pickProperties<TKeys extends keyof TProperties>(
    ...keys: TKeys[]
  ): Table<Pick<TProperties, TKeys>> {
    const properties = Object.fromEntries(
      Object.entries(this.fields).filter((v) => keys.includes(v[0] as any)),
    ) as Pick<TProperties, TKeys>;
    // Pass the client instance to the new Table
    return new Table(this.client, this.name, properties);
  }

  /**
   * Creates a new Table instance with all but the specified properties from the original table.
   */
  omitProperties<TKeys extends keyof TProperties>(
    ...keys: TKeys[]
  ): Table<Omit<TProperties, TKeys>> {
    const properties = Object.fromEntries(
      Object.entries(this.fields).filter((v) => !keys.includes(v[0] as any)),
    ) as Omit<TProperties, TKeys>;
    // Pass the client instance to the new Table
    return new Table(this.client, this.name, properties);
  }

  /**
   * Creates a new Table instance with additional properties added to the original table's properties.
   */
  appendProperties<TAppendedProperties extends GenericProperties>(
    properties: TAppendedProperties,
  ): Table<Omit<TProperties, keyof TAppendedProperties> & TAppendedProperties> {
    // Pass the client instance to the new Table
    return new Table(this.client, this.name, {
      ...this.fields,
      ...properties,
    });
  }

  /** Use for typescript only. const x: typeof table.T */
  T!: Infer<TProperties>;
}

/**
 * Factory function to create a new Table instance.
 */
export function table<TProperties extends GenericProperties>(
  client: DataverseClient,
  name: string,
  properties: TProperties,
): Table<TProperties> {
  return new Table(client, name, properties);
}

function buildQuery(
  table: Table<GenericProperties>,
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

function buildSelect(table: Table<GenericProperties>): string {
  return Object.values(table.fields)
    .filter((v) => v.kind === "value" || v.type === "lookupId" || v.type==="file")
    .map((v) =>v.fromDataverseName)
    .join(",");
}

function buildExpand(table: Table<GenericProperties>): string {
  return Object.values(table.fields)
    .filter(
      (v) =>
        v.kind === "navigation" &&
        v.type !== "lookupId" &&
        v.type !== "collectionIds",
    )
    .map((v) => {
      const navProp = v as CollectionProperty<any> | LookupProperty<any>;
      // Recursively build select and expand for nested tables
      const innerSelect = buildSelect(navProp.table);
      const innerExpand = buildExpand(navProp.table);
      let expandQuery = `$select=${innerSelect}`;
      if (innerExpand) {
        expandQuery += `;$expand=${innerExpand}`;
      }
      return `${navProp.name}(${expandQuery})`;
    })
    .join(",");
}
