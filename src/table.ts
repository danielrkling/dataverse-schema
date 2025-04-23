import {
  associateRecord,
  associateRecordToList,
  deletePropertyValue,
  deleteRecord,
  disssociateRecord,
  getAssociatedRecord,
  getAssociatedRecords,
  getPropertyValue,
  getRecord,
  getRecords,
  patchRecord,
  postRecord,
  updatePropertyValue,
} from "./operations";
import {
  CollectionIdsProperty,
  CollectionProperty,
  LookupIdProperty,
  LookupProperty,
  PrimaryKeyProperty,
} from "./properties";
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
  StandardSchemaV1,
} from "./types";
import { attachEtag, Etag } from "./util";

export type QueryForTable<T> = {
  orderby?: Partial<Record<keyof T, "asc" | "desc">>;
  filter?: string;
  top?: number;
};

/**
 * Represents a Dataverse table and provides methods for interacting with it.
 * Implements the StandardSchemaV1 interface.
 *
 * @template TProperties An object defining the properties of the table.  Each property definition
 * describes the type and behavior of a column in the Dataverse table.
 */
export class Table<TProperties extends GenericProperties> extends Schema<
  Infer<TProperties>
> {
  properties: TProperties;
  kind = "table" as const;
  type = "table" as const;

  /**
   * Creates a new Table instance.
   *
   * @param entitySetName The entity set name of the Dataverse table.
   * @param props An object defining the properties of the table.
   */
  constructor(entitySetName: string, props: TProperties) {
    super(entitySetName, null as Infer<TProperties>);
    this.name = entitySetName;
    this.properties = props;
  }

  getIssues(value: any, path: PropertyKey[] = []): StandardSchemaV1.Issue[] {
    const issues = super.getIssues(value, path);
    if (typeof value !== "object") value = {}
    for (const [key, property] of Object.entries(this.properties)) {
      if (!property.getReadOnly())
        issues.push(...property.getIssues(value[key], [...path, key]));
    }
    return issues;
  }

  /**
   * Gets the default values for the table's properties, optionally merged with provided values.
   *
   * @param value Optional object containing values to merge with the defaults.
   * @returns An object containing the default values for the table.
   *
   * @example
   * // Example 1: Get all default values.
   * const defaultAccount = myAccountTable.getDefault();
   * // Returns an object with all properties set to their defaults.
   *
   * // Example 2: Merge provided values with defaults.
   * const partialAccount = { name: "Initial Name" };
   * const mergedAccount = myAccountTable.getDefault(partialAccount);
   * // Returns an object with defaults, but 'name' is set to "Initial Name".
   */
  getDefault(value?: Partial<Infer<TProperties>>): Infer<TProperties> {
    const result = {} as Record<string, any>;
    for (const [key, property] of Object.entries(this.properties)) {
      if (value === undefined || !(key in value)) {
        result[key] = property.getDefault();
      } else {
        result[key] = value[key];
      }
      // const propertyValue = value[key];

      // if (property.type === "collection") {
      //   const array = Array.isArray(propertyValue)
      //     ? propertyValue
      //     : ([] as any[]);
      //   result[key] = array.map((v: any) => property.table.getDefault(v));
      // }
      // if (property.type === "collectionIds") {
      //   const array = Array.isArray(propertyValue)
      //     ? propertyValue
      //     : ([] as any[]);
      //   result[key] = array;
      // }
      // if (property.type === "lookup") {
      //   result[key] =
      //     propertyValue === null
      //       ? null
      //       : property.table.getDefault(propertyValue as {});
      // }
      // if (property.kind === "value" || property.type === "lookupId") {
      //   result[key] = propertyValue;
      // }
    }
    return result as unknown as Infer<TProperties>;
  }

  /**
   * Retrieves a single record from the table by its ID.
   *
   * @param keys The unique identifier of the record to retrieve.
   * @returns A promise that resolves to the retrieved record, or null if not found.
   *
   * @example
   * const account = await myAccountTable.getRecord("12345678-90ab-cdef-1234-567890abcdef");
   * if (account) {
   * console.log(account.name); // Access a property of the record
   * }
   */
  async getRecord(id: DataverseKey): Promise<Infer<TProperties> | null> {
    return getRecord(this.name, id, buildQuery(this)).then((v) =>
      this.transformValueFromDataverse(v)
    );
  }

  getAlternateKeys(value: Partial<Infer<TProperties>>): AlternateKey {
    return Object.entries(value).map(kv => `${this.properties[kv[0]].name}=${kv[1]}`).join(',') as AlternateKey
  }

  /**
   * Retrieves multiple records from the table, optionally with a query.
   *
   * @param query An optional object specifying query parameters such as order, filter, and top.
   * @returns A promise that resolves to an array of retrieved records.
   *
   * @example
   * // Example 1: Get all accounts
   * const allAccounts = await myAccountTable.getRecords();
   *
   * // Example 2: Get accounts ordered by name, with a limit
   * const limitedAccounts = await myAccountTable.getRecords({
   * orderby: { name: "asc" },
   * top: 10,
   * });
   *
   * // Example 3: Get accounts filtered by a condition
   * const filteredAccounts = await myAccountTable.getRecords({
   * filter: equals("accountnumber", "123")
   * });
   */
  async getRecords(
    query?: QueryForTable<TProperties>
  ): Promise<Infer<TProperties>[]> {
    return getRecords(this.name, buildQuery(this, query)).then((values) =>
      values.map((v) => this.transformValueFromDataverse(v))
    );
  }

  /**
   * Retrieves the value of a specific property for a record.
   *
   * @param key The key of the property to retrieve.
   * @param id The unique identifier of the record.
   * @param query Optional query parameters to apply.
   * @returns A promise that resolves to the property value.
   *
   * @example
   * //Get a single property
   * const accountName = await myAccountTable.getPropertyValue("name", "12345678-90ab-cdef-1234-567890abcdef");
   *
   * //Get a collection valued property
   * const contacts = await myAccountTable.getPropertyValue("contact_customer_accounts", "12345678-90ab-cdef-1234-567890abcdef");
   */
  async getPropertyValue<TKey extends keyof TProperties>(
    key: TKey,
    id: DataverseKey,
    query?: QueryForTable<TProperties>
  ): Promise<Infer<TProperties[TKey]>> {
    const prop = this.properties[key];
    if (prop.kind === "value" || prop.type === "lookupId") {
      return getPropertyValue(this.name, id, prop.name).then((v) =>
        prop.transformValueFromDataverse(v)
      ) as Infer<TProperties[TKey]>;
    }
    if (prop.type === "collection" || prop.type === "collectionIds") {
      return getAssociatedRecords(
        this.name,
        id,
        prop.name,
        buildQuery(this, query)
      ).then(
        (v) => prop.transformValueFromDataverse(v) as Infer<TProperties[TKey]>
      );
    }
    if (prop.type === "lookup") {
      return getAssociatedRecord(
        this.name,
        id,
        prop.name,
        buildQuery(this, query)
      ).then(
        (v) => prop.transformValueFromDataverse(v) as Infer<TProperties[TKey]>
      );
    }
    throw new Error("Invalid Property");
  }

  /**
   * Updates the value of a specific property for a record.
   *
   * @param key The key of the property to update.
   * @param id The unique identifier of the record to update.
   * @param value The new value for the property.
   * @returns A promise that resolves to the ID of the updated record.
   *
   * @example
   * await myAccountTable.updatePropertyValue("name", "12345678-90ab-cdef-1234-567890abcdef", "New Name");
   */
  async updatePropertyValue<TKey extends keyof TProperties>(
    key: TKey,
    id: DataverseKey,
    value: Infer<TProperties[TKey]>
  ): Promise<DataverseKey> {
    const prop = this.properties[key];
    if (prop.kind === "navigation") {
      await this.updateNavigationProperty(prop, id, value);
    } else {
      await updatePropertyValue(
        this.name,
        id,
        this.properties[key].name,
        prop.transformValueToDataverse(value)
      );
    }
    return id;
  }

  /**
   * Handles updating navigation properties (lookups, expands, collections, lookups).
   * @param property The navigation property to update
   * @param id The id of the record being updated.
   * @param value The new value for the navigation property.
   */
  protected async updateNavigationProperty(
    property: GenericNavigationProperty,
    id: DataverseKey,
    value: any
  ) {
    if (property.type === "collection" || property.type === "collectionIds") {
      if (Array.isArray(value)) {
        const ids =
          property.type === "collection"
            ? await Promise.all(
              value.map((v: any) => property.table.saveRecord(v))
            )
            : (value as DataverseKey[]);
        return associateRecordToList(
          this.name,
          id,
          property.name,
          property.table.name,
          property.table.getPrimaryKey().property.name,
          ids
        );
      }
    }

    if (property.type === "lookup" || property.type == "lookupId") {
      const name =
        property.type === "lookup" ? property.name : property.navigationName;
      if (value === null) {
        return disssociateRecord(this.name, id, name);
      } else {
        const childId =
          property.type === "lookup"
            ? await this.saveRecord(value)
            : (value as GUID);
        return associateRecord(
          this.name,
          id,
          name,
          property.table.name,
          childId
        );
      }
    }
  }

  /**
   * Associates a child record with a parent record through a navigation property.
   *
   * @param key The key of the navigation property to use for the association.
   * @param id The unique identifier of the parent record.
   * @param childId The unique identifier of the child record to associate.
   * @returns A promise that resolves to the ID of the parent record.
   *
   * @example
   * const accountId = "a1b2c3d4-e5f6-7890-1234-567890abcdef";
   * const contactId = "f9e8d7c6-b5a4-3210-fedc-ba9876543210";
   * await myAccountTable.associateRecord("primarycontactid", accountId, contactId);
   */
  async associateRecord<
    TKey extends NarrowKeysByValue<TProperties, GenericNavigationProperty>
  >(key: TKey, id: DataverseKey, childId: DataverseKey): Promise<DataverseKey> {
    const prop = this.properties[key];
    if (prop.kind === "navigation") {
      return associateRecord(
        this.name,
        id,
        prop.name,
        prop.table.name,
        childId
      );
    } else {
      throw new Error("Can only associate to naigation properties");
    }
  }

  /**
   * Dissociates a child record from a parent record through a navigation property.
   *
   * @param key The key of the navigation property to use for the disassociation.
   * @param id The unique identifier of the parent record.
   * @param childId The unique identifier of the child record to dissociate (only for collection-valued navigation properties).
   * @returns A promise that resolves to the ID of the parent record.
   *
   * @example
   * // Dissociate a contact from an account's primary contact
   * await myAccountTable.dissociateRecord("primarycontactid", accountId);
   *
   * // Dissociate a contact from an account's contact collection
   * await myAccountTable.dissociateRecord("contact_customer_accounts", accountId, contactId);
   */
  async dissociateRecord<
    TKey extends NarrowKeysByValue<
      TProperties,
      CollectionProperty<any> | CollectionIdsProperty
    >
  >(key: TKey, id: DataverseKey, childId: DataverseKey): Promise<DataverseKey>;
  async dissociateRecord<
    TKey extends NarrowKeysByValue<
      TProperties,
      LookupProperty<any> | LookupIdProperty
    >
  >(key: TKey, id: DataverseKey): Promise<DataverseKey>;
  async dissociateRecord<
    TKey extends NarrowKeysByValue<TProperties, GenericNavigationProperty>
  >(
    key: TKey,
    id: DataverseKey,
    childId?: DataverseKey
  ): Promise<DataverseKey> {
    const prop = this.properties[key];
    if (prop.kind === "navigation") {
      return disssociateRecord(
        this.name,
        id,
        prop.name,
        prop.type === "collection" || prop.type === "collectionIds"
          ? childId
          : undefined
      );
    } else {
      throw new Error("Can only associate to naigation properties");
    }
  }

  /**
   * Saves a record to the table.  Handles both creating new records and updating existing ones.
   *
   * @param value An object containing the data to save.  The object structure should match the table's properties.
   * @returns A promise that resolves to the GUID of the saved record.
   *
   * @example
   * // Example 1: Creating a new account
   * const newAccountId = await myAccountTable.saveRecord({
   * name: "New Account Name",
   * accountnumber: "NewAccount001",
   * });
   *
   * // Example 2: Updating an existing account
   * const existingAccountId = "a1b2c3d4-e5f6-7890-1234-567890abcdef";
   * const updatedAccountId = await myAccountTable.saveRecord({
   * id: existingAccountId,
   * name: "Updated Account Name",
   * });
   */
  async saveRecord(value: Partial<Infer<TProperties>>): Promise<GUID> {
    const promises = [];
    const pk = this.getPrimaryKey().property.name;
    let id = this.getPrimaryId(value);
    if (id) {
      promises.push(
        patchRecord(
          this.name,
          id,
          this.transformValueToDataverse(value),
          query({ select: pk })
        )
      );
    } else {
      const record = await postRecord(
        this.name,
        this.transformValueToDataverse(value),
        query({ select: pk })
      )
      //we need primary key of new record
      id = record[pk] as GUID
    }

    for (const [key, property] of Object.entries(this.properties)) {
      if (property.getReadOnly() || !(key in value)) continue;

      if (property.kind === "navigation") {
        promises.push(this.updateNavigationProperty(property, id, value[key]));
      }
    }
    await Promise.all(promises);
    return id;
  }

  /**
   * Deletes a record from the table by its ID.
   *
   * @param id The unique identifier of the record to delete.
   * @returns A promise that resolves to the ID of the deleted record.
   *
   * @example
   * await myAccountTable.deleteRecord("12345678-90ab-cdef-1234-567890abcdef");
   */
  async deleteRecord(id: DataverseKey): Promise<DataverseKey> {
    return deleteRecord(this.name, id);
  }

  /**
   * Deletes the value of a specific property for a record.  Only works for value properties.
   *
   * @param key The key of the property to delete the value of.
   * @param id The unique identifier of the record.
   * @returns A promise that resolves to the ID of the record.
   *
   * @example
   * await myAccountTable.deletePropertyValue("accountnumber", "12345678-90ab-cdef-1234-567890abcdef");
   */
  async deletePropertyValue<
    TKey extends NarrowKeysByValue<TProperties, GenericValueProperty>
  >(key: TKey, id: DataverseKey): Promise<DataverseKey> {
    const prop = this.properties[key];
    if (prop.kind === "value") {
      return deletePropertyValue(this.name, id, prop.name);
    }
    throw new Error("Cannot delete navigation property values");
  }

  /**
   * Gets the primary key property of the table.
   *
   * @returns An object containing the key and property definition of the primary key.
   * @throws Error if no primary key is found.
   *
   * @example
   * const primaryKeyInfo = myAccountTable.getPrimaryKey();
   * console.log(primaryKeyInfo.key); // "id" (or whatever the primary key property is named)
   * console.log(primaryKeyInfo.property); // The PrimaryKeyProperty object
   */
  getPrimaryKey() {
    const result = Object.entries(this.properties).find(
      (f) => f[1].type === "primaryKey"
    );
    if (!result) throw new Error("No Primary Key");
    return {
      key: result[0],
      property: result[1] as PrimaryKeyProperty,
    };
  }

  /**
   * Gets the primary key value from a record object.
   *
   * @param value An object representing a record, typically of type `Partial<Infer<TProperties>>`.
   * @returns The GUID of the primary key, or undefined if not found in the provided value.
   *
   * @example
   * const accountData = { id: "a1b2c3d4-e5f6-7890-1234-567890abcdef", name: "My Account" };
   * const accountId = myAccountTable.getPrimaryId(accountData); // returns "a1b2c3d4-e5f6-7890-1234-567890abcdef"
   */
  getPrimaryId(value: Partial<Infer<TProperties>>): GUID | undefined {
    const { key } = this.getPrimaryKey();
    return value[key] as unknown as GUID;
  }

  /**
   * Transforms a record from Dataverse format to the format expected by the application.
   * This involves using the `transformValueFromDataverse` method of each property.
   *
   * @param value The record data in Dataverse format.
   * @returns The transformed record data in the application's format.
   *
   * @example
   * // Assuming Dataverse returns: { accountid: "...", name: "Account Name", ... }
   * const transformedAccount = myAccountTable.transformValueFromDataverse(dataverseAccountData);
   * // transformedAccount might look like: { id: "...", name: "Account Name", ... }
   */
  transformValueFromDataverse(value: any): Infer<TProperties> {
    if (value === null) return null as unknown as Infer<TProperties>;
    const result = {} as Record<PropertyKey, any>;
    for (const [key, property] of Object.entries(this.properties)) {
      result[key] = property.transformValueFromDataverse(value[property.name]);
    }
    result[Etag] = value[Etag]
    return result as Infer<TProperties>;
  }

  /**
   * Transforms a record from the application's format to Dataverse format.
   * This involves using the `transformValueToDataverse` method of each property.
   *
   * @param value The record data in the application's format.
   * @returns The record data in Dataverse format.
   *
   * @example
   * const appAccountData = { id: "...", name: "Account Name", ... };
   * const dataverseAccountData = myAccountTable.transformValueToDataverse(appAccountData);
   * // dataverseAccountData might look like: { accountid: "...", name: "Account Name", ... }
   */
  transformValueToDataverse(
    value: Partial<Infer<TProperties>>
  ): DataverseRecord {
    if (value === null) return null as unknown as DataverseRecord;
    const result = {} as Record<string, any>;
    for (const [key, property] of Object.entries(this.properties)) {
      if (property.getReadOnly() || !(key in value)) continue;

      if (property.kind === "value") {
        const v = property.transformValueToDataverse(value[key]);
        result[property.name] = v;
      }
    }

    return result;
  }

  /**
   * Creates a new Table instance with a subset of the original table's properties.
   *
   * @param keys The keys of the properties to include in the new table.
   * @returns A new Table instance with the specified properties.
   *
   * @example
   * // Create a new table with only 'name' and 'accountnumber' properties.
   * const nameAndNumberTable = myAccountTable.pickProperties("name", "accountnumber");
   */
  pickProperties<TKeys extends keyof TProperties>(
    ...keys: TKeys[]
  ): Table<Pick<TProperties, TKeys>> {
    const properties = Object.fromEntries(
      Object.entries(this.properties).filter((v) => keys.includes(v[0] as any))
    ) as Pick<TProperties, TKeys>;

    return new Table(this.name, properties);
  }

  /**
   * Creates a new Table instance with all but the specified properties from the original table.
   *
   * @param keys The keys of the properties to exclude from the new table.
   * @returns A new Table instance with the remaining properties.
   *
   * @example
   * // Create a new table without the 'notes' and 'tasks' properties.
   * const noNotesAndTasksTable = myAccountTable.omitProperties("notes", "tasks");
   */
  omitProperties<TKeys extends keyof TProperties>(
    ...keys: TKeys[]
  ): Table<Omit<TProperties, TKeys>> {
    const properties = Object.fromEntries(
      Object.entries(this.properties).filter((v) => !keys.includes(v[0] as any))
    ) as Omit<TProperties, TKeys>;

    return new Table(this.name, properties);
  }

  /**
   * Creates a new Table instance with additional properties added to the original table's properties.
   *
   * @param properties An object defining the properties to append.
   * @returns A new Table instance with the appended properties.
   *
   * @example
   * // Create a new table with an added 'customField' property.
   * const extendedTable = myAccountTable.appendProperties({
   * customField: string("custom_field"),
   * });
   */
  appendProperties<TAppendedProperties extends GenericProperties>(
    properties: TAppendedProperties
  ): Table<Omit<TProperties, keyof TAppendedProperties> & TAppendedProperties> {
    return new Table(this.name, { ...this.properties, ...properties });
  }
}

export function table<TProperties extends GenericProperties>(
  name: string,
  properties: TProperties
): Table<TProperties> {
  return new Table(name, properties);
}

function buildQuery(
  table: Table<GenericProperties>,
  q?: QueryForTable<GenericProperties>
): string {
  return query({
    top: q?.top,
    filter: q?.filter,
    orderby: q?.orderby
      ? Object.entries(q?.orderby ?? {})
        .map(([key, value]) => `${table.properties[key].name} ${value}`)
        .join(",")
      : undefined,
    select: buildSelect(table),
    expand: buildExpand(table),
  });
}

function buildSelect(table: Table<GenericProperties>): string {
  return Object.values(table.properties)
    .filter((v) => v.kind === "value" || v.type === "lookupId")
    .map((v) => v.name)
    .join(",");
}

function buildExpand(table: Table<GenericProperties>): string {
  return Object.values(table.properties)
    .filter((v) => v.kind === "navigation" && v.type !== "lookupId")
    .map(
      (v) =>
        `${v.name}($select=${buildSelect(v.table)};$expand=${buildExpand(
          v.table
        )})`
    )
    .join(",");
}
