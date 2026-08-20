import { DataverseTable } from "../../table"
import { GenericProperties, Infer } from "../../types"
import { LookupProperty, CollectionProperty } from "../../fields"
import { Etag } from "../../util"
import { FilterExpr, FieldRef } from "../filter/expr"
import { Aggregation, GroupByExpr, average, count, groupby, max, min, sum } from "../shared/aggregation"
import { filterInputNode } from "../filter/input"
import type { FilterNode } from "../filter/ast"
import { ODataAggregateAst, ODataApplyAst, ODataSelectAst, FieldPath, serializeODataAggregate, serializeODataSelect, toODataFilterNode, toODataPath } from "./ast"
import type { FieldBase } from "../../fields"

export { Aggregation, GroupByExpr, average, count, groupby, max, min, sum } from "../shared/aggregation"

// --- Internal proxy & key types ---

const proxyTableMap = new WeakMap<object, DataverseTable<any>>()
const proxyPathMap = new WeakMap<object, FieldPath>()

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
    : T[K] extends FieldBase<infer V> ? FieldRef<V, K extends string ? K : never, T[K]> : never
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

type MergeExpand<T, K extends string, V> = {
  [P in keyof T | K]: P extends K ? V : P extends keyof T ? T[P] : never
}

// --- Alias proxy for apply orderby ---

type ApplyAliasProxy<R extends Record<string, any>> = {
  [K in keyof R]: FieldRef<R[K], K extends string ? K : never>
}

// --- ApplyQuery interface ---

export interface ApplyQuery<T extends GenericProperties, TResult extends Record<string, any>> {
  filter(filter: string): ApplyQuery<T, TResult>
  filter(filter: FilterExpr): ApplyQuery<T, TResult>
  filter(filter: (f: ODataFieldProxy<T>) => string | FilterExpr): ApplyQuery<T, TResult>
  orderby(fieldSelector: (f: ApplyAliasProxy<TResult>) => string | FieldRef<any>, direction?: "asc" | "desc"): ApplyQuery<T, TResult>
  orderby(alias: string, direction?: "asc" | "desc"): ApplyQuery<T, TResult>
  top(n: number): ApplyQuery<T, TResult>
  toAst(): ODataAggregateAst
  toString(): string
  execute(): Promise<TResult[]>
  iterate(options?: { pageSize?: number }): AsyncGenerator<TResult>
  iteratePages(options?: { pageSize?: number }): AsyncGenerator<TResult[]>
}

// --- State-machine interfaces ---

export interface InitialQuery<TAll extends GenericProperties> {
  select(): SelectQuery<TAll, TAll>
  select<K extends ValueKeys<TAll>>(...keys: K[]): SelectQuery<TAll, { [P in K]: TAll[P] }, { [P in K]: Infer<TAll[P]> }>
  apply<R extends Record<string, GroupByExpr<any> | Aggregation<any>>>(
    expr: (f: ODataFieldProxy<TAll>) => R,
  ): ApplyQuery<TAll, ApplyResultType<R>>
}

export interface SelectQuery<TAll extends GenericProperties, TChosen extends Record<string, any>, TResult = Infer<TChosen>> {
  expand<K extends NavKeys<TAll>>(key: K): SelectQuery<TAll, MergeExpand<TChosen, K & string, TAll[K]>, MergeExpand<TResult, K & string, Infer<TAll[K]>>>
  expand<K extends CollectionKeys<TAll>, R extends Record<string, any>>(
    key: K,
    sub: (q: CollectionSubQuery<RelatedProps<TAll, K>, RelatedProps<TAll, K>>) => CollectionSubQuery<RelatedProps<TAll, K>, R>,
  ): SelectQuery<TAll, MergeExpand<TChosen, K & string, R[]>, MergeExpand<TResult, K & string, Infer<R>[]>>
  expand<K extends LookupKeys<TAll>, R extends Record<string, any>>(
    key: K,
    sub: (q: LookupSubQuery<RelatedProps<TAll, K>, RelatedProps<TAll, K>>) => LookupSubQuery<RelatedProps<TAll, K>, R>,
  ): SelectQuery<TAll, MergeExpand<TChosen, K & string, R | null>, MergeExpand<TResult, K & string, Infer<R> | null>>
  filter(filter: string): SelectQuery<TAll, TChosen, TResult>
  filter(filter: FilterExpr): SelectQuery<TAll, TChosen, TResult>
  filter(filter: (f: ODataFieldProxy<TAll>) => string | FilterExpr): SelectQuery<TAll, TChosen, TResult>
  orderby(fieldSelector: (f: ODataFieldProxy<TAll>) => string | FieldRef<any>, direction?: "asc" | "desc"): SelectQuery<TAll, TChosen, TResult>
  orderby(alias: string, direction?: "asc" | "desc"): SelectQuery<TAll, TChosen, TResult>
  top(n: number): SelectQuery<TAll, TChosen, TResult>
  toAst(): ODataSelectAst
  toString(): string
  execute(): Promise<TResult[]>
  iterate(options?: { pageSize?: number }): AsyncGenerator<TResult>
  iteratePages(options?: { pageSize?: number }): AsyncGenerator<TResult[]>
}

export interface CollectionSubQuery<TAll extends GenericProperties, TChosen extends Record<string, any>, TResult = Infer<TChosen>> {
  select<K extends ValueKeys<TAll>>(...keys: K[]): CollectionSubQuery<TAll, { [P in K]: TAll[P] }, { [P in K]: Infer<TAll[P]> }>
  expand<K extends CollectionKeys<TAll>, R extends Record<string, any>>(
    key: K,
    sub: (q: CollectionSubQuery<RelatedProps<TAll, K>, RelatedProps<TAll, K>>) => CollectionSubQuery<RelatedProps<TAll, K>, R>,
  ): CollectionSubQuery<TAll, MergeExpand<TChosen, K & string, R[]>, MergeExpand<TResult, K & string, Infer<R>[]>>
  expand<K extends LookupKeys<TAll>, R extends Record<string, any>>(
    key: K,
    sub: (q: LookupSubQuery<RelatedProps<TAll, K>, RelatedProps<TAll, K>>) => LookupSubQuery<RelatedProps<TAll, K>, R>,
  ): CollectionSubQuery<TAll, MergeExpand<TChosen, K & string, R | null>, MergeExpand<TResult, K & string, Infer<R> | null>>
  filter(filter: string): CollectionSubQuery<TAll, TChosen, TResult>
  filter(filter: FilterExpr): CollectionSubQuery<TAll, TChosen, TResult>
  filter(filter: (f: ODataFieldProxy<TAll>) => string | FilterExpr): CollectionSubQuery<TAll, TChosen, TResult>
  orderby(fieldSelector: (f: ODataFieldProxy<TAll>) => string | FieldRef<any>, direction?: "asc" | "desc"): CollectionSubQuery<TAll, TChosen, TResult>
  orderby(alias: string, direction?: "asc" | "desc"): CollectionSubQuery<TAll, TChosen, TResult>
  top(n: number): CollectionSubQuery<TAll, TChosen, TResult>
}

export interface LookupSubQuery<TAll extends GenericProperties, TChosen extends Record<string, any>, TResult = Infer<TChosen>> {
  select<K extends ValueKeys<TAll>>(...keys: K[]): LookupSubQuery<TAll, { [P in K]: TAll[P] }, { [P in K]: Infer<TAll[P]> }>
  expand<K extends CollectionKeys<TAll>, R extends Record<string, any>>(
    key: K,
    sub: (q: CollectionSubQuery<RelatedProps<TAll, K>, RelatedProps<TAll, K>>) => CollectionSubQuery<RelatedProps<TAll, K>, R>,
  ): LookupSubQuery<TAll, MergeExpand<TChosen, K & string, R[]>, MergeExpand<TResult, K & string, Infer<R>[]>>
  expand<K extends LookupKeys<TAll>, R extends Record<string, any>>(
    key: K,
    sub: (q: LookupSubQuery<RelatedProps<TAll, K>, RelatedProps<TAll, K>>) => LookupSubQuery<RelatedProps<TAll, K>, R>,
  ): LookupSubQuery<TAll, MergeExpand<TChosen, K & string, R | null>, MergeExpand<TResult, K & string, Infer<R> | null>>
}

// --- ApplyQuery class ---

export class ODataApplyQuery<T extends GenericProperties, TResult extends Record<string, any> = Record<string, any>> {
  private _table: DataverseTable<T>
  private _filters: FilterNode[] = []
  private _apply?: ODataApplyAst
  private _orderby: Array<{ name: string; dir: "asc" | "desc" }> = []
  private _top?: number
  private _aliasProxy: Record<string, string> = {}
  private _aliasFields: Record<string, FieldRef<any> | undefined> = {}

  constructor(
    table: DataverseTable<T>,
    apply: ODataApplyAst | undefined,
    aliasProxy: Record<string, string>,
    initialFilters?: FilterNode[],
    aliasFields?: Record<string, FieldRef<any> | undefined>,
  ) {
    this._table = table
    this._apply = apply
    this._aliasProxy = aliasProxy
    this._aliasFields = aliasFields ?? {}
    if (initialFilters) this._filters = [...initialFilters]
  }

  filter(filter: string): this
  filter(filter: FilterExpr): this
  filter(filter: (f: ODataFieldProxy<T>) => string | FilterExpr): this
  filter(filter: string | FilterExpr | ((f: ODataFieldProxy<T>) => string | FilterExpr)): this {
    this._filters.push(filterInputNode(filter, _buildProxyForTable(this._table)))
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
    return serializeODataAggregate(this.toAst())
  }

  toAst(): ODataAggregateAst {
    return {
      kind: "aggregate",
      filters: this._filters.map(toODataFilterNode),
      apply: this._apply,
       orderby: this._orderby.map((order) => ({ field: order.name, direction: order.dir })),
      top: this._top,
    }
  }

  toString(): string {
    return this._build()
  }

  private _transformRow(v: any): TResult {
    const r = { ...v }
    for (const [alias, field] of Object.entries(this._aliasFields)) {
      if (field && alias in r) r[alias] = field.transformFromDataverse(r[alias])
    }
    r[Etag] = v["@odata.etag"]
    delete r["@odata.etag"]
    return r as TResult
  }

  async execute(): Promise<TResult[]> {
    const results: TResult[] = []
    for await (const page of this.iteratePages()) {
      results.push(...page)
    }
    return results
  }

  async *iterate(options?: { pageSize?: number }): AsyncGenerator<TResult> {
    for await (const page of this.iteratePages(options)) {
      yield* page
    }
  }

  async *iteratePages(options?: { pageSize?: number }): AsyncGenerator<TResult[]> {
    const qs = this.toString()
    const raw = this._table.client.iteratePages(this._table.entitySetName, { ...options, query: qs })
    for await (const page of raw) {
      yield page.map((v: any) => this._transformRow(v))
    }
  }
}

// --- Internal expand metadata ---

interface ExpandMeta {
  key: string
  dvName: string
  isCollection: boolean
  selectedKeys: string[] | null
  subExpands: ExpandMeta[] | null
}

// --- Internal sub-query mode ---

type SubQueryMode = "collection" | "lookup"

// --- Main query builder class (internal) ---

class ODataQuery<T extends GenericProperties> {
  #table: DataverseTable<T>
  #fields: FieldPath[] = []
  #selectedKeys: string[] = []
  #filters: FilterNode[] = []
  #expands: Array<{ navigation: LookupProperty<any> | CollectionProperty<any>; key: string; query: ODataSelectAst }> = []
  #expandMeta: ExpandMeta[] = []
  #orderby: Array<{ field: FieldPath; direction: "asc" | "desc" }> = []
  #top?: number
  #proxy: ODataFieldProxy<T>
  #subQueryMode?: SubQueryMode

  constructor(table: DataverseTable<T>, subQueryMode?: SubQueryMode) {
    this.#table = table
    this.#proxy = _buildProxyForTable(table) as any
    this.#subQueryMode = subQueryMode
  }

  get _table() { return this.#table }
  get _proxy() { return this.#proxy }
  get _expandMeta() { return this.#expandMeta }

  select(): this
  select<K extends ValueKeys<T>>(...keys: K[]): this
  select(...keys: any[]): this {
    if (keys.length === 0) {
      this.#fields = []
      this.#selectedKeys = []
      for (const [key, prop] of Object.entries(this.#table.fields) as [string, any][]) {
        if (prop.kind === "value" || prop.type === "lookupId" || prop.type === "file" || prop.type === "image") {
          this.#fields.push([prop])
          this.#selectedKeys.push(key)
        }
      }
    } else {
      this.#fields = keys.map((k: any) => (this.#proxy[k] as FieldRef<any>).path)
      this.#selectedKeys = keys as string[]
    }
    return this
  }

  expand<K extends string & NavKeys<T>>(key: K, sub?: (q: any) => any): this {
    const prop = this.#table.fields[key] as LookupProperty<any> | CollectionProperty<any>
    const isCollection = prop.type === "collection"
    if (this.#subQueryMode === "collection" && isCollection) {
      throw new Error("expand() within a collection expand only supports lookup navigation properties")
    }

    const child = new ODataQuery(prop.table, isCollection ? "collection" : "lookup") as any
    const result = sub?.(child)
    const q = result ?? child

    this.#expands.push({ navigation: prop, key, query: q.toAst() })

    // Track expand metadata for partial transforms
    const childSelectedKeys = q._getSelectedKeys()
    const childExpandMeta = q._expandMeta
    const subQueryProvided = !!sub
    this.#expandMeta.push({
      key,
      dvName: prop.name,
      isCollection,
      selectedKeys: subQueryProvided
        ? (childSelectedKeys.length > 0 ? childSelectedKeys : null)
        : null,
      subExpands: subQueryProvided && childExpandMeta.length > 0 ? childExpandMeta : null,
    })

    return this
  }

  filter(filter: string): this
  filter(filter: FilterExpr): this
  filter(filter: (f: ODataFieldProxy<T>) => string | FilterExpr): this
  filter(filter: string | FilterExpr | ((f: ODataFieldProxy<T>) => string | FilterExpr)): this {
    this.#filters.push(filterInputNode(filter, this.#proxy))
    return this
  }

  orderby(fieldSelector: (f: ODataFieldProxy<T>) => string | FieldRef<any>, direction?: "asc" | "desc"): this
  orderby(alias: string, direction?: "asc" | "desc"): this
  orderby(nameOrSelector: string | ((f: any) => string | FieldRef<any>), direction: "asc" | "desc" = "asc"): this {
    if (this.#subQueryMode === "lookup") throw new Error("orderby() is not supported in lookup expands")
    if (typeof nameOrSelector === "function") {
      const result = nameOrSelector(this.#proxy)
      this.#orderby.push({
        field: typeof result === "string" ? pathForName(this.#table, result) : result.path,
        direction,
      })
    } else {
      this.#orderby.push({ field: pathForName(this.#table, nameOrSelector), direction })
    }
    return this
  }

  top(n: number): this {
    if (this.#subQueryMode === "lookup") throw new Error("top() is not supported in lookup expands")
    this.#top = n
    return this
  }

  apply<R extends Record<string, GroupByExpr<any> | Aggregation<any>>>(
    expr: (f: ODataFieldProxy<T>) => R,
  ): ODataApplyQuery<T, ApplyResultType<R>> {
    const result = expr(this.#proxy as any)
    const groupByFields: string[] = []
    const aggregateExpressions: { field?: string; operation: string; alias: string }[] = []
    const aliasProxy: Record<string, string> = {}
    const aliasFields: Record<string, FieldRef<any> | undefined> = {}

    for (const [alias, value] of Object.entries(result)) {
      aliasProxy[alias] = alias
      if (value instanceof GroupByExpr) {
        if (value.path) groupByFields.push(toODataPath(value.path))
        aliasFields[alias] = value.fieldRef
      } else if (value instanceof Aggregation) {
        aggregateExpressions.push({ field: value.path ? toODataPath(value.path) : undefined, operation: value.operation, alias })
        aliasFields[alias] = value.fieldRef
      }
    }

    const aggregate = aggregateExpressions.length > 0
      ? { kind: "aggregate" as const, expressions: aggregateExpressions }
      : undefined
    const apply: ODataApplyAst | undefined = groupByFields.length > 0
      ? { kind: "groupby", fields: groupByFields, next: aggregate }
      : aggregate

    return new ODataApplyQuery<T, ApplyResultType<R>>(
      this.#table,
      apply,
      aliasProxy,
      this.#filters.length > 0 ? this.#filters : undefined,
      aliasFields,
    )
  }

  _buildForExpand(): string {
    return serializeODataSelect(this.toAst(), ";")
  }

  toAst(): ODataSelectAst {
    return {
      kind: "select",
      select: this.#fields.map(toODataPath),
      filters: this.#filters.map(toODataFilterNode),
      orderby: this.#orderby.map(order => ({ field: toODataPath(order.field), direction: order.direction })),
      expands: this.#expands.map((expand) => ({ navigation: expand.navigation.name, query: expand.query })),
      top: this.#top,
    }
  }

  toString(): string {
    return serializeODataSelect(this.toAst())
  }

  _getSelectedKeys(): string[] {
    return this.#selectedKeys
  }

  private _partialTransform(value: any): Record<string, any> {
    const result: Record<string | symbol, any> = {}
    const recordId = value[this.#table.primaryKey.property.fromDataverseName] ?? value[this.#table.primaryKey.property.name]
    const ctx = { table: this.#table, client: this.#table.client, recordId: recordId ?? "" }
    for (const key of this.#selectedKeys) {
      const prop = this.#table.fields[key]
      result[key] = FieldRef.fromPath(prop, prop.fromDataverseName ?? prop.name).transformFromDataverse(value[prop.fromDataverseName], ctx)
    }
    for (const expand of this.#expandMeta) {
      if (value[expand.dvName] !== undefined) {
        result[expand.key] = _processExpand(value[expand.dvName], expand, this.#table)
      }
    }
    result[Etag] = value["@odata.etag"]
    return result
  }

  private _transformRow(value: any): any {
    if (this.#selectedKeys.length > 0) {
      return this._partialTransform(value)
    }
    if (this.#expandMeta.some(e => e.selectedKeys)) {
      return this._partialTransform(value)
    }
    return this.#table.transformValueFromDataverse(value)
  }

  async execute(): Promise<any[]> {
    const results: any[] = []
    for await (const page of this.iteratePages()) {
      results.push(...page)
    }
    return results
  }

  async *iterate(options?: { pageSize?: number }): AsyncGenerator<any> {
    const qs = this.toString()
    if (!qs) {
      yield* this.#table.iterateRecords(undefined, options)
      return
    }
    for await (const page of this.iteratePages(options)) {
      yield* page
    }
  }

  async *iteratePages(options?: { pageSize?: number }): AsyncGenerator<any[]> {
    const qs = this.toString()
    if (!qs) {
      yield* this.#table.iteratePages(undefined, options)
      return
    }
    for await (const page of this.#table.client.iteratePages(
      this.#table.entitySetName,
      { ...options, query: qs },
    )) {
      yield page.map((v: unknown) => this._transformRow(v))
    }
  }
}

// --- InitialQuery (forces select or apply first) ---

class InitialQueryImpl<T extends GenericProperties> {
  #table: DataverseTable<T>

  constructor(table: DataverseTable<T>) {
    this.#table = table
  }

  select(): SelectQuery<T, T>
  select<K extends ValueKeys<T>>(...keys: K[]): SelectQuery<T, { [P in K]: T[P] }>
  select(...keys: any[]): any {
    const q = new ODataQuery(this.#table)
    if (keys.length === 0) {
      q.select()
    } else {
      q.select(...keys)
    }
    return q
  }

  apply<R extends Record<string, GroupByExpr<any> | Aggregation<any>>>(
    expr: (f: ODataFieldProxy<T>) => R,
  ): ApplyQuery<T, ApplyResultType<R>> {
    return new ODataQuery(this.#table).apply(expr) as unknown as ApplyQuery<T, ApplyResultType<R>>
  }
}

// --- Helpers ---

function pathForName(table: DataverseTable<any>, path: string): FieldPath {
  const segments: any[] = []
  let current = table
  for (const name of path.split("/")) {
    const entry = Object.values(current.fields).find((field: any) => (field.fromDataverseName ?? field.name) === name) as any
    if (!entry) throw new Error(`Unknown query field: ${path}`)
    segments.push(entry)
    if (entry.kind === "navigation") current = entry.table
  }
  return segments
}

function _processExpand(raw: any, expand: ExpandMeta, table: DataverseTable<any>): any {
  if (raw === null || raw === undefined) return null
  const navProp = table.fields[expand.key] as any
  const relatedTable = navProp.table as DataverseTable<any>
  if (expand.isCollection) {
    const items = Array.from(raw ?? [])
    if (expand.selectedKeys) {
      return items.map((item: any) => _partialTransformItem(relatedTable, expand.selectedKeys!, item, expand.subExpands))
    } else {
      return navProp.transformValueFromDataverse(raw)
    }
  } else {
    if (expand.selectedKeys) {
      return _partialTransformItem(relatedTable, expand.selectedKeys, raw, expand.subExpands)
    } else {
      return navProp.transformValueFromDataverse(raw)
    }
  }
}

function _partialTransformItem(table: DataverseTable<any>, selectedKeys: string[], raw: any, subExpands?: ExpandMeta[] | null): Record<string, any> {
  const result: Record<string, any> = {}
  const recordId = raw[table.primaryKey.property.fromDataverseName] ?? raw[table.primaryKey.property.name]
  const ctx = { table, client: table.client, recordId: recordId ?? "" }
  for (const key of selectedKeys) {
    const prop = table.fields[key]
    if (prop) {
      result[key] = FieldRef.fromPath(prop, prop.fromDataverseName ?? prop.name).transformFromDataverse(raw[prop.fromDataverseName], ctx)
    }
  }
  if (subExpands) {
    for (const expand of subExpands) {
      if (raw[expand.dvName] !== undefined) {
        result[expand.key] = _processExpand(raw[expand.dvName], expand, table)
      }
    }
  }
  return result
}

function _buildProxyForTable<T extends GenericProperties>(
  table: DataverseTable<T>,
  prefix?: string,
  prefixPath: FieldPath = [],
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
            const sub = _buildProxyForTable(navProp.table, currentPrefix, [...prefixPath, navProp]) as Record<string, any>
            sub.toString = () => currentPrefix
            Object.defineProperty(sub, "path", { value: [...prefixPath, navProp], enumerable: false })
            if (isCollection) proxyTableMap.set(sub, navProp.table)
            proxyPathMap.set(sub, [...prefixPath, navProp])
            cached = sub
          }
          return cached
        },
        enumerable: true,
        configurable: true,
      })
    } else {
      proxy[key] = FieldRef.fromPath(prop, prefix ? `${prefix}/${dataverseName}` : dataverseName, [...prefixPath, prop])
    }
  }
  return proxy as ODataFieldProxy<T>
}

// --- Lambda helpers ---

export function buildLambdaProxy<P extends GenericProperties>(
  alias: string,
  table: DataverseTable<P>,
): ODataLambdaProxy<P> {
  const fields = table.fields as Record<string, any>
  const proxy = {} as Record<string, any>
  for (const [key, prop] of Object.entries(fields)) {
    proxy[key] = FieldRef.fromPath(prop, `${alias}/${prop.fromDataverseName ?? prop.name}`)
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
  return new FilterExpr({
    type: "lambda",
    field: proxyPathMap.get(proxy as object) ?? [],
    operator: "any",
    alias,
    condition: result instanceof FilterExpr ? result.getNode() : { type: "raw", value: result },
  })
}

export function all<P extends GenericProperties>(
  proxy: ODataCollectionNavProxy<P>,
  condition: (x: ODataLambdaProxy<P>) => string | FilterExpr,
): FilterExpr {
  const alias = "x"
  const table = proxyTableMap.get(proxy as object)
  if (!table) throw new Error("all() requires a collection navigation proxy")
  const result = condition(buildLambdaProxy(alias, table as DataverseTable<P>))
  return new FilterExpr({
    type: "lambda",
    field: proxyPathMap.get(proxy as object) ?? [],
    operator: "all",
    alias,
    condition: result instanceof FilterExpr ? result.getNode() : { type: "raw", value: result },
  })
}

// --- Entry point ---

export function fetchOdata<T extends GenericProperties>(table: DataverseTable<T>): InitialQuery<T> {
  return new InitialQueryImpl(table) as any
}

export type ODataTableQueryOptions = {
  filter?: string
  orderby?: Partial<Record<string, "asc" | "desc">> | string
  top?: number
}

function expandAll(query: any, table: DataverseTable<any>, depth: number): void {
  if (depth > 3) return
  for (const [key, prop] of Object.entries(table.fields) as [string, any][]) {
    if (prop.kind !== "navigation" || prop.type === "lookupId" || prop.type === "collectionIds") continue
    query.expand(key, (sub: any) => {
      sub.select()
      expandAll(sub, prop.table, depth + 1)
      return sub
    })
  }
}

export function buildTableQueryAst<T extends GenericProperties>(
  table: DataverseTable<T>,
  options?: ODataTableQueryOptions,
): ODataSelectAst {
  const query = new ODataQuery(table)
  query.select()
  expandAll(query, table, 0)

  if (options?.filter) query.filter(options.filter)
  if (options?.top !== undefined) query.top(options.top)
  if (typeof options?.orderby === "string") {
    for (const value of options.orderby.split(",")) {
      const [field, direction = "asc"] = value.trim().split(/\s+/)
      if (field) query.orderby(field, direction as "asc" | "desc")
    }
  } else {
    for (const [field, direction] of Object.entries(options?.orderby ?? {})) {
      const property = table.fields[field]?.fromDataverseName ?? table.fields[field]?.name ?? field
      query.orderby(property, direction as "asc" | "desc")
    }
  }

  return query.toAst()
}
