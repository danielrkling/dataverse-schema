import { Schema } from "./schema";
import { DataverseTable } from "./table";
import { GenericProperties, GetTable, GUID, Infer } from "./types";
import { parseDateOnly, toDateOnly } from "./util";
import { isType } from "./validators";
import { isTypeOrNull } from "./validators";
import { StandardSchemaV1 } from "@standard-schema/spec";

export class BooleanField extends Schema<boolean> {
  kind = "value" as const;
  type = "boolean" as const;
  constructor(name: string) {
    super(name, false);
    this.check(isType("boolean"));
  }
}

export class NumberField extends Schema<number> {
  kind = "value" as const;
  type = "number" as const;
  constructor(name: string) {
    super(name, 0);
    this.check(isType("number"));
  }

  transformValueFromDataverse(value: any): number {
    return value ?? 0;
  }
}

export class NullableNumberField extends Schema<number | null> {
  kind = "value" as const;
  type = "number" as const;
  constructor(name: string) {
    super(name, null);
    this.check(isTypeOrNull("number"));
  }
}

export class StringField extends Schema<string> {
  kind = "value" as const;
  type = "string" as const;
  constructor(name: string) {
    super(name, "");
    this.check(isType("string"));
  }

  transformValueFromDataverse(value: any): string {
    return value ?? "";
  }
}

export class NullableStringField extends Schema<string | null> {
  kind = "value" as const;
  type = "string" as const;
  constructor(name: string) {
    super(name, null);
    this.check(isTypeOrNull("string"));
  }
}

export class PrimaryKeyField extends Schema<GUID> {
  kind = "value" as const;
  type = "primaryKey" as const;
  constructor(name: string) {
    super(name, "" as GUID);
    // this.setReadOnly();
    this.check(isType("string"));
  }

  getDefault(): GUID {
    return crypto.randomUUID();
  }
}

export class ListField<T extends string | number> extends Schema<T | null> {
  kind = "value" as const;
  type = "list" as const;
  list: Array<T>;
  constructor(name: string, list: Array<T>) {
    super(name, null);
    this.list = list;
    this.check((v) => {
      if (v !== null && !list.includes(v)) {
        return `${v} not in [${list}]`;
      }
    });
  }
}

export class DateTimeField extends Schema<Date> {
  kind = "value" as const;
  type = "date" as const;
  constructor(name: string) {
    super(name, new Date());
    this.check((v) => (v instanceof Date ? undefined : "value is not Date"));
  }
  getDefault(): Date {
    return new Date();
  }
  transformValueFromDataverse(value: any): Date {
    if (value === null) return new Date();
    return new Date(value);
  }
}

export class NullableDateTimeField extends Schema<Date | null> {
  kind = "value" as const;
  type = "date" as const;
  constructor(name: string) {
    super(name, null);
    this.check((v) =>
      v === null || v instanceof Date ? undefined : "value is not Date or null",
    );
  }
  transformValueFromDataverse(value: any): Date | null {
    if (value === null) return null;
    return new Date(value);
  }
}

export class DateField extends Schema<Date> {
  kind = "value" as const;
  type = "dateOnly" as const;
  constructor(name: string) {
    super(name, parseDateOnly(new Date().toISOString()));
    this.check((v) =>
      v instanceof Date ? undefined : "value is not Date",
    );
  }
  transformValueFromDataverse(value: any): Date {
    if (value === null) return parseDateOnly(new Date().toISOString());
    return parseDateOnly(value);
  }
  transformValueToDataverse(value: any) {
    return toDateOnly(value);
  }
}

export class NullableDateField extends Schema<Date | null> {
  kind = "value" as const;
  type = "dateOnly" as const;
  constructor(name: string) {
    super(name, null);
    this.check((v) =>
      v === null || v instanceof Date ? undefined : "value is not Date or null",
    );
  }
  transformValueFromDataverse(value: any): Date | null {
    if (value === null) return null;
    return parseDateOnly(value);
  }
  transformValueToDataverse(value: any) {
    return toDateOnly(value);
  }
}

export class FormattedField extends Schema<string | null> {
  kind = "value" as const;
  type = "formatted" as const;
  constructor(name: string) {
    super(name, null);
    this.fromDataverseName = `${name}@OData.Community.Display.V1.FormattedValue`;
    this.setReadOnly(true);
  }
}

export class ImageField extends Schema<string | null> {
  kind = "value" as const;
  type = "image" as const;
  constructor(name: string) {
    super(name, null);
    this.check(isTypeOrNull("string"));
  }
}

export class FileField extends Schema<string> {
  type = "file" as const;
  kind = "file" as const;

  constructor(name: string) {
    super(name, "");
    this.fromDataverseName = `${name}_name`;
    this.setReadOnly(true);
  }
}

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
export function boolean(name: string) {
  return new BooleanField(name);
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
export function number(name: string) {
  return new NumberField(name);
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
export function nullableNumber(name: string) {
  return new NullableNumberField(name);
}

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
export function string(name: string) {
  return new StringField(name);
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
export function nullableString(name: string) {
  return new NullableStringField(name);
}

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
export function primaryKey(name: string) {
  return new PrimaryKeyField(name);
}

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
export function list<T extends string | number>(name: string, list: Array<T>) {
  return new ListField<T>(name, list);
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
export function datetime(name: string) {
  return new DateTimeField(name);
}

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
export function date(name: string) {
  return new DateField(name);
}

/**
 * Creates a nullable date-only column definition (allows `null`).
 *
 * @param name The Dataverse logical name of the column.
 */
export function nullableDate(name: string){
  return new NullableDateField(name)
}

/**
 * Creates a nullable date-time column definition (allows `null`).
 *
 * @param name The Dataverse logical name of the column.
 */
export function nullableDateTime(name: string){
  return new NullableDateTimeField(name)
}

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
export function formatted(name: string) {
  return new FormattedField(name);
}

/**
 * Creates an image column definition.
 *
 * @param name The Dataverse logical name of the image column.
 */
export function image(name: string) {
  return new ImageField(name);
}

/**
 * Creates a file column definition. File columns are read-only and store the file name.
 *
 * @param name The Dataverse logical name of the file column.
 */
export function file(name: string){
  return new FileField(name)
}

export class LookupIdProperty extends Schema<GUID | null> {
  kind = "navigation" as const;
  type = "lookupId" as const;
  navigationName: string;
  #getTable: GetTable<DataverseTable<GenericProperties>>;

  constructor(name: string, getTable: GetTable) {
    super(name, null);
    this.navigationName = name;
    this.#getTable = getTable;
    this.fromDataverseName = `_${name.toLowerCase()}_value`
    this.toDataverseName = `${this.name}@odata.bind`
  }

  #table: DataverseTable<{ id: PrimaryKeyField }> | undefined;
  get table(): DataverseTable<{ id: PrimaryKeyField }> {
    if (!this.#table) {
      const table = this.#getTable();
      const { property } = table.getPrimaryKey();
      this.#table = new DataverseTable({ client: table.client, entitySetName: table.name, logicalName: table.name, fields: { id: property } });
    }
    return this.#table;
  }


  transformValueToDataverse(value: any): string | null {
    if (value) {
      return `${this.table.name}(${value})`;
    } else {
      return null;
    }
  }
}

export class CollectionProperty<
  TProperties extends GenericProperties,
> extends Schema<Infer<TProperties>[]> {
  kind = "navigation" as const;
  type = "collection" as const;
  #getTable: GetTable<DataverseTable<GenericProperties>>;

  constructor(name: string, getTable: GetTable<DataverseTable<TProperties>>) {
    super(name, []);
    this.#getTable = getTable as unknown as GetTable<DataverseTable<GenericProperties>>;
    this.check((v) =>
      !Array.isArray(v) ? "value is not an array" : undefined,
    );
  }

  #table: DataverseTable<GenericProperties> | undefined;
  get table(): DataverseTable<TProperties> {
    return (this.#table ??= this.#getTable()) as unknown as DataverseTable<TProperties>;
  }

  transformValueFromDataverse(value: any): Infer<TProperties>[] {
    return Array.from(value ?? []).map((v: any) =>
      this.table.transformValueFromDataverse(v),
    );
  }

  getIssues(value: any, path: PropertyKey[] = []): StandardSchemaV1.Issue[] {
    const issues = super.getIssues(value, path);
    if (Array.isArray(value)) {
      issues.push(
        ...value
          .map((v: any, i: number) => this.table.getIssues(v, [...path, i]))
          .flat(1),
      );
    }
    return issues;
  }
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
export function collection<TProperties extends GenericProperties>(
  name: string,
  getTable: GetTable<DataverseTable<TProperties>>,
) {
  return new CollectionProperty(name, getTable);
}

export class CollectionIdsProperty extends Schema<GUID[]> {
  kind = "navigation" as const;
  type = "collectionIds" as const;
  #getTable: GetTable<DataverseTable<GenericProperties>>;

  constructor(name: string, getTable: GetTable) {
    super(name, []);
    this.#getTable = getTable;
    this.check((v) =>
      !Array.isArray(v) ? "value is not an array" : undefined,
    );
  }

  #table: DataverseTable<{ id: PrimaryKeyField }> | undefined;
  get table(): DataverseTable<{ id: PrimaryKeyField }> {
    if (!this.#table) {
      const table = this.#getTable();
      const { property } = table.getPrimaryKey();
      this.#table = new DataverseTable({ client: table.client, entitySetName: table.name, logicalName: table.name, fields: { id: property } });
    }
    return this.#table;
  }

  transformValueFromDataverse(value: any): GUID[] {
    return Array.from(value ?? []).map((v: any) => v[this.table.fields.id.name]);
  }

  getIssues(value: any, path: PropertyKey[] = []): StandardSchemaV1.Issue[] {
    const issues = super.getIssues(value, path);
    if (Array.isArray(value)) {
      issues.push(
        ...value
          .map((v: any, i: number) => this.table.fields.id.getIssues(v,[...path,i]))
          .flat(1),
      );
    }
    return issues;
  }
}

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
export function collectionIds(name: string, getTable: GetTable) {
  return new CollectionIdsProperty(name, getTable);
}

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
export function lookupId(name: string, getTable: GetTable) {
  return new LookupIdProperty(name, getTable);
}

export class LookupProperty<
  TProperties extends GenericProperties,
> extends Schema<Infer<TProperties> | null> {
  kind = "navigation" as const;
  type = "lookup" as const;
  #getTable: GetTable<DataverseTable<GenericProperties>>;

  constructor(name: string, getTable: GetTable<DataverseTable<TProperties>>) {
    super(name, null);
    this.#getTable = getTable as unknown as GetTable<DataverseTable<GenericProperties>>;
  }

  #table: DataverseTable<GenericProperties> | undefined;
  get table(): DataverseTable<TProperties> {
    return (this.#table ??= this.#getTable()) as unknown as DataverseTable<TProperties>;
  }

  transformValueFromDataverse(value: any): Infer<TProperties> | null {
    return value == null ? null : this.table.transformValueFromDataverse(value);
  }

  getIssues(value: any, path?: PropertyKey[]): StandardSchemaV1.Issue[] {
    const issues = super.getIssues(value, path);
    if (value !== null) {
      issues.push(...this.table.getIssues(value, path));
    }
    return issues;
  }
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
export function lookup<TProperties extends GenericProperties>(
  name: string,
  getTable: GetTable<DataverseTable<TProperties>>,
) {
  return new LookupProperty(name, getTable);
}
