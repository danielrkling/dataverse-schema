import { DataverseTable } from "./table"
import { GenericProperties, Infer } from "./types"
import { LookupProperty, CollectionProperty } from "./fields"
import { getName, Etag } from "./util"
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
 * Created via factory functions like `sum()`, `min()`, `max()`, `count()`.
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

/**
 * Represents a field used for grouping inside an `apply()` expression.
 * Created via the `groupby()` helper function.
 */
export class GroupByExpr<TValue = unknown> {
  declare private __type: TValue
  readonly field: string
  constructor(field: string) {
    this.field = field
  }
}

/** Group a field inside an `apply()` expression. */
export function groupby<TValue>(ref: FieldRef<TValue>): GroupByExpr<TValue>
export function groupby(ref: string): GroupByExpr<unknown>
export function groupby(ref: any): GroupByExpr<any> {
  return new GroupByExpr(ref as string)
}

/** Average aggregation. `average(field)` or `average("field_name")`. */
export function average<TValue>(name: FieldRef<TValue>, alias?: string): Aggregation<TValue>
export function average(name: string, alias?: string): Aggregation<number>
export function average(name: any, alias?: string): Aggregation<number> {
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

type CollectionKeys<T> = {
  [K in keyof T]: T[K] extends CollectionProperty<any> ? K : never
}[keyof T]

type LookupKeys<T> = {
  [K in keyof T]: T[K] extends LookupProperty<any> ? K : never
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

/** Extract the result type from an `apply()` record. */
type ApplyResultType<R extends Record<string, GroupByExpr<any> | Aggregation<any>>> = {
  [K in keyof R]: R[K] extends GroupByExpr<infer V> ? V
    : R[K] extends Aggregation<infer V> ? V
    : never
}

/** Proxy type for `orderby` after `apply()`, mapping alias names to FieldRefs. */
type ApplyAliasProxy<R extends Record<string, any>> = {
  [K in keyof R]: FieldRef<R[K], K extends string ? K : never>
}

/**
 * A type-safe OData query builder for Dataverse.
 *
 * Create one via {@link fetchOdata} — never instantiate directly.
 *
 * @example
 * const q = fetchOdata(Person)
 *   .select("name", "age")
 *   .filter(f => equals(f.name, "John"))
 *   .orderby(f => f.name)
 *   .top(10);
 *
 * const results = await q.execute();
 */
export class ODataQuery<T extends GenericProperties, TResult = Infer<T>> {
  private _table: DataverseTable<T>
  private _fields: string[] = []
  private _selectedKeys: string[] = []
  private _filters: string[] = []
  private _expands: Array<{ name: string; key: string; query: string }> = []
  private _orderby: Array<{ name: string; dir: "asc" | "desc" }> = []
  private _top?: number
  private _apply = ""
  private _isApply = false
  private _expandMode: "full" | "collection" | "lookup" = "full"
  private _proxy: ODataFieldProxy<T>
  private _applyAliasProxy: Record<string, string> = {}

  constructor(table: DataverseTable<T>) {
    this._table = table
    this._proxy = this._buildProxy()
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
   * Selects all value columns (no-args) or restricts to the specified fields.
   *
   * @example
   * fetchOdata(Person).select();
   * fetchOdata(Person).select("name", "age");
   */
  select(): ODataQuery<T, Infer<T>>
  select<K extends ValueKeys<T>>(...keys: K[]): ODataQuery<T, { [P in K]: Infer<T[P]> }>
  select<K extends ValueKeys<T>>(...keys: K[]): any {
    if (this._isApply) throw new Error("select() is not supported after apply()")
    if (keys.length === 0) {
      this._fields = []
      this._selectedKeys = []
      for (const prop of Object.values(this._table.fields) as any[]) {
        if (prop.kind === "value" || prop.type === "lookupId" || prop.type === "file") {
          this._fields.push(prop.fromDataverseName ?? prop.name)
        }
      }
    } else {
      this._fields = keys.map(k => this._proxy[k] as string)
      this._selectedKeys = keys as string[]
    }
    return this as any
  }

  /**
   * Adds a `$filter` clause. Can be a raw string or a callback receiving a
   * typed field proxy. Multiple `.filter()` calls stack with `and`.
   *
   * @example
   * fetchOdata(Person).filter(f => eq(f.name, "John"));
   *
   * @example
   * // Multiple calls stack:
   * fetchOdata(Person)
   *   .filter(f => equals(f.name, "John"))
   *   .filter(f => greaterThan(f.age, 20));
   */
  filter(filter: string): this
  filter(filter: FilterExpr): this
  filter(filter: (f: ODataFieldProxy<T>) => string | FilterExpr): this
  filter(filter: string | FilterExpr | ((f: ODataFieldProxy<T>) => string | FilterExpr)): this {
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
  expand<K extends CollectionKeys<T>, R>(
    key: K,
    sub?: (q: Omit<ODataQuery<RelatedProps<T, K>>, 'apply'>) => ODataQuery<RelatedProps<T, K>, R>,
  ): ODataQuery<T, Omit<TResult, K & keyof TResult> & { [P in K]: ExpandResult<T, P, R> }>
  expand<K extends LookupKeys<T>, R>(
    key: K,
    sub?: (q: Omit<ODataQuery<RelatedProps<T, K>>, 'orderby' | 'top' | 'apply'>) => ODataQuery<RelatedProps<T, K>, R>,
  ): ODataQuery<T, Omit<TResult, K & keyof TResult> & { [P in K]: ExpandResult<T, P, R> }>
  expand<K extends string & NavKeys<T>, R>(
    key: K,
    sub?: (q: any) => any,
  ): any {
    if (this._isApply) throw new Error("expand() is not supported after apply()")
    const prop = this._table.fields[key] as LookupProperty<any> | CollectionProperty<any>
    const isCollection = prop.type === "collection"
    if (this._expandMode === "collection" && isCollection) {
      throw new Error("expand() within a collection expand only supports lookup navigation properties")
    }
    const child = new ODataQuery(prop.table) as unknown as ODataQuery<RelatedProps<T, K>>
    child._expandMode = isCollection ? "collection" : "lookup"
    const result = sub?.(child)
    const q = result ?? child
    this._expands.push({ name: prop.name, key, query: q._build(true) })
    return this
  }

  /**
   * Adds a `$orderby` clause.
   *
   * After `select()`: use a field selector callback.
   * After `apply()`: use a field selector callback with alias names.
   *
   * Multiple calls accumulate.
   *
   * @example
   * fetchOdata(Person).orderby(f => f.name);
   * fetchOdata(Person).orderby(f => f.age, "desc");
   * fetchOdata(Person).apply(v => ({ total: sum(v.age) })).orderby(r => r.total, "desc");
   */
  orderby(fieldSelector: (f: ODataFieldProxy<T>) => string, direction?: "asc" | "desc"): this
  orderby(alias: string, direction?: "asc" | "desc"): this
  orderby(nameOrSelector: string | ((f: any) => string), direction: "asc" | "desc" = "asc"): this {
    if (this._expandMode === "lookup") throw new Error("orderby() is not supported in lookup expands")
    if (typeof nameOrSelector === "function") {
      this._orderby.push({ name: nameOrSelector(this._isApply ? this._applyAliasProxy : this._proxy), dir: direction })
    } else {
      this._orderby.push({ name: nameOrSelector, dir: direction })
    }
    return this
  }

  /** Limits the number of returned records (`$top`). */
  top(n: number): this {
    if (this._expandMode === "lookup") throw new Error("top() is not supported in lookup expands")
    this._top = n
    return this
  }

  /**
   * Adds a `$apply` expression for server-side aggregation and grouping.
   * The callback receives a field proxy and must return a record where:
   * - Values created with `groupby()` define grouping fields
   * - Values created with `sum()`, `average()`, `min()`, `max()`, `count()` define aggregations
   *
   * Record keys become the alias names in the response.
   *
   * @example
   * fetchOdata(Person).apply(v => ({
   *   age: groupby(v.age),
   *   total: sum(v.age),
   *   average: average(v.age),
   * }));
   *
   * @example
   * // Aggregate without grouping:
   * fetchOdata(Person).apply(v => ({
   *   total: sum(v.age),
   *   cnt: count(),
   * }));
   */
  apply<R extends Record<string, GroupByExpr<any> | Aggregation<any>>>(
    expr: (f: ODataFieldProxy<T>) => R,
  ): Omit<ODataQuery<T, ApplyResultType<R>>, 'select' | 'expand'> & {
    orderby(fieldSelector: (f: ApplyAliasProxy<ApplyResultType<R>>) => string, direction?: "asc" | "desc"): ODataQuery<T, ApplyResultType<R>>
    orderby(alias: string, direction?: "asc" | "desc"): ODataQuery<T, ApplyResultType<R>>
  } {
    if (this._isApply) throw new Error("apply() can only be called once")
    if (this._expandMode !== "full") throw new Error("apply() is not supported in expand sub-queries")
    this._isApply = true

    const result = expr(this._proxy as any)
    const groupByFields: string[] = []
    const aggParts: string[] = []

    this._applyAliasProxy = {}
    for (const [alias, value] of Object.entries(result)) {
      this._applyAliasProxy[alias] = alias
      if (value instanceof GroupByExpr) {
        groupByFields.push(value.field)
      } else if (value instanceof Aggregation) {
        aggParts.push(value.toOdata(alias))
      }
    }

    if (groupByFields.length > 0 && aggParts.length > 0) {
      this._apply = `groupby((${groupByFields.join(",")}),aggregate(${aggParts.join(",")}))`
    } else if (groupByFields.length > 0) {
      this._apply = `groupby((${groupByFields.join(",")}))`
    } else if (aggParts.length > 0) {
      this._apply = `aggregate(${aggParts.join(",")})`
    }

    return this as any
  }

  private _build(forExpand = false): string {
    const parts: string[] = []
    const joinChar = forExpand ? ";" : "&"

    if (this._isApply) {
      if (this._filters.length === 1) {
        parts.push(`$filter=${this._filters[0]}`)
      } else if (this._filters.length > 1) {
        parts.push(`$filter=${this._filters.join(" and ")}`)
      }
      if (this._apply) parts.push(`$apply=${this._apply}`)
      if (this._orderby.length) {
        parts.push(`$orderby=${this._orderby.map(o => `${o.name} ${o.dir}`).join(",")}`)
      }
      if (this._top !== undefined) parts.push(`$top=${this._top}`)
    } else {
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
    }

    return parts.join(joinChar)
  }

  toString(): string {
    return this._build()
  }

  private _partialTransform(value: any): Record<string, any> {
    const result: Record<string | symbol, any> = {}
    for (const key of this._selectedKeys) {
      const prop = this._table.fields[key]
      result[key] = prop.transformValueFromDataverse(value[prop.fromDataverseName])
    }
    for (const expand of this._expands) {
      const prop = this._table.fields[expand.key]
      if (prop && value[expand.name] !== undefined) {
        result[expand.key] = (prop as any).transformValueFromDataverse(value[expand.name])
      }
    }
    result[Etag] = value["@odata.etag"]
    return result
  }

  async execute(): Promise<TResult[]> {
    const qs = this.toString()
    if (!qs) return this._table.getRecords() as Promise<TResult[]>
    const raw = await this._table.client.getRecords(this._table.entitySetName, qs)
    if (this._isApply) {
      return raw.map((v: any) => {
        const r = { ...v }
        r[Etag] = v["@odata.etag"]
        delete r["@odata.etag"]
        return r
      }) as TResult[]
    }
    if (this._selectedKeys.length > 0) {
      return raw.map((v: unknown) => this._partialTransform(v)) as TResult[]
    }
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
