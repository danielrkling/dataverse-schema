import { Table } from "./table"
import { GenericProperties, Infer } from "./types"
import { LookupProperty, CollectionProperty } from "./fields"
import { getName } from "./util"
import { OrderSpec } from "./query"

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

type ODataNavProxyValue<P extends GenericProperties> = {
  toString(): string;
  any(cb: (proxy: ODataLambdaProxy<P>) => string): string;
  any(alias: string, cb: (proxy: ODataLambdaProxy<P>) => string): string;
  all(cb: (proxy: ODataLambdaProxy<P>) => string): string;
  all(alias: string, cb: (proxy: ODataLambdaProxy<P>) => string): string;
} & ODataFieldProxy<P>

type ODataFieldProxy<T extends GenericProperties> = {
  [K in keyof T]: T[K] extends LookupProperty<infer P> ? ODataNavProxyValue<P>
    : T[K] extends CollectionProperty<infer P> ? ODataNavProxyValue<P>
    : string
}

/**
 * A type-safe OData query builder for Dataverse. Construct OData query strings
 * with `$select`, `$filter`, `$expand`, `$orderby`, `$top`, `$count`, `$apply`,
 * and `$ref` using auto-completing field proxies.
 *
 * Create one via {@link fetchOdata} — never instantiate directly.
 *
 * @template T The table's property definitions.
 * @template TResult The result row shape (narrowed by `.select()`, `.expand()`, etc.).
 *
 * @example
 * const q = fetchOdata(Person)
 *   .select("name", "age")
 *   .where(f => equals(f.name, "John"))
 *   .orderby({ name: "asc" })
 *   .top(10);
 *
 * const results = await q.execute();
 * // results: { name: string; age: number }[]
 */
export class ODataQuery<T extends GenericProperties, TResult = Infer<T>> {
  private _table: Table<T>
  private _fields: string[] = []
  private _filters: string[] = []
  private _expands: Array<{ name: string; query: string; isRef?: boolean }> = []
  private _orderby: Array<{ name: string; dir: "asc" | "desc" }> = []
  private _top?: number
  private _includeCount = false
  private _apply = ""
  private _lambdaAliasIndex = 0
  private _proxy: ODataFieldProxy<T>

  constructor(table: Table<T>) {
    this._table = table
    this._proxy = this._buildProxy()
  }

  private _buildProxy(): ODataFieldProxy<T> {
    return this._buildProxyForTable(this._table) as any
  }

  private _buildProxyForTable(table: Table<any>, prefix?: string): Record<string, any> {
    const proxy: Record<string, any> = {}
    const fields = table.fields as Record<string, any>
    for (const [key, prop] of Object.entries(fields)) {
      const dataverseName = prop.fromDataverseName ?? prop.name
      if (prop.kind === "navigation" && (prop.type === "lookup" || prop.type === "collection")) {
        const navProp = prop as LookupProperty<any> | CollectionProperty<any>
        const currentPrefix = prefix ? `${prefix}/${dataverseName}` : dataverseName
        let cached: Record<string, any> | undefined
        Object.defineProperty(proxy, key, {
          get: () => {
            if (!cached) {
              const sub = this._buildProxyForTable(navProp.table, currentPrefix)
              sub.toString = () => dataverseName
              const lambdaMap: Record<string, string> = {}
              const navFields = navProp.table.fields as Record<string, any>
              for (const [lk, lp] of Object.entries(navFields)) {
                lambdaMap[lk] = lp.fromDataverseName ?? lp.name
              }
              const buildLambdaProxy = (alias: string) => {
                const lp: Record<string, string> = {}
                for (const [k, n] of Object.entries(lambdaMap)) lp[k] = `${alias}/${n}`
                return lp
              }
              const resolveAliasAndCallback = (a: string | ((p: any) => string), b?: (p: any) => string) => {
                if (typeof a === "function") {
                  const alias = String.fromCharCode(97 + (this._lambdaAliasIndex++ % 26))
                  return { alias, cb: a }
                }
                return { alias: a, cb: b! }
              }
              sub.any = (a: string | ((p: any) => string), b?: (p: any) => string) => {
                const { alias, cb } = resolveAliasAndCallback(a, b)
                return `${getName(sub)}/any(${alias}: ${cb(buildLambdaProxy(alias))})`
              }
              sub.all = (a: string | ((p: any) => string), b?: (p: any) => string) => {
                const { alias, cb } = resolveAliasAndCallback(a, b)
                return `${getName(sub)}/all(${alias}: ${cb(buildLambdaProxy(alias))})`
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
   * This narrows the result type to only the selected properties.
   *
   * @param keys One or more value-field keys (navigation properties are excluded).
   *
   * @example
   * const q = fetchOdata(Person).select("name", "age");
   * // TResult → { name: string; age: number }
   */
  select<K extends ValueKeys<T>>(...keys: K[]): ODataQuery<T, { [P in K]: Infer<T[P]> }> {
    this._fields = keys.map(k => this._proxy[k] as string)
    return this as any
  }

  /**
   * Adds a `$filter` clause. Can be a raw OData filter string or a callback
   * that receives a typed field proxy. Multiple `.where()` calls are combined
   * with `and`.
   *
   * @overload
   * @param filter A raw OData filter string.
   *
   * @overload
   * @param filter A callback receiving a field proxy for type-safe filter construction.
   *
   * @example
   * // String overload:
   * fetchOdata(Person).where("fullname eq 'John'");
   *
   * @example
   * // Callback with field proxy and filter helpers:
   * fetchOdata(Person)
   *   .where(f => and(equals(f.name, "John"), greaterThan(f.age, 20)));
   *
   * @example
   * // Multiple where calls stack additively:
   * fetchOdata(Person)
   *   .where(f => equals(f.name, "John"))
   *   .where(f => greaterThan(f.age, 20));
   * // $filter=(fullname eq 'John') and (person_age gt 20)
   */
  where(filter: string): this
  where(filter: (f: ODataFieldProxy<T>) => string): this
  where(filter: string | ((f: ODataFieldProxy<T>) => string)): this {
    const str = typeof filter === "string" ? filter : filter(this._proxy)
    this._filters.push(str)
    return this
  }

  /**
   * Adds a `$expand` clause for a navigation property. The callback receives a
   * nested {@link ODataQuery} scoped to the related table for further `.select()`,
   * `.where()`, `.expand()`, etc.
   *
   * @param key The navigation property key.
   * @param sub A callback to configure the nested query.
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
    this._expands.push({ name: prop.name, query: q._build() })
    return this as any
  }

  /**
   * Adds a `$orderby` clause. Supports function callback with auto-completing
   * field proxy, `asc`/`desc` helpers, or a simple direction map.
   *
   * @overload
   * @param spec Callback that receives a field proxy and returns an ordering spec.
   *
   * @overload
   * @param keys An object mapping field names to `"asc"` or `"desc"`.
   *
   * @example
   * // Function overload with asc/desc helpers:
   * fetchOdata(Person).orderby(f => asc(f.name, f.age));
   * fetchOdata(Person).orderby(f => desc(f.age));
   *
   * @example
   * // Record overload:
   * fetchOdata(Person).orderby({ name: "asc", age: "desc" });
   */
  orderby(spec: (f: ODataFieldProxy<T>) => OrderSpec | OrderSpec[] | Record<string, "asc" | "desc">): this
  orderby(keys: { [K in keyof T]?: "asc" | "desc" }): this
  orderby(arg: any): this {
    if (typeof arg === "function") {
      const result = arg(this._proxy)
      if (result instanceof OrderSpec) {
        this._orderby = result.fields.map(f => ({ name: f, dir: result.direction }))
      } else if (Array.isArray(result)) {
        this._orderby = result.flatMap((s: OrderSpec) => s.fields.map(f => ({ name: f, dir: s.direction })))
      } else {
        this._orderby = Object.entries(result)
          .filter(([, v]) => v)
          .map(([k, v]) => ({ name: k, dir: v as "asc" | "desc" }))
      }
      return this
    }
    this._orderby = Object.entries(arg)
      .filter(([, v]) => v)
      .map(([k, v]) => ({ name: this._proxy[k as keyof T] as string, dir: v as "asc" | "desc" }))
    return this
  }

  /**
   * Limits the number of returned records (`$top`).
   *
   * @example
   * fetchOdata(Person).top(10);
   */
  top(n: number): this {
    this._top = n
    return this
  }

  /**
   * Includes the total record count in the response (`$count=true`).
   *
   * @example
   * const q = fetchOdata(Person).includeCount();
   * // query string: "$count=true"
   */
  includeCount(): this {
    this._includeCount = true
    return this
  }

  /**
   * Adds a `$apply` expression for server-side aggregation.
   *
   * @param expression A raw OData `$apply` expression.
   *
   * @example
   * fetchOdata(Person).apply("groupby((person_age),aggregate(person_age with sum as total))");
   */
  apply(expression: string): this {
    this._apply = expression
    return this
  }

  /**
   * Adds a `$expand` with `/$ref` to retrieve only the related record IDs
   * instead of full expanded records. The navigation property is removed from
   * the result type.
   *
   * @param key The navigation property key.
   *
   * @example
   * const q = fetchOdata(Person).expandRef("primaryAddress");
   * // query: "$expand=person_Address/$ref"
   * // TResult no longer includes primaryAddress
   */
  expandRef<K extends string & NavKeys<T>>(
    key: K,
  ): ODataQuery<T, Omit<TResult, K & keyof TResult>> {
    const prop = this._table.fields[key] as LookupProperty<any> | CollectionProperty<any>
    this._expands.push({ name: prop.name, query: "", isRef: true })
    return this as any
  }

  private _build(): string {
    const parts: string[] = []
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
        if (e.isRef) return `${e.name}/$ref`
        return e.query ? `${e.name}(${e.query})` : e.name
      }).join(",")}`)
    }
    if (this._top !== undefined) parts.push(`$top=${this._top}`)
    if (this._includeCount) parts.push(`$count=true`)
    if (this._apply) parts.push(`$apply=${this._apply}`)
    return parts.join("&")
  }

  toString(): string {
    return this._build()
  }

  async execute(): Promise<TResult[]> {
    const qs = this.toString()
    if (!qs) return this._table.getRecords() as Promise<TResult[]>
    const raw = await this._table.client.getRecords(this._table.name, qs)
    return raw.map((v: unknown) => this._table.transformValueFromDataverse(v)) as TResult[]
  }
}

export function fetchOdata<T extends GenericProperties>(table: Table<T>): ODataQuery<T, Infer<T>> {
  return new ODataQuery(table)
}
