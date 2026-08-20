import * as v from "valibot";
//#region src/query/path.d.ts
type QueryProperty = FieldBase<any> | LookupProperty<any> | CollectionProperty<any>;
type FieldPath = readonly QueryProperty[];
//#endregion
//#region src/query/shared/field-ref.d.ts
declare class FieldRef<T = any, K extends string = string, F extends FieldBase<T> = FieldBase<T>> {
  readonly field: F;
  readonly path: readonly QueryProperty[];
  private readonly _path;
  constructor(field: F, path?: string, pathSegments?: readonly QueryProperty[]);
  static fromPath<T, F extends FieldBase<T>>(field: F, path: string, pathSegments?: readonly QueryProperty[]): FieldRef<T, string, F>;
  get dataverseName(): string;
  transformFromDataverse(value: unknown, ctx?: TransformContext): T;
  transformToDataverse(value: T, ctx?: TransformContext): unknown;
  toString(): string;
}
//#endregion
//#region src/query/filter/ast.d.ts
type FilterValue = string | number | boolean | Date | null;
type FilterComparisonOperator = "eq" | "ne" | "gt" | "ge" | "lt" | "le";
type FilterFunctionName = string;
type FilterNode = {
  readonly type: "comparison";
  readonly field: FieldPath;
  readonly operator: FilterComparisonOperator | string;
  readonly value: FilterValue;
} | {
  readonly type: "null";
  readonly field: FieldPath;
  readonly positive: boolean;
} | {
  readonly type: "contains";
  readonly field: FieldPath;
  readonly value: string;
} | {
  readonly type: "startsWith";
  readonly field: FieldPath;
  readonly value: string;
} | {
  readonly type: "endsWith";
  readonly field: FieldPath;
  readonly value: string;
} | {
  readonly type: "compare";
  readonly field: FieldPath;
  readonly operator: FilterComparisonOperator | string;
  readonly otherField: FieldPath;
} | {
  readonly type: "lambda";
  readonly field: FieldPath;
  readonly operator: "any" | "all";
  readonly alias: string;
  readonly condition: FilterNode;
} | {
  readonly type: "fn";
  readonly field: FieldPath;
  readonly fnName: FilterFunctionName;
  readonly operator: string;
  readonly values: readonly FilterValue[];
} | {
  readonly type: "raw";
  readonly value: string;
} | {
  readonly type: "and";
  readonly conditions: readonly FilterNode[];
} | {
  readonly type: "or";
  readonly conditions: readonly FilterNode[];
} | {
  readonly type: "not";
  readonly condition: FilterNode;
};
//#endregion
//#region src/query/filter/expr.d.ts
type NonNullType<T> = T extends Date | null ? Date : Exclude<T, null>;
declare class FilterExpr {
  private node;
  constructor(node: FilterNode);
  toString(): string;
  toOdata(): string;
  toFetchXml(): string;
  getNode(): FilterNode;
}
declare function eq<T>(field: FieldRef<T>, value: T | null | FieldRef<any>): FilterExpr;
declare function ne<T>(field: FieldRef<T>, value: T | null | FieldRef<any>): FilterExpr;
declare function gt<T extends number | string | Date | null>(field: FieldRef<T>, value: NonNullType<T> | FieldRef<any>): FilterExpr;
declare function ge<T extends number | string | Date | null>(field: FieldRef<T>, value: NonNullType<T> | FieldRef<any>): FilterExpr;
declare function lt<T extends number | string | Date | null>(field: FieldRef<T>, value: NonNullType<T> | FieldRef<any>): FilterExpr;
declare function le<T extends number | string | Date | null>(field: FieldRef<T>, value: NonNullType<T> | FieldRef<any>): FilterExpr;
declare function isNull(field: FieldRef<any>): FilterExpr;
declare function isNotNull(field: FieldRef<any>): FilterExpr;
declare function contains<T extends string | null>(field: FieldRef<T>, value: string): FilterExpr;
declare function startsWith<T extends string | null>(field: FieldRef<T>, value: string): FilterExpr;
declare function endsWith<T extends string | null>(field: FieldRef<T>, value: string): FilterExpr;
declare function and(...conditions: (FilterExpr | string)[]): FilterExpr;
declare function or(...conditions: (FilterExpr | string)[]): FilterExpr;
declare function not(condition: FilterExpr | string): FilterExpr;
declare function isActive(): FilterExpr;
declare function isInactive(): FilterExpr;
declare function Above(field: FieldRef<any>, value: string): FilterExpr;
declare function AboveOrEqual(field: FieldRef<any>, value: string): FilterExpr;
declare function Between(field: FieldRef<any>, value1: string | number, value2: string | number): FilterExpr;
declare function ContainsValues(field: FieldRef<any>, values: (string | number)[]): FilterExpr;
declare function DoesNotContainValues(field: FieldRef<any>, values: (string | number)[]): FilterExpr;
declare function EqualBusinessId(field: FieldRef<any>): FilterExpr;
declare function EqualUserId(field: FieldRef<any>): FilterExpr;
declare function EqualUserLanguage(field: FieldRef<any>): FilterExpr;
declare function EqualUserOrUserHierarchy(field: FieldRef<any>): FilterExpr;
declare function EqualUserOrUserHierarchyAndTeams(field: FieldRef<any>): FilterExpr;
declare function EqualUserOrUserTeams(field: FieldRef<any>): FilterExpr;
declare function In<T extends string | number>(field: FieldRef<T>, values: T[]): FilterExpr;
declare function InFiscalPeriod(field: FieldRef<any>, value: number): FilterExpr;
declare function InFiscalPeriodAndYear(field: FieldRef<any>, fiscalPeriod: number, fiscalYear: number): FilterExpr;
declare function InFiscalYear(field: FieldRef<any>, value: number): FilterExpr;
declare function InOrAfterFiscalPeriodAndYear(field: FieldRef<any>, fiscalPeriod: number, fiscalYear: number): FilterExpr;
declare function InOrBeforeFiscalPeriodAndYear(field: FieldRef<any>, fiscalPeriod: number, fiscalYear: number): FilterExpr;
declare function Last7Days(field: FieldRef<any>): FilterExpr;
declare function LastFiscalPeriod(field: FieldRef<any>): FilterExpr;
declare function LastFiscalYear(field: FieldRef<any>): FilterExpr;
declare function LastMonth(field: FieldRef<any>): FilterExpr;
declare function LastWeek(field: FieldRef<any>): FilterExpr;
declare function LastXDays(field: FieldRef<any>, value: number): FilterExpr;
declare function LastXFiscalPeriods(field: FieldRef<any>, value: number): FilterExpr;
declare function LastXFiscalYears(field: FieldRef<any>, value: number): FilterExpr;
declare function LastXHours(field: FieldRef<any>, value: number): FilterExpr;
declare function LastXMonths(field: FieldRef<any>, value: number): FilterExpr;
declare function LastXWeeks(field: FieldRef<any>, value: number): FilterExpr;
declare function LastXYears(field: FieldRef<any>, value: number): FilterExpr;
declare function LastYear(field: FieldRef<any>): FilterExpr;
declare function Next7Days(field: FieldRef<any>): FilterExpr;
declare function NextFiscalPeriod(field: FieldRef<any>): FilterExpr;
declare function NextFiscalYear(field: FieldRef<any>): FilterExpr;
declare function NextMonth(field: FieldRef<any>): FilterExpr;
declare function NextWeek(field: FieldRef<any>): FilterExpr;
declare function NextXDays(field: FieldRef<any>, value: number): FilterExpr;
declare function NextXFiscalPeriods(field: FieldRef<any>, value: number): FilterExpr;
declare function NextXFiscalYears(field: FieldRef<any>, value: number): FilterExpr;
declare function NextXHours(field: FieldRef<any>, value: number): FilterExpr;
declare function NextXMonths(field: FieldRef<any>, value: number): FilterExpr;
declare function NextXWeeks(field: FieldRef<any>, value: number): FilterExpr;
declare function NextXYears(field: FieldRef<any>, value: number): FilterExpr;
declare function NextYear(field: FieldRef<any>): FilterExpr;
declare function NotBetween(field: FieldRef<any>, value1: string | number, value2: string | number): FilterExpr;
declare function NotEqualBusinessId(field: FieldRef<any>): FilterExpr;
declare function NotEqualUserId(field: FieldRef<any>): FilterExpr;
declare function NotIn<T extends string | number>(field: FieldRef<T>, values: T[]): FilterExpr;
declare function NotUnder(field: FieldRef<any>, value: string): FilterExpr;
declare function OlderThanXDays(field: FieldRef<any>, value: number): FilterExpr;
declare function OlderThanXHours(field: FieldRef<any>, value: number): FilterExpr;
declare function OlderThanXMinutes(field: FieldRef<any>, value: number): FilterExpr;
declare function OlderThanXMonths(field: FieldRef<any>, value: number): FilterExpr;
declare function OlderThanXWeeks(field: FieldRef<any>, value: number): FilterExpr;
declare function OlderThanXYears(field: FieldRef<any>, value: number): FilterExpr;
declare function On(field: FieldRef<any>, value: string): FilterExpr;
declare function OnOrAfter(field: FieldRef<any>, value: string): FilterExpr;
declare function OnOrBefore(field: FieldRef<any>, value: string): FilterExpr;
declare function ThisFiscalPeriod(field: FieldRef<any>): FilterExpr;
declare function ThisFiscalYear(field: FieldRef<any>): FilterExpr;
declare function ThisMonth(field: FieldRef<any>): FilterExpr;
declare function ThisWeek(field: FieldRef<any>): FilterExpr;
declare function ThisYear(field: FieldRef<any>): FilterExpr;
declare function Today(field: FieldRef<any>): FilterExpr;
declare function Tomorrow(field: FieldRef<any>): FilterExpr;
declare function Under(field: FieldRef<any>, value: string): FilterExpr;
declare function UnderOrEqual(field: FieldRef<any>, value: string): FilterExpr;
declare function Yesterday(field: FieldRef<any>): FilterExpr;
//#endregion
//#region src/query/shared/aggregation.d.ts
declare class GroupByExpr<V = any> {
  field: string;
  fieldRef?: FieldRef<V>;
  path?: FieldPath;
  constructor(field: string, fieldRef?: FieldRef<V>);
}
declare class Aggregation<V = any> {
  field?: string;
  fieldRef?: FieldRef<V>;
  path?: FieldPath;
  operation: string;
  constructor(operation: string, field?: string, fieldRef?: FieldRef<V>);
}
type NumericRef = FieldRef<number> | FieldRef<number | null>;
type MinMaxRef = NumericRef | FieldRef<Date> | FieldRef<Date | null>;
declare function sum(field: NumericRef): Aggregation<number>;
declare function min(field: MinMaxRef): Aggregation<number | Date>;
declare function max(field: MinMaxRef): Aggregation<number | Date>;
declare function average(field: NumericRef): Aggregation<number>;
declare function count(field?: FieldRef<any>): Aggregation<number>;
declare function groupby<V>(field: FieldRef<V>): GroupByExpr<V>;
//#endregion
//#region src/query/odata/ast.d.ts
type ODataAlias = string;
type ODataPath = string;
type ODataFilterValue = string | number | boolean | Date | null;
type ODataFilterNode = {
  readonly type: "comparison";
  readonly field: ODataPath;
  readonly operator: string;
  readonly value: ODataFilterValue;
} | {
  readonly type: "null";
  readonly field: ODataPath;
  readonly positive: boolean;
} | {
  readonly type: "contains" | "startsWith" | "endsWith";
  readonly field: ODataPath;
  readonly value: string;
} | {
  readonly type: "compare";
  readonly field: ODataPath;
  readonly operator: string;
  readonly otherField: ODataPath;
} | {
  readonly type: "lambda";
  readonly field: ODataPath;
  readonly operator: "any" | "all";
  readonly alias: string;
  readonly condition: ODataFilterNode;
} | {
  readonly type: "fn";
  readonly field: ODataPath;
  readonly fnName: string;
  readonly operator: string;
  readonly values: readonly ODataFilterValue[];
} | {
  readonly type: "raw";
  readonly value: string;
} | {
  readonly type: "and" | "or";
  readonly conditions: readonly ODataFilterNode[];
} | {
  readonly type: "not";
  readonly condition: ODataFilterNode;
};
type ODataAggregateExpressionAst = {
  field?: ODataPath;
  operation: string;
  alias: string;
};
type ODataApplyAst = {
  kind: "groupby";
  fields: ODataPath[];
  next?: ODataApplyAst;
} | {
  kind: "aggregate";
  expressions: ODataAggregateExpressionAst[];
};
type ODataOrderAst = {
  field: ODataPath;
  direction: "asc" | "desc";
};
type ODataAggregateOrderAst = {
  field: ODataAlias;
  direction: "asc" | "desc";
};
type ODataExpandAst = {
  navigation: ODataPath;
  query?: ODataSelectAst;
};
type ODataSelectAst = {
  kind: "select";
  select?: ODataPath[];
  filters?: ODataFilterNode[];
  orderby?: ODataOrderAst[];
  expands?: ODataExpandAst[];
  top?: number;
};
type ODataAggregateAst = {
  kind: "aggregate";
  filters?: ODataFilterNode[];
  apply?: ODataApplyAst;
  orderby?: ODataAggregateOrderAst[];
  top?: number;
};
declare function toODataPath(path: FieldPath): ODataPath;
declare function toODataFilterNode(node: FilterNode): ODataFilterNode;
declare function serializeODataSelect(ast: ODataSelectAst, separator?: "&" | ";"): string;
declare function serializeODataAggregate(ast: ODataAggregateAst): string;
//#endregion
//#region src/query/odata/builder.d.ts
type ODataLambdaProxy<P extends GenericProperties> = { [K in keyof P]: FieldRef<any>; };
type ODataCollectionNavProxy<P extends GenericProperties> = {
  toString(): string;
} & ODataFieldProxy<P>;
type ODataLookupNavProxy<P extends GenericProperties> = {
  toString(): string;
} & ODataFieldProxy<P>;
type ODataFieldProxy<T extends GenericProperties> = { [K in keyof T]: T[K] extends CollectionProperty<infer P> ? ODataCollectionNavProxy<P> : T[K] extends LookupProperty<infer P> ? ODataLookupNavProxy<P> : T[K] extends FieldBase<infer V> ? FieldRef<V, K extends string ? K : never, T[K]> : never; };
type ValueKeys<T extends GenericProperties> = { [K in keyof T]: T[K] extends {
  kind: 'value';
} | {
  type: 'lookupId';
} | {
  type: 'file';
} ? K : never; }[keyof T];
type CollectionKeys<T extends GenericProperties> = { [K in keyof T]: T[K] extends CollectionProperty<any> ? K : never; }[keyof T];
type LookupKeys<T extends GenericProperties> = { [K in keyof T]: T[K] extends LookupProperty<any> ? K : never; }[keyof T];
type NavKeys<T extends GenericProperties> = CollectionKeys<T> | LookupKeys<T>;
type RelatedProps<T extends GenericProperties, K extends keyof T> = T[K] extends CollectionProperty<infer P> ? P : T[K] extends LookupProperty<infer P> ? P : never;
type ApplyResultType$1<R extends Record<string, GroupByExpr<any> | Aggregation<any>>> = { [K in keyof R]: R[K] extends GroupByExpr<infer V> ? V : R[K] extends Aggregation<infer V> ? V : never; };
type MergeExpand<T, K extends string, V> = { [P in keyof T | K]: P extends K ? V : P extends keyof T ? T[P] : never; };
type ApplyAliasProxy$1<R extends Record<string, any>> = { [K in keyof R]: FieldRef<R[K], K extends string ? K : never>; };
interface ApplyQuery<T extends GenericProperties, TResult extends Record<string, any>> {
  filter(filter: string): ApplyQuery<T, TResult>;
  filter(filter: FilterExpr): ApplyQuery<T, TResult>;
  filter(filter: (f: ODataFieldProxy<T>) => string | FilterExpr): ApplyQuery<T, TResult>;
  orderby(fieldSelector: (f: ApplyAliasProxy$1<TResult>) => string | FieldRef<any>, direction?: "asc" | "desc"): ApplyQuery<T, TResult>;
  orderby(alias: string, direction?: "asc" | "desc"): ApplyQuery<T, TResult>;
  top(n: number): ApplyQuery<T, TResult>;
  toAst(): ODataAggregateAst;
  toString(): string;
  execute(): Promise<TResult[]>;
  iterate(options?: {
    pageSize?: number;
  }): AsyncGenerator<TResult>;
  iteratePages(options?: {
    pageSize?: number;
  }): AsyncGenerator<TResult[]>;
}
interface InitialQuery<TAll extends GenericProperties> {
  select(): SelectQuery<TAll, TAll>;
  select<K extends ValueKeys<TAll>>(...keys: K[]): SelectQuery<TAll, { [P in K]: TAll[P]; }, { [P in K]: Infer<TAll[P]>; }>;
  apply<R extends Record<string, GroupByExpr<any> | Aggregation<any>>>(expr: (f: ODataFieldProxy<TAll>) => R): ApplyQuery<TAll, ApplyResultType$1<R>>;
}
interface SelectQuery<TAll extends GenericProperties, TChosen extends Record<string, any>, TResult = Infer<TChosen>> {
  expand<K extends NavKeys<TAll>>(key: K): SelectQuery<TAll, MergeExpand<TChosen, K & string, TAll[K]>, MergeExpand<TResult, K & string, Infer<TAll[K]>>>;
  expand<K extends CollectionKeys<TAll>, R extends Record<string, any>>(key: K, sub: (q: CollectionSubQuery<RelatedProps<TAll, K>, RelatedProps<TAll, K>>) => CollectionSubQuery<RelatedProps<TAll, K>, R>): SelectQuery<TAll, MergeExpand<TChosen, K & string, R[]>, MergeExpand<TResult, K & string, Infer<R>[]>>;
  expand<K extends LookupKeys<TAll>, R extends Record<string, any>>(key: K, sub: (q: LookupSubQuery<RelatedProps<TAll, K>, RelatedProps<TAll, K>>) => LookupSubQuery<RelatedProps<TAll, K>, R>): SelectQuery<TAll, MergeExpand<TChosen, K & string, R | null>, MergeExpand<TResult, K & string, Infer<R> | null>>;
  filter(filter: string): SelectQuery<TAll, TChosen, TResult>;
  filter(filter: FilterExpr): SelectQuery<TAll, TChosen, TResult>;
  filter(filter: (f: ODataFieldProxy<TAll>) => string | FilterExpr): SelectQuery<TAll, TChosen, TResult>;
  orderby(fieldSelector: (f: ODataFieldProxy<TAll>) => string | FieldRef<any>, direction?: "asc" | "desc"): SelectQuery<TAll, TChosen, TResult>;
  orderby(alias: string, direction?: "asc" | "desc"): SelectQuery<TAll, TChosen, TResult>;
  top(n: number): SelectQuery<TAll, TChosen, TResult>;
  toAst(): ODataSelectAst;
  toString(): string;
  execute(): Promise<TResult[]>;
  iterate(options?: {
    pageSize?: number;
  }): AsyncGenerator<TResult>;
  iteratePages(options?: {
    pageSize?: number;
  }): AsyncGenerator<TResult[]>;
}
interface CollectionSubQuery<TAll extends GenericProperties, TChosen extends Record<string, any>, TResult = Infer<TChosen>> {
  select<K extends ValueKeys<TAll>>(...keys: K[]): CollectionSubQuery<TAll, { [P in K]: TAll[P]; }, { [P in K]: Infer<TAll[P]>; }>;
  expand<K extends CollectionKeys<TAll>, R extends Record<string, any>>(key: K, sub: (q: CollectionSubQuery<RelatedProps<TAll, K>, RelatedProps<TAll, K>>) => CollectionSubQuery<RelatedProps<TAll, K>, R>): CollectionSubQuery<TAll, MergeExpand<TChosen, K & string, R[]>, MergeExpand<TResult, K & string, Infer<R>[]>>;
  expand<K extends LookupKeys<TAll>, R extends Record<string, any>>(key: K, sub: (q: LookupSubQuery<RelatedProps<TAll, K>, RelatedProps<TAll, K>>) => LookupSubQuery<RelatedProps<TAll, K>, R>): CollectionSubQuery<TAll, MergeExpand<TChosen, K & string, R | null>, MergeExpand<TResult, K & string, Infer<R> | null>>;
  filter(filter: string): CollectionSubQuery<TAll, TChosen, TResult>;
  filter(filter: FilterExpr): CollectionSubQuery<TAll, TChosen, TResult>;
  filter(filter: (f: ODataFieldProxy<TAll>) => string | FilterExpr): CollectionSubQuery<TAll, TChosen, TResult>;
  orderby(fieldSelector: (f: ODataFieldProxy<TAll>) => string | FieldRef<any>, direction?: "asc" | "desc"): CollectionSubQuery<TAll, TChosen, TResult>;
  orderby(alias: string, direction?: "asc" | "desc"): CollectionSubQuery<TAll, TChosen, TResult>;
  top(n: number): CollectionSubQuery<TAll, TChosen, TResult>;
}
interface LookupSubQuery<TAll extends GenericProperties, TChosen extends Record<string, any>, TResult = Infer<TChosen>> {
  select<K extends ValueKeys<TAll>>(...keys: K[]): LookupSubQuery<TAll, { [P in K]: TAll[P]; }, { [P in K]: Infer<TAll[P]>; }>;
  expand<K extends CollectionKeys<TAll>, R extends Record<string, any>>(key: K, sub: (q: CollectionSubQuery<RelatedProps<TAll, K>, RelatedProps<TAll, K>>) => CollectionSubQuery<RelatedProps<TAll, K>, R>): LookupSubQuery<TAll, MergeExpand<TChosen, K & string, R[]>, MergeExpand<TResult, K & string, Infer<R>[]>>;
  expand<K extends LookupKeys<TAll>, R extends Record<string, any>>(key: K, sub: (q: LookupSubQuery<RelatedProps<TAll, K>, RelatedProps<TAll, K>>) => LookupSubQuery<RelatedProps<TAll, K>, R>): LookupSubQuery<TAll, MergeExpand<TChosen, K & string, R | null>, MergeExpand<TResult, K & string, Infer<R> | null>>;
}
declare class ODataApplyQuery<T extends GenericProperties, TResult extends Record<string, any> = Record<string, any>> {
  private _table;
  private _filters;
  private _apply?;
  private _orderby;
  private _top?;
  private _aliasProxy;
  private _aliasFields;
  constructor(table: DataverseTable<T>, apply: ODataApplyAst | undefined, aliasProxy: Record<string, string>, initialFilters?: FilterNode[], aliasFields?: Record<string, FieldRef<any> | undefined>);
  filter(filter: string): this;
  filter(filter: FilterExpr): this;
  filter(filter: (f: ODataFieldProxy<T>) => string | FilterExpr): this;
  orderby(fieldSelector: (f: ApplyAliasProxy$1<TResult>) => string | FieldRef<any>, direction?: "asc" | "desc"): this;
  orderby(alias: string, direction?: "asc" | "desc"): this;
  top(n: number): this;
  private _build;
  toAst(): ODataAggregateAst;
  toString(): string;
  private _transformRow;
  execute(): Promise<TResult[]>;
  iterate(options?: {
    pageSize?: number;
  }): AsyncGenerator<TResult>;
  iteratePages(options?: {
    pageSize?: number;
  }): AsyncGenerator<TResult[]>;
}
declare function buildLambdaProxy<P extends GenericProperties>(alias: string, table: DataverseTable<P>): ODataLambdaProxy<P>;
declare function any<P extends GenericProperties>(proxy: ODataCollectionNavProxy<P>, condition: (x: ODataLambdaProxy<P>) => string | FilterExpr): FilterExpr;
declare function all<P extends GenericProperties>(proxy: ODataCollectionNavProxy<P>, condition: (x: ODataLambdaProxy<P>) => string | FilterExpr): FilterExpr;
declare function fetchOdata<T extends GenericProperties>(table: DataverseTable<T>): InitialQuery<T>;
type ODataTableQueryOptions = {
  filter?: string;
  orderby?: Partial<Record<string, "asc" | "desc">> | string;
  top?: number;
};
declare function buildTableQueryAst<T extends GenericProperties>(table: DataverseTable<T>, options?: ODataTableQueryOptions): ODataSelectAst;
//#endregion
//#region src/table.d.ts
type TableRequestOptions = {
  pageSize?: number;
  signal?: AbortSignal;
};
type DataverseTableOptions<TProperties extends GenericProperties> = {
  client: DataverseClient;
  entitySetName: string;
  logicalName: string;
  fields: TProperties;
  schema?: ValidationSchema<Infer<TProperties>>;
  primaryKey?: {
    key: string;
    property: PrimaryKeyField;
  };
};
/**
 * Represents a Dataverse table (entity) and provides methods for CRUD, querying,
 * navigation properties, actions, functions, and bulk operations.
 *
 * Create instances via the constructor with an options object.
 * All API calls go through the provided {@link DataverseClient}.
 *
 * @template TProperties An object mapping property names to their field definitions.
 *
 * @example
 * const client = new DataverseClient({ url: "https://org.crm.dynamics.com" });
 *
 * const Account = new DataverseTable({
 *   client,
 *   entitySetName: "accounts",
 *   logicalName: "account",
 *   fields: {
 *     id: primaryKey("accountid"),
 *     name: string("name"),
 *     revenue: number("revenue"),
 *     primaryContact: lookup("primarycontactid", () => Contact),
 *   },
 * });
 *
 * // Type-safe queries
 * const record = await Account.getRecord("GUID-HERE");
 * console.log(record.name); // typed as string
 */
declare class DataverseTable<TProperties extends GenericProperties> {
  client: DataverseClient;
  fields: TProperties;
  logicalName: string;
  entitySetName: string;
  name: string;
  kind: "table";
  type: "table";
  schema?: ValidationSchema<Infer<TProperties>>;
  primaryKey: {
    key: string;
    property: PrimaryKeyField;
  };
  /**
   * @param options Options including the DataverseClient, entity set name, logical name, and field definitions.
   */
  constructor(options: DataverseTableOptions<TProperties> & {
    schema?: ValidationSchema<Infer<TProperties>>;
  });
  getSchema(): v.BaseSchema<unknown, Infer<TProperties>, v.BaseIssue<unknown>>;
  getDefault(value?: Partial<Infer<TProperties>>): Infer<TProperties>;
  /**
   * Retrieves a single record by its primary key (GUID) or alternate key.
   * Returns `null` when the record is not found.
   *
   * @param id The primary key GUID, alternate key, or string identifier.
   *
   * @example
   * const account = await Account.getRecord("acme-1234-abcd");
   * if (account) console.log(account.name);
   */
  getRecord(id: DataverseKey, options?: {
    signal?: AbortSignal;
  }): Promise<Infer<TProperties> | null>;
  getAlternateKeys(value: Partial<Infer<TProperties>>): AlternateKey;
  /**
   * Retrieves multiple records from the table, with optional filtering, sorting, and paging.
   *
   * @param queryOptions Optional query parameters (filter, orderby, top).
   *
   * @example
   * const activeAccounts = await Account.getRecords({
   *   filter: "statecode eq 0",
   *   orderby: "name asc",
   *   top: 10,
   * });
   */
  getRecords(queryOptions?: ODataTableQueryOptions, options?: TableRequestOptions): Promise<Infer<TProperties>[]>;
  /**
   * Iterates over records one at a time, lazily following `@odata.nextLink` pagination.
   * Each record is transformed like {@link getRecords}. Records within a page are
   * yielded synchronously once the page arrives; only page boundaries trigger HTTP
   * requests. A `break` stops further requests.
   *
   * @param queryOptions Optional query parameters (filter, orderby, top).
   * @param options Optional page-size control.
   *
   * @example
   * for await (const account of Account.iterateRecords({ filter: "statecode eq 0" }, { pageSize: 100 })) {
   *   console.log(account.name);
   * }
   */
  iterateRecords(queryOptions?: ODataTableQueryOptions, options?: TableRequestOptions): AsyncGenerator<Infer<TProperties>>;
  /**
   * Iterates over pages of records, lazily following `@odata.nextLink` pagination.
   * Each yielded page is transformed like {@link getRecords}. The next page is
   * only fetched when the consumer requests it, so `break` stops further requests.
   * Prefer this over {@link iterateRecords} when you want to iterate a page's
   * array synchronously.
   *
   * @param queryOptions Optional query parameters (filter, orderby, top).
   * @param options Optional page-size control.
   *
   * @example
   * for await (const page of Account.iteratePages({ filter: "statecode eq 0" }, { pageSize: 100 })) {
   *   for (const account of page) console.log(account.name);
   * }
   */
  iteratePages(queryOptions?: ODataTableQueryOptions, options?: TableRequestOptions): AsyncGenerator<Infer<TProperties>[]>;
  /**
   * Retrieves the value of a single property for a record by ID.
   * Works for value properties, lookup IDs, lookups (returns expanded record), and collections.
   *
   * @example
   * const age = await Person.getPropertyValue("age", "some-guid");
   * const address = await Person.getPropertyValue("primaryAddress", "some-guid");
   */
  getPropertyValue<TKey extends keyof TProperties>(key: TKey, id: DataverseKey, queryOptions?: ODataTableQueryOptions): Promise<Infer<TProperties[TKey]>>;
  /**
   * Updates the value of a single property for a record by ID.
   * For navigation properties, this associates/dissociates related records.
   *
   * @example
   * await Person.updatePropertyValue("age", "some-guid", 35);
   */
  updatePropertyValue<TKey extends keyof TProperties>(key: TKey, id: DataverseKey, value: Infer<TProperties[TKey]>): Promise<GUID>;
  /**
   * Links an existing child record to a parent record through a navigation property.
   *
   * @example
   * await Person.associateRecord("primaryAddress", "person-guid", "address-guid");
   */
  associateRecord<TKey extends NarrowKeysByValue<TProperties, GenericNavigationProperty>>(key: TKey, id: DataverseKey, childId: GUID): Promise<GUID>;
  /**
   * Removes the link between a parent and child record through a navigation property.
   * Overloads:
   * - Collection/collectionIds: requires childId
   * - Lookup/lookupId: omits childId (clears the lookup)
   *
   * @example
   * await Person.dissociateRecord("addresses", "person-guid", "address-guid");
   * await Person.dissociateRecord("primaryAddress", "person-guid"); // clears lookup
   */
  dissociateRecord<TKey extends NarrowKeysByValue<TProperties, CollectionProperty<any> | CollectionIdsProperty>>(key: TKey, id: DataverseKey, childId: GUID): Promise<GUID>;
  dissociateRecord<TKey extends NarrowKeysByValue<TProperties, LookupProperty<any> | LookupIdProperty>>(key: TKey, id: DataverseKey): Promise<GUID>;
  /**
   * Creates a new record in Dataverse and returns its generated GUID.
   *
   * @param value The record data (partial — primary key is auto-generated).
   *
   * @example
   * const newId = await Person.insertRecord({ name: "John", age: 30 });
   */
  insertRecord(value: Partial<Infer<TProperties>>): Promise<GUID>;
  /**
   * Updates an existing record by ID. Supports optimistic concurrency via etag.
   *
   * @param id The record's primary key.
   * @param value The fields to update (partial record data).
   * @param etag Optional etag for conditional updates (If-Match header).
   *
   * @example
   * await Person.updateRecord("some-guid", { name: "Jane" });
   * // With etag:
   * await Person.updateRecord("some-guid", { name: "Jane" }, 'W/"123456"');
   */
  updateRecord(id: DataverseKey, value: Partial<Infer<TProperties>>, etag?: string): Promise<GUID>;
  /**
   * Creates or updates a record. If `id` is provided the record is updated;
   * otherwise a new record is created. Navigation properties (collections, lookups)
   * are also synced through nested upserts.
   *
   * @param id The GUID of an existing record, or `undefined` to create new.
   * @param value The record data (partial for updates).
   * @param etag Optional etag for conditional upsert.
   *
   * @example
   * // Create
   * const newId = await Person.upsertRecord(undefined, { name: "John" });
   * // Update
   * await Person.upsertRecord(existingId, { name: "Jane" });
   */
  upsertRecord(id: DataverseKey | undefined, value: Partial<Infer<TProperties>>, etag?: string): Promise<GUID>;
  /**
   * Deletes a record by its primary key. Supports optimistic concurrency via etag.
   *
   * @param id The primary key of the record to delete.
   * @param etag Optional etag for conditional deletion.
   *
   * @example
   * await Person.deleteRecord("some-guid");
   */
  deleteRecord(id: DataverseKey, etag?: string): Promise<GUID>;
  /**
   * Activates a record by setting its `statecode` to 0.
   *
   * @example
   * await Person.activateRecord("some-guid");
   */
  activateRecord(id: DataverseKey): Promise<GUID>;
  /**
   * Deactivates a record by setting its `statecode` to 1.
   *
   * @example
   * await Person.deactivateRecord("some-guid");
   */
  deactivateRecord(id: DataverseKey): Promise<GUID>;
  /**
   * Deletes (clears) the value of a value property for a record. Cannot be used
   * on navigation properties.
   *
   * @example
   * await Person.deletePropertyValue("name", "some-guid");
   */
  deletePropertyValue<TKey extends NarrowKeysByValue<TProperties, GenericValueProperty>>(key: TKey, id: DataverseKey): Promise<GUID>;
  /**
   * Executes a bound Dataverse action on this entity set or a specific record.
   * POST /{entitySet}({id})/Microsoft.Dynamics.CRM.{ActionName}
   *
   * @param actionName The Dataverse action name (without the CRM namespace prefix, e.g. `"GenerateInvoice"`).
   * @param params Optional parameters to pass in the request body.
   * @param id Optional record GUID — if provided, the action is bound to a specific record.
   *
   * @example
   * // Bound to entity set
   * await Account.executeAction("BulkDetectDuplicates", { ... });
   * // Bound to a record
   * await Account.executeAction("CalculatePrice", { discount: 10 }, "record-guid");
   */
  executeAction(actionName: string, params?: Record<string, any>, id?: DataverseKey): Promise<any>;
  /**
   * Executes a bound Dataverse function on a record.
   * GET /{entitySet}({id})/Microsoft.Dynamics.CRM.{FunctionName}(...)
   *
   * @param functionName The Dataverse function name (e.g. `"CalculateActualValueOfOpportunity"`).
   * @param id The record GUID to bind the function to.
   * @param params Optional function parameters (appended as query parameters).
   *
   * @example
   * const result = await Opportunity.executeFunction(
   *   "CalculateActualValueOfOpportunity",
   *   "opportunity-guid",
   * );
   */
  executeFunction(functionName: string, id: DataverseKey, params?: Record<string, any>): Promise<any>;
  /**
   * Creates multiple records in a single API call via `CreateMultiple`.
   *
   * @param records Array of partial records to create.
   *
   * @example
   * await Account.createMultiple([
   *   { name: "Acme" },
   *   { name: "Beta" },
   * ]);
   */
  createMultiple(records: Partial<Infer<TProperties>>[]): Promise<any>;
  /**
   * Updates multiple records in a single API call via `UpdateMultiple`.
   *
   * @param records Array of partial records to update (must include primary key).
   *
   * @example
   * await Account.updateMultiple([
   *   { id: "guid-1", name: "Acme Updated" },
   *   { id: "guid-2", name: "Beta Updated" },
   * ]);
   */
  updateMultiple(records: Partial<Infer<TProperties>>[]): Promise<any>;
  /**
   * Deletes multiple records in a single API call via `DeleteMultiple`.
   *
   * @param ids Array of record GUIDs to delete.
   *
   * @example
   * await Account.deleteMultiple(["guid-1", "guid-2"]);
   */
  deleteMultiple(ids: string[]): Promise<any>;
  /**
   * Extracts the primary key GUID from a record object, or `undefined` if not present.
   *
   * @example
   * const account = await Account.getRecord("some-guid");
   * const pk = Account.getPrimaryId(account); // GUID | undefined
   */
  getPrimaryId(value: Partial<Infer<TProperties>>): GUID | undefined;
  transformValueFromDataverse(value: any): Infer<TProperties>;
  transformValueToDataverse(value: Partial<Infer<TProperties>>, ctx?: TransformContext): Promise<DataverseRecord>;
  /**
   * Creates a new `Table` with only the specified properties. Useful for
   * narrowing the type when querying a subset of columns.
   *
   * @example
   * const NameOnly = Account.pickProperties("name", "id");
   * const records = await NameOnly.getRecords(); // { name: string; id: GUID }[]
   */
  pickProperties<TKeys extends keyof TProperties>(...keys: TKeys[]): DataverseTable<Pick<TProperties, TKeys>>;
  /**
   * Creates a new `DataverseTable` with the specified properties excluded.
   *
   * @example
   * const WithoutSensitive = Person.omitProperties("ssn");
   */
  omitProperties<TKeys extends keyof TProperties>(...keys: TKeys[]): DataverseTable<Omit<TProperties, TKeys>>;
  /**
   * Creates a new `DataverseTable` with additional properties appended.
   *
   * @example
   * const Extended = Account.appendProperties({
   *   customField: string("new_stringcolumn"),
   * });
   * // Extended has all original fields plus `customField`
   */
  appendProperties<TAppendedProperties extends GenericProperties>(properties: TAppendedProperties): DataverseTable<Omit<TProperties, keyof TAppendedProperties> & TAppendedProperties>;
  deleteFile(id: GUID, fieldName: string): Promise<void>;
  downloadImage(id: GUID, fieldName: string): Promise<Blob>;
  deleteImage(id: GUID, fieldName: string): Promise<void>;
  private _afterSave;
  /** Use for type inference: `Infer<typeof Account>` resolves to the record type. */
  T: Infer<TProperties>;
}
/**
 * Represents a Dataverse many-to-many intersect (association) table.
 *
 * This is a simple descriptor for use with FetchXML's {@link EntityQueryBuilder.join join()}
 * method. It does NOT extend {@link DataverseTable} — it is not a queryable entity on its own.
 *
 * @example
 * const AccountContact = new DataverseIntersectTable("accountcontact", Account, Contact);
 *
 * // Use in FetchXML via join():
 * fetchXml(Account)
 *   .select(f => ({ name: f.name }))
 *   .join("inner", AccountContact, sub =>
 *     sub.select(f => ({ accountName: f.name }))
 *   )
 */
declare class DataverseIntersectTable<T1 extends GenericProperties, T2 extends GenericProperties> {
  /** Marks this table as an intersect table for FetchXML joins. */
  readonly intersect = true;
  /**
   * The intersect table name used in FetchXML `<link-entity name="...">`.
   * This is the Dataverse entity logical name (e.g. `"accountcontact"`).
   * It is NOT an entity set name (no pluralization) — unlike {@link DataverseTable.entitySetName}
   * and {@link DataverseTable.logicalName}, this single `name` serves both roles
   * for intersect table references in FetchXML join syntax.
   */
  readonly name: string;
  /** The first related table. */
  readonly table1: DataverseTable<T1>;
  /** The second related table. */
  readonly table2: DataverseTable<T2>;
  constructor(name: string, table1: DataverseTable<T1>, table2: DataverseTable<T2>);
}
//#endregion
//#region src/fields.d.ts
type ValidationSchema<T> = v.BaseSchema<T, T, v.BaseIssue<unknown>>;
type FieldOptions<T> = {
  default?: T;
  readonly?: boolean;
  schema?: ValidationSchema<T>;
};
declare const SKIP: unique symbol;
type TransformContext = {
  table: DataverseTable<any>;
  client: DataverseClient;
  recordId: string;
};
declare abstract class FieldBase<T> {
  #private;
  name: string;
  fromDataverseName: string;
  toDataverseName: string;
  kind: string;
  type: string;
  schema: ValidationSchema<T>;
  constructor(name: string, defaults: {
    defaultValue: T;
    schema: ValidationSchema<T>;
  }, options?: FieldOptions<T>);
  getDefault(): T;
  getReadOnly(): boolean;
  transformValueFromDataverse(value: unknown, ctx?: TransformContext): T;
  transformValueToDataverse(value: unknown, ctx?: TransformContext): unknown;
  afterSave?(ctx: TransformContext, value: any): Promise<void>;
}
declare class BooleanField extends FieldBase<boolean> {
  kind: "value";
  type: "boolean";
  constructor(name: string, options?: FieldOptions<boolean>);
  transformValueFromDataverse(value: any): boolean;
}
declare class NullableBooleanField extends FieldBase<boolean | null> {
  kind: "value";
  type: "boolean";
  constructor(name: string, options?: FieldOptions<boolean | null>);
  transformValueFromDataverse(value: any): boolean | null;
}
declare class NumberField extends FieldBase<number> {
  kind: "value";
  type: "number";
  constructor(name: string, options?: FieldOptions<number>);
  transformValueFromDataverse(value: any): number;
}
declare class NullableNumberField extends FieldBase<number | null> {
  kind: "value";
  type: "number";
  constructor(name: string, options?: FieldOptions<number | null>);
  transformValueFromDataverse(value: any): number | null;
}
declare class StringField extends FieldBase<string> {
  kind: "value";
  type: "string";
  constructor(name: string, options?: FieldOptions<string>);
  transformValueFromDataverse(value: any): string;
}
declare class NullableStringField extends FieldBase<string | null> {
  kind: "value";
  type: "string";
  constructor(name: string, options?: FieldOptions<string | null>);
  transformValueFromDataverse(value: any): string | null;
}
declare class PrimaryKeyField extends FieldBase<GUID> {
  kind: "value";
  type: "primaryKey";
  constructor(name: string, options?: FieldOptions<GUID>);
  getDefault(): GUID;
}
declare class ListField<T extends string | number> extends FieldBase<T | null> {
  kind: "value";
  type: "list";
  readonly list: readonly T[];
  constructor(name: string, list: Array<T>, options?: FieldOptions<T | null>);
}
declare class ChoiceField<T extends Record<number, string>> extends FieldBase<T[keyof T]> {
  #private;
  kind: "value";
  type: "choice";
  constructor(name: string, options: T, fieldOptions?: FieldOptions<T[keyof T]>);
  transformValueFromDataverse(value: any): T[keyof T];
  transformValueToDataverse(value: any): number;
}
declare class NullableChoiceField<T extends Record<number, string>> extends FieldBase<T[keyof T] | null> {
  #private;
  kind: "value";
  type: "choice";
  constructor(name: string, options: T, fieldOptions?: FieldOptions<T[keyof T] | null>);
  transformValueFromDataverse(value: any): T[keyof T] | null;
  transformValueToDataverse(value: any): number | null;
}
declare class DateTimeField extends FieldBase<Date> {
  kind: "value";
  type: "date";
  constructor(name: string, options?: FieldOptions<Date>);
  getDefault(): Date;
  transformValueFromDataverse(value: any): Date;
}
declare class NullableDateTimeField extends FieldBase<Date | null> {
  kind: "value";
  type: "date";
  constructor(name: string, options?: FieldOptions<Date | null>);
  transformValueFromDataverse(value: any): Date | null;
}
declare class DateField extends FieldBase<Date> {
  kind: "value";
  type: "dateOnly";
  constructor(name: string, options?: FieldOptions<Date>);
  transformValueFromDataverse(value: any): Date;
  transformValueToDataverse(value: any): string | null;
}
declare class NullableDateField extends FieldBase<Date | null> {
  kind: "value";
  type: "dateOnly";
  constructor(name: string, options?: FieldOptions<Date | null>);
  transformValueFromDataverse(value: any): Date | null;
  transformValueToDataverse(value: any): string | null;
}
declare class FormattedField extends FieldBase<string | null> {
  kind: "value";
  type: "formatted";
  constructor(name: string, options?: FieldOptions<string | null>);
}
declare class ImageField extends FieldBase<ImageRef | null> {
  kind: "value";
  type: "image";
  constructor(name: string, options?: FieldOptions<ImageRef | null>);
  transformValueFromDataverse(value: any, ctx?: TransformContext): ImageRef | null;
  transformValueToDataverse(value: ImageRef | null): Promise<string | null | typeof SKIP>;
  afterSave(ctx: TransformContext, value: any): Promise<void>;
}
type FileRef = {
  name: string;
  url?: string;
  data?: Blob | null;
};
type ImageRef = {
  readonly url?: string;
  readonly fullSizeUrl?: string;
  data?: Blob | null;
};
declare class FileField extends FieldBase<FileRef | null> {
  type: "file";
  kind: "file";
  constructor(name: string, options?: FieldOptions<FileRef | null>);
  transformValueFromDataverse(value: any, ctx?: TransformContext): FileRef | null;
  transformValueToDataverse(): typeof SKIP;
  afterSave(ctx: TransformContext, value: FileRef): Promise<void>;
}
declare class JsonField<T> extends FieldBase<T> {
  kind: "value";
  type: "json";
  constructor(name: string, schema: ValidationSchema<T>, options?: FieldOptions<T>);
  transformValueFromDataverse(value: any): T;
  transformValueToDataverse(value: any): string | null;
}
/**
 * Creates a boolean-typed Dataverse column definition.
 *
 * @param name The Dataverse logical name of the column (e.g. `"is_active"`).
 *
 * @example
 * const table = new DataverseTable({
 *   isActive: boolean("is_active"),
 * });
 * // Infer<typeof table>["isActive"] → boolean
 */
declare function boolean(name: string, options?: FieldOptions<boolean>): BooleanField;
declare function nullableBoolean(name: string, options?: FieldOptions<boolean | null>): NullableBooleanField;
/**
 * Creates a number-typed Dataverse column definition.
 *
 * @param name The Dataverse logical name of the column (e.g. `"person_age"`).
 *
 * @example
 * const table = new DataverseTable({
 *   age: number("person_age"),
 * });
 * // Infer<typeof table>["age"] → number
 */
declare function number(name: string, options?: FieldOptions<number>): NumberField;
/**
 * Creates a nullable number column definition (allows `null`).
 *
 * @param name The Dataverse logical name of the column.
 *
 * @example
 * const table = new DataverseTable({
 *   age: nullableNumber("person_age"),
 * });
 * // Infer<typeof table>["age"] → number | null
 */
declare function nullableNumber(name: string, options?: FieldOptions<number | null>): NullableNumberField;
/**
 * Creates a string-typed Dataverse column definition.
 *
 * @param name The Dataverse logical name of the column (e.g. `"fullname"`).
 *
 * @example
 * const table = new DataverseTable({
 *   name: string("fullname"),
 * });
 * // Infer<typeof table>["name"] → string
 */
declare function string(name: string, options?: FieldOptions<string>): StringField;
/**
 * Creates a nullable string column definition (allows `null`).
 *
 * @param name The Dataverse logical name of the column.
 *
 * @example
 * const table = new DataverseTable({
 *   middleName: nullableString("middlename"),
 * });
 * // Infer<typeof table>["middleName"] → string | null
 */
declare function nullableString(name: string, options?: FieldOptions<string | null>): NullableStringField;
/**
 * Creates a primary key (GUID) column definition for a Dataverse table.
 *
 * @param name The Dataverse logical name of the primary key column (e.g. `"contactid"`).
 *
 * @example
 * const table = new DataverseTable({
 *   id: primaryKey("contactid"),
 * });
 * // Infer<typeof table>["id"] → `${string}-${string}-${string}-${string}-${string}`
 */
declare function primaryKey(name: string, options?: FieldOptions<GUID>): PrimaryKeyField;
/**
 * Creates a choice/option-set column definition with a fixed set of allowed values.
 *
 * @param name The Dataverse logical name of the column.
 * @param list The array of allowed string or numeric values.
 *
 * @example
 * const table = new DataverseTable({
 *   gender: list("gendercode", [1, 2]),
 * });
 * // Infer<typeof table>["gender"] → 1 | 2 | null
 */
declare function list<T extends string | number>(name: string, list: Array<T>, options?: FieldOptions<T | null>): ListField<T>;
/**
 * Creates a choice/option-set column definition. Maps Dataverse numeric option values
 * to human-readable string labels.
 *
 * @param name The Dataverse logical name of the column.
 * @param options An object mapping numeric option values to string labels.
 *
 * @example
 * const table = new DataverseTable({
 *   status: choice("statuscode", { 1: "Active", 2: "Inactive", 3: "Archived" }),
 * });
 * // Infer<typeof table>["status"] → "Active" | "Inactive" | "Archived"
 */
declare function choice<T extends Record<number, string>>(name: string, options: T, fieldOptions?: FieldOptions<T[keyof T]>): ChoiceField<T>;
/**
 * Creates a nullable choice/option-set column definition (allows `null`).
 *
 * @param name The Dataverse logical name of the column.
 * @param options An object mapping numeric option values to string labels.
 *
 * @example
 * const table = new DataverseTable({
 *   priority: nullableChoice("prioritycode", { 1: "Low", 2: "High" }),
 * });
 * // Infer<typeof table>["priority"] → "Low" | "High" | null
 */
declare function nullableChoice<T extends Record<number, string>>(name: string, options: T, fieldOptions?: FieldOptions<T[keyof T] | null>): NullableChoiceField<T>;
/**
 * Creates a date-time column definition (maps to JavaScript `Date`).
 *
 * @param name The Dataverse logical name of the column.
 *
 * @example
 * const table = new DataverseTable({
 *   createdAt: datetime("createdon"),
 * });
 * // Infer<typeof table>["createdAt"] → Date
 */
declare function datetime(name: string, options?: FieldOptions<Date>): DateTimeField;
/**
 * Creates a date-only column definition (maps to JavaScript `Date`, time portion is zeroed).
 *
 * @param name The Dataverse logical name of the column.
 *
 * @example
 * const table = new DataverseTable({
 *   birthDate: date("birthdate"),
 * });
 * // Infer<typeof table>["birthDate"] → Date
 */
declare function date(name: string, options?: FieldOptions<Date>): DateField;
/**
 * Creates a nullable date-only column definition (allows `null`).
 *
 * @param name The Dataverse logical name of the column.
 */
declare function nullableDate(name: string, options?: FieldOptions<Date | null>): NullableDateField;
/**
 * Creates a nullable date-time column definition (allows `null`).
 *
 * @param name The Dataverse logical name of the column.
 */
declare function nullableDateTime(name: string, options?: FieldOptions<Date | null>): NullableDateTimeField;
/**
 * Creates a formatted-value column definition for retrieving user-localized display values
 * (e.g. for option-set labels). These are read-only.
 *
 * @param name The Dataverse logical name of the column.
 *
 * @example
 * const table = new DataverseTable({
 *   statusLabel: formatted("statuscode"),
 * });
 */
declare function formatted(name: string, options?: FieldOptions<string | null>): FormattedField;
/**
 * Creates an image column definition.
 *
 * @param name The Dataverse logical name of the image column.
 */
declare function image(name: string, options?: FieldOptions<ImageRef | null>): ImageField;
/**
 * Creates a file column definition. File columns are read-only and store the file name.
 *
 * @param name The Dataverse logical name of the file column.
 */
declare function file(name: string, options?: FieldOptions<FileRef | null>): FileField;
/**
 * Creates a JSON-typed Dataverse column definition. Stores JSON as a text column
 * in Dataverse and parses/validates it using the provided valibot schema.
 *
 * @param name The Dataverse logical name of the column.
 * @param schema A valibot schema that validates the parsed JSON structure.
 * @param options Optional field options (default, readonly).
 *
 * @example
 * const Address = v.object({ street: v.string(), city: v.string() });
 * const table = new DataverseTable({
 *   address: json("address_data", Address),
 * });
 * // Infer<typeof table>["address"] → { street: string; city: string }
 */
declare function json<T>(name: string, schema: ValidationSchema<T>, options?: FieldOptions<T>): JsonField<T>;
declare class LookupIdProperty extends FieldBase<GUID | null> {
  #private;
  kind: "navigation";
  type: "lookupId";
  navigationName: string;
  constructor(name: string, getTable: GetTable, options?: FieldOptions<GUID | null>);
  get table(): DataverseTable<{
    id: PrimaryKeyField;
  }>;
  transformValueToDataverse(value: any): string | null;
}
declare class CollectionProperty<TProperties extends GenericProperties> extends FieldBase<Infer<TProperties>[]> {
  #private;
  kind: "navigation";
  type: "collection";
  constructor(name: string, getTable: GetTable<DataverseTable<TProperties>>, options?: FieldOptions<Infer<TProperties>[]>);
  get table(): DataverseTable<TProperties>;
  transformValueFromDataverse(value: any): Infer<TProperties>[];
  transformValueToDataverse(): typeof SKIP;
  afterSave(ctx: TransformContext, value: any): Promise<void>;
}
/**
 * Creates a one-to-many (collection) navigation property definition. The related records
 * can be expanded via OData `$expand` or fetched through the table API.
 *
 * @param name The Dataverse logical name of the collection navigation property.
 * @param getTable A thunk that returns the related table definition.
 *
 * @example
 * const Address = table(client, "addresses", { id: primaryKey("addressid"), street: string("street"), ... });
 * const Person = table(client, "people", {
 *   id: primaryKey("personid"),
 *   addresses: collection("person_addresses", () => Address),
 * });
 * // Infer<typeof Person>["addresses"] → { id: GUID; street: string }[]
 */
declare function collection<TProperties extends GenericProperties>(name: string, getTable: GetTable<DataverseTable<TProperties>>): CollectionProperty<TProperties>;
declare class CollectionIdsProperty extends FieldBase<GUID[]> {
  #private;
  kind: "navigation";
  type: "collectionIds";
  constructor(name: string, getTable: GetTable, options?: FieldOptions<GUID[]>);
  get table(): DataverseTable<{
    id: PrimaryKeyField;
  }>;
  transformValueFromDataverse(value: any): GUID[];
  transformValueToDataverse(): typeof SKIP;
  afterSave(ctx: TransformContext, value: any): Promise<void>;
}
/**
 * Creates a collection-of-IDs navigation property definition. Unlike a full collection,
 * this only stores the related record IDs (GUIDs), not the full records.
 *
 * @param name The Dataverse logical name of the navigation property.
 * @param getTable A thunk that returns the related table definition.
 *
 * @example
 * const Address = table(client, "addresses", { id: primaryKey("addressid"), ... });
 * const Person = table(client, "people", {
 *   id: primaryKey("personid"),
 *   addressIds: collectionIds("person_addresses", () => Address),
 * });
 * // Infer<typeof Person>["addressIds"] → `${string}-${string}-${string}-${string}-${string}`[]
 */
declare function collectionIds(name: string, getTable: GetTable): CollectionIdsProperty;
/**
 * Creates a lookup-ID navigation property definition. This stores only the foreign-key
 * GUID of the related record (not the full expanded record).
 *
 * @param name The Dataverse logical name of the lookup column.
 * @param getTable A thunk that returns the related table definition.
 *
 * @example
 * const Address = table(client, "addresses", { id: primaryKey("addressid"), ... });
 * const Person = table(client, "people", {
 *   id: primaryKey("personid"),
 *   primaryAddressId: lookupId("primaryaddressid", () => Address),
 * });
 * // Infer<typeof Person>["primaryAddressId"] → `${string}-${string}-${string}-${string}-${string}` | null
 */
declare function lookupId(name: string, getTable: GetTable): LookupIdProperty;
declare class LookupProperty<TProperties extends GenericProperties> extends FieldBase<Infer<TProperties> | null> {
  #private;
  kind: "navigation";
  type: "lookup";
  constructor(name: string, getTable: GetTable<DataverseTable<TProperties>>, options?: FieldOptions<Infer<TProperties> | null>);
  get table(): DataverseTable<TProperties>;
  transformValueFromDataverse(value: any): Infer<TProperties> | null;
  transformValueToDataverse(): typeof SKIP;
  afterSave(ctx: TransformContext, value: any): Promise<void>;
}
/**
 * Creates a many-to-one (lookup) navigation property definition. The related record
 * can be expanded via OData `$expand` or fetched through the table API.
 *
 * @param name The Dataverse logical name of the lookup column.
 * @param getTable A thunk that returns the related table definition.
 *
 * @example
 * const Address = table(client, "addresses", { id: primaryKey("addressid"), ... });
 * const Person = table(client, "people", {
 *   id: primaryKey("personid"),
 *   primaryAddress: lookup("primaryaddressid", () => Address),
 * });
 * // Infer<typeof Person>["primaryAddress"] → { id: GUID; ... } | null
 */
declare function lookup<TProperties extends GenericProperties>(name: string, getTable: GetTable<DataverseTable<TProperties>>): LookupProperty<TProperties>;
//#endregion
//#region src/types.d.ts
type Primitive = string | number | boolean | null;
/**
 * Represents a Dataverse record, which is essentially a JavaScript object
 * with properties corresponding to the columns/attributes in a Dataverse entity.
 * The 'any' type is used here because the structure of a Dataverse record
 * can vary significantly depending on the entity and the selected attributes.
 */
type DataverseRecord = Record<string, Primitive>;
/**
 * Represents a GUID (Globally Unique Identifier) string, a standard identifier
 * used extensively in Dataverse (and Microsoft technologies in general).
 * The format is a string with five sections separated by hyphens.
 */
type GUID = `${string}-${string}-${string}-${string}-${string}`;
/**
 * Represents an alternate key for a Dataverse entity.  An alternate key is used
 * to uniquely identify a record instead of using its primary key (GUID).
 * It can be a single key-value pair or a combination of multiple key-value pairs.
 */
type AlternateKey = `${string}=${string}` | `${string}=${string},${string}=${string}`;
/**
 * Represents a Dataverse key, which can be either a GUID (primary key) or an AlternateKey.
 */
type DataverseKey = GUID | AlternateKey | string;
/**
 * Utility type to narrow down the keys of an object `T`
 * to only those keys whose values are of type `V`.
 *
 * @template T The type of the object.
 * @template V The type of the values to filter for.
 *
 * @example
 * interface MyObject {
 * id: number;
 * name: string;
 * isActive: boolean;
 * email: string;
 * }
 *
 * type StringKeys = NarrowKeysByValue<MyObject, string>;  // "name" | "email"
 */
type NarrowKeysByValue<T extends object, V> = { [K in keyof T]: T[K] extends V ? K : never; }[keyof T];
/**
 * Infers the TypeScript type from a Dataverse schema definition.  This is a recursive
 * type that drills down through the schema definition (which can be a Table,
 * GenericProperties, or a Property) to extract the corresponding TypeScript type.
 *
 * @template T The Dataverse schema definition.
 */
type Infer<T> = T extends null | undefined ? T : T extends DataverseTable<infer U> ? Infer<U> : T extends CollectionProperty<infer U> ? Infer<U>[] : T extends LookupProperty<infer U> ? Infer<U> | null : T extends FieldBase<infer U> ? U : { [K in keyof T]: Infer<T[K]>; };
/**
 * Represents a generic object of properties, where the keys are property names
 * and the values are GenericProperty definitions.  This is used to define the
 * structure of a Dataverse entity.
 */
type GenericProperties = Record<string, GenericProperty>;
/**
 * Represents a generic navigation property in a Dataverse entity.  Navigation
 * properties are used to define relationships between entities.
 */
type GenericNavigationProperty = CollectionProperty<GenericProperties> | LookupProperty<GenericProperties> | LookupIdProperty | CollectionIdsProperty;
/**
 * Represents a generic value property in a Dataverse entity.  Value properties
 * store the actual data of an entity, such as strings, numbers, dates, etc.
 */
type GenericValueProperty = PrimaryKeyField | StringField | NullableStringField | NumberField | NullableNumberField | BooleanField | NullableBooleanField | DateTimeField | NullableDateTimeField | DateField | NullableDateField | ImageField | ListField<string | number> | FileField | ChoiceField<Record<number, string>> | NullableChoiceField<Record<number, string>> | JsonField<any>;
/**
 * Represents a generic property in a Dataverse entity.  A property can be
 * either a navigation property or a value property.
 */
type GenericProperty = GenericNavigationProperty | GenericValueProperty;
type GetTable<T = any> = () => T;
//#endregion
//#region src/util.d.ts
declare const Etag = "$etag";
declare function isNonEmptyString(value: unknown): value is string;
declare function wrapString(value: unknown): string;
type ExpandValue = string | {
  select?: (Name)[];
  expand?: ExpandObject;
  filter?: string;
  orderby?: {
    [key: string]: "asc" | "desc";
  };
};
interface ExpandObject {
  [key: string]: ExpandValue;
}
declare function select(...values: (Name)[]): string;
declare function orderby(values: {
  [key: string]: "asc" | "desc";
} | string[]): string;
declare class OrderSpec {
  readonly fields: string[];
  readonly direction: "asc" | "desc";
  constructor(fields: string[], direction: "asc" | "desc");
  toString(): string;
}
declare function asc(...fields: Name[]): OrderSpec;
declare function desc(...fields: Name[]): OrderSpec;
declare function keys(keyValues: {
  [key: string]: string | number;
}): string;
declare function expand(values: string | ExpandObject): string;
declare function attachEtag<T>(v: T): T;
declare function getEtag(v: any): string | undefined;
/**
 * Retains references to previous recrods if ETag value is unchanged
 *
 * @param prevRecords
 * @param newRecords
 * @returns
 */
declare function mergeRecords<T>(prevRecords: T[], newRecords: T[]): T[];
/**
 * Creates an XML string from a template string array, removing unnecessary whitespace.
 *
 * @param raw The template string array.
 * @param values The values to interpolate into the template string.
 * @returns A compact XML string.
 *
 * @example
 * // Create a simple XML string:
 * const myXml = xml`
 * <root>
 * <element>Hello</element>
 * </root>
 * `;
 * // returns "<root><element>Hello</element></root>"
 */
declare function xml(raw: TemplateStringsArray, ...values: unknown[]): string;
/**
 * Converts a File object to a base64 encoded string.
 *
 * @param file The File object to convert.
 * @returns A promise that resolves to the base64 encoded string, or rejects with an error.
 *
 * @example
 * // Convert a file to base64:
 * const myFile = document.getElementById('myFile').files[0];
 * toBase64(myFile)
 * .then(base64String => console.log(base64String))
 * .catch(error => console.error(error));
 */
declare function toBase64(file: File): Promise<string>;
/**
 * Creates a data URL from a base64 encoded image string.
 *
 * @param base64 The base64 encoded image string.
 * @returns A data URL representing the image.
 *
 * @example
 * // Create a data URL from a base64 string:
 * const base64String = "iVBORw0KGgoAAAANSUhEUg..."; // A long base64 string
 * const imageUrl = base64ImageToURL(base64String);
 * // returns "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg..."
 */
declare function base64ImageToURL(base64: string): string;
/**
 * Constructs a URL to retrieve an image from Dataverse.
 *
 * @param entity The logical name of the entity the image belongs to.
 * @param name The name of the image attribute.
 * @param id The ID of the entity record.
 * @returns A URL string to download the image.
 *
 * @example
 * // Get the URL for a contact's profile image:
 * const imageUrl = getImageUrl("contact", "entityimage", "12345");
 * // returns "/Image/download.aspx?Entity=contact&Attribute=entityimage&Id=12345&Full=true"
 */
declare function getImageUrl(entity: string, name: string, id: string): string;
declare function parseDateOnly(dateString: string): Date;
declare function toDateOnly(date: Date): string | null;
/** A field name can be a string or an object with a name or toString method. */
type Name = string | {
  name: string;
} | {
  toString(): string;
};
/** Extracts the string name from a FieldName type. */
declare function getName(name: Name): string;
//#endregion
//#region src/client.d.ts
/**
 * A single Prefer value — either a raw string or a structured object
 * for annotations and page size.
 *
 * @example
 * // String form
 * const options: PreferOption[] = ["return=representation", "odata.track-changes"];
 *
 * @example
 * // Object form for annotations
 * const options: PreferOption[] = [{ annotations: "*" }];
 *
 * @example
 * // Object form for page size
 * const options: PreferOption[] = [{ maxPageSize: 500 }];
 */
type PreferOption = "return=representation" | "respond-async" | "odata.track-changes" | {
  annotations: "*" | string[];
} | {
  maxPageSize: number;
};
type RequestOptions = {
  signal?: AbortSignal;
};
type QueryRequestOptions = RequestOptions & {
  query?: string;
};
type GetRecordOptions = QueryRequestOptions & {
  etag?: string;
};
type PatchRecordOptions = QueryRequestOptions & {
  etag?: string;
};
type DeleteRecordOptions = RequestOptions & {
  etag?: string;
};
type PostRecordOptions = QueryRequestOptions & {
  returnRepresentation?: boolean;
};
declare class DataverseHttpError extends Error {
  readonly status: number;
  readonly statusText: string;
  readonly body: unknown;
  readonly response?: Response | undefined;
  constructor(message: string, status: number, statusText: string, body: unknown, response?: Response | undefined);
}
/** Options for configuring a DataverseClient instance. */
type DataverseClientOptions = {
  /** Base URL of the Dataverse environment (defaults to `location.origin`). */
  url?: string;
  /** Bearer token for authentication. */
  token?: string;
  /** Azure AD object ID to impersonate (sets CallerObjectId header). */
  impersonateByAAId?: string;
  /** Dataverse user ID to impersonate (sets MSCRMCallerID header). */
  impersonateByUserId?: string;
  /**
   * OData Prefer header values. Accepts an array of strings or structured objects.
   *
   * @example
   * ```ts
   * prefer: ["return=representation", { annotations: "*" }, { maxPageSize: 500 }]
   * ```
   */
  prefer?: PreferOption[];
  /** Use `"Strong"` to bypass caching and get the latest version. */
  consistency?: "Strong";
  /** Solution unique name — associates the request with an unmanaged solution. */
  solutionUniqueName?: string;
  /** Set to `true` to enable duplicate detection on create/update. */
  suppressDuplicateDetection?: boolean;
  /** Set to `true` to bypass custom plug-in execution (requires prvBypassCustomPlugins privilege). */
  bypassCustomPluginExecution?: boolean;
  /** Additional headers to include on every request. */
  headers?: Record<string, string>;
};
/**
 * Low-level HTTP client for the Dataverse Web API (v9.2).
 * Provides CRUD, batch, action, function, and bulk operation methods.
 *
 * @example
 * const client = new DataverseClient({
 *   url: "https://org.crm.dynamics.com",
 *   token: "eyJ...",
 * });
 *
 * @example
 * // With impersonation
 * const client = new DataverseClient({
 *   url: "https://org.crm.dynamics.com",
 *   impersonateByUserId: "00000000-0000-0000-0000-000000000001",
 * });
 */
declare class DataverseClient {
  options: DataverseClientOptions;
  /** @param options Connection and authentication options. */
  constructor(options?: DataverseClientOptions);
  /**
   * Core HTTP fetch method for all Dataverse API calls.
   * Automatically prepends the API base path, applies auth headers,
   * handles 204/304 responses, and extracts OData-EntityId from POST headers.
   *
   * @example
   * await client.fetch("accounts?$select=name&$top=5")
   *
   * @example
   * await client.fetch("accounts", {
   *   method: "POST",
   *   body: JSON.stringify({ name: "New Account" }),
   * })
   */
  fetch(resource: string, options?: RequestInit & {
    raw?: boolean;
  }): Promise<any>;
  private _resolvePrefer;
  private _iteratePages;
  private _resource;
  /**
   * Retrieves a single record by ID.
   *
   * @example
   * const account = await client.getRecord("accounts", "00000000-0000-0000-0000-000000000001",
   *   "$select=name,revenue")
   */
  getRecord(entitySetName: Name, id: DataverseKey, options?: GetRecordOptions): Promise<any>;
  /**
   * Retrieves multiple records, automatically following `@odata.nextLink` pagination.
   *
   * @example
   * const accounts = await client.getRecords("accounts",
   *   "$select=name,revenue&$filter=revenue gt 10000")
   */
  getRecords(entitySetName: Name, options?: QueryRequestOptions & {
    pageSize?: number;
  }): Promise<any[]>;
  /**
   * Iterates over records one at a time, lazily following `@odata.nextLink` pagination.
   * Records within a page are yielded synchronously once the page arrives; only page
   * boundaries trigger HTTP requests. A `break` stops further requests.
   *
   * @param entitySetName The entity set to query (e.g. `"accounts"`).
   * @param query OData query string (e.g. `"$select=name&$top=10"`).
   * @param options Optional page-size control.
   *
   * @example
   * for await (const account of client.iterateRecords("accounts", "$select=name", { pageSize: 100 })) {
   *   console.log(account.name);
   * }
   */
  iterateRecords(entitySetName: Name, options?: QueryRequestOptions & {
    pageSize?: number;
  }): AsyncGenerator<any>;
  /**
   * Iterates over pages of records, lazily following `@odata.nextLink` pagination.
   * The next page is only fetched when the consumer requests it, so `break`
   * stops further requests. Prefer this over {@link iterateRecords} when you
   * want to iterate a page's array synchronously.
   *
   * @param entitySetName The entity set to query (e.g. `"accounts"`).
   * @param query OData query string (e.g. `"$select=name&$top=10"`).
   * @param options Optional page-size control.
   *
   * @example
   * for await (const page of client.iteratePages("accounts", "$select=name", { pageSize: 100 })) {
   *   for (const account of page) console.log(account.name);
   * }
   */
  iteratePages(entitySetName: Name, options?: QueryRequestOptions & {
    pageSize?: number;
  }): AsyncGenerator<any[]>;
  /**
   * Creates a record and returns its full representation by default.
   * Pass `returnRepresentation: false` to return only the generated GUID.
   *
   * @example
   * const newAccount = await client.postRecord("accounts",
   *   { name: "New Account", revenue: 50000 })
   * const id = await client.postRecord("accounts", { name: "New Account" },
   *   { returnRepresentation: false })
   */
  postRecord(entitySetName: Name, value: object, options: PostRecordOptions & {
    returnRepresentation: false;
  }): Promise<GUID>;
  postRecord(entitySetName: Name, value: object, options?: PostRecordOptions): Promise<any>;
  /**
   * Updates an existing record (partial update via PATCH).
   *
   * @example
   * await client.patchRecord("accounts", "00000000-0000-0000-0000-000000000001",
   *   { name: "Updated Name", revenue: 75000 })
   */
  patchRecord(entitySetName: Name, id: string, value: object, options?: PatchRecordOptions): Promise<any>;
  /**
   * Deletes a record by ID.
   *
   * @example
   * const deletedId = await client.deleteRecord("accounts",
   *   "00000000-0000-0000-0000-000000000001")
   */
  deleteRecord(entitySetName: Name, id: string, options?: DeleteRecordOptions): Promise<GUID>;
  /**
   * Updates a single property value via PUT.
   *
   * @example
   * await client.updatePropertyValue("accounts",
   *   "00000000-0000-0000-0000-000000000001", "name", "New Name")
   */
  updatePropertyValue(entitySetName: Name, id: string, propertyName: Name, value: any, options?: RequestOptions & {
    etag?: string;
  }): Promise<GUID>;
  /**
   * Deletes (nulls out) a single property value.
   *
   * @example
   * await client.deletePropertyValue("accounts",
   *   "00000000-0000-0000-0000-000000000001", "emailaddress1")
   */
  deletePropertyValue(entitySetName: Name, id: string, propertyName: Name, options?: RequestOptions): Promise<GUID>;
  /**
   * Retrieves a single property value.
   *
   * @example
   * const name = await client.getPropertyValue("accounts",
   *   "00000000-0000-0000-0000-000000000001", "name")
   */
  getPropertyValue(entitySetName: Name, id: string, propertyName: Name, options?: RequestOptions): Promise<any>;
  /**
   * Retrieves a property's raw value (e.g. file content) via `/$value`.
   *
   * @example
   * const imageData = await client.getPropertyRawValue("accounts",
   *   "00000000-0000-0000-0000-000000000001", "entityimage")
   */
  getPropertyRawValue(entitySetName: Name, id: string, propertyName: Name, options?: RequestOptions): Promise<any>;
  /**
   * Returns the URL for a property's raw value.
   *
   * @example
   * const url = client.getPropertyRawValueURL("accounts",
   *   "00000000-0000-0000-0000-000000000001", "entityimage")
   */
  getPropertyRawValueURL(entitySetName: Name, id: string, propertyName: Name): string;
  /**
   * Returns the full-size image download URL.
   *
   * @example
   * const url = client.getImageFullSizeURL("accounts",
   *   "00000000-0000-0000-0000-000000000001", "entityimage")
   */
  getImageFullSizeURL(entitySetName: Name, id: string, propertyName: Name): string;
  /**
   * Returns the legacy image download URL.
   *
   * @example
   * const url = client.getImageDownloadURL("accounts",
   *   "00000000-0000-0000-0000-000000000001", "entityimage")
   */
  getImageDownloadURL(entitySetName: Name, id: string, propertyName: Name): string;
  /**
   * Uploads a file to a file property.
   *
   * @example
   * await client.updateFileProperty("accounts",
   *   "00000000-0000-0000-0000-000000000001",
   *   "myfile", "report.pdf", fileBlob)
   */
  updateFileProperty(entitySetName: Name, id: string, propertyName: Name, filename: string, body: string | Blob | BufferSource, options?: RequestOptions): Promise<any>;
  /**
   * Activates a record (sets statecode to 0).
   *
   * @example
   * await client.activateRecord("accounts",
   *   "00000000-0000-0000-0000-000000000001")
   */
  activateRecord(entitySetName: Name, id: string): Promise<GUID>;
  /**
   * Deactivates a record (sets statecode to 1).
   *
   * @example
   * await client.deactivateRecord("accounts",
   *   "00000000-0000-0000-0000-000000000001")
   */
  deactivateRecord(entitySetName: Name, id: string): Promise<GUID>;
  /**
   * Associates two records via a navigation property.
   *
   * @example
   * await client.associateRecord("accounts",
   *   "00000000-0000-0000-0000-000000000001",
   *   "primarycontactid",
   *   "contacts",
   *   "00000000-0000-0000-0000-000000000002")
   */
  associateRecord(entitySetName: Name, parentId: string, propertyName: Name, childEntitySetName: Name, childId: string, options?: RequestOptions): Promise<GUID>;
  /**
   * Dissociates two records. If childId is omitted, all references are removed.
   *
   * @example
   * await client.dissociateRecord("accounts",
   *   "00000000-0000-0000-0000-000000000001",
   *   "primarycontactid",
   *   "00000000-0000-0000-0000-000000000002")
   */
  dissociateRecord(entitySetName: Name, parentId: string, propertyName: Name, childId?: string, options?: RequestOptions): Promise<GUID>;
  /**
   * Retrieves associated records via a collection navigation property.
   *
   * @example
   * const contacts = await client.getAssociatedRecords("accounts",
   *   "00000000-0000-0000-0000-000000000001",
   *   "contact_customer_accounts",
   *   "$select=fullname,email")
   */
  getAssociatedRecords(entitySetName: Name, id: string, navigationPropertyName: Name, options?: QueryRequestOptions & {
    pageSize?: number;
  }): Promise<any[]>;
  /**
   * Retrieves a single associated record via a single-valued navigation property.
   *
   * @example
   * const contact = await client.getAssociatedRecord("accounts",
   *   "00000000-0000-0000-0000-000000000001",
   *   "primarycontactid",
   *   "$select=fullname,email")
   */
  getAssociatedRecord(entitySetName: Name, id: string, navigationPropertyName: Name, options?: QueryRequestOptions): Promise<any>;
  /**
   * Synchronizes a list of associated records: adds new ones and removes ones
   * no longer in the list.
   *
   * @example
   * await client.associateRecordToList("accounts",
   *   "00000000-0000-0000-0000-000000000001",
   *   "contact_customer_accounts",
   *   "contacts",
   *   "contactid",
   *   ["id1", "id2", "id3"])
   */
  associateRecordToList(entitySetName: Name, parentId: string, propertyName: Name, childEntitySetName: Name, childPrimaryKeyName: Name, childIds: string[]): Promise<GUID[]>;
  /**
   * Executes an unbound Dataverse action (POST).
   *
   * @example
   * const result = await client.executeAction("WinQuote", {
   *   QuoteClose: { ... },
   *   Status: 4,
   * })
   */
  executeAction(actionName: string, params?: Record<string, any>): Promise<any>;
  /**
   * Executes a bound Dataverse action on a specific record or entity set (POST).
   *
   * @example
   * // Bound to a record
   * await client.executeBoundAction("accounts",
   *   "WinQuote", { Status: 4 },
   *   "00000000-0000-0000-0000-000000000001")
   *
   * @example
   * // Bound to an entity set (no id)
   * await client.executeBoundAction("accounts", "BulkDelete", { Query: ... })
   */
  executeBoundAction(entitySetName: Name, actionName: string, params?: Record<string, any>, id?: string): Promise<any>;
  /**
   * Executes an unbound Dataverse function (GET).
   *
   * @example
   * const result = await client.executeFunction("WhoAmI")
   *
   * @example
   * const result = await client.executeFunction("CalculateTotalTime",
   *   { Start: "2025-01-01", End: "2025-12-31" })
   */
  executeFunction(functionName: string, params?: Record<string, any>): Promise<any>;
  /**
   * Executes a bound Dataverse function on a specific record (GET).
   *
   * @example
   * const result = await client.executeBoundFunction("accounts",
   *   "00000000-0000-0000-0000-000000000001",
   *   "CalculateDepreciation",
   *   { Year: 2025 })
   */
  executeBoundFunction(entitySetName: Name, id: string, functionName: string, params?: Record<string, any>): Promise<any>;
  /**
   * Creates multiple records in a single API call using CreateMultiple.
   *
   * @example
   * await client.createMultiple("accounts", [
   *   { name: "Account 1" },
   *   { name: "Account 2" },
   * ])
   */
  createMultiple(entitySetName: Name, records: Record<string, any>[]): Promise<any>;
  /**
   * Updates multiple records in a single API call using UpdateMultiple.
   *
   * @example
   * await client.updateMultiple("accounts", [
   *   { accountid: "id1", name: "Updated 1" },
   *   { accountid: "id2", name: "Updated 2" },
   * ])
   */
  updateMultiple(entitySetName: Name, records: Record<string, any>[]): Promise<any>;
  /**
   * Deletes multiple records in a single API call by their IDs.
   *
   * @example
   * await client.deleteMultiple("accounts", [
   *   "00000000-0000-0000-0000-000000000001",
   *   "00000000-0000-0000-0000-000000000002",
   * ])
   */
  deleteMultiple(entitySetName: Name, ids: string[]): Promise<any>;
  _batchTxs: NestedStringArray | null;
  /**
   * Groups multiple requests into a batch for improved performance.
   * All fetch() calls inside the callback are collected and sent as a single
   * HTTP request.
   *
   * @example
   * await client.batch(async () => {
   *   await client.getRecord("accounts", "id1", "$select=name");
   *   await client.getRecord("accounts", "id2", "$select=name");
   * })
   */
  batch(fn: () => Promise<void>): Promise<any>;
  _processBatch(resource: string, options: RequestInit): boolean;
  _changeSetTxs: NestedStringArray | null;
  /**
   * Groups multiple write operations into a change set within a batch.
   * All changes in a change set are committed atomically.
   * If not already inside a batch, automatically wraps one.
   *
   * @example
   * await client.changeset(async () => {
   *   await client.postRecord("accounts", { name: "New" }, { returnRepresentation: false });
   *   await client.patchRecord("accounts", "id", { name: "Updated" });
   * })
   */
  changeset(fn: () => Promise<void>): Promise<void>;
  _processChangeset(resource: string, options: RequestInit): boolean;
}
type NestedStringArray = Array<string | NestedStringArray>;
//#endregion
//#region src/functions.d.ts
/**
 * Retrieves the roles assigned to a user in Azure Active Directory (AAD).
 *
 * @param aadId - The AAD Directory Object ID of the user whose roles need to be fetched.
 * @returns  A promise that resolves to a Set of role names associated with the user.
 */
declare function RetrieveAadUserRoles(client: DataverseClient, aadId: string): Promise<Set<string>>;
/**
 * Retrieves the total record count for a specific entity in the system.
 *
 * @param  logicalName - The logical name of the entity whose total record count is to be fetched.
 * @returns  A promise that resolves to the total record count for the specified entity.
 */
declare function RetrieveTotalRecordCount(client: DataverseClient, logicalName: string): Promise<number>;
/**
 * Retrieves the identity information of the currently authenticated user.
 *
 * @returns A promise that resolves to an object containing the BusinessUnitId, UserId, and OrganizationId
 * of the currently authenticated user.
 */
declare function WhoAmI(client: DataverseClient): Promise<{
  BusinessUnitId: GUID;
  UserId: GUID;
  OrganizationId: GUID;
}>;
declare function RetrieveChoices(client: DataverseClient, name: string): Promise<{
  value: number;
  color: string;
  label: string;
  description: string;
}[]>;
declare function mapChoices(data: any): {
  value: number;
  color: string;
  label: string;
  description: string;
}[];
//#endregion
//#region src/query/fetchxml/ast.d.ts
type FetchXmlAttributeAst = {
  name: string;
  alias?: string;
  aggregate?: string;
  groupby?: boolean;
  dategrouping?: string;
  distinct?: boolean;
  rowaggregate?: string;
};
type FetchXmlOrderAst = {
  attribute: string;
  entityname?: string;
  descending?: boolean;
};
type FetchXmlLinkAst = {
  name: string;
  from?: string;
  to?: string;
  linkType: string;
  alias?: string;
  intersect?: boolean;
  attributes: FetchXmlAttributeAst[];
  filters: Array<FilterNode | string>;
  orders: FetchXmlOrderAst[];
  links: FetchXmlLinkAst[];
};
type FetchXmlBaseAst = {
  entity: string;
  attributes: FetchXmlAttributeAst[];
  filters: Array<FilterNode | string>;
  orders: FetchXmlOrderAst[];
  links: FetchXmlLinkAst[];
  distinct?: boolean;
  top?: number;
  datasource?: string;
  options?: string;
  lateMaterialize?: boolean;
  aggregateLimit?: number;
  useRawOrderBy?: boolean;
  version?: string;
  mapping?: string;
};
type FetchXmlSelectAst = FetchXmlBaseAst & {
  kind: "xml-select";
};
type FetchXmlAggregateAst = FetchXmlBaseAst & {
  kind: "xml-aggregate";
};
declare function serializeFetchXml(ast: FetchXmlSelectAst | FetchXmlAggregateAst): string;
//#endregion
//#region src/query/fetchxml/builder.d.ts
type ExecuteOptions = {
  datasource?: string;
  lateMaterialize?: boolean;
  aggregateLimit?: number;
  useRawOrderBy?: boolean;
  options?: string;
};
type Simplify<T> = { [Key in keyof T]: T[Key]; } & {};
type FieldSelector<TProps extends GenericProperties> = { [K in keyof TProps]: K; };
type FieldProxy<T extends GenericProperties> = { [K in keyof T]: T[K] extends FieldBase<infer V> ? FieldRef<V, K extends string ? K : never, T[K]> : never; };
type FetchLinkType = "inner" | "outer" | "any" | "not any" | "all" | "not all" | "exists" | "in" | "matchfirstrowusingcrossapply";
type AttrDef = {
  name: string;
  alias: string;
  aggregate?: string;
  groupby?: boolean;
  dategrouping?: string;
  distinct?: boolean;
  rowaggregate?: string;
};
type OrderDef = {
  attribute: string;
  entityname?: string;
  descending?: boolean;
};
type ApplyResultType<R extends Record<string, GroupByExpr<any> | Aggregation<any>>> = { [K in keyof R]: R[K] extends GroupByExpr<infer V> ? V : R[K] extends Aggregation<infer V> ? V : never; };
type ApplyAliasProxy<R extends Record<string, any>> = { [K in keyof R]: FieldRef<R[K], K extends string ? K : never>; };
type SubJoinBuilder<TProps extends GenericProperties, TResult extends Record<string, any>, TSelected extends boolean = false> = {
  select: TSelected extends true ? never : <R extends Record<string, keyof TProps>>(selector: (fields: FieldSelector<TProps>) => R) => SubJoinBuilder<TProps, { [K in keyof R]: Infer<TProps[R[K]]>; }, true>;
  filter(filter: string | FilterExpr | ((f: FieldProxy<TProps>) => string | FilterExpr)): SubJoinBuilder<TProps, TResult, TSelected>;
  join<TDataverseTable extends DataverseTable<any>, TFrom extends keyof TDataverseTable["fields"], TTo extends keyof TProps>(linkType: FilterOnlyLinkType, table: TDataverseTable, from: TFrom, to: TTo, subquery: (q: FilterCollector<TDataverseTable["fields"]>) => void, intersect?: boolean): SubJoinBuilder<TProps, TResult, TSelected>;
  join<TDataverseTable extends DataverseTable<any>, TFrom extends keyof TDataverseTable["fields"], TTo extends keyof TProps, TJoinResult extends Record<string, any>>(linkType: NormalLinkType, table: TDataverseTable, from: TFrom, to: TTo, subquery: (q: SubJoinBuilder<TDataverseTable["fields"], {}>) => SubJoinBuilder<TDataverseTable["fields"], TJoinResult>, intersect?: boolean): SubJoinBuilder<TProps, NoOverlap<TResult, TJoinResult>, TSelected>;
  join<T2 extends GenericProperties>(linkType: FilterOnlyLinkType, intersectTable: DataverseIntersectTable<TProps, T2>, subquery: (q: FilterCollector<T2>) => void): SubJoinBuilder<TProps, TResult, TSelected>;
  join<T2 extends GenericProperties, TJoinResult extends Record<string, any>>(linkType: NormalLinkType, intersectTable: DataverseIntersectTable<TProps, T2>, subquery: (q: SubJoinBuilder<T2, {}>) => SubJoinBuilder<T2, TJoinResult>): SubJoinBuilder<TProps, NoOverlap<TResult, TJoinResult>, TSelected>;
  join<T2 extends GenericProperties>(linkType: FilterOnlyLinkType, intersectTable: DataverseIntersectTable<T2, TProps>, subquery: (q: FilterCollector<T2>) => void): SubJoinBuilder<TProps, TResult, TSelected>;
  join<T2 extends GenericProperties, TJoinResult extends Record<string, any>>(linkType: NormalLinkType, intersectTable: DataverseIntersectTable<T2, TProps>, subquery: (q: SubJoinBuilder<T2, {}>) => SubJoinBuilder<T2, TJoinResult>): SubJoinBuilder<TProps, NoOverlap<TResult, TJoinResult>, TSelected>;
  orderby(fieldSelector: (f: FieldProxy<TProps>) => string | FieldRef<any>, direction?: 'asc' | 'desc'): SubJoinBuilder<TProps, TResult, TSelected>;
  orderby(entityname: string, attribute: string, direction?: 'asc' | 'desc'): SubJoinBuilder<TProps, TResult, TSelected>;
  toXml(): string;
  toString(): string;
};
type FilterOnlyLinkType = 'any' | 'not any' | 'all' | 'not all' | 'exists' | 'in';
type NormalLinkType = Exclude<FetchLinkType, FilterOnlyLinkType>;
type NoOverlap<T extends Record<string, any>, U extends Record<string, any>> = Extract<keyof T, keyof U> extends never ? Simplify<T & U> : never;
type SubAggregateJoinBuilder<TProps extends GenericProperties, TResult extends Record<string, any> = {}, TApplied extends boolean = false> = {
  apply: TApplied extends true ? never : <R extends Record<string, GroupByExpr<any> | Aggregation<any>>>(expr: (f: FieldProxy<TProps>) => R) => SubAggregateJoinBuilder<TProps, ApplyResultType<R>, true>;
  filter(filter: string | FilterExpr | ((f: FieldProxy<TProps>) => string | FilterExpr)): SubAggregateJoinBuilder<TProps, TResult, TApplied>;
  join<TDataverseTable extends DataverseTable<any>, TFrom extends keyof TDataverseTable["fields"], TTo extends keyof TProps>(linkType: FilterOnlyLinkType, table: TDataverseTable, from: TFrom, to: TTo, subquery: (q: FilterCollector<TDataverseTable["fields"]>) => void, intersect?: boolean): SubAggregateJoinBuilder<TProps, TResult, TApplied>;
  join<TDataverseTable extends DataverseTable<any>, TFrom extends keyof TDataverseTable["fields"], TTo extends keyof TProps, TJoinResult extends Record<string, any>>(linkType: NormalLinkType, table: TDataverseTable, from: TFrom, to: TTo, subquery: (q: SubAggregateJoinBuilder<TDataverseTable["fields"], {}>) => SubAggregateJoinBuilder<TDataverseTable["fields"], TJoinResult>, intersect?: boolean): SubAggregateJoinBuilder<TProps, NoOverlap<TResult, TJoinResult>, TApplied>;
  join<T2 extends GenericProperties>(linkType: FilterOnlyLinkType, intersectTable: DataverseIntersectTable<TProps, T2>, subquery: (q: FilterCollector<T2>) => void): SubAggregateJoinBuilder<TProps, TResult, TApplied>;
  join<T2 extends GenericProperties, TJoinResult extends Record<string, any>>(linkType: NormalLinkType, intersectTable: DataverseIntersectTable<TProps, T2>, subquery: (q: SubAggregateJoinBuilder<T2, {}>) => SubAggregateJoinBuilder<T2, TJoinResult>): SubAggregateJoinBuilder<TProps, NoOverlap<TResult, TJoinResult>, TApplied>;
  join<T2 extends GenericProperties>(linkType: FilterOnlyLinkType, intersectTable: DataverseIntersectTable<T2, TProps>, subquery: (q: FilterCollector<T2>) => void): SubAggregateJoinBuilder<TProps, TResult, TApplied>;
  join<T2 extends GenericProperties, TJoinResult extends Record<string, any>>(linkType: NormalLinkType, intersectTable: DataverseIntersectTable<T2, TProps>, subquery: (q: SubAggregateJoinBuilder<T2, {}>) => SubAggregateJoinBuilder<T2, TJoinResult>): SubAggregateJoinBuilder<TProps, NoOverlap<TResult, TJoinResult>, TApplied>;
  orderby(fieldSelector: (f: FieldProxy<TProps>) => string | FieldRef<any>, direction?: 'asc' | 'desc'): SubAggregateJoinBuilder<TProps, TResult, TApplied>;
  orderby(entityname: string, attribute: string, direction?: 'asc' | 'desc'): SubAggregateJoinBuilder<TProps, TResult, TApplied>;
  toXml(): string;
  toString(): string;
};
interface FetchXmlSelectQuery<TProps extends GenericProperties, TResult extends Record<string, any>> {
  select<R extends Record<string, keyof TProps>>(selector: (fields: FieldSelector<TProps>) => R): FetchXmlSelectQuery<TProps, { [K in keyof R]: Infer<TProps[R[K]]>; }>;
  filter(filter: string | FilterExpr | ((f: FieldProxy<TProps>) => string | FilterExpr)): FetchXmlSelectQuery<TProps, TResult>;
  join<TDataverseTable extends DataverseTable<any>, TFrom extends keyof TDataverseTable["fields"], TTo extends keyof TProps>(linkType: FilterOnlyLinkType, table: TDataverseTable, from: TFrom, to: TTo, subquery: (q: FilterCollector<TDataverseTable["fields"]>) => void, intersect?: boolean): FetchXmlSelectQuery<TProps, TResult>;
  join<TDataverseTable extends DataverseTable<any>, TFrom extends keyof TDataverseTable["fields"], TTo extends keyof TProps, TJoinResult extends Record<string, any>>(linkType: NormalLinkType, table: TDataverseTable, from: TFrom, to: TTo, subquery: (q: SubJoinBuilder<TDataverseTable["fields"], {}>) => SubJoinBuilder<TDataverseTable["fields"], TJoinResult>, intersect?: boolean): FetchXmlSelectQuery<TProps, NoOverlap<TResult, TJoinResult>>;
  join<T2 extends GenericProperties>(linkType: FilterOnlyLinkType, intersectTable: DataverseIntersectTable<TProps, T2>, subquery: (q: FilterCollector<T2>) => void): FetchXmlSelectQuery<TProps, TResult>;
  join<T2 extends GenericProperties, TJoinResult extends Record<string, any>>(linkType: NormalLinkType, intersectTable: DataverseIntersectTable<TProps, T2>, subquery: (q: SubJoinBuilder<T2, {}>) => SubJoinBuilder<T2, TJoinResult>): FetchXmlSelectQuery<TProps, NoOverlap<TResult, TJoinResult>>;
  join<T2 extends GenericProperties>(linkType: FilterOnlyLinkType, intersectTable: DataverseIntersectTable<T2, TProps>, subquery: (q: FilterCollector<T2>) => void): FetchXmlSelectQuery<TProps, TResult>;
  join<T2 extends GenericProperties, TJoinResult extends Record<string, any>>(linkType: NormalLinkType, intersectTable: DataverseIntersectTable<T2, TProps>, subquery: (q: SubJoinBuilder<T2, {}>) => SubJoinBuilder<T2, TJoinResult>): FetchXmlSelectQuery<TProps, NoOverlap<TResult, TJoinResult>>;
  distinct(): FetchXmlSelectQuery<TProps, TResult>;
  top(n: number): FetchXmlSelectQuery<TProps, TResult>;
  orderby(fieldSelector: (f: FieldProxy<TProps>) => string | FieldRef<any>, direction?: 'asc' | 'desc'): FetchXmlSelectQuery<TProps, TResult>;
  orderby(entityname: string, attribute: string, direction?: 'asc' | 'desc'): FetchXmlSelectQuery<TProps, TResult>;
  toXml(): string;
  toAst(): FetchXmlSelectAst;
  toString(): string;
  execute(options?: ExecuteOptions): Promise<TResult[]>;
  iterate(options?: ExecuteOptions & {
    pageSize?: number;
  }): AsyncGenerator<TResult>;
  iteratePages(options?: ExecuteOptions & {
    pageSize?: number;
  }): AsyncGenerator<TResult[]>;
}
interface FetchXmlInitial<TProps extends GenericProperties> {
  select(): FetchXmlSelectQuery<TProps, TProps>;
  select<R extends Record<string, keyof TProps>>(selector: (fields: FieldSelector<TProps>) => R): FetchXmlSelectQuery<TProps, { [K in keyof R]: Infer<TProps[R[K]]>; }>;
  apply<R extends Record<string, GroupByExpr<any> | Aggregation<any>>>(expr: (f: FieldProxy<TProps>) => R): FetchXmlAggregateQuery<TProps, ApplyResultType<R>>;
  filter(filter: string | FilterExpr | ((f: FieldProxy<TProps>) => string | FilterExpr)): FetchXmlInitial<TProps>;
  join<TDataverseTable extends DataverseTable<any>, TFrom extends keyof TDataverseTable["fields"], TTo extends keyof TProps>(linkType: FilterOnlyLinkType, table: TDataverseTable, from: TFrom, to: TTo, subquery: (q: FilterCollector<TDataverseTable["fields"]>) => void, intersect?: boolean): FetchXmlInitial<TProps>;
  join<TDataverseTable extends DataverseTable<any>, TFrom extends keyof TDataverseTable["fields"], TTo extends keyof TProps, TJoinResult extends Record<string, any>>(linkType: NormalLinkType, table: TDataverseTable, from: TFrom, to: TTo, subquery: (q: SubJoinBuilder<TDataverseTable["fields"], {}>) => SubJoinBuilder<TDataverseTable["fields"], TJoinResult>, intersect?: boolean): FetchXmlInitial<TProps>;
  join<T2 extends GenericProperties>(linkType: FilterOnlyLinkType, intersectTable: DataverseIntersectTable<TProps, T2>, subquery: (q: FilterCollector<T2>) => void): FetchXmlInitial<TProps>;
  join<T2 extends GenericProperties, TJoinResult extends Record<string, any>>(linkType: NormalLinkType, intersectTable: DataverseIntersectTable<TProps, T2>, subquery: (q: SubJoinBuilder<T2, {}>) => SubJoinBuilder<T2, TJoinResult>): FetchXmlInitial<TProps>;
  join<T2 extends GenericProperties>(linkType: FilterOnlyLinkType, intersectTable: DataverseIntersectTable<T2, TProps>, subquery: (q: FilterCollector<T2>) => void): FetchXmlInitial<TProps>;
  join<T2 extends GenericProperties, TJoinResult extends Record<string, any>>(linkType: NormalLinkType, intersectTable: DataverseIntersectTable<T2, TProps>, subquery: (q: SubJoinBuilder<T2, {}>) => SubJoinBuilder<T2, TJoinResult>): FetchXmlInitial<TProps>;
  distinct(): FetchXmlInitial<TProps>;
  top(n: number): FetchXmlInitial<TProps>;
  orderby(fieldSelector: (f: FieldProxy<TProps>) => string | FieldRef<any>, direction?: 'asc' | 'desc'): FetchXmlInitial<TProps>;
  orderby(entityname: string, attribute: string, direction?: 'asc' | 'desc'): FetchXmlInitial<TProps>;
  toXml(): string;
  toAst(): FetchXmlSelectAst;
  toString(): string;
  execute(options?: ExecuteOptions): Promise<Infer<TProps>[]>;
  iterate(options?: ExecuteOptions & {
    pageSize?: number;
  }): AsyncGenerator<Infer<TProps>>;
  iteratePages(options?: ExecuteOptions & {
    pageSize?: number;
  }): AsyncGenerator<Infer<TProps>[]>;
}
declare class FilterCollector<TProps extends GenericProperties = any> {
  protected _filters: string[];
  private _proxy;
  constructor(table: DataverseTable<TProps>);
  private _buildProxy;
  filter(filter: string | FilterExpr | ((f: FieldProxy<TProps>) => string | FilterExpr)): this;
}
declare class FetchXmlAggregateQuery<TProps extends GenericProperties, TResult extends Record<string, any> = {}> {
  private _linkAlias;
  private _table;
  private _attributes;
  private _links;
  protected _filters: string[];
  private _aliasProxy;
  private _proxy;
  private _top?;
  private _useRawOrderBy;
  private _lateMaterialize;
  private _aggregateLimit?;
  private _orders;
  private _datasource?;
  private _options?;
  constructor(table: DataverseTable<TProps>, initialAttributes?: AttrDef[], _linkAlias?: {
    value: number;
  }, initialFilters?: string[]);
  private _buildProxy;
  private _getEffectiveAttributes;
  filter(filter: string | FilterExpr | ((f: FieldProxy<TProps>) => string | FilterExpr)): this;
  join<TDataverseTable extends DataverseTable<any>, TFrom extends keyof TDataverseTable["fields"], TTo extends keyof TProps, TJoinResult extends Record<string, any>>(linkType: FetchLinkType, table: TDataverseTable, from: TFrom, to: TTo, subquery: (q: SubAggregateJoinBuilder<TDataverseTable["fields"], {}>) => SubAggregateJoinBuilder<TDataverseTable["fields"], TJoinResult>, intersect?: boolean): FetchXmlAggregateQuery<TProps, NoOverlap<TResult, TJoinResult>>;
  join<T2 extends GenericProperties, TJoinResult extends Record<string, any>>(linkType: FetchLinkType, intersectTable: DataverseIntersectTable<TProps, T2>, subquery: (q: SubAggregateJoinBuilder<T2, {}>) => SubAggregateJoinBuilder<T2, TJoinResult>): FetchXmlAggregateQuery<TProps, NoOverlap<TResult, TJoinResult>>;
  join<T2 extends GenericProperties, TJoinResult extends Record<string, any>>(linkType: FetchLinkType, intersectTable: DataverseIntersectTable<T2, TProps>, subquery: (q: SubAggregateJoinBuilder<T2, {}>) => SubAggregateJoinBuilder<T2, TJoinResult>): FetchXmlAggregateQuery<TProps, NoOverlap<TResult, TJoinResult>>;
  top(n: number): this;
  orderby(fieldSelector: (f: ApplyAliasProxy<TResult>) => string | FieldRef<any>, direction?: 'asc' | 'desc'): this;
  orderby(entityname: string, attribute: string, direction?: 'asc' | 'desc'): this;
  toAst(): FetchXmlAggregateAst;
  toXml(): string;
  toString(): string;
  protected _applyExecuteOptions(options?: ExecuteOptions): void;
  private _transformRow;
  execute(options?: ExecuteOptions): Promise<TResult[]>;
  iterate(options?: ExecuteOptions & {
    pageSize?: number;
  }): AsyncGenerator<TResult>;
  iteratePages(options?: ExecuteOptions & {
    pageSize?: number;
  }): AsyncGenerator<TResult[]>;
  private _buildAliasInfo;
  private _collectAliases;
  private static _isFilterOnlyLinkType;
  private _renderLinkEntity;
  private _collectAliasesFromBuilder;
}
declare class EntityQueryBuilder<TProps extends GenericProperties, TResult extends Record<string, any> = {}> {
  protected _linkAlias: {
    value: number;
  };
  private _table;
  private _attributes;
  protected _links: Array<{
    name: string;
    alias: string;
    from: string;
    to: string;
    linkType: FetchLinkType;
    builder: EntityQueryBuilder<any, any> | FilterCollector<any>;
    intersect?: boolean;
  }>;
  protected _orders: OrderDef[];
  protected _filters: string[];
  private _isDistinct;
  private _proxy;
  private _top?;
  private _isAggregate;
  private _useRawOrderBy;
  private _lateMaterialize;
  private _aggregateLimit?;
  private _datasource?;
  private _options?;
  constructor(table: DataverseTable<TProps>, _linkAlias?: {
    value: number;
  });
  private _getEffectiveAttributes;
  private _buildProxy;
  select<R extends Record<string, keyof TProps>>(selector: (fields: FieldSelector<TProps>) => R): EntityQueryBuilder<TProps, { [K in keyof R]: Infer<TProps[R[K]]>; }>;
  apply<R extends Record<string, GroupByExpr<any> | Aggregation<any>>>(expr: (f: FieldProxy<TProps>) => R): FetchXmlAggregateQuery<TProps, ApplyResultType<R>>;
  _toAggregateQuery(): FetchXmlAggregateQuery<TProps, any>;
  filter(filter: string | FilterExpr | ((f: FieldProxy<TProps>) => string | FilterExpr)): this;
  join<TDataverseTable extends DataverseTable<any>, TFrom extends keyof TDataverseTable["fields"], TTo extends keyof TProps>(linkType: FilterOnlyLinkType, table: TDataverseTable, from: TFrom, to: TTo, subquery: (q: FilterCollector<TDataverseTable["fields"]>) => void, intersect?: boolean): EntityQueryBuilder<TProps, TResult>;
  join<TDataverseTable extends DataverseTable<any>, TFrom extends keyof TDataverseTable["fields"], TTo extends keyof TProps, TJoinResult extends Record<string, any>>(linkType: NormalLinkType, table: TDataverseTable, from: TFrom, to: TTo, subquery: (q: SubJoinBuilder<TDataverseTable["fields"], {}>) => SubJoinBuilder<TDataverseTable["fields"], TJoinResult>, intersect?: boolean): EntityQueryBuilder<TProps, NoOverlap<TResult, TJoinResult>>;
  join<T2 extends GenericProperties>(linkType: FilterOnlyLinkType, intersectTable: DataverseIntersectTable<TProps, T2>, subquery: (q: FilterCollector<T2>) => void): EntityQueryBuilder<TProps, TResult>;
  join<T2 extends GenericProperties, TJoinResult extends Record<string, any>>(linkType: NormalLinkType, intersectTable: DataverseIntersectTable<TProps, T2>, subquery: (q: SubJoinBuilder<T2, {}>) => SubJoinBuilder<T2, TJoinResult>): EntityQueryBuilder<TProps, NoOverlap<TResult, TJoinResult>>;
  join<T2 extends GenericProperties>(linkType: FilterOnlyLinkType, intersectTable: DataverseIntersectTable<T2, TProps>, subquery: (q: FilterCollector<T2>) => void): EntityQueryBuilder<TProps, TResult>;
  join<T2 extends GenericProperties, TJoinResult extends Record<string, any>>(linkType: NormalLinkType, intersectTable: DataverseIntersectTable<T2, TProps>, subquery: (q: SubJoinBuilder<T2, {}>) => SubJoinBuilder<T2, TJoinResult>): EntityQueryBuilder<TProps, NoOverlap<TResult, TJoinResult>>;
  distinct(): this;
  top(n: number): this;
  orderby(fieldSelector: (f: FieldProxy<TProps>) => string | FieldRef<any>, direction?: 'asc' | 'desc'): this;
  orderby(entityname: string, attribute: string, direction?: 'asc' | 'desc'): this;
  toAst(): FetchXmlSelectAst;
  toXml(): string;
  static _isFilterOnlyLinkType(linkType: FetchLinkType): boolean;
  private _renderLinkEntity;
  toString(): string;
  protected _applyExecuteOptions(options?: ExecuteOptions): void;
  private _transformRow;
  execute(options?: ExecuteOptions): Promise<TResult[]>;
  iterate(options?: ExecuteOptions & {
    pageSize?: number;
  }): AsyncGenerator<TResult>;
  iteratePages(options?: ExecuteOptions & {
    pageSize?: number;
  }): AsyncGenerator<TResult[]>;
  private _buildAliasInfo;
  private _collectAliases;
}
declare function fetchXml<TProps extends GenericProperties>(table: DataverseTable<TProps>): FetchXmlInitial<TProps>;
//#endregion
export { Above, AboveOrEqual, Aggregation, AlternateKey, ApplyQuery, Between, BooleanField, ChoiceField, CollectionIdsProperty, CollectionProperty, CollectionSubQuery, ContainsValues, DataverseClient, DataverseClientOptions, DataverseHttpError, DataverseIntersectTable, DataverseKey, DataverseRecord, DataverseTable, DataverseTableOptions, DateField, DateTimeField, DeleteRecordOptions, DoesNotContainValues, EntityQueryBuilder, EqualBusinessId, EqualUserId, EqualUserLanguage, EqualUserOrUserHierarchy, EqualUserOrUserHierarchyAndTeams, EqualUserOrUserTeams, Etag, ExpandObject, ExpandValue, FetchLinkType, FetchXmlAggregateAst, FetchXmlAggregateQuery, FetchXmlAttributeAst, FetchXmlInitial, FetchXmlLinkAst, FetchXmlOrderAst, FetchXmlSelectAst, FetchXmlSelectQuery, FieldBase, FieldOptions, type FieldPath, FieldProxy, FieldRef, FileField, FileRef, FilterCollector, FilterExpr, FormattedField, GUID, GenericNavigationProperty, GenericProperties, GenericProperty, GenericValueProperty, GetRecordOptions, GetTable, GroupByExpr, ImageField, ImageRef, In, InFiscalPeriod, InFiscalPeriodAndYear, InFiscalYear, InOrAfterFiscalPeriodAndYear, InOrBeforeFiscalPeriodAndYear, Infer, InitialQuery, JsonField, Last7Days, LastFiscalPeriod, LastFiscalYear, LastMonth, LastWeek, LastXDays, LastXFiscalPeriods, LastXFiscalYears, LastXHours, LastXMonths, LastXWeeks, LastXYears, LastYear, ListField, LookupIdProperty, LookupProperty, LookupSubQuery, Name, NarrowKeysByValue, Next7Days, NextFiscalPeriod, NextFiscalYear, NextMonth, NextWeek, NextXDays, NextXFiscalPeriods, NextXFiscalYears, NextXHours, NextXMonths, NextXWeeks, NextXYears, NextYear, NotBetween, NotEqualBusinessId, NotEqualUserId, NotIn, NotUnder, NullableBooleanField, NullableChoiceField, NullableDateField, NullableDateTimeField, NullableNumberField, NullableStringField, NumberField, ODataAggregateAst, ODataAggregateExpressionAst, ODataAggregateOrderAst, ODataAlias, ODataApplyAst, ODataApplyQuery, ODataExpandAst, ODataFilterNode, ODataFilterValue, ODataOrderAst, ODataPath, ODataSelectAst, ODataTableQueryOptions, OlderThanXDays, OlderThanXHours, OlderThanXMinutes, OlderThanXMonths, OlderThanXWeeks, OlderThanXYears, On, OnOrAfter, OnOrBefore, OrderSpec, PatchRecordOptions, PostRecordOptions, PreferOption, PrimaryKeyField, Primitive, type QueryProperty, QueryRequestOptions, RequestOptions, RetrieveAadUserRoles, RetrieveChoices, RetrieveTotalRecordCount, SKIP, SelectQuery, StringField, TableRequestOptions, ThisFiscalPeriod, ThisFiscalYear, ThisMonth, ThisWeek, ThisYear, Today, Tomorrow, TransformContext, Under, UnderOrEqual, ValidationSchema, WhoAmI, Yesterday, all, and, any, asc, attachEtag, average, base64ImageToURL, boolean, buildLambdaProxy, buildTableQueryAst, choice, collection, collectionIds, contains, count, date, datetime, desc, endsWith, eq, expand, fetchOdata, fetchXml, file, formatted, ge, getEtag, getImageUrl, getName, groupby, gt, image, isActive, isInactive, isNonEmptyString, isNotNull, isNull, json, keys, le, list, lookup, lookupId, lt, mapChoices, max, mergeRecords, min, ne, not, nullableBoolean, nullableChoice, nullableDate, nullableDateTime, nullableNumber, nullableString, number, or, orderby, parseDateOnly, primaryKey, select, serializeFetchXml, serializeODataAggregate, serializeODataSelect, startsWith, string, sum, toBase64, toDateOnly, toODataFilterNode, toODataPath, wrapString, xml };