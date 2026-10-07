/**
 * Field definitions for SharePoint list/library columns.
 *
 * Notes vs Dataverse (`packages/dataverse`):
 * - SharePoint has no server-managed "required/read-only" enforcement keywords
 *   here; validation is column-level (enforced server-side on the list).
 * - Internal column names: SharePoint assigns prefixed/canonicalized internal
 *   names (static name vs display name). The field `name` should be the
 *   *internal* name exactly as it appears in REST responses (e.g. `"Title"`,
 *   `"MyCustomField0"`); discover via `_api/web/lists/GetByTitle('List')/Fields`.
 * - `Title` is the one SharePoint-ism: display name `Title`, internal `Title`,
 *   and it behaves like a non-null string (wire null ⇔ `""`).

 * TODO(convergence): once a `packages/core` is extracted, these classes move
 * there to share transforms + validation with the Dataverse field system.
 */

import type { StandardSchemaV1 } from "@standard-schema/spec";
import type { ListItemId } from "./types";

export type FieldKind = "string" | "number" | "boolean" | "date" | "datetime" | "datetime";

export type FieldOptions<T> = {
    /** Standard-Schema (valibot/Zod/ArkType) schema for the field's read value. */
    schema?: StandardSchemaV1<T, T>;
    /** Set `true` for server-computed columns (read-only from the REST surface). */
    readonly?: boolean;
};

export class FieldBase<T> {
    readonly type: FieldKind;
    readonly name: string;
    readonly options: FieldOptions<T>;

    constructor(name: string, type: FieldKind, options: FieldOptions<T> = {}) {
        this.name = name;
        this.type = type;
        this.options = options;
    }

    /** Wire value (REST payload) → TS read value. */
    fromSharePoint(wire: unknown): T {
        return wire as T;
    }

    /** TS value → wire payload value. */
    toSharePoint(value: T): unknown {
        return value;
    }
}

export class StringField<T extends string = string> extends FieldBase<T> {
    constructor(name: string, options: FieldOptions<T> = {}) {
        super(name, "string", options);
    }
    // SharePoint returns empty strings for unset single-line columns.
    override fromSharePoint(wire: unknown): T {
        return (wire == null ? "" : wire) as T;
    }
}

export class NumberField<T extends number | null = number | null> extends FieldBase<T> {
    constructor(name: string, options: FieldOptions<T> = {}) {
        super(name, "number", options);
    }
    override fromSharePoint(wire: unknown): T {
        // Some verbose payloads deliver numbers as strings ("1.5").
        if (wire === "" || wire == null) return null as T;
        const n = typeof wire === "number" ? wire : Number(wire);
        return (Number.isNaN(n) ? null : n) as T;
    }
}

export class BooleanField extends FieldBase<boolean> {
    constructor(name: string, options: FieldOptions<boolean> = {}) {
        super(name, "boolean", options);
    }
    override fromSharePoint(wire: unknown): boolean {
        // Verbose JSON delivers `true`/`false` — but some tenants return null.
        return wire === true;
    }
    override toSharePoint(value: boolean): boolean {
        return value === true;
    }
}

export class DateField<T = string | null> extends FieldBase<T> {
    constructor(name: string, options: FieldOptions<T> = {}) {
        super(name, "date", options);
    }
    override fromSharePoint(wire: unknown): T {
        return (wire == null || wire === "" ? null : new Date(wire as string).toISOString().slice(0, 10)) as T;
    }
    override toSharePoint(value: T): unknown {
        if (value == null) return null;
        return value instanceof Date ? value.toISOString().slice(0, 10) : value;
    }
}

export class DatetimeField<T = Date | null> extends FieldBase<T> {
    constructor(name: string, options: FieldOptions<T> = {}) {
        super(name, "datetime", options);
    }
    override fromSharePoint(wire: unknown): T {
        return (wire == null || wire === "" ? null : new Date(wire as string)) as T;
    }
    override toSharePoint(value: T): unknown {
        if (value == null) return null;
        return value instanceof Date ? value.toISOString() : value;
    }
}

// Factories follow the dataverse-schema pattern (camelCase, matching field kind).
export function text(name: string, options?: FieldOptions<string>) { return new StringField(name, options); }
export function number(name: string, options?: FieldOptions<number | null>) { return new NumberField(name, options); }
export function bool(name: string, options?: FieldOptions<boolean>) { return new BooleanField(name, options); }
export function date(name: string, options?: FieldOptions<string | null>) { return new DateField(name, options); }
export function datetime(name: string, options?: FieldOptions<Date | null>) { return new DatetimeField(name, options); }
export function title(name: string = "Title", options?: FieldOptions<string>) { return new StringField(name, options); }

/**
 * Primary key field — SharePoint list items expose an integer `Id`.
 * `name` defaults to `"Id"` (the internal column SharePoint REST returns).
 */
export function primaryKey(name: string = "Id") { return new NumberField(name, { readonly: true }); }

/** Infers the TS record type from a fields map. */
export type InferRecord<TFields extends Record<string, FieldBase<any>>> = {
    [K in keyof TFields]: TFields[K] extends FieldBase<infer T> ? T : never;
};

