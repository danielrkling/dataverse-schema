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

function asDefaultFactory<T>(value: DefaultValue<T>): () => T {
  return typeof value === "function"
    ? value as () => T
    : () => value;
}


export type DefaultValue<T> = T | (() => T);

export type FieldOptions<T> = {
  default?: DefaultValue<T>;
  /** Exclude the field from request bodies / updates. Implied by `system`. */
  readonly?: boolean;
  /** Validation-only: reject `null`/`undefined`/empty strings via `table.schema`. */
  required?: boolean;
  /** Server-managed field that Dataverse always populates (createdon, statecode, …).
   *  Implies `readonly`. Reads are non-null: a null from the wire fails fast instead
   *  of folding silently into a default. */
  system?: boolean;
  schema?: ValidationSchema<T>;
};

type FieldDefinition<T> = {
  defaultValue: DefaultValue<T>;
  schema: ValidationSchema<T>;
  /** Whether absence on the wire resolves to `null` (nullable fields) or fails fast. */
  nullable?: boolean;
};

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
 *   omits the key entirely).
 * - Field factories decide how empties resolve. Nullable factories — `number`,
 *   `datetime`, `date`, dynamic `choice` — read `T | null` and pass `null`
 *   through untouched. Non-nullable factories — `string` (empty string ≡ null on
 *   the wire), `boolean` (Dataverse never sends null), `multiChoice` (null ≡ no
 *   selection ≡ `[]`) — and `{ required: true }` fields fold null/missing values
 *   into the field default. Values that are present but malformed still throw.
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
 * Fields created with `required: true` reject `null`, `undefined`, and empty or
 * whitespace-only strings when validated (e.g. through `table.schema`).
 */
export abstract class FieldBase<T> implements ValidationSchema<T> {
  /**
   * Standard Schema V1 props, delegated to the field's validation `schema`.
   * Lets any Standard Schema–aware consumer validate the field directly.
   */
  get "~standard"(): ValidationSchema<T>["~standard"] {
    return this.schema["~standard"];
  }

  /** No runtime value. Use with typeof field.T */
  T!: T
  /** Canonical Dataverse schema name (e.g. `nnsyc200_Test_Lookup`). */
  schemaName: string
  /** Lowercased logical name (e.g. `nnsyc200_test_lookup`), used for `$select`, `$filter`, FetchXML attributes. */
  logicalName: string
  fromDataverseName: string
  toDataverseName: string
  kind!: string
  type!: string
  schema: ValidationSchema<T>

  #getDefault: () => T;
  #readOnly: boolean
  #nullable: boolean

  constructor(
    name: string,
    definition: FieldDefinition<T>,
    options?: FieldOptions<T> & { system?: boolean },
  ) {
    this.schemaName = name;
    this.logicalName = name.toLowerCase();
    this.fromDataverseName = this.logicalName;
    this.toDataverseName = this.logicalName;

    // Use an own-property check so `default: undefined` can still be
    // intentional if a future field type supports it.
    const defaultValue =
      options && Object.hasOwn(options, "default")
        ? options.default as DefaultValue<T>
        : definition.defaultValue;

    this.#getDefault = asDefaultFactory(defaultValue);
    this.#readOnly = options?.system === true || options?.readonly === true;
    this.#nullable = definition.nullable ?? false;

    const baseSchema = options?.schema ?? definition.schema;
    const withNull = this.#nullable ? nullableOf(baseSchema) : baseSchema;
    this.schema = (options?.required ? requiredOf(withNull) : withNull) as ValidationSchema<T>;
  }

  getDefault(): T {
    return this.#getDefault();
  }

  getReadOnly(): boolean {
    return this.#readOnly
  }

  protected isNullable(): boolean {
    return this.#nullable
  }

  /**
   * How a `null`/absent wire value becomes a field value.
   * Nullable fields → `null`; non-nullable fields fail fast.
   */
  protected nullToRead(): T {
    if (this.isNullable()) return null as T;
    throw new Error(
      `Field "${this.logicalName}" is non-nullable but Dataverse returned null`,
    );
  }

  transformValueFromDataverse(value: unknown, ctx?: TransformContext): T | Promise<T> {
    return value as T
  }

  transformValueToDataverse(value: unknown, ctx?: TransformContext): unknown {
    return value
  }

  afterSave?(ctx: TransformContext, value: any): Promise<void>
}

/** Wire value for a field kind: `T | null` when nullable, bare `T` otherwise. */
export type FieldValue<T, Nullable extends boolean> = T | (Nullable extends true ? null : never);

export class BooleanField extends FieldBase<boolean> {
  kind = "value" as const;
  type = "boolean" as const;
  constructor(name: string, options?: FieldOptions<boolean>) {
    super(name, { defaultValue: false, schema: BOOLEAN_SCHEMA }, options);
  }

  transformValueFromDataverse(value: any): boolean {
    if (typeof value === "string") return value.toLowerCase() === "true";
    return value ?? this.getDefault();
  }
}


export class NumberField<Nullable extends boolean = true> extends FieldBase<FieldValue<number, Nullable>> {
  kind = "value" as const;
  type = "number" as const;  constructor(name: string, options?: FieldOptions<FieldValue<number, Nullable>> & { system?: boolean }) {
    super(name, {
      defaultValue: ((options?.system === true ? 0 : null) as any),
      schema: NUMBER_SCHEMA as ValidationSchema<FieldValue<number, Nullable>>,
      nullable: options?.system !== true,
    }, options);
  }

  transformValueFromDataverse(value: unknown): FieldValue<number, Nullable> {
    if (value == null) return this.nullToRead();

    const result = typeof value === "string"
      ? Number(value)
      : value;

    if (typeof result !== "number" || !Number.isFinite(result)) {
      throw new Error(`Invalid number value: ${value}`);
    }

    return result as FieldValue<number, Nullable>;
  }
}


export class StringField extends FieldBase<string> {
  kind = "value" as const;
  type = "string" as const;
  constructor(name: string, options?: FieldOptions<string>) {
    super(name, { defaultValue: "", schema: STRING_SCHEMA }, options);
  }

  transformValueFromDataverse(value: any): string {
    return value ?? this.getDefault();
  }
}


export class PrimaryKeyField extends FieldBase<GUID> {
  kind = "value" as const;
  type = "primaryKey" as const;
  constructor(name: string, options?: FieldOptions<GUID>) {
    super(name, {
      defaultValue: () => crypto.randomUUID() as GUID,
      schema: GUID_SCHEMA,
    }, options);
  }

  transformValueFromDataverse(value: unknown): GUID {
    if (typeof value !== "string") {
      // throw new Error(
      //   `Missing or invalid primary key value for "${this.logicalName}"`,
      // );
    }
  
    return value as GUID;
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
 * (e.g. `"3,4,5"`). This field transforms that string to an array of configured string labels when
 * reading and back to a CSV string when writing. An empty selection reads as
 * `[]` and writes as `null` (which clears the column).
 *
 * @example
 * const table = new DataverseTable({
 *   months: multiChoice("nnsyc200_months", {
 *     1: "January",
 *     2: "February",
 *     3: "March",
 * }),
 * // Infer<typeof table>["months"] → ("January" | "February" | "March")[]
 */
export class MultiChoiceField<T extends Record<number, string>>
  extends FieldBase<T[keyof T][]> {
  kind = "value" as const;
  type = "multiChoice" as const;

  /** Dataverse option value → application label. */
  readonly choices: Readonly<T>;

  /** Labels in option-value order. */
  readonly labels: readonly T[keyof T][];

  constructor(
    name: string,
    choices: T,
    options?: FieldOptions<T[keyof T][]>,
  ) {
    const choiceMap = Object.freeze({ ...choices }) as Readonly<T>;
    const labels = Object.values(choiceMap) as [string, ...string[]];

    if (labels.length === 0) {
      throw new Error("Multi-choice fields require at least one option");
    }

    super(name, {
      defaultValue: () => [] as T[keyof T][],
      schema: arrayOf(
        checkSchema<T[keyof T]>(
          (value) => (labels as readonly unknown[]).includes(value),
          `Value not in [${labels}]`,
        ),
      ),
    }, options);

    this.choices = choiceMap;
    this.labels = Object.freeze([...labels]) as readonly T[keyof T][];
  }


  /** Converts one Dataverse numeric option value to its typed label. */
  fromChoiceValue(value: number): T[keyof T] {
    const label = this.choices[value as keyof T];

    if (label === undefined) {
      throw new Error(
        `Unknown multi-choice value: ${value} (${this.logicalName})`,
      );
    }

    return label;
  }

  /** Converts one typed label to its Dataverse numeric option value. */
  toChoiceValue(value: T[keyof T]): number {
    for (const [key, label] of Object.entries(this.choices)) {
      if (label === value) return Number(key);
    }

    throw new Error(`Unknown multi-choice label: ${value}`);
  }

  transformValueFromDataverse(value: unknown): T[keyof T][] {
    if (value == null || value === "") return this.getDefault();

    const rawValues = Array.isArray(value)
      ? value
      : String(value).split(",");

    return rawValues.map((raw) =>
      this.fromChoiceValue(Number(String(raw).trim())),
    );
  }

  transformValueToDataverse(value: unknown): string | null {
    if (value == null) return null;

    if (!Array.isArray(value)) {
      throw new Error(
        `Multi-choice field "${this.logicalName}" requires an array of labels`,
      );
    }

    if (value.length === 0) return null;

    return value
      .map((label) => this.toChoiceValue(label as T[keyof T]))
      .join(",");
  }
}

export class ChoiceField<T extends Record<number, string>, Nullable extends boolean = true> extends FieldBase<FieldValue<T[keyof T], Nullable>> {
  kind = "value" as const;
  type = "choice" as const;
  readonly choices: Readonly<T>;
  readonly labels: readonly T[keyof T][];

  constructor(
    name: string,
    choices: T,
    options?: FieldOptions<FieldValue<T[keyof T], Nullable>> & { system?: boolean },
  ) {
    const choiceMap = Object.freeze({ ...choices }) as Readonly<T>;
    const firstKey = Object.keys(choiceMap)[0];

    if (firstKey === undefined) {
      throw new Error("Choice fields require at least one option");
    }

    const labels = Object.values(choiceMap) as [string, ...string[]];

    super(name, {
      defaultValue: ((options?.system === true ? choiceMap[Number(firstKey) as keyof T] : null) as any),
      schema: checkSchema<T[keyof T]>(
        (value) => (labels as readonly unknown[]).includes(value),
        `Value not in [${labels}]`,
      ) as ValidationSchema<FieldValue<T[keyof T], Nullable>>,
      nullable: options?.system !== true,
    }, options);

    this.choices = choiceMap;
    this.labels = Object.freeze([...labels]) as readonly T[keyof T][];
  }

  /** Converts a Dataverse numeric option value to its typed label. */
  fromChoiceValue(value: number): T[keyof T] {
    const result = this.choices[value as keyof T];

    if (result === undefined) {
      throw new Error(
        `Unknown choice value: ${value} (${this.logicalName})`,
      );
    }

    return result;
  }

  /** Converts a typed label to its Dataverse numeric option value. */
  toChoiceValue(value: T[keyof T]): number {
    for (const [key, label] of Object.entries(this.choices)) {
      if (label === value) return Number(key);
    }

    throw new Error(`Unknown choice label: ${value}`);
  }

  transformValueFromDataverse(value: any): FieldValue<T[keyof T], Nullable> {
    if (value == null) return this.nullToRead();
    return this.fromChoiceValue(value) as FieldValue<T[keyof T], Nullable>;
  }

  transformValueToDataverse(value: any): number | null {
    if (value == null) return null;
    return this.toChoiceValue(value);
  }
}

/**
 * Creates a multi-select choice column that works with raw Dataverse numeric option
 * values (MultiSelectPicklist).
 *
 * The Web API stores these as a comma-delimited string of option values
 * (e.g. `"3,4,5"`); reads produce `number[]` and writes produce CSV strings.
 * An empty selection reads as `[]` and writes as `null` (which clears the
 * column).
 *
 * @example
 * const table = new DataverseTable({
 *   months: multiChoice("nnsyc200_months"),
 * });
 * // Infer<typeof table>["months"] → number[]
 */
export class DynamicMultiChoiceField extends FieldBase<number[]> {
  kind = "value" as const;
  type = "dynamicMultiChoice" as const;

  constructor(name: string, options?: FieldOptions<number[]>) {
    super(name, {
      defaultValue: () => [],
      schema: arrayOf(NUMBER_SCHEMA),
    }, options);
  }

  transformValueFromDataverse(value: unknown): number[] {
    if (value == null || value === "") return this.getDefault();

    const rawValues = Array.isArray(value)
      ? value
      : String(value).split(",");

    return rawValues.map((raw) => {
      const result = Number(String(raw).trim());
      if (!Number.isFinite(result)) {
        throw new Error(`Invalid multi-choice value: ${raw} (${this.logicalName})`);
      }
      return result;
    });
  }

  transformValueToDataverse(value: unknown): string | null {
    if (value == null) return null;

    if (!Array.isArray(value)) {
      throw new Error(
        `Multi-choice field "${this.logicalName}" requires an array of values`,
      );
    }

    if (value.length === 0) return null;

    return value.join(",");
  }
}

export class DateTimeField<Nullable extends boolean = true> extends FieldBase<FieldValue<Date, Nullable>> {
  kind = "value" as const;
  type = "dateTime" as const;
  constructor(name: string, options?: FieldOptions<FieldValue<Date, Nullable>> & { system?: boolean }) {
    super(name, {
      defaultValue: ((options?.system === true ? () => new Date() : null) as any),
      schema: DATE_SCHEMA as ValidationSchema<FieldValue<Date, Nullable>>,
      nullable: options?.system !== true,
    }, options);
  }
  transformValueFromDataverse(value: any): FieldValue<Date, Nullable> {
    if (value == null) return this.nullToRead();
    const result = new Date(value);
    if (!isValidDate(result)) throw new Error(`Invalid datetime value: ${value}`);
    return result as FieldValue<Date, Nullable>;
  }
}


export class DateField<Nullable extends boolean = true> extends FieldBase<FieldValue<Date, Nullable>> {
  kind = "value" as const;
  type = "dateOnly" as const;
  constructor(name: string, options?: FieldOptions<FieldValue<Date, Nullable>> & { system?: boolean }) {
    super(name, {
      defaultValue: ((options?.system === true ? () => parseDateOnly(new Date().toISOString()) : null) as any),
      schema: DATE_SCHEMA as ValidationSchema<FieldValue<Date, Nullable>>,
      nullable: options?.system !== true,
    }, options);
  }
  transformValueFromDataverse(value: any): FieldValue<Date, Nullable> {
    if (value == null) return this.nullToRead();
    return parseValidDateOnly(value) as FieldValue<Date, Nullable>;
  }
  transformValueToDataverse(value: any) {
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
    if (value?.data === null) {
      await ctx.client.deletePropertyValue(ctx.table.entitySetName, ctx.recordId, this.logicalName)
    } else if (value?.data instanceof Blob) {
      await ctx.client.updateFileProperty(ctx.table.entitySetName, ctx.recordId, this.logicalName, "image.png", value.data)
    }
  }
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
    } else if (value?.data === null) {
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

/**
 * Creates a number-typed Dataverse column definition. Nullable by default.
 * Pass `{ system: true }` for server-managed numbers that Dataverse always
 * populates — the read type is non-null, the field is readonly, and a null from
 * the wire fails fast. `{ required: true }` is validation-only.
 *
 * @param name The Dataverse logical name of the column (e.g. `"person_age"`).
 *
 * @example
 * const table = new DataverseTable({
 *   age: number("person_age"),                  // number | null
 *   state: number("statecode", { system: true }),// number (readonly)
 * });
 */
export function number(name: string, options?: FieldOptions<number | null> & { system?: false | undefined; required?: boolean }): NumberField<true>;
export function number(name: string, options: FieldOptions<number> & { system: true; required?: boolean }): NumberField<false>;
export function number(name: string, options?: FieldOptions<number | null> & { system?: boolean; required?: boolean }): NumberField<boolean> {
  return new NumberField(name, options);
}

/**
 * Creates a string-typed Dataverse column definition. Non-null: Dataverse
 * coerces empty strings to `null`, so a missing value reads as `""` — no
 * information is lost either way.
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
 * Reads the Dataverse CSV format (`"3,4,5"`) as an array of configured string
 * labels and writes arrays back as CSV. Non-null: Dataverse reports `null` for
 * "nothing selected", which reads as `[]` — the same information.
 *
 * @param name The Dataverse logical name of the column.
 * @param choices The allowed numeric option values (or a value→label map).
 *
 * @example
 * const table = new DataverseTable({
 *   months: multiChoice("nnsyc200_months", { 1: "Jan", 2: "Feb" }),
 * });
 * // Infer<typeof table>["months"] → ("Jan" | "Feb")[]
 */
function multiChoice<const T extends Record<number, string>>(
  name: string,
  choices: T,
  options?: FieldOptions<T[keyof T][]>,
): MultiChoiceField<T>;
/**
 * Overload of {@link multiChoice} for multi-select option sets not known at
 * compile time. Returns a number-array-typed field.
 *
 * @example
 * const table = new DataverseTable({
 *   months: multiChoice("nnsyc200_months"),
 * });
 * // Infer<typeof table>["months"] → number[]
 */
function multiChoice(name: string, options?: FieldOptions<number[]>): DynamicMultiChoiceField;
function multiChoice(...args: any[]): any {
  const name = args[0] as string;
  // A choices map has numeric keys; otherwise it is an options object or absent
  const isChoices = args.length > 1 && args[1] != null && typeof args[1] === "object" && Object.keys(args[1]).some((k) => /^\d+$/.test(k));
  if (isChoices) {
    return new MultiChoiceField(name, args[1], args[2]);
  }
  return new DynamicMultiChoiceField(name, args[1]);
}
export { multiChoice };

/**
 * Creates a choice/option-set column definition. Maps Dataverse numeric option values
 * to human-readable string labels. Nullable by default; pass `{ required: true }`
 * for a non-null read type.
 *
 * @param name The Dataverse logical name of the column.
 * @param choices An object mapping numeric option values to string labels.
 * @param options Optional field options (default, readonly, schema, required).
 *
 * @example
 * const table = new DataverseTable({
 *   status: choice("statuscode", { 1: "Active", 2: "Inactive", 3: "Archived" }),
 * });
 * // Infer<typeof table>["status"] → "Active" | "Inactive" | "Archived" | null
 */
function choice<const T extends Record<number, string>>(name: string, choices: T, options?: FieldOptions<T[keyof T] | null>): ChoiceField<T, true>;
function choice(name: string, options?: FieldOptions<number | null> & { system?: false | undefined; required?: boolean }): NumberField<true>;
function choice(name: string, options: FieldOptions<number> & { system: true; required?: boolean }): NumberField<false>;
function choice(...args: any[]): any {
  const name = args[0] as string;
  // Typed choices: (name, choices, options?); a choices map has numeric keys
  const isChoices = args.length > 1 && args[1] != null && typeof args[1] === "object" && Object.keys(args[1]).some((k) => /^\d+$/.test(k));
  if (isChoices) {
    return new ChoiceField(name, args[1], args[2]);
  }
  // Raw choice values: exactly the same behaviour as number()
  return new NumberField(name, args[1]);
}
export { choice };

/**
 * Creates a date-only column definition (maps to JavaScript `Date`, time portion is zeroed).
 * Nullable by default; pass `{ system: true }` for server-managed dates that
 * Dataverse always populates — non-null read type, readonly, null fails fast.
 *
 * @param name The Dataverse logical name of the column.
 *
 * @example
 * const table = new DataverseTable({
 *   birthDate: date("birthdate"),                        // Date | null
 *   anniversary: date("anniversary", { system: true }),  // Date (readonly)
 * });
 */
export function date(name: string, options?: FieldOptions<Date | null> & { system?: false | undefined; required?: boolean }): DateField<true>;
export function date(name: string, options: FieldOptions<Date> & { system: true; required?: boolean }): DateField<false>;
export function date(name: string, options?: FieldOptions<Date | null> & { system?: boolean; required?: boolean }): DateField<boolean> {
  return new DateField(name, options);
}

/**
 * Creates a date-time column definition (maps to JavaScript `Date`).
 * Nullable by default; pass `{ system: true }` for server-managed stamps that
 * Dataverse always populates — non-null read type, readonly, null fails fast.
 *
 * @param name The Dataverse logical name of the column.
 *
 * @example
 * const table = new DataverseTable({
 *   createdAt: datetime("createdon", { system: true }), // Date (readonly)
 *   reviewAt: datetime("review_on"),                    // Date | null
 * });
 */
export function datetime(name: string, options?: FieldOptions<Date | null> & { system?: false | undefined; required?: boolean }): DateTimeField<true>;
export function datetime(name: string, options: FieldOptions<Date> & { system: true; required?: boolean }): DateTimeField<false>;
export function datetime(name: string, options?: FieldOptions<Date | null> & { system?: boolean; required?: boolean }): DateTimeField<boolean> {
  return new DateTimeField(name, options as FieldOptions<Date>);
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

export class LookupIdProperty<Nullable extends boolean = true> extends FieldBase<FieldValue<GUID, Nullable>> {
  kind = "navigation" as const;
  type = "lookupId" as const;
  #getTable: GetTable<DataverseTable<GenericProperties>>;

  constructor(name: string, getTable: GetTable, options?: FieldOptions<FieldValue<GUID, Nullable>> & { system?: boolean }) {
    super(name, {
      defaultValue: null as FieldValue<GUID, Nullable>,
      schema: GUID_SCHEMA as ValidationSchema<FieldValue<GUID, Nullable>>,
      nullable: options?.system !== true,
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
      defaultValue: () => [],
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
      defaultValue: () => [],
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
export const lookupId: {
  (name: string, getTable: GetTable, options?: FieldOptions<GUID | null> & { system?: false | undefined; required?: boolean }): LookupIdProperty<true>;
  (name: string, getTable: GetTable, options: FieldOptions<GUID> & { system: true; required?: boolean }): LookupIdProperty<false>;
} = (
  name: string,
  getTable: GetTable,
  options?: FieldOptions<GUID | null> & { system?: boolean },
): LookupIdProperty<boolean> =>
  new LookupIdProperty(name, getTable, options);

// --- System field sugar (server-managed, always populated, readonly, non-null reads) ---

/** Server-managed record-create timestamp (`createdon`). Non-null `Date`, readonly. */
export function createdOn(name = "createdon", options?: FieldOptions<Date>): DateTimeField<false> {
  return new DateTimeField(name, { ...(options as any), system: true });
}

/** Server-managed record-modify timestamp (`modifiedon`). Non-null `Date`, readonly. */
export function modifiedOn(name = "modifiedon", options?: FieldOptions<Date>): DateTimeField<false> {
  return new DateTimeField(name, { ...(options as any), system: true });
}

/** Server-managed row-version number (`versionnumber`). Non-null `number`, readonly. */
export function versionNumber(name = "versionnumber", options?: FieldOptions<number>): NumberField<false> {
  return new NumberField(name, { ...(options as any), system: true });
}

/** Record state (draft/active/inactive) — `statecode`. Non-null `number`, readonly. */
export function stateCode(name = "statecode", options?: FieldOptions<number>): NumberField<false> {
  return new NumberField(name, { ...(options as any), system: true });
}

/** Record creator (`createdby`) — a lookup to the systemuser table. Non-null `GUID`, readonly.
 *  Pass a `getTable` thunk if the id may ever be written; reads need no table. */
export function createdBy(getTableOrName?: GetTable | string, name = "createdby", options?: FieldOptions<GUID>): LookupIdProperty<false> {
  const getTable = typeof getTableOrName === "function" ? getTableOrName : () => { throw new Error("createdBy has no related table; pass a getTable thunk to support writes"); };
  return new LookupIdProperty(name, getTable, { ...(options ?? {}), system: true });
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
