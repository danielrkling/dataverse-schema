/**
 * Field definitions for JSON-backed records.
 *
 * The conventions mirror the Dataverse / SharePoint schema packages: factories
 * are camelCase, the field `name` is the key stored in JSON, the field map key
 * is the TypeScript property name, and phantom `T` properties make type-only
 * inference possible without importing field maps.
 *
 * Unlike the remote packages there is no wire protocol to translate: values are
 * already JSON. The transform layer therefore only has to handle rich local
 * types (Date), missing-value policy, and Standard Schema validation.
 */

import type { StandardSchemaV1 } from "@standard-schema/spec";

export type FieldKind =
  | "string"
  | "number"
  | "boolean"
  | "date"
  | "datetime"
  | "json"
  | "choice"
  | "multiChoice"
  | "primaryKey";

export type ValidationSchema<T> = StandardSchemaV1<T, T>;

export type FieldOptions<T> = {
  /** Standard Schema (valibot/Zod/ArkType) validating this field's value. */
  schema?: ValidationSchema<T>;
  /** Informational: the value is not authored by the app. */
  readonly?: boolean;
};

/** Validates a value through a Standard Schema, synchronously. */
export function validateStandardSync<T>(
  schema: StandardSchemaV1<T>,
  value: unknown,
  label: string,
): T {
  const result = schema["~standard"].validate(value);
  if (result instanceof Promise) {
    throw new Error(`${label} uses an async schema — filesystem table transforms require a synchronous schema`);
  }
  if (result.issues) {
    const detail = result.issues
      .map((issue) => {
        const path = (issue.path ?? [])
          .map((segment) => (typeof segment === "object" ? String(segment.key) : String(segment)))
          .join(".");
        return path ? `${path}: ${issue.message}` : issue.message;
      })
      .join(", ");
    throw new Error(`${label} failed schema validation (${detail})`);
  }
  return result.value as T;
}

export class FieldBase<T> {
  readonly type: FieldKind;
  readonly name: string;
  readonly options: FieldOptions<T>;

  constructor(name: string, type: FieldKind, options: FieldOptions<T> = {}) {
    this.name = name;
    this.type = type;
    this.options = options;
  }

  /** No runtime value. Use with `typeof field.T`. */
  T!: T;

  /** JSON value → local TypeScript value. */
  fromStorage(value: unknown): T {
    return value as T;
  }

  /** Local TypeScript value → JSON value. */
  toStorage(value: T): unknown {
    return value;
  }

  /**
   * Validates a local value against this field's schema. Nullish values are
   * left to the field's null policy (matching the other schema packages), so a
   * missing optional field does not fail validation just because a schema was
   * supplied.
   */
  validate(value: unknown, label = `field "${this.name}"`): T {
    if (!this.options.schema || value == null) return value as T;
    return validateStandardSync(this.options.schema, value, label);
  }
}

export class StringField<T extends string = string> extends FieldBase<T> {
  constructor(name: string, options: FieldOptions<T> = {}) {
    super(name, "string", options);
  }

  override fromStorage(value: unknown): T {
    // Matches the other packages: a missing string column reads as "".
    return (value == null ? "" : String(value)) as T;
  }
}

export class NumberField<T extends number | null = number | null> extends FieldBase<T> {
  constructor(name: string, options: FieldOptions<T> = {}) {
    super(name, "number", options);
  }

  override fromStorage(value: unknown): T {
    if (value === "" || value == null) return null as T;
    const number = typeof value === "number" ? value : Number(value);
    return (Number.isNaN(number) ? null : number) as T;
  }
}

export class BooleanField extends FieldBase<boolean> {
  constructor(name: string, options: FieldOptions<boolean> = {}) {
    super(name, "boolean", options);
  }

  override fromStorage(value: unknown): boolean {
    return value === true;
  }

  override toStorage(value: boolean): boolean {
    return value === true;
  }
}

/** Date-only column. Reads/writes real `Date` objects (stored as ISO strings). */
export class DateField<T extends Date | null = Date | null> extends FieldBase<T> {
  constructor(name: string, options: FieldOptions<T> = {}) {
    super(name, "date", options);
  }

  override fromStorage(value: unknown): T {
    if (value == null || value === "") return null as T;
    if (value instanceof Date) return value as T;
    const date = new Date(value as string | number);
    return (Number.isNaN(date.getTime()) ? null : date) as T;
  }

  override toStorage(value: T): unknown {
    if (value == null) return null;
    if (!(value instanceof Date)) throw new TypeError("date field expects a Date instance");
    return value.toISOString();
  }
}

export class DatetimeField<T extends Date | null = Date | null> extends FieldBase<T> {
  constructor(name: string, options: FieldOptions<T> = {}) {
    super(name, "datetime", options);
  }

  override fromStorage(value: unknown): T {
    if (value == null || value === "") return null as T;
    if (value instanceof Date) return value as T;
    const date = new Date(value as string | number);
    return (Number.isNaN(date.getTime()) ? null : date) as T;
  }

  override toStorage(value: T): unknown {
    if (value == null) return null;
    if (!(value instanceof Date)) throw new TypeError("datetime field expects a Date instance");
    return value.toISOString();
  }
}

/**
 * Arbitrary JSON value. Unlike the SharePoint package's JSON columns, the value
 * is stored as real JSON (objects stay objects) because the record file itself
 * is JSON.
 */
export class JsonField<T = any> extends FieldBase<T> {
  readonly schema?: StandardSchemaV1<T>;

  constructor(name: string, options: Omit<FieldOptions<T>, "schema"> & { schema?: StandardSchemaV1<T> } = {}) {
    super(name, "json", options as FieldOptions<T>);
    this.schema = options.schema;
  }

  override fromStorage(value: unknown): T {
    const parsed = (value == null ? null : value) as T;
    if (parsed == null || !this.schema) return parsed;
    return validateStandardSync(this.schema, parsed, `json field "${this.name}"`);
  }

  override toStorage(value: T): unknown {
    return value;
  }

  override validate(value: unknown, label = `json field "${this.name}"`): T {
    if (!this.schema || value == null) return value as T;
    return validateStandardSync(this.schema, value, label);
  }
}

/** Single-select choice. Values are plain strings in JSON. */
export class ChoiceField<C extends string = string> extends FieldBase<C | null> {
  readonly choices: readonly C[] | undefined;

  constructor(name: string, options: FieldOptions<C> & { choices?: readonly C[] } = {}) {
    super(name, "choice", options);
    this.choices = options.choices;
  }

  override fromStorage(value: unknown): C | null {
    return (value == null || value === "" ? null : value) as C | null;
  }
}

/** Multi-select choice. Stored as a JSON array (missing ⇔ `[]`). */
export class MultiChoiceField<C extends string = string> extends FieldBase<C[]> {
  readonly choices: readonly C[] | undefined;

  constructor(name: string, options: FieldOptions<C[]> & { choices?: readonly C[] } = {}) {
    super(name, "multiChoice", options);
    this.choices = options.choices;
  }

  override fromStorage(value: unknown): C[] {
    if (value == null || value === "") return [];
    if (!Array.isArray(value)) throw new TypeError(`multiChoice field "${this.name}" expects a JSON array`);
    return value as C[];
  }

  override toStorage(value: C[]): unknown {
    if (!Array.isArray(value)) throw new TypeError("multiChoice field expects an array");
    return value;
  }
}

/**
 * Primary key field. Record ids are strings (generated with `crypto.randomUUID`
 * when omitted) because they also become file names.
 */
export class PrimaryKeyField extends FieldBase<string> {
  constructor(name: string = "id") {
    super(name, "primaryKey", { readonly: true });
  }

  override fromStorage(value: unknown): string {
    if (value == null || value === "") return "";
    return String(value);
  }

  override toStorage(value: string): string {
    return String(value);
  }
}

// --- factories ---

export function text(name: string, options?: FieldOptions<string>) {
  return new StringField(name, options);
}

export function number(name: string, options?: FieldOptions<number | null>) {
  return new NumberField(name, options);
}

export function bool(name: string, options?: FieldOptions<boolean>) {
  return new BooleanField(name, options);
}

export function json<T = any>(
  name: string,
  options?: Omit<FieldOptions<T>, "schema"> & { schema?: StandardSchemaV1<T> },
) {
  return new JsonField<T>(name, options);
}

export function date(name: string, options?: FieldOptions<Date | null>) {
  return new DateField(name, options);
}

export function datetime(name: string, options?: FieldOptions<Date | null>) {
  return new DatetimeField(name, options);
}

export function choice<C extends string = string>(
  name: string,
  options?: FieldOptions<C> & { choices?: readonly C[] },
) {
  return new ChoiceField(name, options);
}

export function multiChoice<C extends string = string>(
  name: string,
  options?: FieldOptions<C[]> & { choices?: readonly C[] },
) {
  return new MultiChoiceField(name, options);
}

export function title(name: string = "title", options?: FieldOptions<string>) {
  return new StringField(name, options);
}

export function primaryKey(name: string = "id") {
  return new PrimaryKeyField(name);
}

/** Infers the TypeScript record type from a fields map. */
export type InferRecord<TFields extends Record<string, FieldBase<any>>> = {
  [K in keyof TFields]: TFields[K] extends FieldBase<infer T> ? T : never;
};

/** The table's inferred record type via the phantom `T` property. */
export type InferTable<TTable extends { T: any }> = TTable["T"];
