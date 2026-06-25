import { DataverseTable } from "./table"
import { GenericProperties, Infer } from "./types"
import { LookupProperty, CollectionProperty } from "./fields"
import { Etag } from "./util"
import { FilterExpr, FieldRef } from "./filter"

const proxyTableMap = new WeakMap<object, DataverseTable<any>>()

type ODataLambdaProxy<P extends GenericProperties> = {
  [K in keyof P]: FieldRef<any>;
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

type ValueKeys<T extends GenericProperties> = { [K in keyof T]: T[K] extends { kind: 'value' } | { type: 'lookupId' } | { type: 'file' } ? K : never }[keyof T]
type CollectionKeys<T extends GenericProperties> = { [K in keyof T]: T[K] extends CollectionProperty<any> ? K : never }[keyof T]
type LookupKeys<T extends GenericProperties> = { [K in keyof T]: T[K] extends LookupProperty<any> ? K : never }[keyof T]
type NavKeys<T extends GenericProperties> = CollectionKeys<T> | LookupKeys<T>
type RelatedProps<T extends GenericProperties, K extends keyof T> = T[K] extends CollectionProperty<infer P> ? P : T[K] extends LookupProperty<infer P> ? P : never
type ExpandResult<T extends GenericProperties, K extends keyof T, R> = T[K] extends CollectionProperty<any> ? R[] : R

type ApplyResultType<R extends Record<string, GroupByExpr<any> | Aggregation<any>>> = {
  [K in keyof R]: R[K] extends GroupByExpr<infer V> ? V
    : R[K] extends Aggregation<infer V> ? V
    : never
}

export class GroupByExpr<V = any> {
  field: string
  constructor(field: string) { this.field = field }
}

export class Aggregation<V = any> {
  field?: string
  operation: string
  constructor(operation: string, field?: string) {
    this.operation = operation
    this.field = field
  }
  toOdata(alias: string): string {
    return this.field ? `${this.field} with ${this.operation} as ${alias}` : `$count as ${alias}`
  }
}

type ApplyAliasProxy<R extends Record<string, any>> = {
  [K in keyof R]: FieldRef<R[K], K extends string ? K : never>
}

export class ODataApplyQuery<T extends GenericProperties, TResult extends Record<string, any> = Record<string, any>> {
  private _table: DataverseTable<T>
  private _filters: string[] = []
  private _apply: string
  private _orderby: Array<{ name: string; dir: "asc" | "desc" }> = []
  private _top?: number
  private _aliasProxy: Record<string, string> = {}

  constructor(
    table: DataverseTable<T>,
    apply: string,
    aliasProxy: Record<string, string>,
    initialFilters?: string[],
  ) {
    this._table = table
    this._apply = apply
    this._aliasProxy = aliasProxy
    if (initialFilters) this._filters = [...initialFilters]
  }

  filter(filter: string): this
  filter(filter: FilterExpr): this
  filter(filter: (f: ODataFieldProxy<T>) => string | FilterExpr): this
  filter(filter: string | FilterExpr | ((f: ODataFieldProxy<T>) => string | FilterExpr)): this {
    let str: string
    if (filter instanceof FilterExpr) {
      str = filter.toOdata()
    } else if (typeof filter === "function") {
      const result = filter(buildProxyForTable(this._table))
      str = result instanceof FilterExpr ? result.toOdata() : result
    } else {
      str = filter
    }
    this._filters.push(str)
    return this
  }

  orderby(fieldSelector: (f: ApplyAliasProxy<TResult>) => string | FieldRef<any>, direction?: "asc" | "desc"): this
  orderby(alias: string, direction?: "asc" | "desc"): this
  orderby(nameOrSelector: string | ((f: any) => string | FieldRef<any>), direction: "asc" | "desc" = "asc"): this {
    if (typeof nameOrSelector === "function") {
      const result = nameOrSelector(this._aliasProxy)
      this._orderby.push({ name: typeof result === "string" ? result : result.toString(), dir: direction })
    } else {
      this._orderby.push({ name: nameOrSelector, dir: direction })
    }
    return this
  }

  top(n: number): this {
    this._top = n
    return this
  }

  private _build(): string {
    const parts: string[] = []
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
    return parts.join("&")
  }

  toString(): string {
    return this._build()
  }

  async execute(): Promise<TResult[]> {
    const qs = this.toString()
    const raw = await this._table.client.getRecords(this._table.entitySetName, qs)
    return raw.map((v: any) => {
      const r = { ...v }
      r[Etag] = v["@odata.etag"]
      delete r["@odata.etag"]
      return r
    }) as TResult[]
  }
}

export class ODataQuery<T extends GenericProperties, TResult = Infer<T>> {
  private _table: DataverseTable<T>
  private _fields: string[] = []
  private _selectedKeys: string[] = []
  private _filters: string[] = []
  private _expands: Array<{ name: string; key: string; query: string }> = []
  private _orderby: Array<{ name: string; dir: "asc" | "desc" }> = []
  private _top?: number
  private _expandMode: "full" | "collection" | "lookup" = "full"
  private _proxy: ODataFieldProxy<T>

  constructor(table: DataverseTable<T>) {
    this._table = table
    this._proxy = this._buildProxy()
  }

  private _buildProxy(): ODataFieldProxy<T> {
    return buildProxyForTable(this._table) as any
  }

  select(): ODataQuery<T, Infer<T>>
  select<K extends ValueKeys<T>>(...keys: K[]): ODataQuery<T, { [P in K]: Infer<T[P]> }>
  select<K extends ValueKeys<T>>(...keys: K[]): any {
    if (keys.length === 0) {
      this._fields = []
      this._selectedKeys = []
      for (const prop of Object.values(this._table.fields) as any[]) {
        if (prop.kind === "value" || prop.type === "lookupId" || prop.type === "file") {
          this._fields.push(prop.fromDataverseName ?? prop.name)
        }
      }
    } else {
      this._fields = keys.map(k => this._proxy[k].toString() as string)
      this._selectedKeys = keys as string[]
    }
    return this as any
  }

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

  expand<K extends CollectionKeys<T>, R>(
    key: K,
    sub?: (q: Omit<ODataQuery<RelatedProps<T, K>>, 'apply' | 'execute' | 'toString'>) => ODataQuery<RelatedProps<T, K>, R>,
  ): ODataQuery<T, Omit<TResult, K & keyof TResult> & { [P in K]: ExpandResult<T, P, R> }>
  expand<K extends LookupKeys<T>, R>(
    key: K,
    sub?: (q: Omit<ODataQuery<RelatedProps<T, K>>, 'orderby' | 'top' | 'apply' | 'execute' | 'toString'>) => ODataQuery<RelatedProps<T, K>, R>,
  ): ODataQuery<T, Omit<TResult, K & keyof TResult> & { [P in K]: ExpandResult<T, P, R> }>
  expand<K extends string & NavKeys<T>, R>(
    key: K,
    sub?: (q: any) => any,
  ): any {
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

  orderby(fieldSelector: (f: ODataFieldProxy<T>) => string | FieldRef<any>, direction?: "asc" | "desc"): this
  orderby(alias: string, direction?: "asc" | "desc"): this
  orderby(nameOrSelector: string | ((f: any) => string | FieldRef<any>), direction: "asc" | "desc" = "asc"): this {
    if (this._expandMode === "lookup") throw new Error("orderby() is not supported in lookup expands")
    if (typeof nameOrSelector === "function") {
      const result = nameOrSelector(this._proxy)
      this._orderby.push({ name: typeof result === "string" ? result : result.toString(), dir: direction })
    } else {
      this._orderby.push({ name: nameOrSelector, dir: direction })
    }
    return this
  }

  top(n: number): this {
    if (this._expandMode === "lookup") throw new Error("top() is not supported in lookup expands")
    this._top = n
    return this
  }

  apply<R extends Record<string, GroupByExpr<any> | Aggregation<any>>>(
    expr: (f: ODataFieldProxy<T>) => R,
  ): ODataApplyQuery<T, ApplyResultType<R>> {
    const result = expr(this._proxy as any)
    const groupByFields: string[] = []
    const aggParts: string[] = []
    const aliasProxy: Record<string, string> = {}

    for (const [alias, value] of Object.entries(result)) {
      aliasProxy[alias] = alias
      if (value instanceof GroupByExpr) {
        groupByFields.push(value.field)
      } else if (value instanceof Aggregation) {
        aggParts.push(value.toOdata(alias))
      }
    }

    let applyStr = ""
    if (groupByFields.length > 0 && aggParts.length > 0) {
      applyStr = `groupby((${groupByFields.join(",")}),aggregate(${aggParts.join(",")}))`
    } else if (groupByFields.length > 0) {
      applyStr = `groupby((${groupByFields.join(",")}))`
    } else if (aggParts.length > 0) {
      applyStr = `aggregate(${aggParts.join(",")})`
    }

    return new ODataApplyQuery<T, ApplyResultType<R>>(
      this._table,
      applyStr,
      aliasProxy,
      this._filters.length > 0 ? this._filters : undefined,
    )
  }

  protected _build(forExpand = false): string {
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
    if (this._selectedKeys.length > 0) {
      return raw.map((v: unknown) => this._partialTransform(v)) as TResult[]
    }
    return raw.map((v: unknown) => this._table.transformValueFromDataverse(v)) as TResult[]
  }
}

export function buildProxyForTable<T extends GenericProperties>(
  table: DataverseTable<T>,
  prefix?: string,
): ODataFieldProxy<T> {
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
            const sub = buildProxyForTable(navProp.table, currentPrefix) as Record<string, any>
            sub.toString = () => currentPrefix
            if (isCollection) proxyTableMap.set(sub, navProp.table)
            cached = sub
          }
          return cached
        },
        enumerable: true,
        configurable: true,
      })
    } else {
      proxy[key] = new FieldRef(prefix ? `${prefix}/${dataverseName}` : dataverseName, prop)
    }
  }
  return proxy as ODataFieldProxy<T>
}

export function sum<V>(field: FieldRef<V> | string): Aggregation<V> {
  return new Aggregation("sum", field instanceof FieldRef ? field.toString() : field)
}
export function min<V>(field: FieldRef<V>): Aggregation<V> {
  return new Aggregation("min", field.toString())
}
export function max<V>(field: FieldRef<V>): Aggregation<V> {
  return new Aggregation("max", field.toString())
}
export function average<V>(field: FieldRef<V>): Aggregation<V> {
  return new Aggregation("average", field.toString())
}
export function count<V>(field?: FieldRef<V> | string): Aggregation<number> {
  return new Aggregation("count", field ? (field instanceof FieldRef ? field.toString() : field) : undefined)
}
export function groupby<V>(field: FieldRef<V> | string): GroupByExpr<V> {
  return new GroupByExpr(field instanceof FieldRef ? field.toString() : field)
}

export function buildLambdaProxy<P extends GenericProperties>(
  alias: string,
  table: DataverseTable<P>,
): ODataLambdaProxy<P> {
  const fields = table.fields as Record<string, any>
  const proxy = {} as Record<string, any>
  for (const [key, prop] of Object.entries(fields)) {
    proxy[key] = new FieldRef(`${alias}/${prop.fromDataverseName ?? prop.name}`)
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
