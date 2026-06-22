import { DataverseTable } from "./table"
import { GenericProperties, Infer } from "./types"
import { LookupProperty, CollectionProperty } from "./fields"
import { getName } from "./util"
import { FilterExpr } from "./filter"

const proxyTableMap = new WeakMap<object, DataverseTable<any>>()

// --- Aggregation ---

/**
 * Phantom branded string that carries the inferred TypeScript type of a Dataverse field.
 * At runtime it is just a string (the OData field name).
 */
export type FieldRef<T, K extends string = string> = string & { __fieldType: T; __key: K }

/**
 * Represents a server-side aggregation expression usable in OData `$apply` and FetchXML.
 * Created via factory functions like `avg()`, `sum()`, `min()`, `max()`, `count()`.
 */
export class Aggregation<TValue = number> {
  constructor(
    readonly operation: string,
    readonly field?: string,
    readonly alias?: string,
  ) {}

  /** OData format (e.g. `"title with average as avg_title"`). */
  toOdata(alias?: string): string {
    const a = alias ?? this.alias
    if (this.operation === "count" || this.operation === "countdistinct") {
      return a ? `$count as ${a}` : `$count`
    }
    const resolvedAlias = a ?? this.field
    return `${this.field} with ${this.operation} as ${resolvedAlias}`
  }

  /** FetchXML format (e.g. `name="title" alias="avg_title" aggregate="avg"`). */
  toXml(alias?: string): string {
    if (!this.field) return ""
    const a = alias ?? this.alias ?? this.field
    return `name="${this.field}" alias="${a}" aggregate="${this.operation}"`
  }

  toString(): string {
    return this.toOdata()
  }
}

/** Average aggregation. `avg(field)` or `avg("field_name")`. */
export function avg<TValue>(name: FieldRef<TValue>, alias?: string): Aggregation<TValue>
export function avg(name: string, alias?: string): Aggregation<number>
export function avg(name: any, alias?: string): Aggregation<number> {
  return new Aggregation<number>("average", name, alias)
}

/** Sum aggregation. */
export function sum<TValue>(name: FieldRef<TValue>, alias?: string): Aggregation<TValue>
export function sum(name: string, alias?: string): Aggregation<number>
export function sum(name: any, alias?: string): Aggregation<number> {
  return new Aggregation<number>("sum", name, alias)
}

/** Minimum aggregation. */
export function min<TValue>(name: FieldRef<TValue>, alias?: string): Aggregation<TValue>
export function min(name: string, alias?: string): Aggregation<number>
export function min(name: any, alias?: string): Aggregation<number> {
  return new Aggregation<number>("min", name, alias)
}

/** Maximum aggregation. */
export function max<TValue>(name: FieldRef<TValue>, alias?: string): Aggregation<TValue>
export function max(name: string, alias?: string): Aggregation<number>
export function max(name: any, alias?: string): Aggregation<number> {
  return new Aggregation<number>("max", name, alias)
}

/** Count aggregation. `count()` for OData, `count(field)` or `count(field, alias)` for FetchXML. */
export function count(alias?: string): Aggregation<number>
export function count(field: string, alias?: string): Aggregation<number>
export function count(fieldOrAlias?: string, alias?: string): Aggregation<number> {
  if (fieldOrAlias === undefined) {
    return new Aggregation<number>("count", undefined, alias)
  }
  if (alias !== undefined) {
    return new Aggregation<number>("count", fieldOrAlias, alias)
  }
  return new Aggregation<number>("count", fieldOrAlias)
}

// --- OData Query Types ---

type NavKeys<T> = {
  [K in keyof T]: T[K] extends LookupProperty<any> | CollectionProperty<any> ? K : never
}[keyof T]

type ValueKeys<T> = {
  [K in keyof T]: T[K] extends LookupProperty<any> | CollectionProperty<any> ? never : K
}[keyof T]

type RelatedProps<T, K extends keyof T> = T[K] extends LookupProperty<infer P> ? P
  : T[K] extends CollectionProperty<infer P> ? P
  : never

type ExpandResult<T, K extends keyof T, R> =
  T[K] extends CollectionProperty<any> ? R[] : (R | null)

type ODataLambdaProxy<P extends GenericProperties> = {
  [K in keyof P]: string;
}

type ODataCollectionNavProxy<P extends GenericProperties> = {
  toString(): string;
} & ODataFieldProxy<P>

type ODataLookupNavProxy<P extends GenericProperties> = {
  toString(): string;
} & ODataFieldProxy<P>

type ODataFieldProxy<T extends GenericProperties> = {
  [K in keyof T]: T[K] extends CollectionProperty<infer P> ? ODataCollectionNavProxy<P>
    : T[K] extends LookupProperty<infer P> ? ODataLookupNavProxy<P>
    : FieldRef<Infer<T[K]>, K extends string ? K : never>
}

/** Extract a record type from an array of `FieldRef` values, using their phantom keys. */
type GroupByFields<TFields extends FieldRef<any, string>[]> = {
  [P in TFields[number] as P extends FieldRef<any, infer K> ? K : never]:
    P extends FieldRef<infer V, any> ? V : never
}

/**
 * A type-safe OData query builder for Dataverse.
 *
 * Create one via {@link fetchOdata} — never instantiate directly.
 *
 * @example
 * const q = fetchOdata(Person)
 *   .select("name", "age")
 *   .where(f => equals(f.name, "John"))
 *   .orderby(f => f.name)
 *   .top(10);
 *
 * const results = await q.execute();
 */
export class ODataQuery<T extends GenericProperties, TResult = Infer<T>> {
  private _table: DataverseTable<T>
  private _fields: string[] = []
  private _filters: string[] = []
  private _expands: Array<{ name: string; query: string }> = []
  private _orderby: Array<{ name: string; dir: "asc" | "desc" }> = []
  private _top?: number
  private _apply = ""
  private _proxy: ODataFieldProxy<T>

  constructor(table: DataverseTable<T>) {
    this._table = table
    this._proxy = this._buildProxy()
    this._selectDefaults()
  }

  private _selectDefaults(): void {
    for (const prop of Object.values(this._table.fields) as any[]) {
      if (prop.kind === "value" || prop.type === "lookupId" || prop.type === "file") {
        this._fields.push(prop.fromDataverseName ?? prop.name)
      }
    }
  }

  private _buildProxy(): ODataFieldProxy<T> {
    return this._buildProxyForDataverseTable(this._table) as any
  }

  private _buildProxyForDataverseTable(table: DataverseTable<any>, prefix?: string): Record<string, any> {
    const proxy: Record<string, any> = {}
    const fields = table.fields as Record<string, any>
    for (const [key, prop] of Object.entries(fields)) {
      const dataverseName = prop.fromDataverseName ?? prop.name
      const isCollection = prop.kind === "navigation" && prop.type === "collection"
      const isLookup = prop.kind === "navigation" && prop.type === "lookup"
      if (isCollection || isLookup) {
        const navProp = prop as LookupProperty<any> | CollectionProperty<any>
        const currentPrefix = prefix ? `${prefix}/${dataverseName}` : dataverseName
        let cached: Record<string, any> | undefined
        Object.defineProperty(proxy, key, {
          get: () => {
            if (!cached) {
              const sub = this._buildProxyForDataverseTable(navProp.table, currentPrefix)
              sub.toString = () => dataverseName
              if (isCollection) {
                proxyTableMap.set(sub, navProp.table)
              }
              cached = sub
            }
            return cached
          },
          enumerable: true,
          configurable: true,
        })
      } else {
        proxy[key] = prefix ? `${prefix}/${dataverseName}` : dataverseName
      }
    }
    return proxy
  }

  /**
   * Restricts the returned columns to the specified fields.
   * By default, all value columns are selected.
   *
   * @param keys One or more value-field keys (navigation properties are excluded).
   *
   * @example
   * fetchOdata(Person).select("name", "age");
   */
  select<K extends ValueKeys<T>>(...keys: K[]): ODataQuery<T, { [P in K]: Infer<T[P]> }> {
    this._fields = keys.map(k => this._proxy[k] as string)
    return this as any
  }

  /**
   * Adds a `$filter` clause. Can be a raw string or a callback receiving a
   * typed field proxy. Multiple `.where()` calls stack with `and`.
   *
   * @example
   * fetchOdata(Person).where(f => equals(f.name, "John"));
   *
   * @example
   * // Multiple calls stack:
   * fetchOdata(Person)
   *   .where(f => equals(f.name, "John"))
   *   .where(f => greaterThan(f.age, 20));
   */
  where(filter: string): this
  where(filter: FilterExpr): this
  where(filter: (f: ODataFieldProxy<T>) => string | FilterExpr): this
  where(filter: string | FilterExpr | ((f: ODataFieldProxy<T>) => string | FilterExpr)): this {
    let str: string
    if (filter instanceof FilterExpr) {
      str = filter.toOdata()
    } else if (typeof filter === "function") {
      const result = filter(this._proxy)
      str = result instanceof FilterExpr ? result.toOdata() : result
    } else {
      str = filter
    }
    this._filters.push(str)
    return this
  }

  /**
   * Adds a `$expand` clause for a navigation property.
   *
   * @example
   * fetchOdata(Person)
   *   .select("name")
   *   .expand("primaryAddress", sub => sub.select("street", "zip"));
   *
   * @example
   * // Nested expand:
   * fetchOdata(Person)
   *   .expand("primaryAddress", sub =>
   *     sub.expand("location", sub2 => sub2.select("name"))
   *   );
   */
  expand<K extends string & NavKeys<T>, R>(
    key: K,
    sub: (q: ODataQuery<RelatedProps<T, K>>) => ODataQuery<RelatedProps<T, K>, R>,
  ): ODataQuery<T, Omit<TResult, K & keyof TResult> & { [P in K]: ExpandResult<T, P, R> }> {
    const prop = this._table.fields[key] as LookupProperty<any> | CollectionProperty<any>
    const child = new ODataQuery(prop.table) as unknown as ODataQuery<RelatedProps<T, K>>
    const result = sub(child)
    const q = result ?? child
    this._expands.push({ name: prop.name, query: q._build(true) })
    return this as any
  }

  /**
   * Adds a `$orderby` clause. The callback receives a field proxy to select
   * a field. Direction defaults to `"asc"`. Multiple calls accumulate.
   *
   * @example
   * fetchOdata(Person).orderby(f => f.name);
   * fetchOdata(Person).orderby(f => f.age, "desc");
   */
  orderby(fieldSelector: (f: ODataFieldProxy<T>) => string, direction: "asc" | "desc" = "asc"): this {
    this._orderby.push({ name: fieldSelector(this._proxy), dir: direction })
    return this
  }

  /** Limits the number of returned records (`$top`). */
  top(n: number): this {
    this._top = n
    return this
  }

  /**
   * Adds a `$apply` expression with optional grouping and aggregations.
   *
   * @param selectFields Callback returning the field refs to group by.
   *   Pass `() => []` to aggregate the whole table without grouping.
   * @param aggFields Optional callback returning a record of alias → Aggregation.
   *
   * @example
   * fetchOdata(Person).groupby(
   *   f => [f.age],
   *   f => ({ total: sum(f.age) }),
   * );
   *
   * @example
   * // Aggregate without grouping:
   * fetchOdata(Person).groupby(
   *   () => [],
   *   f => ({ total: sum(f.age) }),
   * );
   *
   * @example
   * // Just groupby without aggregates:
   * fetchOdata(Person).groupby(f => [f.age]);
   */
  groupby<const TFields extends FieldRef<any, string>[], A extends Record<string, Aggregation>>(
    selectFields: (f: ODataFieldProxy<T>) => TFields,
    aggFields: (f: ODataFieldProxy<T>) => A,
  ): ODataQuery<T, GroupByFields<TFields> & { [P in keyof A]: A[P] extends Aggregation<infer V> ? V : number }>
  groupby<const TFields extends FieldRef<any, string>[]>(
    selectFields: (f: ODataFieldProxy<T>) => TFields,
  ): ODataQuery<T, GroupByFields<TFields>>
  groupby(
    selectFields: (f: ODataFieldProxy<T>) => any[],
    aggFields?: (f: ODataFieldProxy<T>) => Record<string, Aggregation>,
  ): ODataQuery<T, any> {
    const groupByNames = selectFields(this._proxy as any) as string[]
    const aggStrings = aggFields
      ? Object.entries(aggFields(this._proxy as any)).map(([alias, agg]) => agg.toOdata(alias))
      : []
    if (groupByNames.length > 0 && aggStrings.length > 0) {
      this._apply = `groupby((${groupByNames.join(",")}),aggregate(${aggStrings.join(",")}))`
    } else if (groupByNames.length > 0) {
      this._apply = `groupby((${groupByNames.join(",")}))`
    } else if (aggStrings.length > 0) {
      this._apply = `aggregate(${aggStrings.join(",")})`
    }
    return this
  }

  private _build(forExpand = false): string {
    const parts: string[] = []
    const joinChar = forExpand ? ";" : "&"
    if (this._fields.length) parts.push(`$select=${this._fields.join(",")}`)
    if (this._filters.length === 1) {
      parts.push(`$filter=${this._filters[0]}`)
    } else if (this._filters.length > 1) {
      parts.push(`$filter=${this._filters.join(" and ")}`)
    }
    if (this._orderby.length) {
      parts.push(`$orderby=${this._orderby.map(o => `${o.name} ${o.dir}`).join(",")}`)
    }
    if (this._expands.length) {
      parts.push(`$expand=${this._expands.map(e => {
        return e.query ? `${e.name}(${e.query})` : e.name
      }).join(",")}`)
    }
    if (this._top !== undefined) parts.push(`$top=${this._top}`)
    if (this._apply) parts.push(`$apply=${this._apply}`)
    return parts.join(joinChar)
  }

  toString(): string {
    return this._build()
  }

  async execute(): Promise<TResult[]> {
    const qs = this.toString()
    if (!qs) return this._table.getRecords() as Promise<TResult[]>
    const raw = await this._table.client.getRecords(this._table.entitySetName, qs)
    return raw.map((v: unknown) => this._table.transformValueFromDataverse(v)) as TResult[]
  }
}

function buildLambdaProxy<P extends GenericProperties>(
  alias: string,
  table: DataverseTable<P>,
): ODataLambdaProxy<P> {
  const fields = table.fields as Record<string, any>
  const proxy = {} as Record<string, string>
  for (const [key, prop] of Object.entries(fields)) {
    proxy[key] = `${alias}/${prop.fromDataverseName ?? prop.name}`
  }
  return proxy as ODataLambdaProxy<P>
}

export function any<P extends GenericProperties>(
  proxy: ODataCollectionNavProxy<P>,
  condition: (x: ODataLambdaProxy<P>) => string | FilterExpr,
): FilterExpr {
  const alias = "x"
  const table = proxyTableMap.get(proxy as object)
  if (!table) throw new Error("any() requires a collection navigation proxy")
  const result = condition(buildLambdaProxy(alias, table as DataverseTable<P>))
  return new FilterExpr({ type: "lambda", field: String(proxy), operator: "any", alias, condition: result instanceof FilterExpr ? result.toOdata() : result })
}

export function all<P extends GenericProperties>(
  proxy: ODataCollectionNavProxy<P>,
  condition: (x: ODataLambdaProxy<P>) => string | FilterExpr,
): FilterExpr {
  const alias = "x"
  const table = proxyTableMap.get(proxy as object)
  if (!table) throw new Error("all() requires a collection navigation proxy")
  const result = condition(buildLambdaProxy(alias, table as DataverseTable<P>))
  return new FilterExpr({ type: "lambda", field: String(proxy), operator: "all", alias, condition: result instanceof FilterExpr ? result.toOdata() : result })
}

export function fetchOdata<T extends GenericProperties>(table: DataverseTable<T>): ODataQuery<T, Infer<T>> {
  return new ODataQuery(table)
}
