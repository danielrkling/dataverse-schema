import * as v from "valibot"
import { FieldBase, ValidationSchema } from "./fieldBase";
import { DataverseTable } from "./table";
import { GenericProperties, GetTable, GUID, Infer } from "./types";
import { parseDateOnly, toDateOnly } from "./util";

function buildObjectSchema(fields: Record<string, FieldBase<any>>): v.BaseSchema<any, any, any> {
  const shape: Record<string, v.BaseSchema<any, any, any>> = {}
  for (const [key, field] of Object.entries(fields)) {
    shape[key] = field.schema
  }
  return v.object(shape)
}

export class BooleanField extends FieldBase<boolean> {
  kind = "value" as const;
  type = "boolean" as const;
  constructor(name: string) {
    super({ name, defaultValue: false, kind: "value", type: "boolean", schema: v.boolean() as ValidationSchema<boolean> });
  }
}

export class NumberField extends FieldBase<number> {
  kind = "value" as const;
  type = "number" as const;
  constructor(name: string) {
    super({ name, defaultValue: 0, kind: "value", type: "number", schema: v.number() as ValidationSchema<number> });
  }

  transformValueFromDataverse(value: any): number {
    return value ?? 0;
  }
}

export class NullableNumberField extends FieldBase<number | null> {
  kind = "value" as const;
  type = "number" as const;
  constructor(name: string) {
    super({ name, defaultValue: null, kind: "value", type: "number", schema: v.nullable(v.number()) as ValidationSchema<number | null> });
  }
}

export class StringField extends FieldBase<string> {
  kind = "value" as const;
  type = "string" as const;
  constructor(name: string) {
    super({ name, defaultValue: "", kind: "value", type: "string", schema: v.string() as ValidationSchema<string> });
  }

  transformValueFromDataverse(value: any): string {
    return value ?? "";
  }
}

export class NullableStringField extends FieldBase<string | null> {
  kind = "value" as const;
  type = "string" as const;
  constructor(name: string) {
    super({ name, defaultValue: null, kind: "value", type: "string", schema: v.nullable(v.string()) as ValidationSchema<string | null> });
  }
}

export class PrimaryKeyField extends FieldBase<GUID> {
  kind = "value" as const;
  type = "primaryKey" as const;
  constructor(name: string) {
    super({ name, defaultValue: "" as GUID, kind: "value", type: "primaryKey", schema: v.string() as ValidationSchema<GUID> });
  }

  getDefault(): GUID {
    return crypto.randomUUID();
  }
}

export class ListField<T extends string | number> extends FieldBase<T | null> {
  kind = "value" as const;
  type = "list" as const;
  list: Array<T>;
  constructor(name: string, list: Array<T>) {
    super({
      name,
      defaultValue: null,
      kind: "value",
      type: "list",
      schema: v.nullable(v.custom<T>((v) => list.includes(v as T), `Value not in [${list}]`)) as ValidationSchema<T | null>,
    });
    this.list = list;
  }
}

export class ChoiceField<T extends Record<number, string>> extends FieldBase<T[keyof T]> {
  kind = "value" as const;
  type = "choice" as const;
  #options: T;
  constructor(name: string, options: T) {
    const firstKey = Object.keys(options)[0];
    const values = Object.values(options) as [string, ...string[]];
    super({
      name,
      defaultValue: options[Number(firstKey) as keyof T],
      kind: "value",
      type: "choice",
      schema: v.picklist(values) as unknown as ValidationSchema<T[keyof T]>,
    });
    this.#options = options;
  }

  transformValueFromDataverse(value: any): T[keyof T] {
    return this.#options[value as keyof T];
  }

  transformValueToDataverse(value: any): number {
    for (const [k, v] of Object.entries(this.#options)) {
      if (v === value) return Number(k);
    }
    return value as any;
  }
}

export class NullableChoiceField<T extends Record<number, string>> extends FieldBase<T[keyof T] | null> {
  kind = "value" as const;
  type = "choice" as const;
  #options: T;
  constructor(name: string, options: T) {
    const values = Object.values(options) as [string, ...string[]];
    super({
      name,
      defaultValue: null,
      kind: "value",
      type: "choice",
      schema: v.nullable(v.picklist(values)) as unknown as ValidationSchema<T[keyof T] | null>,
    });
    this.#options = options;
  }

  transformValueFromDataverse(value: any): T[keyof T] | null {
    if (value === null) return null;
    return this.#options[value as keyof T];
  }

  transformValueToDataverse(value: any): number | null {
    if (value === null) return null;
    for (const [k, v] of Object.entries(this.#options)) {
      if (v === value) return Number(k);
    }
    return value as any;
  }
}

export class DateTimeField extends FieldBase<Date> {
  kind = "value" as const;
  type = "date" as const;
  constructor(name: string) {
    super({
      name,
      defaultValue: new Date(),
      kind: "value",
      type: "date",
      schema: v.instance(Date) as ValidationSchema<Date>,
    });
  }
  getDefault(): Date {
    return new Date();
  }
  transformValueFromDataverse(value: any): Date {
    if (value === null) return new Date();
    return new Date(value);
  }
}

export class NullableDateTimeField extends FieldBase<Date | null> {
  kind = "value" as const;
  type = "date" as const;
  constructor(name: string) {
    super({
      name,
      defaultValue: null,
      kind: "value",
      type: "date",
      schema: v.nullable(v.instance(Date)) as ValidationSchema<Date | null>,
    });
  }
  transformValueFromDataverse(value: any): Date | null {
    if (value === null) return null;
    return new Date(value);
  }
}

export class DateField extends FieldBase<Date> {
  kind = "value" as const;
  type = "dateOnly" as const;
  constructor(name: string) {
    super({
      name,
      defaultValue: parseDateOnly(new Date().toISOString()),
      kind: "value",
      type: "dateOnly",
      schema: v.instance(Date) as ValidationSchema<Date>,
    });
  }
  transformValueFromDataverse(value: any): Date {
    if (value === null) return parseDateOnly(new Date().toISOString());
    return parseDateOnly(value);
  }
  transformValueToDataverse(value: any) {
    return toDateOnly(value);
  }
}

export class NullableDateField extends FieldBase<Date | null> {
  kind = "value" as const;
  type = "dateOnly" as const;
  constructor(name: string) {
    super({
      name,
      defaultValue: null,
      kind: "value",
      type: "dateOnly",
      schema: v.nullable(v.instance(Date)) as ValidationSchema<Date | null>,
    });
  }
  transformValueFromDataverse(value: any): Date | null {
    if (value === null) return null;
    return parseDateOnly(value);
  }
  transformValueToDataverse(value: any) {
    return toDateOnly(value);
  }
}

export class FormattedField extends FieldBase<string | null> {
  kind = "value" as const;
  type = "formatted" as const;
  constructor(name: string) {
    super({
      name,
      defaultValue: null,
      kind: "value",
      type: "formatted",
      schema: v.nullable(v.string()) as ValidationSchema<string | null>,
    });
    this.fromDataverseName = `${name}@OData.Community.Display.V1.FormattedValue`;
    this.setReadOnly(true);
  }
}

export class ImageField extends FieldBase<string | null> {
  kind = "value" as const;
  type = "image" as const;
  constructor(name: string) {
    super({
      name,
      defaultValue: null,
      kind: "value",
      type: "image",
      schema: v.nullable(v.string()) as ValidationSchema<string | null>,
    });
  }
}

export class FileField extends FieldBase<string> {
  type = "file" as const;
  kind = "file" as const;

  constructor(name: string) {
    super({
      name,
      defaultValue: "",
      kind: "file",
      type: "file",
      schema: v.string() as ValidationSchema<string>,
    });
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
 * Creates a choice/option-set column definition. Maps Dataverse numeric option values
 * to human-readable string labels.
 *
 * @param name The Dataverse logical name of the column.
 * @param options An object mapping numeric option values to string labels.
 *
 * @example
 * const table = new DataverseTable({
 *   status: choice("statuscode", { 1: "Active", 2: "Inactive", 3: "Archived" }),
 * });
 * // Infer<typeof table>["status"] → "Active" | "Inactive" | "Archived"
 */
export function choice<T extends Record<number, string>>(name: string, options: T) {
  return new ChoiceField<T>(name, options);
}

/**
 * Creates a nullable choice/option-set column definition (allows `null`).
 *
 * @param name The Dataverse logical name of the column.
 * @param options An object mapping numeric option values to string labels.
 *
 * @example
 * const table = new DataverseTable({
 *   priority: nullableChoice("prioritycode", { 1: "Low", 2: "High" }),
 * });
 * // Infer<typeof table>["priority"] → "Low" | "High" | null
 */
export function nullableChoice<T extends Record<number, string>>(name: string, options: T) {
  return new NullableChoiceField<T>(name, options);
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

export class LookupIdProperty extends FieldBase<GUID | null> {
  kind = "navigation" as const;
  type = "lookupId" as const;
  navigationName: string;
  #getTable: GetTable<DataverseTable<GenericProperties>>;

  constructor(name: string, getTable: GetTable) {
    super({
      name,
      defaultValue: null,
      kind: "navigation",
      type: "lookupId",
      schema: v.nullable(v.string()) as ValidationSchema<GUID | null>,
    });
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
> extends FieldBase<Infer<TProperties>[]> {
  kind = "navigation" as const;
  type = "collection" as const;
  #getTable: GetTable<DataverseTable<GenericProperties>>;

  constructor(name: string, getTable: GetTable<DataverseTable<TProperties>>) {
    super({
      name,
      defaultValue: [],
      kind: "navigation",
      type: "collection",
      schema: v.array(v.lazy(() => buildObjectSchema(getTable().fields))) as any,
    });
    this.#getTable = getTable as unknown as GetTable<DataverseTable<GenericProperties>>;
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

export class CollectionIdsProperty extends FieldBase<GUID[]> {
  kind = "navigation" as const;
  type = "collectionIds" as const;
  #getTable: GetTable<DataverseTable<GenericProperties>>;

  constructor(name: string, getTable: GetTable) {
    super({
      name,
      defaultValue: [],
      kind: "navigation",
      type: "collectionIds",
      schema: v.array(v.string()) as ValidationSchema<GUID[]>,
    });
    this.#getTable = getTable;
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
> extends FieldBase<Infer<TProperties> | null> {
  kind = "navigation" as const;
  type = "lookup" as const;
  #getTable: GetTable<DataverseTable<GenericProperties>>;

  constructor(name: string, getTable: GetTable<DataverseTable<TProperties>>) {
    super({
      name,
      defaultValue: null,
      kind: "navigation",
      type: "lookup",
      schema: v.nullable(v.lazy(() => buildObjectSchema(getTable().fields))) as any,
    });
    this.#getTable = getTable as unknown as GetTable<DataverseTable<GenericProperties>>;
  }

  #table: DataverseTable<GenericProperties> | undefined;
  get table(): DataverseTable<TProperties> {
    return (this.#table ??= this.#getTable()) as unknown as DataverseTable<TProperties>;
  }

  transformValueFromDataverse(value: any): Infer<TProperties> | null {
    return value == null ? null : this.table.transformValueFromDataverse(value);
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
