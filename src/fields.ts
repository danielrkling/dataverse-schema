import { DataverseClient } from "./client";
import { DataverseTable } from "./table";
import { GenericProperties, GetTable, GUID, Infer } from "./types";
import { parseDateOnly, toDateOnly } from "./util";
import {
  arrayOf, BOOLEAN_SCHEMA, BLOB_SCHEMA, checkSchema, composeRecordSchema, DATE_SCHEMA,
  GUID_SCHEMA, lazyOf, nullableOf, NUMBER_SCHEMA, optionalOf, requiredOf,
  standardParse, STRING_SCHEMA, ValidationSchema,
} from "./schema";

function isValidDate(value: Date): boolean {
  return value instanceof Date && !isNaN(value.getTime());
}

/**
 * Extracts the validation schema of each field, keyed by property name —
 * the shape `composeRecordSchema` expects.
 */
function schemasOf(fields: Record<string, FieldBase<any>>): Record<string, ValidationSchema<any>> {
  return Object.fromEntries(Object.entries(fields).map(([key, field]) => [key, field.schema]));
}

function parseValidDateOnly(value: unknown): Date {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(value)) throw new Error(`Invalid date-only value: ${value}`);
  const text = value as string;
  const result = parseDateOnly(text);
  const [year, month, day] = text.slice(0, 10).split("-").map(Number);
  if (!isValidDate(result) || result.getFullYear() !== year || result.getMonth() !== month - 1 || result.getDate() !== day) {
    throw new Error(`Invalid date-only value: ${text}`);
  }
  return result;
}

export type FieldOptions<T> = {
  default?: T
  readonly?: boolean
  /**
   * Rejects `null`, `undefined`, and empty/whitespace-only strings at
   * validation time. Most useful on nullable fields, whose schemas otherwise
   * accept `null`.
   */
  required?: boolean
  schema?: ValidationSchema<T>
}

export const SKIP = Symbol("skip")

export type TransformContext = {
  table: DataverseTable<any>
  client: DataverseClient
  recordId: string
}

/**
 * Base class for all Dataverse column and navigation property definitions.
 *
 * ## Transform contract
 * - `transformValueFromDataverse(value, ctx?)` converts a raw API payload into the
 *   typed record value. Dataverse represents empty columns as explicit `null` (or
 *   omits the key entirely); non-nullable fields fold both into their field default.
 *   Use the `nullable*` variants to preserve empties as `null`. Values that are
 *   present but malformed still throw.
 * - `transformValueToDataverse(value, ctx?)` converts a record value into its API
 *   payload. It may return synchronously or return a `Promise`. Returning the
 *   {@link SKIP} symbol excludes the value from the request body (used by file/image
 *   columns whose content is uploaded separately).
 * - `afterSave(ctx, value)` runs after a create/update when the key was present in
 *   the submitted value. File/image fields use it as the explicit data channel:
 *   they only act when `value.data` is a `Blob` (upload) or exactly `null` (clear).
 *
 * Fields created with `readonly: true` are never included in request bodies,
 * `updatePropertyValue`, or `deletePropertyValue`.
 * Fields created with `required: true` reject `null`, `undefined`, and
 * empty/whitespace-only strings when validated (e.g. through `table.schema`) —
 * handy for nullable fields.
 */
export abstract class FieldBase<T> {
  /** Canonical Dataverse schema name (e.g. `nnsyc200_Test_Lookup`). */
  schemaName: string
  /** Lowercased logical name (e.g. `nnsyc200_test_lookup`), used for `$select`, `$filter`, FetchXML attributes. */
  logicalName: string
  fromDataverseName: string
  toDataverseName: string
  kind!: string
  type!: string
  schema: ValidationSchema<T>

  #default: T
  #readOnly: boolean

  constructor(name: string, defaults: { defaultValue: T; schema: ValidationSchema<T> }, options?: FieldOptions<T>) {
    this.schemaName = name
    this.logicalName = name.toLowerCase()
    this.fromDataverseName = this.logicalName
    this.toDataverseName = this.logicalName
    this.#default = options?.default ?? defaults.defaultValue
    this.#readOnly = options?.readonly ?? false
    const base = options?.schema ?? defaults.schema
    this.schema = options?.required ? requiredOf(base) : base
  }

  getDefault(): T {
    return this.#default as T
  }

  getReadOnly(): boolean {
    return this.#readOnly
  }

  transformValueFromDataverse(value: unknown, ctx?: TransformContext): T | Promise<T> {
    return value as T
  }

  transformValueToDataverse(value: unknown, ctx?: TransformContext): unknown {
    return value
  }

  afterSave?(ctx: TransformContext, value: any): Promise<void>
}

export class BooleanField extends FieldBase<boolean> {
  kind = "value" as const;
  type = "boolean" as const;
  constructor(name: string, options?: FieldOptions<boolean>) {
    super(name, { defaultValue: false, schema: BOOLEAN_SCHEMA }, options);
  }

  transformValueFromDataverse(value: any): boolean {
    if (typeof value === "string") return value.toLowerCase() === "true";
    return value ?? false;
  }
}

export class NullableBooleanField extends FieldBase<boolean | null> {
  kind = "value" as const;
  type = "boolean" as const;
  constructor(name: string, options?: FieldOptions<boolean | null>) {
    super(name, {
      defaultValue: null,
      schema: nullableOf(BOOLEAN_SCHEMA),
    }, options);
  }

  transformValueFromDataverse(value: any): boolean | null {
    if (typeof value === "string") return value.toLowerCase() === "true";
    return value ?? null;
  }
}

export class NumberField extends FieldBase<number> {
  kind = "value" as const;
  type = "number" as const;
  constructor(name: string, options?: FieldOptions<number>) {
    super(name, { defaultValue: 0, schema: NUMBER_SCHEMA }, options);
  }

  transformValueFromDataverse(value: any): number {
    if (typeof value === "string") {
      const n = Number(value);
      return Number.isFinite(n) ? n : 0;
    }
    return value ?? 0;
  }
}

export class NullableNumberField extends FieldBase<number | null> {
  kind = "value" as const;
  type = "number" as const;
  constructor(name: string, options?: FieldOptions<number | null>) {
    super(name, { defaultValue: null, schema: nullableOf(NUMBER_SCHEMA) }, options);
  }

  transformValueFromDataverse(value: any): number | null {
    if (typeof value === "string") {
      const n = Number(value);
      return Number.isFinite(n) ? n : null;
    }
    return value ?? null;
  }
}

export class StringField extends FieldBase<string> {
  kind = "value" as const;
  type = "string" as const;
  constructor(name: string, options?: FieldOptions<string>) {
    super(name, { defaultValue: "", schema: STRING_SCHEMA }, options);
  }

  transformValueFromDataverse(value: any): string {
    return value ?? "";
  }
}

export class NullableStringField extends FieldBase<string | null> {
  kind = "value" as const;
  type = "string" as const;
  constructor(name: string, options?: FieldOptions<string | null>) {
    super(name, { defaultValue: null, schema: nullableOf(STRING_SCHEMA) }, options);
  }

  transformValueFromDataverse(value: any): string | null {
    return value ?? null;
  }
}

export class PrimaryKeyField extends FieldBase<GUID> {
  kind = "value" as const;
  type = "primaryKey" as const;
  constructor(name: string, options?: FieldOptions<GUID>) {
    super(name, {
      defaultValue: "" as GUID,
      schema: GUID_SCHEMA,
    }, options);
  }

  getDefault(): GUID {
    return (super.getDefault() || crypto.randomUUID()) as GUID;
  }
}

export class ListField<T extends string | number> extends FieldBase<T | null> {
  kind = "value" as const;
  type = "list" as const;
  readonly list: readonly T[];
  constructor(name: string, list: ReadonlyArray<T>, options?: FieldOptions<T | null>) {
    const values = Object.freeze([...list]) as readonly T[];
    super(name, {
      defaultValue: null,
      schema: nullableOf(checkSchema<T>((value) => values.includes(value as T), `Value not in [${values}]`)),
    }, options);
    this.list = values;
  }
}

/**
 * Field for Dataverse multi-select choice (MultiSelectPicklist) columns.
 *
 * The Web API stores these as a comma-delimited string of option values
 * (e.g. `"3,4,5"`). This field transforms that string to a `number[]` when
 * reading and back to a CSV string when writing. An empty selection reads as
 * `[]` and writes as `null` (which clears the column).
 *
 * @example
 * const table = new DataverseTable({
 *   months: multiChoice("nnsyc200_months", [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]),
 * });
 * // Infer<typeof table>["months"] → number[]
 */
export class MultiChoiceField extends FieldBase<number[]> {
  kind = "value" as const;
  type = "multiChoice" as const;
  readonly choices: readonly number[];

  constructor(name: string, choices: Array<number> | Record<number, string>, options?: FieldOptions<number[]>) {
    const values = (Array.isArray(choices) ? [...choices] : Object.keys(choices).map(Number)).sort((a, b) => a - b);
    if (values.length === 0) throw new Error("Multi-choice fields require at least one value");
    super(name, {
      defaultValue: [] as number[],
      schema: arrayOf(checkSchema<number>((value) => values.includes(value as number), `Value not in [${values}]`)),
    }, options);
    this.choices = Object.freeze(values) as readonly number[];
  }

  getDefault(): number[] {
    return [...super.getDefault()];
  }

  transformValueFromDataverse(value: any): number[] {
    if (value == null || value === "") return [];
    if (Array.isArray(value)) return value.map((v) => Number(v));
    return String(value)
      .split(",")
      .map((part) => Number(part.trim()))
      .filter((n) => !Number.isNaN(n));
  }

  transformValueToDataverse(value: any): string | null {
    if (value == null) return null;
    const arr = Array.isArray(value) ? value : [value];
    if (arr.length === 0) return null;
    return arr.map((v) => Number(v)).join(",");
  }
}

export class ChoiceField<T extends Record<number, string>> extends FieldBase<T[keyof T]> {
  kind = "value" as const;
  type = "choice" as const;
  /** Allowed labels (values of the choice map), frozen. */
  readonly choices: readonly T[keyof T][];
  #choices: T;
  constructor(name: string, choices: T, options?: FieldOptions<T[keyof T]>) {
    const firstKey = Object.keys(choices)[0];
    if (firstKey === undefined) throw new Error("Choice fields require at least one option");
    const values = Object.values(choices) as [string, ...string[]];
    super(name, {
      defaultValue: choices[Number(firstKey) as keyof T],
      schema: checkSchema<T[keyof T]>(
        (value) => (values as readonly unknown[]).includes(value),
        `Value not in [${values}]`,
      ),
    }, options);
    this.#choices = choices;
    this.choices = Object.freeze([...values]) as readonly T[keyof T][];
  }

  transformValueFromDataverse(value: any): T[keyof T] {
    const result = this.#choices[value as keyof T];
    if (result === undefined) throw new Error(`Unknown choice value: ${value} (${this.logicalName})`);
    return result;
  }

  transformValueToDataverse(value: any): number {
    for (const [k, v] of Object.entries(this.#choices)) {
      if (v === value) return Number(k);
    }
    throw new Error(`Unknown choice label: ${value}`);
  }
}

export class NullableChoiceField<T extends Record<number, string>> extends FieldBase<T[keyof T] | null> {
  kind = "value" as const;
  type = "choice" as const;
  /** Allowed labels (values of the choice map), frozen. */
  readonly choices: readonly T[keyof T][];
  #choices: T;
  constructor(name: string, choices: T, options?: FieldOptions<T[keyof T] | null>) {
    if (Object.keys(choices).length === 0) throw new Error("Choice fields require at least one option");
    const values = Object.values(choices) as [string, ...string[]];
    super(name, {
      defaultValue: null,
      schema: nullableOf(checkSchema<T[keyof T]>(
        (value) => (values as readonly unknown[]).includes(value),
        `Value not in [${values}]`,
      )),
    }, options);
    this.#choices = choices;
    this.choices = Object.freeze([...values]) as readonly T[keyof T][];
  }

  transformValueFromDataverse(value: any): T[keyof T] | null {
    if (value === null) return null;
    const result = this.#choices[value as keyof T];
    if (result === undefined) throw new Error(`Unknown choice value: ${value} (${this.logicalName})`);
    return result;
  }

  transformValueToDataverse(value: any): number | null {
    if (value === null) return null;
    for (const [k, v] of Object.entries(this.#choices)) {
      if (v === value) return Number(k);
    }
    throw new Error(`Unknown choice label: ${value}`);
  }
}

export class DateTimeField extends FieldBase<Date> {
  kind = "value" as const;
  type = "dateTime" as const;
  constructor(name: string, options?: FieldOptions<Date>) {
    super(name, {
      defaultValue: new Date(),
      schema: DATE_SCHEMA,
    }, options);
  }
  getDefault(): Date {
    return new Date();
  }
  transformValueFromDataverse(value: any): Date {
    if (value == null) return this.getDefault();
    const result = new Date(value);
    if (!isValidDate(result)) throw new Error(`Invalid datetime value: ${value}`);
    return result;
  }
}

export class NullableDateTimeField extends FieldBase<Date | null> {
  kind = "value" as const;
  type = "dateTime" as const;
  constructor(name: string, options?: FieldOptions<Date | null>) {
    super(name, {
      defaultValue: null,
      schema: nullableOf(DATE_SCHEMA),
    }, options);
  }
  transformValueFromDataverse(value: any): Date | null {
    if (value === null) return null;
    if (value === undefined) return null;
    const result = new Date(value);
    if (!isValidDate(result)) throw new Error(`Invalid datetime value: ${value}`);
    return result;
  }
}

export class DateField extends FieldBase<Date> {
  kind = "value" as const;
  type = "dateOnly" as const;
  constructor(name: string, options?: FieldOptions<Date>) {
    super(name, {
      defaultValue: parseDateOnly(new Date().toISOString()),
      schema: DATE_SCHEMA,
    }, options);
  }
  getDefault(): Date {
    return parseDateOnly(new Date().toISOString());
  }
  transformValueFromDataverse(value: any): Date {
    if (value == null) return this.getDefault();
    return parseValidDateOnly(value);
  }
  transformValueToDataverse(value: any) {
    if (!(value instanceof Date) || !isValidDate(value)) throw new Error("Invalid date value");
    return toDateOnly(value);
  }
}

export class NullableDateField extends FieldBase<Date | null> {
  kind = "value" as const;
  type = "dateOnly" as const;
  constructor(name: string, options?: FieldOptions<Date | null>) {
    super(name, {
      defaultValue: null,
      schema: nullableOf(DATE_SCHEMA),
    }, options);
  }
  transformValueFromDataverse(value: any): Date | null {
    if (value == null) return null;
    return parseValidDateOnly(value);
  }
  transformValueToDataverse(value: any) {
    if (value === null || value === undefined) return null;
    if (!(value instanceof Date) || !isValidDate(value)) throw new Error("Invalid date value");
    return toDateOnly(value);
  }
}

/**
 * Field for retrieving user-localized display values
 * (e.g. `...@OData.Community.Display.V1.FormattedValue`). Always read-only:
 * the value is computed by Dataverse and can never be written or deleted.
 */
export class FormattedField extends FieldBase<string | null> {
  kind = "value" as const;
  type = "formatted" as const;
  constructor(name: string, options?: FieldOptions<string | null>) {
    super(name, {
      defaultValue: null,
      schema: nullableOf(STRING_SCHEMA),
    }, { ...options, readonly: true });
    this.fromDataverseName = `${name}@OData.Community.Display.V1.FormattedValue`;
  }
}

/**
 * Field for Dataverse image columns.
 *
 * The column value itself is server-managed: `transformValueToDataverse` returns
 * {@link SKIP} so the field is never part of a create/update body. Instead, data
 * flows through the explicit channel in `afterSave`: include `{ data }` in the
 * record value where `data` is a `Blob` to upload or exactly `null` to clear the
 * image. Reading returns `{ url, fullSizeUrl? }`.
 */
export class ImageField extends FieldBase<ImageRef | null> {
  kind = "value" as const;
  type = "image" as const;
  constructor(name: string, options?: FieldOptions<ImageRef | null>) {
    super(name, {
      defaultValue: null,
      schema: nullableOf(composeRecordSchema({
        url: optionalOf(STRING_SCHEMA),
        fullSizeUrl: optionalOf(STRING_SCHEMA),
        data: optionalOf(nullableOf(BLOB_SCHEMA)),
      })),
    }, options);
  }

  transformValueFromDataverse(value: any, ctx?: TransformContext): ImageRef | null {
    if (value == null) return null;
    const b64 = String(value);
    const mimeType = b64.startsWith("/9j/") ? "image/jpeg"
      : b64.startsWith("iVB") ? "image/png"
        : b64.startsWith("R0lG") ? "image/gif"
          : "application/octet-stream";
    const url = `data:${mimeType};base64,${b64}`;
    if (!ctx) return { url };
    const fullSizeUrl = ctx.client.getImageFullSizeURL(ctx.table.entitySetName, ctx.recordId, this.logicalName);
    return { url, fullSizeUrl };
  }

  //When using conditional operations (If-Match) image columns are not allowed even though they are allowed normally. Workaround is to update property after save
  async transformValueToDataverse(_value?: unknown, _ctx?: TransformContext): Promise<string | null | typeof SKIP> {
    return SKIP
  }

  async afterSave(ctx: TransformContext, value: any): Promise<void> {
    if (value?.data === null){
      await ctx.client.deletePropertyValue(ctx.table.entitySetName, ctx.recordId, this.logicalName)
    }else if (value?.data instanceof Blob){
      await ctx.client.updateFileProperty(ctx.table.entitySetName, ctx.recordId, this.logicalName, "image.png", value.data)
    }
  }
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export type FileRef = {
  name?: string;
  url?: string;
  data?: Blob | null;
}

export type ImageRef = {
  readonly url?: string;
  readonly fullSizeUrl?: string
  data?: Blob | null;
}

/**
 * Field for Dataverse file columns.
 *
 * The column value itself is server-managed: `transformValueToDataverse` returns
 * {@link SKIP} so the field is never part of a create/update body. Instead, data
 * flows through the explicit channel in `afterSave`: include `{ name?, data }` in
 * the record value where `data` is a `Blob` to upload or exactly `null` to clear
 * the file. Reading returns `{ name, url? }`.
 */
export class FileField extends FieldBase<FileRef | null> {
  kind = "value" as const;
  type = "file" as const;

  constructor(name: string, options?: FieldOptions<FileRef | null>) {
    super(name, {
      defaultValue: null,
      schema: nullableOf(composeRecordSchema({
        name: optionalOf(STRING_SCHEMA),
        url: optionalOf(STRING_SCHEMA),
        data: optionalOf(nullableOf(BLOB_SCHEMA)),
      })),
    }, options);
    this.fromDataverseName = `${name}_name`;
  }

  transformValueFromDataverse(value: any, ctx?: TransformContext): FileRef | null {
    if (value == null) return null;
    if (!ctx) return { name: value };

    return {
      name: value,
      url: ctx.client.getPropertyRawValueURL(ctx.table.entitySetName, ctx.recordId, this.logicalName),
    }
  }

  transformValueToDataverse(_value?: unknown, _ctx?: TransformContext): typeof SKIP {
    return SKIP;
  }

  async afterSave(ctx: TransformContext, value: FileRef): Promise<void> {
    if (value?.data instanceof Blob) {
      const fileName = value.name ?? this.getDefault()?.name;
      if (fileName) {
        await ctx.client.updateFileProperty(ctx.table.entitySetName, ctx.recordId, this.logicalName, fileName, value.data);
      }
    } else if (value?.data === null){
      await ctx.client.deletePropertyValue(ctx.table.entitySetName, ctx.recordId, this.logicalName)
    }
  }
}

export class JsonField<T> extends FieldBase<T> {
  kind = "value" as const;
  type = "json" as const;

  constructor(name: string, options: FieldOptions<T> & { schema: ValidationSchema<T> }) {
    super(name, { defaultValue: undefined as T, schema: options.schema }, options);
  }

  async transformValueFromDataverse(value: any): Promise<T> {
    if (value == null) return this.getDefault();
    const raw = typeof value === "string" ? JSON.parse(value) : value;
    return standardParse(this.schema, raw);
  }

  transformValueToDataverse(value: any): string | null {
    if (value == null) return null;
    return JSON.stringify(value);
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
export function boolean(name: string, options?: FieldOptions<boolean>) {
  return new BooleanField(name, options);
}

export function nullableBoolean(name: string, options?: FieldOptions<boolean | null>) {
  return new NullableBooleanField(name, options);
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
export function number(name: string, options?: FieldOptions<number>) {
  return new NumberField(name, options);
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
export function nullableNumber(name: string, options?: FieldOptions<number | null>) {
  return new NullableNumberField(name, options);
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
export function string(name: string, options?: FieldOptions<string>) {
  return new StringField(name, options);
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
export function nullableString(name: string, options?: FieldOptions<string | null>) {
  return new NullableStringField(name, options);
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
export function primaryKey(name: string, options?: FieldOptions<GUID>) {
  return new PrimaryKeyField(name, options);
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
export function list<const T extends string | number>(name: string, list: ReadonlyArray<T>, options?: FieldOptions<T | null>) {
  return new ListField<T>(name, list, options);
}

/**
 * Creates a multi-select choice column definition (MultiSelectPicklist).
 * Reads the Dataverse CSV format (`"3,4,5"`) as a `number[]` and writes
 * arrays back as CSV. An empty selection writes `null` (clears the column).
 *
 * @param name The Dataverse logical name of the column.
 * @param choices The allowed numeric option values (or a value→label map).
 *
 * @example
 * const table = new DataverseTable({
 *   months: multiChoice("nnsyc200_months", [1, 2, 3]),
 * });
 * // Infer<typeof table>["months"] → number[]
 */
export function multiChoice(name: string, choices: Array<number> | Record<number, string>, options?: FieldOptions<number[]>) {
  return new MultiChoiceField(name, choices, options);
}

/**
 * Creates a choice/option-set column definition. Maps Dataverse numeric option values
 * to human-readable string labels.
 *
 * @param name The Dataverse logical name of the column.
 * @param choices An object mapping numeric option values to string labels.
 * @param options Optional field options (default, readonly, schema).
 *
 * @example
 * const table = new DataverseTable({
 *   status: choice("statuscode", { 1: "Active", 2: "Inactive", 3: "Archived" }),
 * });
 * // Infer<typeof table>["status"] → "Active" | "Inactive" | "Archived"
 */
export function choice<T extends Record<number, string>>(name: string, choices: T, options?: FieldOptions<T[keyof T]>) {
  return new ChoiceField<T>(name, choices, options);
}

/**
 * Creates a nullable choice/option-set column definition (allows `null`).
 *
 * @param name The Dataverse logical name of the column.
 * @param choices An object mapping numeric option values to string labels.
 * @param options Optional field options (default, readonly, schema).
 *
 * @example
 * const table = new DataverseTable({
 *   priority: nullableChoice("prioritycode", { 1: "Low", 2: "High" }),
 * });
 * // Infer<typeof table>["priority"] → "Low" | "High" | null
 */
export function nullableChoice<T extends Record<number, string>>(name: string, choices: T, options?: FieldOptions<T[keyof T] | null>) {
  return new NullableChoiceField<T>(name, choices, options);
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
export function datetime(name: string, options?: FieldOptions<Date>) {
  return new DateTimeField(name, options);
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
export function date(name: string, options?: FieldOptions<Date>) {
  return new DateField(name, options);
}

/**
 * Creates a nullable date-only column definition (allows `null`).
 *
 * @param name The Dataverse logical name of the column.
 */
export function nullableDate(name: string, options?: FieldOptions<Date | null>) {
  return new NullableDateField(name, options)
}

/**
 * Creates a nullable date-time column definition (allows `null`).
 *
 * @param name The Dataverse logical name of the column.
 */
export function nullableDateTime(name: string, options?: FieldOptions<Date | null>) {
  return new NullableDateTimeField(name, options)
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
export function formatted(name: string, options?: FieldOptions<string | null>) {
  return new FormattedField(name, options);
}

/**
 * Creates an image column definition.
 *
 * @param name The Dataverse logical name of the image column.
 */
export function image(name: string, options?: FieldOptions<ImageRef | null>) {
  return new ImageField(name, options);
}

/**
 * Creates a file column definition. The column value is server-managed; upload or
 * clear file contents through the explicit `{ name?, data }` channel.
 *
 * @param name The Dataverse logical name of the file column.
 */
export function file(name: string, options?: FieldOptions<FileRef | null>) {
  return new FileField(name, options)
}

/**
 * Creates a JSON-typed Dataverse column definition. Stores JSON as a text column
 * in Dataverse and parses/validates it using the provided Standard Schema.
 *
 * @param name The Dataverse logical name of the column.
 * @param options Field options; `schema` (a Standard Schema validating the parsed
 * JSON structure) is required, plus the standard default/readonly options.
 *
 * @example
 * const Address = v.object({ street: v.string(), city: v.string() });
 * const table = new DataverseTable({
 *   address: json("address_data", { schema: Address }),
 * });
 * // Infer<typeof table>["address"] → { street: string; city: string }
 */
export function json<T>(name: string, options: FieldOptions<T> & { schema: ValidationSchema<T> }) {
  return new JsonField<T>(name, options);
}

export class LookupIdProperty extends FieldBase<GUID | null> {
  kind = "navigation" as const;
  type = "lookupId" as const;
  #getTable: GetTable<DataverseTable<GenericProperties>>;

  constructor(name: string, getTable: GetTable, options?: FieldOptions<GUID | null>) {
    super(name, {
      defaultValue: null,
      schema: nullableOf(GUID_SCHEMA),
    }, options);
    this.#getTable = getTable;
    this.fromDataverseName = `_${this.logicalName}_value`
    this.toDataverseName = `${this.schemaName}@odata.bind`
  }

  #table: DataverseTable<{ id: PrimaryKeyField }> | undefined;
  get table(): DataverseTable<{ id: PrimaryKeyField }> {
    if (!this.#table) {
      const table = this.#getTable();
      const { property } = table.primaryKey;
      this.#table = new DataverseTable({ client: table.client, entitySetName: table.entitySetName, logicalName: table.logicalName, fields: { id: property } });
    }
    return this.#table;
  }


  transformValueToDataverse(value: any): string | null {
    if (value === null) return null;
    if (typeof value !== "string" || value.length === 0) {
      throw new Error("Lookup IDs must be non-empty strings");
    }
    return `${this.table.entitySetName}(${value})`;
  }
}

export class CollectionProperty<
  TProperties extends GenericProperties,
> extends FieldBase<Infer<TProperties>[]> {
  kind = "navigation" as const;
  type = "collection" as const;
  #getTable: GetTable<DataverseTable<GenericProperties>>;

  constructor(name: string, getTable: GetTable<DataverseTable<TProperties>>, options?: FieldOptions<Infer<TProperties>[]>) {
    super(name, {
      defaultValue: [],
      schema: arrayOf(lazyOf(() => composeRecordSchema(schemasOf(getTable().fields)))),
    }, options);
    this.#getTable = getTable as unknown as GetTable<DataverseTable<GenericProperties>>;
    // Navigation properties are referenced by their schema name for $expand/association.
    this.fromDataverseName = this.schemaName;
  }

  #table: DataverseTable<GenericProperties> | undefined;
  get table(): DataverseTable<TProperties> {
    return (this.#table ??= this.#getTable()) as unknown as DataverseTable<TProperties>;
  }

  async transformValueFromDataverse(value: any): Promise<Infer<TProperties>[]> {
    return Promise.all(Array.from(value ?? []).map((v: any) =>
      this.table.transformValueFromDataverse(v),
    ));
  }

  transformValueToDataverse(): typeof SKIP {
    return SKIP;
  }

  async afterSave(ctx: TransformContext, value: any): Promise<void> {
    if (!Array.isArray(value)) return;
    const ids = await Promise.all(
      value.map((v: any) => this.table.upsertRecord(undefined, v).then((r) => this.table.getPrimaryId(r)!)),
    );
    await ctx.client.associateRecordToList(
      ctx.table.entitySetName,
      ctx.recordId,
      this.schemaName,
      this.table.entitySetName,
      this.table.primaryKey.property.logicalName,
      ids,
    );
  }
}

/**
 * Creates a one-to-many (collection) navigation property definition. The related records
 * can be expanded via OData `$expand` or fetched through the table API.
 *
 * The thunk is strongly typed so the related records appear in `Infer<typeof table>`.
 * Note: if two tables reference each other through the typed navigation factories
 * (`collection`/`lookup`) on **both** ends, TypeScript cannot implicitly infer the
 * mutually recursive types (TS7022) — break the cycle by using `collectionIds` or
 * `lookupId` (untyped thunks) for one direction, or annotate one table explicitly.
 *
 * @param name The Dataverse logical name of the collection navigation property.
 * @param getTable A thunk that returns the related table definition.
 *
 * @example
 * const Address = new DataverseTable({
 *   client, entitySetName: "addresses", logicalName: "address",
 *   fields: { id: primaryKey("addressid"), street: string("street") },
 * });
 * const Person = new DataverseTable({
 *   client, entitySetName: "people", logicalName: "person",
 *   fields: {
 *     id: primaryKey("personid"),
 *     addresses: collection("person_addresses", () => Address),
 *   },
 * });
 * // Infer<typeof Person>["addresses"] → { id: GUID; street: string }[]
 */
export function collection<TProperties extends GenericProperties>(
  name: string,
  getTable: GetTable<DataverseTable<TProperties>>,
  options?: FieldOptions<Infer<TProperties>[]>,
) {
  return new CollectionProperty(name, getTable, options);
}

export class CollectionIdsProperty extends FieldBase<GUID[]> {
  kind = "navigation" as const;
  type = "collectionIds" as const;
  #getTable: GetTable<DataverseTable<GenericProperties>>;

  constructor(name: string, getTable: GetTable, options?: FieldOptions<GUID[]>) {
    super(name, {
      defaultValue: [],
      schema: arrayOf(GUID_SCHEMA),
    }, options);
    this.#getTable = getTable;
    // Navigation properties are referenced by their schema name for $expand/association.
    this.fromDataverseName = this.schemaName;
  }

  #table: DataverseTable<{ id: PrimaryKeyField }> | undefined;
  get table(): DataverseTable<{ id: PrimaryKeyField }> {
    if (!this.#table) {
      const table = this.#getTable();
      const { property } = table.primaryKey;
      this.#table = new DataverseTable({ client: table.client, entitySetName: table.entitySetName, logicalName: table.logicalName, fields: { id: property } });
    }
    return this.#table;
  }

  transformValueFromDataverse(value: any): GUID[] {
    return Array.from(value ?? []).map((v: any) => v[this.table.fields.id.logicalName]);
  }

  transformValueToDataverse(): typeof SKIP {
    return SKIP;
  }

  async afterSave(ctx: TransformContext, value: any): Promise<void> {
    if (!Array.isArray(value)) return;
    await ctx.client.associateRecordToList(
      ctx.table.entitySetName,
      ctx.recordId,
      this.schemaName,
      this.table.entitySetName,
      this.table.primaryKey.property.logicalName,
      value as GUID[],
    );
  }
}

/**
 * Creates a collection-of-IDs navigation property definition. Unlike a full collection,
 * this only stores the related record IDs (GUIDs), not the full records.
 *
 * @param name The Dataverse logical name of the navigation property.
 * @param getTable A thunk that returns the related table definition. It is
 * intentionally untyped (`GetTable` → `() => any`): the related table only
 * contributes GUIDs here, and keeping the thunk non-generic lets two tables
 * reference each other without creating a TypeScript inference cycle.
 *
 * @example
 * const Address = new DataverseTable({
 *   client, entitySetName: "addresses", logicalName: "address",
 *   fields: { id: primaryKey("addressid") },
 * });
 * const Person = new DataverseTable({
 *   client, entitySetName: "people", logicalName: "person",
 *   fields: {
 *     id: primaryKey("personid"),
 *     addressIds: collectionIds("person_addresses", () => Address),
 *   },
 * });
 * // Infer<typeof Person>["addressIds"] → `${string}-${string}-${string}-${string}-${string}`[]
 */
export function collectionIds(name: string, getTable: GetTable, options?: FieldOptions<GUID[]>) {
  return new CollectionIdsProperty(name, getTable, options);
}

/**
 * Creates a lookup-ID navigation property definition. This stores only the foreign-key
 * GUID of the related record (not the full expanded record).
 *
 * @param name The Dataverse logical name of the lookup column.
 * @param getTable A thunk that returns the related table definition. It is
 * intentionally untyped (`GetTable` → `() => any`): the related table only
 * contributes a GUID here, and keeping the thunk non-generic lets two tables
 * reference each other without creating a TypeScript inference cycle.
 *
 * @example
 * const Address = new DataverseTable({
 *   client, entitySetName: "addresses", logicalName: "address",
 *   fields: { id: primaryKey("addressid") },
 * });
 * const Person = new DataverseTable({
 *   client, entitySetName: "people", logicalName: "person",
 *   fields: {
 *     id: primaryKey("personid"),
 *     primaryAddressId: lookupId("primaryaddressid", () => Address),
 *   },
 * });
 * // Infer<typeof Person>["primaryAddressId"] → `${string}-${string}-${string}-${string}-${string}` | null
 */
export function lookupId(name: string, getTable: GetTable, options?: FieldOptions<GUID | null>) {
  return new LookupIdProperty(name, getTable, options);
}

export class LookupProperty<
  TProperties extends GenericProperties,
> extends FieldBase<Infer<TProperties> | null> {
  kind = "navigation" as const;
  type = "lookup" as const;
  #getTable: GetTable<DataverseTable<GenericProperties>>;

  constructor(name: string, getTable: GetTable<DataverseTable<TProperties>>, options?: FieldOptions<Infer<TProperties> | null>) {
    super(name, {
      defaultValue: null,
      schema: nullableOf(lazyOf(() => composeRecordSchema(schemasOf(getTable().fields)))),
    }, options);
    this.#getTable = getTable as unknown as GetTable<DataverseTable<GenericProperties>>;
    // Navigation properties are referenced by their schema name for $expand/association.
    this.fromDataverseName = this.schemaName;
  }

  #table: DataverseTable<GenericProperties> | undefined;
  get table(): DataverseTable<TProperties> {
    return (this.#table ??= this.#getTable()) as unknown as DataverseTable<TProperties>;
  }

  async transformValueFromDataverse(value: any): Promise<Infer<TProperties> | null> {
    return value == null ? null : this.table.transformValueFromDataverse(value);
  }

  transformValueToDataverse(): typeof SKIP {
    return SKIP;
  }

  async afterSave(ctx: TransformContext, value: any): Promise<void> {
    if (value === null) {
      await ctx.client.dissociateRecord(ctx.table.entitySetName, ctx.recordId, this.schemaName);
    } else {
      const childId = this.table.getPrimaryId(await this.table.upsertRecord(undefined, value))!;
      await ctx.client.associateRecord(
        ctx.table.entitySetName, ctx.recordId, this.schemaName,
        this.table.entitySetName, childId,
      );
    }
  }
}

/**
 * Creates a many-to-one (lookup) navigation property definition. The related record
 * can be expanded via OData `$expand` or fetched through the table API.
 *
 * The thunk is strongly typed so the related record appears in `Infer<typeof table>`.
 * Note: if two tables reference each other through the typed navigation factories
 * (`lookup`/`collection`) on **both** ends, TypeScript cannot implicitly infer the
 * mutually recursive types (TS7022) — break the cycle by using `lookupId` or
 * `collectionIds` (untyped thunks) for one direction, or annotate one table explicitly.
 *
 * @param name The Dataverse logical name of the lookup column.
 * @param getTable A thunk that returns the related table definition.
 *
 * @example
 * const Address = new DataverseTable({
 *   client, entitySetName: "addresses", logicalName: "address",
 *   fields: { id: primaryKey("addressid") },
 * });
 * const Person = new DataverseTable({
 *   client, entitySetName: "people", logicalName: "person",
 *   fields: {
 *     id: primaryKey("personid"),
 *     primaryAddress: lookup("primaryaddressid", () => Address),
 *   },
 * });
 * // Infer<typeof Person>["primaryAddress"] → { id: GUID; ... } | null
 */
export function lookup<TProperties extends GenericProperties>(
  name: string,
  getTable: GetTable<DataverseTable<TProperties>>,
  options?: FieldOptions<Infer<TProperties> | null>,
) {
  return new LookupProperty(name, getTable, options);
}
