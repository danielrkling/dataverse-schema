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

export type FieldKind = "string" | "number" | "boolean" | "date" | "datetime" | "json" | "person" | "people" | "lookup" | "lookupCollection" | "choice" | "multiChoice" | "file" | "comments";

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

    /**
     * The wire key write payloads target. Defaults to the read `name`;
     * reference fields override it to SharePoint's derived `<name>Id` property
     * (see ReferenceFieldOptions).
     */
    get writeName(): string {
        return this.name;
    }

    /** No runtime value. Use with typeof field.T */
    T!: T

    /** Wire value (REST payload) → TS read value. */
    fromSharePoint(wire: unknown): T {
        return wire as T;
    }

    /** TS value → wire payload value. */
    toSharePoint(value: T): unknown {
        return value;
    }

    /** Validates a local value through the field's synchronous Standard Schema. */
    validate(value: unknown, label = `field "${this.name}"`): T {
        if (!this.options.schema || value == null) return value as T;
        const result = this.options.schema["~standard"].validate(value);
        if (result instanceof Promise) {
            throw new Error(`${label} uses an async schema — provide a synchronous one`);
        }
        if (result.issues) {
            throw new Error(`${label} failed schema validation (${result.issues.length} issue${result.issues.length === 1 ? "" : "s"})`);
        }
        return result.value as T;
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

/**
 * JSON string columns (`multi-line text` with plain-text JSON) — undefined/null
 * read as null. The parsed value type + runtime validation are INFERRED from a
 * Standard Schema (valibot/Zod/ArkType):
 *
 *   json("Meta", { schema: v.object({ a: v.number() }) })   // reads { a: number } | null
 *
 * Without a schema the value stays `unknown`-ish (parsed as-is).
 */
export class JsonField<T = any> extends FieldBase<T | null> {
    readonly schema?: StandardSchemaV1<T>;

    constructor(name: string, options: Omit<FieldOptions<T>,"schema"> & { schema?: StandardSchemaV1<T> } = {}) {
        super(name, "json", options);
        this.schema = options.schema;
    }

    override fromSharePoint(wire: unknown): T | null {
        if (wire == null || wire === "") return null;
        let parsed: unknown;
        try {
            parsed = JSON.parse(wire as string);
        } catch {
            throw new Error(`Invalid JSON in column "${this.name}"`);
        }
        if (!this.schema) return parsed as T;
        return this.validate(parsed, `json column "${this.name}"`);
    }

    override toSharePoint(value: T | null): unknown {
        if (value == null) return null;
        if (typeof value === "string") return value;
        return JSON.stringify(value);
    }
}

/** A user/group reference: expanded or unexpanded REST shapes flatten to this. */
export type Person = { id: number; name?: string; email?: string };

/**
 * A lookup reference: id + the target's display value (`Title` on the wire).
 * Lookups never carry an email — that's person (`SP.FieldUser`) territory —
 * so the type stays separate from {@link Person} on purpose.
 */
export type Lookup = { id: number; title?: string };

/**
 * Legacy write conventions for reference columns on the verbose REST surface:
 * a single-valued lookup/person column "Project" is written via the derived
 * `ProjectId` property (numeric id), a multi-valued column via
 * `{ <Name>Id: { results: [...] } }`. Fields expose `writeName` so the table
 * emits those keys instead of the (read-shaped) column name.
 */
export type ReferenceWriteShape = "derivedId" | "typed";

export type ReferenceFieldOptions<T> = FieldOptions<T> & {
    /**
     * Write body shape: `"derivedId"` (default) — `<Name>Id: id | { results }`;
     * `"typed"` — `<Name>Id: { __metadata: { type }, Id|LookupId }`.
     */
    writeShape?: ReferenceWriteShape;
};

/** Derives the REST write key for a reference field: the `<name>Id` property. */
export function referenceWriteName(name: string): string {
    return `${name}Id`;
}

/**
 * Single person/group column (`SP.FieldUser`, `person()`): reads
 * `Person | null` — id from `{ Id }` / plain number / legacy `"17;#Name"`
 * strings, display name and (when expanded) `EMail` included. `null`/`0`
 * (the "no user" sentinel) read as null.
 *
 * Write: the derived `<Name>Id` property (see {@link ReferenceFieldOptions}).
 */
export class PersonField extends FieldBase<Person | null> {
    readonly writeShape: ReferenceWriteShape;

    constructor(name: string, options: ReferenceFieldOptions<Person | null> = {}) {
        super(name, "person", options);
        this.writeShape = options.writeShape ?? "derivedId";
    }
    /** The `<name>Id` property write shape targets (see ReferenceFieldOptions). */
    override get writeName(): string {
        return referenceWriteName(this.name);
    }
    override fromSharePoint(wire: unknown): Person | null {
        return parseIdName(wire);
    }
    override toSharePoint(value: Person | null): unknown {
        return referenceWriteValue(this, value, "SP.FieldUserValue");
    }
}

/**
 * Person/group collection column (`people()`): reads expanded multi-user
 * results (`{ results: [...] }`, arrays) as `Person[]`; empty ⇔ `[]`.
 *
 * Write: the derived `<Name>Id` results envelope
 * (`{ results: [id, ...] }`).
 */
export class PeopleField extends FieldBase<Person[]> {
    readonly writeShape: ReferenceWriteShape;

    constructor(name: string, options: ReferenceFieldOptions<Person[]> = {}) {
        super(name, "people", options);
        this.writeShape = options.writeShape ?? "derivedId";
    }
    override get writeName(): string {
        return referenceWriteName(this.name);
    }
    override fromSharePoint(wire: unknown): Person[] {
        const entries =
            wire == null ? [] :
            Array.isArray(wire) ? wire :
            Array.isArray((wire as { results?: unknown[] }).results) ? (wire as { results: unknown[] }).results :
            [wire];
        return entries
            .map((entry) => parseIdName(entry))
            .filter((v): v is Person => v !== null);
    }
    override toSharePoint(value: Person[]): { results: number[] } {
        if (!Array.isArray(value)) throw new TypeError("people field expects an array of { id }");
        return { results: value.map((p) => {
            if (typeof p?.id !== "number") throw new TypeError("people field entries expect { id }");
            return p.id;
        }) };
    }
}

/**
 * Single-valued lookup column (`SP.FieldLookup`, `lookup()`): same read
 * shapes as {@link PersonField} — id from `{ Id }`/`{ LookupId }` (expanded),
 * plain number, or legacy `"2;#Name"` string.
 *
 * Write: the derived `<Name>Id` property (see {@link ReferenceFieldOptions}).
 */
export class LookupField extends FieldBase<Lookup | null> {
    readonly writeShape: ReferenceWriteShape;

    constructor(name: string, options: ReferenceFieldOptions<Lookup | null> = {}) {
        super(name, "lookup", options);
        this.writeShape = options.writeShape ?? "derivedId";
    }
    override get writeName(): string {
        return referenceWriteName(this.name);
    }
    override fromSharePoint(wire: unknown): Lookup | null {
        const parsed = parseIdName(wire);
        return parsed ? { id: parsed.id, ...(parsed.name ? { title: parsed.name } : {}) } : null;
    }
    override toSharePoint(value: Lookup | null): unknown {
        return referenceWriteValue(this, value, "SP.FieldLookupValue");
    }
}

/**
 * Builds the write value for single-valued reference fields:
 * - `derivedId`: the bare numeric id;
 * - `typed`: an `SP.FieldUserValue`/`SP.FieldLookupValue`-shaped object.
 * Empty local values surface as `null` (SharePoint clears a single-valued
 * reference column on MERGE with `null`).
 */
function referenceWriteValue(field: { writeShape: ReferenceWriteShape; name: string }, value: Person | Lookup | null, wireType: string): unknown {
    if (value == null) return null;
    if (typeof value !== "object" || typeof (value as Person).id !== "number") {
        throw new TypeError(`field "${field.name}" expects { id }`);
    }
    return field.writeShape === "typed"
        ? { __metadata: { type: wireType }, id: (value as Person).id }
        : (value as Person).id;
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
        const email = (o["EMail"] ?? o["Email"]) as string | undefined;
        if (typeof id !== "number" || id === 0) return null;
        return {
            id,
            ...(name ? { name } : {}),
            ...(email ? { email } : {}),
        };
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
export function json<T = any>(name: string, options?: Omit<FieldOptions<T>,"schema"> & { schema?: StandardSchemaV1<T> }) {
    return new JsonField<T>(name, options);
}
export function date(name: string, options?: FieldOptions<Date | null>) { return new DateField(name, options); }
export function datetime(name: string, options?: FieldOptions<Date | null>) { return new DatetimeField(name, options); }
export function people(name: string, options?: ReferenceFieldOptions<Person[]>) { return new PeopleField(name, options); }
export function person(name: string, options?: ReferenceFieldOptions<Person | null>) { return new PersonField(name, options); }
export function lookup(name: string, options?: ReferenceFieldOptions<Lookup | null>) { return new LookupField(name, options); }
export function title(name: string = "Title", options?: FieldOptions<string>) { return new StringField(name, options); }

/**
 * Primary key field — SharePoint list items expose an integer `Id`. `name`
 * defaults to `"Id"` (the internal column SharePoint REST returns). Pinned to
 * non-null: a fetched item always carries its numeric Id (the nullable
 * `NumberField` default would force pointless null-checks on a value that
 * can't occur).
 */
export function primaryKey(name: string = "Id") { return new NumberField<number>(name, { readonly: true }); }

// --- choice ---

/**
 * Single-select choice column. SharePoint stores choice values as their
 * display strings (unlike Dataverse's numeric labels), so this is a plain
 * nullable string. `choices` is validation metadata for the app layer —
 * enforcement stays server-side.
 */
export class ChoiceField<C extends string = string> extends FieldBase<C | null> {
    readonly choices: readonly C[] | undefined;

    constructor(name: string, options: FieldOptions<C> & { choices?: readonly C[] } = {}) {
        super(name, "choice", options);
        this.choices = options.choices;
    }
    override fromSharePoint(wire: unknown): C | null {
        return (wire == null || wire === "" ? null : wire) as C | null;
    }
}

/**
 * Multi-value reference *collection* column (`multiLookup()`): the same wire
 * shapes and `<Name>Id: { results: [...] }` write envelope as {@link PeopleField},
 * but for lookup columns (e.g. a multi-lookup "Concur codes" column). Reads
 * `Lookup[]`; person collections can use the same field (both flatten to
 * `{ id, name? }`).
 */
export class MultiLookupField extends FieldBase<Lookup[]> {
    readonly writeShape: ReferenceWriteShape;

    constructor(name: string, options: ReferenceFieldOptions<Lookup[]> = {}) {
        super(name, "lookupCollection", options);
        this.writeShape = options.writeShape ?? "derivedId";
    }
    override get writeName(): string {
        return referenceWriteName(this.name);
    }
    override fromSharePoint(wire: unknown): Lookup[] {
        const entries =
            wire == null ? [] :
            Array.isArray(wire) ? wire :
            Array.isArray((wire as { results?: unknown[] }).results) ? (wire as { results: unknown[] }).results :
            [wire];
        return entries
            .map((entry) => parseIdName(entry))
            .filter((v): v is Person => v !== null)
            .map((parsed) => ({ id: parsed.id, ...(parsed.name ? { title: parsed.name } : {}) }));
    }
    override toSharePoint(value: Lookup[]): { results: number[] } {
        if (!Array.isArray(value)) throw new TypeError("lookup collection field expects an array of { id }");
        return { results: value.map((v) => {
            if (typeof v?.id !== "number") throw new TypeError("lookup collection entries expect { id }");
            return v.id;
        }) };
    }
}

export function multiLookup(name: string, options?: ReferenceFieldOptions<Lookup[]> & { choices?: readonly Lookup[] }) {
    return new MultiLookupField(name, options);
}

/**
 * Multi-select choice column: wire is a ";#"-joined string (`"A;#B;#C"`),
 * read as `string[]` (empty ⇔ `[]`, mirroring `multiChoice()` in the
 * Dataverse package). Writes re-join with the delimiter.
 */
export class MultiChoiceField<C extends string = string> extends FieldBase<C[]> {
    readonly choices: readonly C[] | undefined;

    constructor(name: string, options: FieldOptions<C[]> & { choices?: readonly C[] } = {}) {
        super(name, "multiChoice", options);
        this.choices = options.choices;
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

/**
 * Single-select choice column. Nullable by construction (`null` ⇔ unset).
 * The value union is INFERRED from the `choices` array (SharePoint stores
 * choice values as display strings — no numeric label mapping like
 * Dataverse's `{ 1: "Draft" }`):
 *
 *   choice("Status", { choices: ["Draft", "Pending"] }) // "Draft" | "Pending" | null
 *
 * or typed explicitly via the generic when the list is built dynamically.
 */
export function choice<C extends string = string>(name: string, options?: FieldOptions<C> & { choices?: readonly C[] }) {
    return new ChoiceField(name, options);
}
export function multiChoice<C extends string = string>(name: string, options?: FieldOptions<C[]> & { choices?: readonly C[] }) {
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
 *   `FileRef` (absolute, built from the client's site URL). Non-null: every
 *   item of a document library *is* a file, so the absent-`FileRef` case
 *   (wrongly declared on a plain list, or a narrow read without `FileRef`)
 *   throws instead of surfacing a hollow `null`.
 * - delete: removing the content = deleting the item (`deleteRecord`); there
 *   is no "clear file" operation like Dataverse's `data: null` channel.
 * - large-file resumable sessions are out of scope for the flat surface.
 */
export class FileField extends FieldBase<FileRef> {
    /**
     * Content overwrite policy for the Files/Add channel (both create and
     * update paths). Default `true` — passing `{ data }` to save *is* the
     * explicit opt-in to replace content; `overwrite: false` makes SharePoint
     * fail on duplicate filenames instead.
     */
    readonly overwrite: boolean;

    constructor(name: string = "FileLeafRef", options: FieldOptions<FileRef> & { overwrite?: boolean } = {}) {
        super(name, "file", options);
        this.overwrite = options.overwrite !== false;
    }
    /** Never part of an item body — content goes through the Files/Add upload channel. */
    override toSharePoint(_value: FileRef): undefined {
        return undefined;
    }
}

export function document(name: string = "FileLeafRef", options?: FieldOptions<FileRef> & { overwrite?: boolean }) {
    return new FileField(name, options);
}

// --- comments (item-level channel, not a list column) ---

/** The author of an item comment — the same flattened principal as `person` reads. */
export type CommentAuthor = { id: number; name?: string; email?: string };

/** A `@mention` inside a comment text (placeholder `@mention{0}` on the wire). */
export type CommentMention = { name?: string; email?: string };

/**
 * A list-item comment (`Microsoft.SharePoint.Comments.comment`). Comments live
 * OUTSIDE the list item object — a separate REST surface
 * (`.../Items(id)/Comments`) that no `$select` can reach — so this type is the
 * flattened read shape of that surface, not of a column value.
 */
export type Comment = {
    /** Comment id as served (a numeric string). */
    id: string;
    text: string;
    author: CommentAuthor;
    createdDate: Date;
    /** `"0"` for top-level comments, the parent id for replies. */
    parentId: string;
    isReply: boolean;
    replyCount: number;
    likeCount: number;
    mentions: CommentMention[];
};

/**
 * Item comments channel for the modern list "activity feed". Like
 * {@link FileField}, the value never rides the item body — comments have no
 * column at all, they are a separate REST surface
 * (`.../Items(id)/Comments`):
 *
 * - read: `table.getRecord` populates the field via a follow-up
 *   `GET .../Comments` call; `getRecords` never fetches comments (N+1), and
 *   the key is simply absent from its records. `table.getComments(id)` is the
 *   explicit read.
 * - write: append-only. `table.addComment(id, text, mentions?)` POSTs the
 *   comment (author is always the authenticated caller — the surface has no
 *   post-on-behalf), `table.deleteComment(id, commentId)` removes one. There
 *   is no update: a PUT/PATCH surface does not exist (editing = delete +
 *   re-add, which changes authorship — not sugar-coated here).
 * - the item body can never carry a comments value: passing one to
 *   `createRecord`/`updateRecord` throws (see
 *   `SharePointTable.transformValueToSharePoint`).
 * - provisioning: nothing to define — comments are a platform feature of the
 *   list, not a schema column.
 * - replies/likes are out of scope for the flat surface (reachable via
 *   `client.getComments` + `$expand=replies` raw).
 */
export class CommentsField extends FieldBase<Comment[] | undefined> {
    /**
     * @param name informational only — comments have no wire name (no column,
     *   no `$select` presence). Defaults to `"Comments"`.
     */
    constructor(name: string = "Comments") {
        super(name, "comments");
    }
    /** Never part of an item body — comments ride their own REST surface. */
    override toSharePoint(_value: Comment[] | undefined): undefined {
        return undefined;
    }
    /** Only reachable via the explicit comments channel, never the item wire. */
    override fromSharePoint(_wire: unknown): Comment[] | undefined {
        throw new Error(`comments field "${this.name}" does not ride the item wire — read via table.getRecord or table.getComments`);
    }
}

export function comments(name?: string) {
    return new CommentsField(name);
}

/** Infers the TS record type from a fields map. */
export type InferRecord<TFields extends Record<string, FieldBase<any>>> = {
    [K in keyof TFields]: TFields[K] extends FieldBase<infer T> ? T : never;
};

/** The table's inferred record type via the phantom `T` property (`InferTable<typeof Tasks>`). */
export type InferTable<TTable extends { T: any }> = TTable["T"];

