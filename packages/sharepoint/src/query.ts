/**
 * Simple, proxy-based, type-safe query builder for the legacy `_api/web`
 * REST surface (OData v3) — a deliberately lighter sibling of the Dataverse
 * package's full builder (no lambdas, aggregations, or nav-AST; flat
 * select/filter/orderby/top/skip/expand only).
 *
 * @example
 * const q = Documents.query()
 *     .select((f) => [f.title, f.ko, f.status, f.author])
 *     .where((f) => and(eq(f.status, "Draft"), startsWith(f.title, "R")))
 *     .orderBy((f) => f.modified, "desc")
 *     .top(50);
 * // references selected above expand themselves (person: Id/Title/EMail,
 * // lookup: Id/Title); .expand({ author: ["JobTitle"] }) can add props.
 *
 * const items = await Documents.getRecords(q.build());
 */

import type { SharePointTable } from "./table";
import type { QueryRequestOptions } from "./client";
import { ChoiceField, CommentsField, DateField, DatetimeField, FileField, JsonField, LookupField, MultiLookupField, MultiChoiceField, NumberField, PersonField, PeopleField, StringField, BooleanField, FieldBase, type Comment, type InferRecord, type FileRef } from "./fields";

// --- field refs -----------------------------------------------------------

/** OData v3 literal rendering for filter values. */
function literal(value: unknown): string {
    if (typeof value === "string") return `'${value.replace(/'/g, "''")}'`;
    if (value instanceof Date) return `datetime'${value.toISOString().replace("Z", "").slice(0, 19)}'`;
    if (typeof value === "boolean") return value ? "true" : "false";
    if (typeof value === "number") return String(value);
    if (value == null) return "null";
    throw new Error(`Unsupported filter value: ${String(value)}`);
}

/** The id-bearing property a reference column filters on (`AuthorId`). */
function filterKey(field: FieldBase<any>): string {
    const isReference = field instanceof PersonField || field instanceof LookupField;
    return (isReference ? `${field.name}Id` : field.name);
}

/**
 * A typed handle to one table field inside a query. Comparators are free
 * functions (eq/ne/gt/…/startsWith) that take a ref + value; the value types
 * follow the field kind (choices: display strings, reference fields: ids.
 */
export class SPFieldRef<F extends FieldBase<any>, TValue = any> {
    readonly field: F;
    /** The wire/column name written into $select/$expand (e.g. `Author`). */
    readonly name: string;
    /** No runtime value — mirrors field.T inside queries/picks. */
    declare T: InferRecord<Record<string, F>>[string];
    /** The TypeScript property key in the table's field map. */
    readonly key: string;

    constructor(field: F, key = field.name) {
        this.field = field;
        this.key = key;
        this.name = field.name;
    }

    /** Raw select key that flows to `$select` (documented for expand carve-outs). */
    toString(): string {
        return this.name;
    }
}

// --- filter plumbing ------------------------------------------------------

/** `and`/`or` join filter fragments; `not()` inverts one. */
export function and(...parts: (string | false | null | undefined)[]): string {
    const joined = parts.filter((p) => typeof p === "string");
    if (!joined.length) return "";
    return joined.length === 1 ? joined[0]! : `(${joined.join(" and ")})`;
}

export function or(...parts: (string | false | null | undefined)[]): string {
    const joined = parts.filter((p) => typeof p === "string");
    if (!joined.length) return "";
    return joined.length === 1 ? joined[0]! : `(${joined.join(" or ")})`;
}

export function not(expr: string): string {
    return `not ${expr}`;
}

/** `Field eq null` / `Field ne null` (the unset sentinel for nullable columns). */
export function isNull(ref: { field: FieldBase<any> }): string {
    return `${filterKey(ref.field)} eq null`;
}
export function isNotNull(ref: { field: FieldBase<any> }): string {
    return `${filterKey(ref.field)} ne null`;
}

// --- typed proxies --------------------------------------------------------

type ValueOf<F extends FieldBase<any>> =
    F extends ChoiceField<infer C> ? C :
    F extends PersonField | LookupField ? number :
    F extends StringField<infer S> ? S :
    F extends NumberField<infer N> ? N :
    F extends BooleanField ? boolean :
    F extends DateField<any> ? Date :
    F extends DatetimeField<any> ? Date :
    F extends MultiChoiceField<infer C> ? C :
    F extends PeopleField | MultiLookupField | MultiChoiceField<infer C> ? string :
    never;

/** The typed field refs a query callback receives (one per declared field). */
export type QueryProxy<TFields extends Record<string, FieldBase<any>>> = {
    [K in keyof TFields]: SPFieldRef<TFields[K], ValueOf<TFields[K]>>;
};

type ReferenceKeys<TFields extends Record<string, FieldBase<any>>> = {
    [K in keyof TFields]: TFields[K] extends PersonField | LookupField | PeopleField | MultiLookupField ? K : never;
}[keyof TFields];

/** The value type one field reads back as (record-side, not comparator-side). */
type ReadValueOf<F extends FieldBase<any>> =
    F extends ChoiceField<infer C> ? C | null :
    F extends PersonField | LookupField ? { id: number; name?: string; email?: string } | null :
    F extends PeopleField | MultiLookupField ? Array<{ id: number; name?: string; email?: string }> :
    F extends StringField<infer S> ? S :
    F extends NumberField<infer N> ? N :
    F extends BooleanField ? boolean :
    F extends DateField<any> | DatetimeField<any> ? Date | null :
    F extends JsonField<infer J> ? J :
    F extends FileField ? FileRef :
    F extends CommentsField ? Comment[] :
    never;

/** A `.select()` pick: each ref maps to its read value type under the same key. */
export type PickedRecord<P extends object> = {
    [K in keyof P]: P[K] extends SPFieldRef<infer F, any> ? ReadValueOf<F & FieldBase<any>> : never;
};

/** `expand({ author: ["Id","Title"] })` — keys restricted to reference fields. */
export type ExpandSpec<TFields extends Record<string, FieldBase<any>>> = Partial<Record<ReferenceKeys<TFields>, readonly string[]>>;

// --- the builder ----------------------------------------------------------

export class SPQuery<
    TFields extends Record<string, FieldBase<any>>,
    TResult extends Record<string, any> = InferRecord<TFields>,
> {
    constructor(private readonly _table: SharePointTable<TFields>) {}

    private _select: string[] = [];
    private _expand: ExpandSpec<TFields> = {};
    private _filter: string | undefined;
    private _orderBy: Array<{ key: string; direction?: "asc" | "desc" }> = [];
    private _top: number | undefined;
    private _skip: number | undefined;

    /**
     * Declares the returned columns and FIXES the builder's result type to
     * exactly the picked subset:
     *
     *   .select((f) => ({ id: f.id, status: f.status }))   // → Promise<{ id: number; status: "…" | null }[]>
     *
     * Reference fields that are expanded (see {@link expand}) are added
     * automatically — only *expanded* reference fields need their `Id`/`Title`
     * carve-outs inside the select entries, which {@link expand} adds.
     */
    select<P extends { [K in keyof TFields & string]?: SPFieldRef<any, any> }>(
        fields: (f: QueryProxy<TFields>) => P,
    ): SPQuery<TFields, PickedRecord<P>> {
        this._select = Object.values(fields(this.proxy()) ?? {})
            .map((entry) => {
                if (!entry) return undefined;
                if (entry.field instanceof CommentsField) {
                    return undefined; // comments have no $select presence — read via getRecord/getComments
                }
                if (DEFAULT_CARVE_OUTS.has(entry.field.constructor as Function)) {
                    // Reference fields expand themselves: the carve-outs are the
                    // same for every column of that kind (person: Id/Title/EMail;
                    // lookup: Id/Title), so select() treats them as expands —
                    // no separate .expand() definition required.
                    this._expand[entry.key as ReferenceKeys<TFields>] ??= DEFAULT_CARVE_OUTS.get(entry.field.constructor as Function)!;
                    return undefined;
                }
                return entry.name;
            })
            .filter((entry): entry is string => !!entry);
        return this as unknown as SPQuery<TFields, PickedRecord<P>>;
    }

    /**
     * Expands reference/collection fields and adds their property carve-outs
     * to `$select` (`Author/Id, Author/Title`) — the same spell the legacy
     * surface expects from `$select=$expand` pairs. Only needed to override or
     * *add* properties: plain references selected via {@link select} expand
     * themselves with the standard carve-outs. Additional `.expand()` calls
     * for the same key append props.
     */
    expand(spec: ExpandSpec<TFields>): this {
        const entries = spec as Partial<Record<string, readonly string[]>>;
        for (const key of Object.keys(entries)) {
            const props = entries[key];
            if (!props?.length) continue;
            const existing = (this._expand as Partial<Record<string, readonly string[]>>)[key] ?? [];
            (this._expand as Partial<Record<string, readonly string[]>>)[key] = [...new Set([...existing, ...props])];
        }
        return this;
    }

    /** Filter fragments via the proxy helpers (`and(...)`, refs' comparisons). */
    where(expr: (f: QueryProxy<TFields>) => string | string[]): this {
        const raw = expr(this.proxy());
        const joined = Array.isArray(raw) ? and(...raw) : raw;
        this._filter = this._filter ? `(${this._filter}) and (${joined})` : joined;
        return this;
    }

    orderBy(field: (f: QueryProxy<TFields>) => SPFieldRef<any, any> | string, direction?: "asc" | "desc"): this {
        const ref = field(this.proxy());
        this._orderBy.push({ key: typeof ref === "string" ? ref : ref.name, direction });
        return this;
    }

    top(count: number): this { this._top = count; return this; }
    skip(count: number): this { this._skip = count; return this; }

    /**
     * Builds the raw OData v3 query string (no leading `?`) for `table.getRecords`/`getRecord`.
     *
     * With no `.select()` the default is "everything declared on the table":
     * every plain field, the document field's `FileRef` mirror, and every
     * reference field expanded with its standard carve-outs.
     *
     * Note: `__metadata` is deliberately NOT added to `$select` — the legacy
     * `_api/web` surface rejects it as a selectable property on some tenants.
     * `__metadata.etag` rides along on responses as served; when a MERGE needs
     * a guaranteed `$etag` after a narrow read, re-fetch the record (table
     * `getRecord`) or pass `ifMatch: "*"` explicitly.
     */
    /** Runs the built query against its own table and resolves the picked record type. */
    async execute(options: QueryRequestOptions = {}): Promise<TResult[]> {
        const rows = await this._table.getRecords(this.build(), options);
        return rows as unknown as TResult[];
    }

    build(): string {
        const parts: string[] = [];
        if (this._select.length === 0 && Object.keys(this._expand).length === 0) {
            const projection = defaultProjection(this._table);
            this._select = projection.select;
            Object.assign(this._expand as Record<string, readonly string[]>, projection.expand);
        }
        const selectEntries = [...this._select];
        const expandKeys = Object.keys(this._expand) as ReferenceKeys<TFields>[];
        for (const key of expandKeys) {
            const props = (this._expand as Record<string, readonly string[]>)[key as string];
            if (!props || props.length === 0) continue;
            for (const prop of props) selectEntries.push(`${this._tableKey(String(key))}/${prop}`);
        }
        if (selectEntries.length) parts.push(`$select=${selectEntries.join(",")}`);
        if (expandKeys.length) {
            parts.push(`$expand=${expandKeys.map((key) => this._tableKey(String(key))).join(",")}`);
        }
        if (this._filter && this._filter !== "") parts.push(`$filter=${this._filter}`);
        if (this._orderBy.length) {
            parts.push(`$orderby=${this._orderBy.map((entry) => `${entry.key}${entry.direction ? ` ${entry.direction}` : ""}`).join(",")}`);
        }
        if (this._top != null) parts.push(`$top=${this._top}`);
        if (this._skip != null) parts.push(`$skip=${this._skip}`);
        return parts.join("&");
    }

    /** Cached typed proxy per builder instance. */
    private _proxy: QueryProxy<TFields> | undefined;
    private proxy(): QueryProxy<TFields> {
        this._proxy ??= buildProxy<TFields>(this._table.fields);
        return this._proxy;
    }

    /** Fields on references read through the expanded parent (`Author/Id`). */
    private _tableKey(key: string): string {
        return fieldName(this._table, key);
    }
}

/** The field's SharePoint (logical) name, falling back to the key itself. */
function fieldName(table: SharePointTable<any>, key: string): string {
    return (table.fields as Record<string, FieldBase<any>>)[key]?.name ?? key;
}

/**
 * Default full projection: every declared plain field + `FileRef` mirror for
 * file channels; reference fields ride `$expand` with their standard carve-outs
 * (a bare `/Items` response only serves `[Field]Id` numbers, and the expanded
 * shapes are what the reference readers document). Consumed by the builder's
 * `build()` when no `.select()` was given and by the table's plain
 * `getRecord`/`getRecords` when the caller passes no query.
 */
export function defaultProjection(table: SharePointTable<any>): { select: string[]; expand: Record<string, readonly string[]> } {
    const select: string[] = [];
    const expand: Record<string, readonly string[]> = {};
    const fields = table.fields as Record<string, FieldBase<any>>;
    for (const key of Object.keys(fields)) {
        const field = fields[key];
        const carve = DEFAULT_CARVE_OUTS.get(field?.constructor as Function);
        if (carve) {
            expand[key] = carve;
            continue; // references ride $expand, not $select
        }
        if (field instanceof CommentsField) {
            continue; // comments have no column — their channel is a per-item follow-up call, never $select
        }
        if (field instanceof FileField) {
            select.push("FileLeafRef", "FileRef"); // the file channel reads hardcode these wire names
            continue;
        }
        select.push(field.name);
    }
    return { select, expand };
}

/** The default projection rendered as a raw OData v3 query string. */
export function defaultQuery(table: SharePointTable<any>): string {
    const projection = defaultProjection(table);
    const parts: string[] = [];
    const expandKeys = Object.keys(projection.expand);
    const selectEntries = [...projection.select];
    for (const key of expandKeys) {
        for (const prop of projection.expand[key]) selectEntries.push(`${fieldName(table, key)}/${prop}`);
    }
    if (selectEntries.length) parts.push(`$select=${selectEntries.join(",")}`);
    if (expandKeys.length) parts.push(`$expand=${expandKeys.map((key) => fieldName(table, key)).join(",")}`);
    return parts.join("&");
}

/**
 * Standard expand carve-outs per reference field kind — `select()` expands
 * these automatically; `.expand()` overrides/adds per key.
 */
const DEFAULT_CARVE_OUTS = new Map<Function, readonly string[]>([
    [PersonField, ["Id", "Title", "EMail"]],
    [PeopleField, ["Id", "Title", "EMail"]],
    [LookupField, ["Id", "Title"]],
    [MultiLookupField, ["Id", "Title"]],
]);

/** Free-function comparators — function style reads better in `and`/`or` chains. */
type AnyRef = SPFieldRef<FieldBase<any>, any>;
type RefValue<R> = R extends SPFieldRef<any, infer V> ? V : never;

/** Reference fields filter on numeric ids; `{ id }` objects are accepted too. */
function filterValue(value: unknown): unknown {
    if (value !== null && typeof value === "object") {
        const id = (value as { id?: unknown }).id;
        return typeof id === "number" ? id : value;
    }
    return value;
}

function cmp(op: string, ref: AnyRef, value: unknown): string {
    return `${filterKey(ref.field)} ${op} ${literal(filterValue(value))}`;
}

export function eq<R extends AnyRef>(ref: R, value: RefValue<R>): string { return cmp("eq", ref, value); }
export function ne<R extends AnyRef>(ref: R, value: RefValue<R>): string { return cmp("ne", ref, value); }
export function gt<R extends AnyRef>(ref: R, value: RefValue<R>): string { return cmp("gt", ref, value); }
export function ge<R extends AnyRef>(ref: R, value: RefValue<R>): string { return cmp("ge", ref, value); }
export function lt<R extends AnyRef>(ref: R, value: RefValue<R>): string { return cmp("lt", ref, value); }
export function le<R extends AnyRef>(ref: R, value: RefValue<R>): string { return cmp("le", ref, value); }
export function contains<R extends AnyRef>(ref: R, value: string): string {
    // OData v3: no `contains()` — `substringof` with inverted args.
    return `substringof(${literal(value)}, ${filterKey(ref.field)}) eq true`;
}
export function startsWith<R extends AnyRef>(ref: R, value: string): string {
    return `startswith(${filterKey(ref.field)}, ${literal(value)})`;
}
export function endsWith<R extends AnyRef>(ref: R, value: string): string {
    return `endswith(${filterKey(ref.field)}, ${literal(value)})`;
}

/** Per-call-site proxy over the table's declared fields (typed keys + refs). */
export function buildProxy<TFields extends Record<string, FieldBase<any>>>(fields: TFields): QueryProxy<TFields> {
    const proxy = {} as QueryProxy<TFields>;
    for (const key of Object.keys(fields)) {
        proxy[key as keyof QueryProxy<TFields>] = new SPFieldRef((fields as Record<string, FieldBase<any>>)[key], key) as QueryProxy<TFields>[keyof QueryProxy<TFields>];
    }
    return proxy;
}

/** Entry point: `SharePointTable.query()` — implemented in table.ts. */
export function spQuery<TFields extends Record<string, FieldBase<any>>>(table: SharePointTable<TFields>): SPQuery<TFields> {
    return new SPQuery(table);
}
