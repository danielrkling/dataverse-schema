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

import { SharePointTable, type SharePointTableOptions } from "./table";
import { ChoiceField, DateField, DatetimeField, LookupField, MultiLookupField, MultiChoiceField, NumberField, PersonField, PeopleField, StringField, BooleanField, FieldBase } from "./fields";

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
    F extends PersonField | LookupField ? number | { id: number } | null :
    F extends StringField<infer S> ? S :
    F extends NumberField<infer N> ? N :
    F extends BooleanField ? boolean :
    F extends DateField<any> ? Date :
    F extends DatetimeField<any> ? Date :
    F extends MultiChoiceField<infer C> ? C :
    F extends PeopleField | MultiLookupField ? string :
    never;

/** The typed field refs a query callback receives (one per declared field). */
export type QueryProxy<TFields extends Record<string, FieldBase<any>>> = {
    [K in keyof TFields]: SPFieldRef<TFields[K], ValueOf<TFields[K]>>;
};

type ReferenceKeys<TFields extends Record<string, FieldBase<any>>> = {
    [K in keyof TFields]: TFields[K] extends PersonField | LookupField | PeopleField | MultiLookupField ? K : never;
}[keyof TFields];

/** `expand({ author: ["Id","Title"] })` — keys restricted to reference fields. */
export type ExpandSpec<TFields extends Record<string, FieldBase<any>>> = Partial<Record<ReferenceKeys<TFields>, readonly string[]>>;

// --- the builder ----------------------------------------------------------

export class SPQuery<TFields extends Record<string, FieldBase<any>>> {
    constructor(private readonly _table: SharePointTable<TFields>) {}

    private _select: string[] = [];
    private _expand: ExpandSpec<TFields> = {};
    private _filter: string | undefined;
    private _orderBy: Array<{ key: string; direction?: "asc" | "desc" }> = [];
    private _top: number | undefined;
    private _skip: number | undefined;

    /**
     * Declares the returned columns (typed refs from the table's field map).
     * Reference fields that are expanded (see {@link expand}) are added
     * automatically — only *expanded* reference fields need their `Id`/`Title`
     * carve-outs inside the select entries, which {@link expand} adds.
     */
    select(fields: (f: QueryProxy<TFields>) => (SPFieldRef<any, any> | string | undefined | null)[]): this {
        this._select = (fields(this.proxy()) ?? [])
            .map((entry: SPFieldRef<any, any> | string | undefined | null) => {
                if (typeof entry === "string") return { kind: "raw" as const, value: entry };
                if (!entry) return undefined;
                if (DEFAULT_CARVE_OUTS.has(entry.field.constructor as Function)) {
                    // Reference fields expand themselves: the carve-outs are the
                    // same for every column of that kind (person: Id/Title/EMail;
                    // lookup: Id/Title), so select() treats them as expands —
                    // no separate .expand() definition required.
                    this._expand[entry.key as ReferenceKeys<TFields>] ??= DEFAULT_CARVE_OUTS.get(entry.field.constructor as Function)!;
                    return undefined;
                }
                return { kind: "raw" as const, value: entry.name };
            })
            .filter((entry): entry is { kind: "raw"; value: string } => !!entry)
            .map((entry) => entry.value);
        return this;
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

    /** Builds the raw OData v3 query string (no leading `?`) for `table.getRecords`/`getRecord`. */
    build(): string {
        const parts: string[] = [];
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

    /** Fields on references read through the expanded parent (`Author/Id`). */
    private _tableKey(key: string): string {
        const field = (this._table.fields as Record<string, FieldBase<any>>)[key];
        return field?.name ?? key;
    }

    /** Cached typed proxy per builder instance. */
    private _proxy: QueryProxy<TFields> | undefined;
    private proxy(): QueryProxy<TFields> {
        this._proxy ??= buildProxy<TFields>(this._table.fields);
        return this._proxy;
    }
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
export type { SharePointTableOptions };
