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
 *
 * This package is intentionally standalone: SharePoint gets a flat, minimal
 * field/query surface instead of the shared core the Dataverse package uses.
 */

import type { StandardSchemaV1 } from "@standard-schema/spec";
import type { ListItemId } from "./types";
import type { SharePointClient } from "./client";

export type FieldKind = "string" | "number" | "boolean" | "date" | "datetime" | "json" | "person" | "lookup" | "choice" | "multiChoice" | "file";

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

/** Date-only column. Reads/writes real `Date` objects (wire is `YYYY-MM-DDT00:00:00`). */
export class DateField<T extends Date | null = Date | null> extends FieldBase<T> {
    constructor(name: string, options: FieldOptions<T> = {}) {
        super(name, "date", options);
    }
    override fromSharePoint(wire: unknown): T {
        if (wire == null || wire === "") return null as T;
        const d = new Date(wire as string);
        return (Number.isNaN(d.getTime()) ? null : d) as T;
    }
    override toSharePoint(value: T): unknown {
        if (value == null) return null;
        if (!(value instanceof Date)) throw new TypeError("date field expects a Date instance");
        return value.toISOString();
    }
}

export class DatetimeField<T extends Date | null = Date | null> extends FieldBase<T> {
    constructor(name: string, options: FieldOptions<T> = {}) {
        super(name, "datetime", options);
    }
    override fromSharePoint(wire: unknown): T {
        if (wire == null || wire === "") return null as T;
        const d = new Date(wire as string);
        return (Number.isNaN(d.getTime()) ? null : d) as T;
    }
    override toSharePoint(value: T): unknown {
        if (value == null) return null;
        if (!(value instanceof Date)) throw new TypeError("datetime field expects a Date instance");
        return value.toISOString();
    }
}

export class JsonField<T = any> extends FieldBase<T> {
    constructor(name: string, options: FieldOptions<T> = {}) {
        super(name, "json", options);
    }
    /** JSON string columns (`multi-line text` with plain-text JSON) — undefined/null reads as null. */
    override fromSharePoint(wire: unknown): T {
        if (wire == null || wire === "") return null as T;
        try {
            return JSON.parse(wire as string) as T;
        } catch {
            throw new Error(`Invalid JSON in column "${this.name}"`);
        }
    }
    override toSharePoint(value: T): unknown {
        if (value == null) return null;
        if (typeof value === "string") return value;
        return JSON.stringify(value);
    }
}

/** A user/group reference: expanded or unexpanded REST shapes flatten to this. */
export type Person = { id: number; name?: string };

/** A lookup reference (per single-valued lookup column). */
export type Lookup = Person;

/**
 * Person/group column (`SP.FieldUser`). Reads `nullable Person | null`.
 *
 * Wire shapes handled on read:
 * - unexpanded: `{"__metadata":…, "Id": 17}` or the plain number `17` (verbose REST variants)
 * - expanded (`$expand=Field`): `{ Id, Title, … }`
 * - legacy string form: `"17;#Display Name"`
 *
 * Write: the id is sent as the plain numeric value (supported for single-value
 * fields across SharePoint REST versions); multi-value person columns are out
 * of scope for the flat query surface.
 */
export class PeopleField<T extends Person | null = Person | null> extends FieldBase<T> {
    constructor(name: string, options: FieldOptions<T> = {}) {
        super(name, "person", options);
    }
    override fromSharePoint(wire: unknown): T {
        return parseIdName(wire) as T;
    }
    override toSharePoint(value: T): unknown {
        if (value == null) return null;
        if (typeof value !== "object" || typeof (value as Person).id !== "number") {
            throw new TypeError("people field expects { id }");
        }
        return (value as Person).id;
    }
}

/**
 * Single-valued lookup column (`SP.FieldLookup`). Same shape handling as
 * {@link PeopleField} — `id` from the wire (or `LookupId` when expanded),
 * plus the lookup's display value when present (`Title`/`Value`/legacy `"2;#x"`).
 */
export class LookupField<T extends Lookup | null = Lookup | null> extends FieldBase<T> {
    constructor(name: string, options: FieldOptions<T> = {}) {
        super(name, "lookup", options);
    }
    override fromSharePoint(wire: unknown): T {
        return parseIdName(wire) as T;
    }
    override toSharePoint(value: T): unknown {
        if (value == null) return null;
        if (typeof value !== "object" || typeof (value as Lookup).id !== "number") {
            throw new TypeError("lookup field expects { id }");
        }
        return (value as Lookup).id;
    }
}

/**
 * Shared parser for person/lookup wire shapes:
 * `{ Id / LookupId }` objects, plain numbers, and legacy `"2;#Name"` strings.
 * `0` (the "no user" sentinel) and empty values read as `null`.
 */
export function parseIdName(wire: unknown): { id: number; name?: string } | null {
    if (wire == null || wire === "") return null;
    if (typeof wire === "object") {
        const o = wire as NodeJS.Dict<unknown>;
        const id = o["LookupId"] ?? o["Id"] ?? o["id"];
        const name = (o["Title"] ?? o["name"]) as string | undefined;
        if (typeof id !== "number" || id === 0) return null;
        return { id, ...(name ? { name } : {}) };
    }
    if (typeof wire === "number") return wire === 0 ? null : { id: wire };
    if (typeof wire === "string") {
        const m = /^\s*(\d+)\s*;#(.*)$/.exec(wire);
        if (m) return m[1] === "0" ? null : { id: Number(m[1]), ...(m[2] ? { name: m[2] } : {}) };
        const n = Number(wire);
        return Number.isNaN(n) || n === 0 ? null : { id: n };
    }
    return null;
}

/** Factories are defined at the bottom of this file (camelCase, dataverse-schema style). */
export function text(name: string, options?: FieldOptions<string>) { return new StringField(name, options); }
export function number(name: string, options?: FieldOptions<number | null>) { return new NumberField(name, options); }
export function bool(name: string, options?: FieldOptions<boolean>) { return new BooleanField(name, options); }
export function json<T = any>(name: string, options?: FieldOptions<T>) { return new JsonField(name, options); }
export function date(name: string, options?: FieldOptions<Date | null>) { return new DateField(name, options); }
export function datetime(name: string, options?: FieldOptions<Date | null>) { return new DatetimeField(name, options); }
export function people(name: string, options?: FieldOptions<Person | null>) { return new PeopleField(name, options); }
export function lookupId(name: string, options?: FieldOptions<Lookup | null>) { return new LookupField(name, options); }
export function title(name: string = "Title", options?: FieldOptions<string>) { return new StringField(name, options); }

/**
 * Primary key field — SharePoint list items expose an integer `Id`.
 * `name` defaults to `"Id"` (the internal column SharePoint REST returns).
 */
export function primaryKey(name: string = "Id") { return new NumberField(name, { readonly: true }); }

// --- choice ---

/**
 * Single-select choice column. SharePoint stores choice values as their
 * display strings (unlike Dataverse's numeric labels), so this is a plain
 * nullable string. `choices` is validation metadata for the app layer —
 * enforcement stays server-side.
 */
export class ChoiceField<C extends string = string> extends FieldBase<C | null> {
    readonly choices: C[] | undefined;

    constructor(name: string, options: FieldOptions<C | null> & { choices?: C[] } = {}) {
        super(name, "choice", options);
        this.choices = options.choices;
    }
    override fromSharePoint(wire: unknown): C | null {
        return (wire == null || wire === "" ? null : wire) as C | null;
    }
}

/**
 * Multi-select choice column: wire is a ";#"-joined string (`"A;#B;#C"`),
 * read as `string[]` (empty ⇔ `[]`, mirroring `multiChoice()` in the
 * Dataverse package). Writes re-join with the delimiter.
 */
export class MultiChoiceField<C extends string = string> extends FieldBase<C[]> {
    constructor(name: string, options: FieldOptions<C[]> = {}) {
        super(name, "multiChoice", options);
    }
    override fromSharePoint(wire: unknown): C[] {
        if (wire == null || wire === "") return [];
        if (Array.isArray(wire)) return wire as C[];
        return String(wire).split(";#").filter((v) => v !== "") as C[];
    }
    override toSharePoint(value: C[]): unknown {
        if (!Array.isArray(value)) throw new TypeError("multiChoice field expects an array");
        return value.join(";#");
    }
}

export function choice<C extends string = string>(name: string, options?: FieldOptions<C | null> & { choices?: C[] }) {
    return new ChoiceField(name, options);
}
export function multiChoice<C extends string = string>(name: string, options?: FieldOptions<C[]>) {
    return new MultiChoiceField(name, options);
}

// --- document/file (doc libraries) ---

/** Same explicit-channel shape as the Dataverse package's `FileRef`. */
export type FileRef = {
    name?: string;
    url?: string;
    data?: Blob | ArrayBuffer | null;
};

/** Transform context handed to afterSave hooks (mirrors the Dataverse package). */
export type TransformContext = {
    table: { listTitle: string };
    client: SharePointClient;
    /** Item id this save produced (upload target). */
    recordId?: number | string;
    /** Server-relative folder the file content belongs in (doc libraries). */
    rootFolder?: string;
};

/**
 * Document/file content for **document libraries** via the legacy `_api/web`
 * REST surface: a doc-lib list item *is* a file, so there is no distinct
 * column value to put in an item body. Content flows through the explicit
 * channel, exactly like the Dataverse package's `FileField`:
 *
 * - create/update: include `{ name?, data: Blob | ArrayBuffer }` in the record
 *   value — the field never appears in an item body (metadata MERGE and Files
 *   upload are separate REST surfaces).
 * - read: `{ name, url }` — `name` from the item's `FileLeafRef`, `url` from
 *   `FileRef` (absolute, built from the client's site URL).
 * - delete: removing the content = deleting the item (`deleteRecord`); there
 *   is no "clear file" operation like Dataverse's `data: null` channel.
 * - large-file resumable sessions are out of scope for the flat surface.
 */
export class FileField extends FieldBase<FileRef | null> {
    constructor(name: string = "FileLeafRef", options: FieldOptions<FileRef | null> = {}) {
        super(name, "file", options);
    }
    /** Never part of an item body — content goes through the Files/Add upload channel. */
    override toSharePoint(_value: FileRef | null): undefined {
        return undefined;
    }
}

export function document(name: string = "FileLeafRef", options?: FieldOptions<FileRef | null>) {
    return new FileField(name, options);
}

/** Infers the TS record type from a fields map. */
export type InferRecord<TFields extends Record<string, FieldBase<any>>> = {
    [K in keyof TFields]: TFields[K] extends FieldBase<infer T> ? T : never;
};

