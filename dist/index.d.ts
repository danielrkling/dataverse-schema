import { IDBPDatabase } from "idb";
import { StandardSchemaV1 } from "@standard-schema/spec";
//#region src/query/path.d.ts
type QueryProperty = FieldBase<any> | LookupProperty<any> | CollectionProperty<any>;
type FieldPath = readonly QueryProperty[];
//#endregion
//#region src/query/shared/field-ref.d.ts
declare class FieldRef<T = any, K extends string = string, F extends FieldBase<T> = FieldBase<T>> {
  readonly field: F;
  readonly path: readonly QueryProperty[];
  private readonly _path;
  constructor(field: F | string, path?: string, pathSegments?: readonly QueryProperty[]);
  static fromPath<T, F extends FieldBase<T>>(field: F, path: string, pathSegments?: readonly QueryProperty[]): FieldRef<T, string, F>;
  get dataverseName(): string;
  transformFromDataverse(value: unknown, ctx?: TransformContext): T | Promise<T>;
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
/**
 * A field reference for filter expressions: either a typed `FieldRef` (from a
 * query builder proxy) or a raw field instance belonging to the root entity.
 */
type FilterField = FieldRef<any> | QueryProperty;
type NonNullType<T> = T extends Date | null ? Date : Exclude<T, null>;
declare class FilterExpr {
  private node;
  constructor(node: FilterNode);
  toString(): string;
  toOdata(): string;
  toFetchXml(): string;
  getNode(): FilterNode;
}
/** A typed field reference (`FieldRef`) or a raw root-level field instance. Both carry the value type `T`. */
type TypedField<T> = FieldRef<T> | FieldBase<T>;
declare function eq<T>(field: TypedField<T>, value: NoInfer<T> | null | FilterField): FilterExpr;
declare function ne<T>(field: TypedField<T>, value: NoInfer<T> | null | FilterField): FilterExpr;
declare function gt<T extends number | string | Date | null>(field: TypedField<T>, value: NoInfer<NonNullType<T>> | FilterField): FilterExpr;
declare function ge<T extends number | string | Date | null>(field: TypedField<T>, value: NoInfer<NonNullType<T>> | FilterField): FilterExpr;
declare function lt<T extends number | string | Date | null>(field: TypedField<T>, value: NoInfer<NonNullType<T>> | FilterField): FilterExpr;
declare function le<T extends number | string | Date | null>(field: TypedField<T>, value: NoInfer<NonNullType<T>> | FilterField): FilterExpr;
declare function isNull(field: FilterField): FilterExpr;
declare function isNotNull(field: FilterField): FilterExpr;
declare function contains(field: FilterField, value: string): FilterExpr;
declare function startsWith(field: FilterField, value: string): FilterExpr;
declare function endsWith(field: FilterField, value: string): FilterExpr;
declare function and(...conditions: (FilterExpr | string)[]): FilterExpr;
declare function or(...conditions: (FilterExpr | string)[]): FilterExpr;
declare function not(condition: FilterExpr | string): FilterExpr;
declare function isActive(): FilterExpr;
declare function isInactive(): FilterExpr;
declare function Above(field: FilterField, value: string): FilterExpr;
declare function AboveOrEqual(field: FilterField, value: string): FilterExpr;
declare function Between(field: FilterField, value1: string | number, value2: string | number): FilterExpr;
declare function ContainsValues(field: FilterField, values: (string | number)[]): FilterExpr;
declare function DoesNotContainValues(field: FilterField, values: (string | number)[]): FilterExpr;
declare function EqualBusinessId(field: FilterField): FilterExpr;
declare function EqualUserId(field: FilterField): FilterExpr;
declare function EqualUserLanguage(field: FilterField): FilterExpr;
declare function EqualUserOrUserHierarchy(field: FilterField): FilterExpr;
declare function EqualUserOrUserHierarchyAndTeams(field: FilterField): FilterExpr;
declare function EqualUserOrUserTeams(field: FilterField): FilterExpr;
declare function In<T extends string | number>(field: TypedField<T>, values: NoInfer<T>[]): FilterExpr;
declare function InFiscalPeriod(field: FilterField, value: number): FilterExpr;
declare function InFiscalPeriodAndYear(field: FilterField, fiscalPeriod: number, fiscalYear: number): FilterExpr;
declare function InFiscalYear(field: FilterField, value: number): FilterExpr;
declare function InOrAfterFiscalPeriodAndYear(field: FilterField, fiscalPeriod: number, fiscalYear: number): FilterExpr;
declare function InOrBeforeFiscalPeriodAndYear(field: FilterField, fiscalPeriod: number, fiscalYear: number): FilterExpr;
declare function Last7Days(field: FilterField): FilterExpr;
declare function LastFiscalPeriod(field: FilterField): FilterExpr;
declare function LastFiscalYear(field: FilterField): FilterExpr;
declare function LastMonth(field: FilterField): FilterExpr;
declare function LastWeek(field: FilterField): FilterExpr;
declare function LastXDays(field: FilterField, value: number): FilterExpr;
declare function LastXFiscalPeriods(field: FilterField, value: number): FilterExpr;
declare function LastXFiscalYears(field: FilterField, value: number): FilterExpr;
declare function LastXHours(field: FilterField, value: number): FilterExpr;
declare function LastXMonths(field: FilterField, value: number): FilterExpr;
declare function LastXWeeks(field: FilterField, value: number): FilterExpr;
declare function LastXYears(field: FilterField, value: number): FilterExpr;
declare function LastYear(field: FilterField): FilterExpr;
declare function Next7Days(field: FilterField): FilterExpr;
declare function NextFiscalPeriod(field: FilterField): FilterExpr;
declare function NextFiscalYear(field: FilterField): FilterExpr;
declare function NextMonth(field: FilterField): FilterExpr;
declare function NextWeek(field: FilterField): FilterExpr;
declare function NextXDays(field: FilterField, value: number): FilterExpr;
declare function NextXFiscalPeriods(field: FilterField, value: number): FilterExpr;
declare function NextXFiscalYears(field: FilterField, value: number): FilterExpr;
declare function NextXHours(field: FilterField, value: number): FilterExpr;
declare function NextXMonths(field: FilterField, value: number): FilterExpr;
declare function NextXWeeks(field: FilterField, value: number): FilterExpr;
declare function NextXYears(field: FilterField, value: number): FilterExpr;
declare function NextYear(field: FilterField): FilterExpr;
declare function NotBetween(field: FilterField, value1: string | number, value2: string | number): FilterExpr;
declare function NotEqualBusinessId(field: FilterField): FilterExpr;
declare function NotEqualUserId(field: FilterField): FilterExpr;
declare function NotIn<T extends string | number>(field: TypedField<T>, values: NoInfer<T>[]): FilterExpr;
declare function NotUnder(field: FilterField, value: string): FilterExpr;
declare function OlderThanXDays(field: FilterField, value: number): FilterExpr;
declare function OlderThanXHours(field: FilterField, value: number): FilterExpr;
declare function OlderThanXMinutes(field: FilterField, value: number): FilterExpr;
declare function OlderThanXMonths(field: FilterField, value: number): FilterExpr;
declare function OlderThanXWeeks(field: FilterField, value: number): FilterExpr;
declare function OlderThanXYears(field: FilterField, value: number): FilterExpr;
declare function On(field: FilterField, value: string): FilterExpr;
declare function OnOrAfter(field: FilterField, value: string): FilterExpr;
declare function OnOrBefore(field: FilterField, value: string): FilterExpr;
declare function ThisFiscalPeriod(field: FilterField): FilterExpr;
declare function ThisFiscalYear(field: FilterField): FilterExpr;
declare function ThisMonth(field: FilterField): FilterExpr;
declare function ThisWeek(field: FilterField): FilterExpr;
declare function ThisYear(field: FilterField): FilterExpr;
declare function Today(field: FilterField): FilterExpr;
declare function Tomorrow(field: FilterField): FilterExpr;
declare function Under(field: FilterField, value: string): FilterExpr;
declare function UnderOrEqual(field: FilterField, value: string): FilterExpr;
declare function Yesterday(field: FilterField): FilterExpr;
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
declare function sum<V extends number>(field: NumericRef): Aggregation<number>;
/** min/max keep the field's value type: a date column yields `Date`, a numeric one `number`. */
declare function min<V extends number | Date>(field: FieldRef<V> | FieldRef<V | null>): Aggregation<V>;
declare function max<V extends number | Date>(field: FieldRef<V> | FieldRef<V | null>): Aggregation<V>;
declare function average<V extends number>(field: NumericRef): Aggregation<number>;
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
type ODataTableQueryOptions<T extends GenericProperties = GenericProperties> = {
  filter?: string | FilterExpr | ((f: ODataFieldProxy<T>) => string | FilterExpr);
  /** Object keys are TypeScript property names (mapped to logical names at runtime); strings pass through raw. */
  orderby?: Partial<Record<keyof T & string, "asc" | "desc">> | string;
  top?: number;
};
declare function buildTableQueryAst<T extends GenericProperties>(table: DataverseTable<T>, options?: ODataTableQueryOptions<T>): ODataSelectAst;
//#endregion
//#region src/schema.d.ts
/**
 * A schema compatible with the Standard Schema V1 spec. Accepts any Standard
 * Schema implementation (valibot, Zod, ArkType, etc.), so field/table `schema`
 * options can be authored with whichever schema library the project uses.
 */
type ValidationSchema<T> = StandardSchemaV1<T, T>;
/** Shorthand for the spec's issue shape. */
type Issue = StandardSchemaV1.Issue;
/**
 * Builds a schema from a synchronous predicate — the basic building block for
 * the library's built-in field schemas (string, number, choice membership...).
 */
declare function checkSchema<T>(check: (value: unknown) => boolean, message: string): ValidationSchema<T>;
declare const STRING_SCHEMA: ValidationSchema<string>;
declare const NUMBER_SCHEMA: ValidationSchema<number>;
declare const BOOLEAN_SCHEMA: ValidationSchema<boolean>;
declare const DATE_SCHEMA: ValidationSchema<Date>;
declare const BLOB_SCHEMA: ValidationSchema<Blob>;
declare const GUID_SCHEMA: ValidationSchema<`${string}-${string}-${string}-${string}-${string}`>;
/**
 * Validates a value against a Standard Schema, throwing on failure. Works with
 * any Standard Schema V1 implementation (not just valibot). Prefer this over
 * `v.parse` for anything touching a `ValidationSchema`, since those may come
 * from a non-valibot library.
 */
declare function standardParse<T>(schema: ValidationSchema<T>, value: unknown): Promise<T>;
/**
 * Result of {@link standardSafeParse}. On failure the Standard Schema issues
 * are carried verbatim (including paths).
 */
type StandardParseResult<T> = {
  success: true;
  value: T;
} | {
  success: false;
  issues: ReadonlyArray<Issue>;
};
/**
 * Validates a value against a Standard Schema without throwing. Works with any
 * Standard Schema V1 implementation, including async ones.
 */
declare function standardSafeParse<T>(schema: ValidationSchema<T>, value: unknown): Promise<StandardParseResult<T>>;
/**
 * Composes a whole-record schema from an object of named child schemas
 * (e.g. a table's fields). Each child validates its entry independently and
 * any issues are tagged with the child's path — regardless of which schema
 * library produced each child. Async child schemas are supported.
 */
declare function composeRecordSchema(children: Record<string, ValidationSchema<any>>): ValidationSchema<any>;
/**
 * Wraps a schema so it validates arrays of that schema, tagging element issues
 * with their index (e.g. `"0: message"`). Used by collection properties. Async
 * element schemas are supported.
 */
declare function arrayOf<T>(child: ValidationSchema<T>): ValidationSchema<T[]>;
/**
 * Defers resolution of a schema until first validation. Used by navigation
 * properties whose related table may not exist yet (circular references).
 */
declare function lazyOf<T>(getChild: () => ValidationSchema<T>): ValidationSchema<T>;
/**
 * Wraps a schema so it also accepts `null`. Used by lookup and nullable fields.
 */
declare function nullableOf<T>(child: ValidationSchema<T>): ValidationSchema<T | null>;
/**
 * Wraps a schema so it also accepts `undefined`, folding it to `null`.
 */
declare function optionalOf<T>(child: ValidationSchema<T>): ValidationSchema<T | null>;
/**
 * Wraps a schema so `null`, `undefined`, and empty/whitespace-only strings are
 * rejected. Used to implement the `required` field option (e.g. making a
 * nullable field reject empty values).
 */
declare function requiredOf<T>(child: ValidationSchema<T>, message?: string): ValidationSchema<T>;
//#endregion
//#region src/table.d.ts
type TableRequestOptions = {
  pageSize?: number;
  signal?: AbortSignal;
};
type MutationOptions = {
  ifMatch?: string;
  ifNoneMatch?: string;
  signal?: AbortSignal;
  /**
   * Overrides the record's "Created On" (`createdon`) with the given
   * date/time on create. Only meaningful for `createRecord` — Dataverse
   * accepts the underlying `overriddencreatedon` attribute on create only,
   * and requires the `prvOverrideCreatedOnCreatedBy` privilege.
   * Accepts a `Date` or an ISO timestamp string.
   */
  overriddenCreatedOn?: Date | string;
};
type DataverseTableOptions<TProperties extends GenericProperties> = {
  client: DataverseClient;
  entitySetName: string;
  logicalName: string;
  fields: TProperties;
  schema?: ValidationSchema<Infer<TProperties>>;
  /**
   * Overrides the auto-detected primary key (normally found by scanning
   * `fields` for a `primaryKey()` field). Useful for derived/projected tables
   * whose `fields` exclude the pk — Dataverse returns the pk attribute in
   * responses regardless of `$select`, so row identity still works.
   */
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
declare class DataverseTable<TProperties extends GenericProperties> implements ValidationSchema<Infer<TProperties>> {
  /**
   * Standard Schema V1 props, delegated to the table's whole-record `schema`.
   * Lets any Standard Schema–aware consumer validate the table directly.
   */
  get "~standard"(): ValidationSchema<Infer<TProperties>>["~standard"];
  client: DataverseClient;
  fields: TProperties;
  logicalName: string;
  entitySetName: string;
  kind: "table";
  type: "table";
  /**
   * Whole-record schema for this table — either the explicit
   * `schema` option or one composed from the individual field schemas.
   */
  schema: ValidationSchema<Infer<TProperties>>;
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
    ifNoneMatch?: string;
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
  getRecords(queryOptions?: ODataTableQueryOptions<TProperties>, options?: TableRequestOptions): Promise<Infer<TProperties>[]>;
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
  iterateRecords(queryOptions?: ODataTableQueryOptions<TProperties>, options?: TableRequestOptions): AsyncGenerator<Infer<TProperties>>;
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
  iteratePages(queryOptions?: ODataTableQueryOptions<TProperties>, options?: TableRequestOptions): AsyncGenerator<Infer<TProperties>[]>;
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
   * File/image columns accept `{ data: Blob | null }` to upload/clear content.
   * Throws for fields marked `readonly`.
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
   * const newId = await Person.createRecord({ name: "John", age: 30 });
   */
  createRecord(value: Partial<Infer<TProperties>>, options?: MutationOptions): Promise<Infer<TProperties>>;
  /**
   * Updates an existing record by ID. Supports optimistic concurrency via the
   * `ifMatch` option (If-Match header). When `ifMatch` is omitted it defaults
   * to `"*"`, which updates the record only if it already exists.
   *
   * @param id The record's primary key.
   * @param value The fields to update (partial record data).
   * @param options Mutation options (`ifMatch`, `ifNoneMatch`, `signal`).
   *
   * @example
   * await Person.updateRecord("some-guid", { name: "Jane" });
   * // Conditional update:
   * await Person.updateRecord("some-guid", { name: "Jane" }, { ifMatch: 'W/"123456"' });
   */
  /**
   * Updates an existing record by ID. Supports optimistic concurrency via the
   * `ifMatch` option (If-Match header). When `ifMatch` is omitted it defaults
   * to `"*"`, which updates the record only if it already exists.
   *
   * Returns the full record as returned by Dataverse after the write
   * (transformed), including the fresh `$etag` and any server-computed fields.
   *
   * @param id The record's primary key.
   * @param value The fields to update (partial record data).
   * @param options Mutation options (`ifMatch`, `ifNoneMatch`, `signal`).
   *
   * @example
   * await Person.updateRecord("some-guid", { name: "Jane" });
   * // Conditional update:
   * await Person.updateRecord("some-guid", { name: "Jane" }, { ifMatch: 'W/"123456"' });
   */
  updateRecord(id: DataverseKey, value: Partial<Infer<TProperties>>, options?: MutationOptions): Promise<Infer<TProperties>>;
  /**
   * Creates or updates a record. If `id` is provided the record is updated via
   * PATCH; otherwise a new record is created via POST. Navigation properties
   * (collections, lookups) are also synced through nested upserts.
   *
   * @param id The GUID of an existing record, or `undefined` to create new.
   * @param value The record data (partial for updates).
   * @param options Mutation options (`ifMatch`, `ifNoneMatch`, `signal`).
   *
   * @example
   * // Create
   * const newId = await Person.upsertRecord(undefined, { name: "John" });
   * // Update
   * await Person.upsertRecord(existingId, { name: "Jane" });
   */
  upsertRecord(id: DataverseKey | undefined, value: Partial<Infer<TProperties>>, options?: MutationOptions): Promise<Infer<TProperties>>;
  /**
   * Deletes a record by its primary key. Supports optimistic concurrency via the
   * `ifMatch` option (If-Match header).
   *
   * @param id The primary key of the record to delete.
   * @param options Mutation options (`ifMatch`, `ifNoneMatch`, `signal`).
   *
   * @example
   * await Person.deleteRecord("some-guid");
   */
  deleteRecord(id: DataverseKey, options?: MutationOptions): Promise<GUID>;
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
   * on navigation properties or fields marked `readonly` — use the dedicated
   * `deleteFile`/`deleteImage` helpers for file and image columns.
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
   * Note: Dataverse always returns the primary key attribute in responses,
   * independent of `$select` — so this works even for tables whose `fields`
   * don't declare the pk.
   *
   * @example
   * const account = await Account.getRecord("some-guid");
   * const pk = Account.getPrimaryId(account); // GUID | undefined
   */
  getPrimaryId(value: Partial<Infer<TProperties>>): GUID | undefined;
  transformValueFromDataverse(value: any): Promise<Infer<TProperties>>;
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
type DefaultValue<T> = T | (() => T);
type FieldOptions<T> = {
  default?: DefaultValue<T>;
  readonly?: boolean;
  required?: boolean;
  schema?: ValidationSchema<T>;
};
type FieldDefinition<T> = {
  defaultValue: DefaultValue<T>;
  schema: ValidationSchema<T>;
};
declare const SKIP: unique symbol;
type TransformContext = {
  table: DataverseTable<any>;
  client: DataverseClient;
  recordId: string;
};
/**
 * Base class for all Dataverse column and navigation property definitions.
 *
 * ## Transform contract
 * - `transformValueFromDataverse(value, ctx?)` converts a raw API payload into the
 *   typed record value. Dataverse represents empty columns as explicit `null` (or
 *   omits the key entirely); non-nullable fields fold both into their field default.
 *   Use the `nullable*` variants to preserve empties as `null`. Values that are
 *   present but malformed still throw.
 * - `transformValueToDataverse(value, ctx?)` converts a record value into its API
 *   payload. It may return synchronously or return a `Promise`. Returning the
 *   {@link SKIP} symbol excludes the value from the request body (used by file/image
 *   columns whose content is uploaded separately).
 * - `afterSave(ctx, value)` runs after a create/update when the key was present in
 *   the submitted value. File/image fields use it as the explicit data channel:
 *   they only act when `value.data` is a `Blob` (upload) or exactly `null` (clear).
 *
 * Fields created with `readonly: true` are never included in request bodies,
 * `updatePropertyValue`, or `deletePropertyValue`.
 * Fields created with `required: true` reject `null`, `undefined`, and
 * empty/whitespace-only strings when validated (e.g. through `table.schema`) —
 * handy for nullable fields.
 */
declare abstract class FieldBase<T> implements ValidationSchema<T> {
  #private;
  /**
   * Standard Schema V1 props, delegated to the field's validation `schema`.
   * Lets any Standard Schema–aware consumer validate the field directly.
   */
  get "~standard"(): ValidationSchema<T>["~standard"];
  /** No runtime value. Use with typeof field.T */
  T: T;
  /** Canonical Dataverse schema name (e.g. `nnsyc200_Test_Lookup`). */
  schemaName: string;
  /** Lowercased logical name (e.g. `nnsyc200_test_lookup`), used for `$select`, `$filter`, FetchXML attributes. */
  logicalName: string;
  fromDataverseName: string;
  toDataverseName: string;
  kind: string;
  type: string;
  schema: ValidationSchema<T>;
  constructor(name: string, definition: FieldDefinition<T>, options?: FieldOptions<T>);
  getDefault(): T;
  getReadOnly(): boolean;
  transformValueFromDataverse(value: unknown, ctx?: TransformContext): T | Promise<T>;
  transformValueToDataverse(value: unknown, ctx?: TransformContext): unknown;
  afterSave?(ctx: TransformContext, value: any): Promise<void>;
}
declare class NullableField<T, F extends FieldBase<T> = FieldBase<T>> extends FieldBase<T | null> {
  readonly inner: F;
  kind: F["kind"];
  type: F["type"];
  constructor(inner: F, options?: FieldOptions<T | null>);
  transformValueFromDataverse(value: unknown, ctx?: TransformContext): T | null | Promise<T | null>;
  transformValueToDataverse(value: unknown, ctx?: TransformContext): unknown;
}
declare class BooleanField extends FieldBase<boolean> {
  kind: "value";
  type: "boolean";
  constructor(name: string, options?: FieldOptions<boolean>);
  transformValueFromDataverse(value: any): boolean;
}
declare class NumberField extends FieldBase<number> {
  kind: "value";
  type: "number";
  constructor(name: string, options?: FieldOptions<number>);
  transformValueFromDataverse(value: unknown): number;
}
declare class StringField extends FieldBase<string> {
  kind: "value";
  type: "string";
  constructor(name: string, options?: FieldOptions<string>);
  transformValueFromDataverse(value: any): string;
}
declare class PrimaryKeyField extends FieldBase<GUID> {
  kind: "value";
  type: "primaryKey";
  constructor(name: string, options?: FieldOptions<GUID>);
  transformValueFromDataverse(value: unknown): GUID;
}
declare class ListField<T extends string | number> extends FieldBase<T | null> {
  kind: "value";
  type: "list";
  readonly list: readonly T[];
  constructor(name: string, list: ReadonlyArray<T>, options?: FieldOptions<T | null>);
}
/**
 * Field for Dataverse multi-select choice (MultiSelectPicklist) columns.
 *
 * The Web API stores these as a comma-delimited string of option values
 * (e.g. `"3,4,5"`). This field transforms that string to an array of configured string labels when
 * reading and back to a CSV string when writing. An empty selection reads as
 * `[]` and writes as `null` (which clears the column).
 *
 * @example
 * const table = new DataverseTable({
 *   months: multiChoice("nnsyc200_months", {
 *     1: "January",
 *     2: "February",
 *     3: "March",
 * }),
 * // Infer<typeof table>["months"] → ("January" | "February" | "March")[]
 */
declare class MultiChoiceField<T extends Record<number, string>> extends FieldBase<T[keyof T][]> {
  kind: "value";
  type: "multiChoice";
  /** Dataverse option value → application label. */
  readonly choices: Readonly<T>;
  /** Labels in option-value order. */
  readonly labels: readonly T[keyof T][];
  constructor(name: string, choices: T, options?: FieldOptions<T[keyof T][]>);
  /** Converts one Dataverse numeric option value to its typed label. */
  fromChoiceValue(value: number): T[keyof T];
  /** Converts one typed label to its Dataverse numeric option value. */
  toChoiceValue(value: T[keyof T]): number;
  transformValueFromDataverse(value: unknown): T[keyof T][];
  transformValueToDataverse(value: unknown): string | null;
}
declare class ChoiceField<T extends Record<number, string>> extends FieldBase<T[keyof T]> {
  kind: "value";
  type: "choice";
  readonly choices: Readonly<T>;
  readonly labels: readonly T[keyof T][];
  constructor(name: string, choices: T, options?: FieldOptions<T[keyof T]>);
  /** Converts a Dataverse numeric option value to its typed label. */
  fromChoiceValue(value: number): T[keyof T];
  /** Converts a typed label to its Dataverse numeric option value. */
  toChoiceValue(value: T[keyof T]): number;
  transformValueFromDataverse(value: any): T[keyof T];
  transformValueToDataverse(value: any): number;
}
declare class NullableChoiceField<T extends Record<number, string>> extends NullableField<T[keyof T], ChoiceField<T>> {
  constructor(name: string, choices: T, options?: FieldOptions<T[keyof T] | null>);
  get choices(): Readonly<T>;
  get labels(): readonly T[keyof T][];
  fromChoiceValue(value: number): T[keyof T];
  toChoiceValue(value: T[keyof T]): number;
}
declare class DateTimeField extends FieldBase<Date> {
  kind: "value";
  type: "dateTime";
  constructor(name: string, options?: FieldOptions<Date>);
  transformValueFromDataverse(value: any): Date;
}
declare class DateField extends FieldBase<Date> {
  kind: "value";
  type: "dateOnly";
  constructor(name: string, options?: FieldOptions<Date>);
  transformValueFromDataverse(value: any): Date;
  transformValueToDataverse(value: any): string | null;
}
/**
 * Field for retrieving user-localized display values
 * (e.g. `...@OData.Community.Display.V1.FormattedValue`). Always read-only:
 * the value is computed by Dataverse and can never be written or deleted.
 */
declare class FormattedField extends FieldBase<string | null> {
  kind: "value";
  type: "formatted";
  constructor(name: string, options?: FieldOptions<string | null>);
}
/**
 * Field for Dataverse image columns.
 *
 * The column value itself is server-managed: `transformValueToDataverse` returns
 * {@link SKIP} so the field is never part of a create/update body. Instead, data
 * flows through the explicit channel in `afterSave`: include `{ data }` in the
 * record value where `data` is a `Blob` to upload or exactly `null` to clear the
 * image. Reading returns `{ url, fullSizeUrl? }`.
 */
declare class ImageField extends FieldBase<ImageRef | null> {
  kind: "value";
  type: "image";
  constructor(name: string, options?: FieldOptions<ImageRef | null>);
  transformValueFromDataverse(value: any, ctx?: TransformContext): ImageRef | null;
  transformValueToDataverse(_value?: unknown, _ctx?: TransformContext): Promise<string | null | typeof SKIP>;
  afterSave(ctx: TransformContext, value: any): Promise<void>;
}
type FileRef = {
  name?: string;
  url?: string;
  data?: Blob | null;
};
type ImageRef = {
  readonly url?: string;
  readonly fullSizeUrl?: string;
  data?: Blob | null;
};
/**
 * Field for Dataverse file columns.
 *
 * The column value itself is server-managed: `transformValueToDataverse` returns
 * {@link SKIP} so the field is never part of a create/update body. Instead, data
 * flows through the explicit channel in `afterSave`: include `{ name?, data }` in
 * the record value where `data` is a `Blob` to upload or exactly `null` to clear
 * the file. Reading returns `{ name, url? }`.
 */
declare class FileField extends FieldBase<FileRef | null> {
  kind: "value";
  type: "file";
  constructor(name: string, options?: FieldOptions<FileRef | null>);
  transformValueFromDataverse(value: any, ctx?: TransformContext): FileRef | null;
  transformValueToDataverse(_value?: unknown, _ctx?: TransformContext): typeof SKIP;
  afterSave(ctx: TransformContext, value: FileRef): Promise<void>;
}
declare class JsonField<T> extends FieldBase<T> {
  kind: "value";
  type: "json";
  constructor(name: string, options: FieldOptions<T> & {
    schema: ValidationSchema<T>;
  });
  transformValueFromDataverse(value: any): Promise<T>;
  transformValueToDataverse(value: any): string | null;
}
declare class NullableBooleanField extends NullableField<boolean, BooleanField> {
  constructor(name: string, options?: FieldOptions<boolean | null>);
}
declare class NullableNumberField extends NullableField<number, NumberField> {
  constructor(name: string, options?: FieldOptions<number | null>);
}
declare class NullableStringField extends NullableField<string, StringField> {
  constructor(name: string, options?: FieldOptions<string | null>);
}
declare class NullableDateTimeField extends NullableField<Date, DateTimeField> {
  constructor(name: string, options?: FieldOptions<Date | null>);
}
declare class NullableDateField extends NullableField<Date, DateField> {
  constructor(name: string, options?: FieldOptions<Date | null>);
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
declare function list<const T extends string | number>(name: string, list: ReadonlyArray<T>, options?: FieldOptions<T | null>): ListField<T>;
/**
 * Creates a multi-select choice column definition (MultiSelectPicklist).
 * Reads the Dataverse CSV format (`"3,4,5"`) as a `number[]` and writes
 * arrays back as CSV. An empty selection writes `null` (clears the column).
 *
 * @param name The Dataverse logical name of the column.
 * @param choices The allowed numeric option values (or a value→label map).
 *
 * @example
 * const table = new DataverseTable({
 *   months: multiChoice("nnsyc200_months", [1, 2, 3]),
 * });
 * // Infer<typeof table>["months"] → number[]
 */
declare function multiChoice<const T extends Record<number, string>>(name: string, choices: T, options?: FieldOptions<T[keyof T][]>): MultiChoiceField<T>;
/**
 * Creates a choice/option-set column definition. Maps Dataverse numeric option values
 * to human-readable string labels.
 *
 * @param name The Dataverse logical name of the column.
 * @param choices An object mapping numeric option values to string labels.
 * @param options Optional field options (default, readonly, schema).
 *
 * @example
 * const table = new DataverseTable({
 *   status: choice("statuscode", { 1: "Active", 2: "Inactive", 3: "Archived" }),
 * });
 * // Infer<typeof table>["status"] → "Active" | "Inactive" | "Archived"
 */
declare function choice<const T extends Record<number, string>>(name: string, choices: T, options?: FieldOptions<T[keyof T]>): ChoiceField<T>;
/**
 * Creates a nullable choice/option-set column definition (allows `null`).
 *
 * @param name The Dataverse logical name of the column.
 * @param choices An object mapping numeric option values to string labels.
 * @param options Optional field options (default, readonly, schema).
 *
 * @example
 * const table = new DataverseTable({
 *   priority: nullableChoice("prioritycode", { 1: "Low", 2: "High" }),
 * });
 * // Infer<typeof table>["priority"] → "Low" | "High" | null
 */
declare function nullableChoice<const T extends Record<number, string>>(name: string, choices: T, options?: FieldOptions<T[keyof T] | null>): NullableChoiceField<T>;
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
 * Creates a file column definition. The column value is server-managed; upload or
 * clear file contents through the explicit `{ name?, data }` channel.
 *
 * @param name The Dataverse logical name of the file column.
 */
declare function file(name: string, options?: FieldOptions<FileRef | null>): FileField;
/**
 * Creates a JSON-typed Dataverse column definition. Stores JSON as a text column
 * in Dataverse and parses/validates it using the provided Standard Schema.
 *
 * @param name The Dataverse logical name of the column.
 * @param options Field options; `schema` (a Standard Schema validating the parsed
 * JSON structure) is required, plus the standard default/readonly options.
 *
 * @example
 * const Address = v.object({ street: v.string(), city: v.string() });
 * const table = new DataverseTable({
 *   address: json("address_data", { schema: Address }),
 * });
 * // Infer<typeof table>["address"] → { street: string; city: string }
 */
declare function json<T>(name: string, options: FieldOptions<T> & {
  schema: ValidationSchema<T>;
}): JsonField<T>;
declare class LookupIdProperty extends FieldBase<GUID | null> {
  #private;
  kind: "navigation";
  type: "lookupId";
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
  transformValueFromDataverse(value: any): Promise<Infer<TProperties>[]>;
  transformValueToDataverse(): typeof SKIP;
  afterSave(ctx: TransformContext, value: any): Promise<void>;
}
/**
 * Creates a one-to-many (collection) navigation property definition. The related records
 * can be expanded via OData `$expand` or fetched through the table API.
 *
 * The thunk is strongly typed so the related records appear in `Infer<typeof table>`.
 * Note: if two tables reference each other through the typed navigation factories
 * (`collection`/`lookup`) on **both** ends, TypeScript cannot implicitly infer the
 * mutually recursive types (TS7022) — break the cycle by using `collectionIds` or
 * `lookupId` (untyped thunks) for one direction, or annotate one table explicitly.
 *
 * @param name The Dataverse logical name of the collection navigation property.
 * @param getTable A thunk that returns the related table definition.
 *
 * @example
 * const Address = new DataverseTable({
 *   client, entitySetName: "addresses", logicalName: "address",
 *   fields: { id: primaryKey("addressid"), street: string("street") },
 * });
 * const Person = new DataverseTable({
 *   client, entitySetName: "people", logicalName: "person",
 *   fields: {
 *     id: primaryKey("personid"),
 *     addresses: collection("person_addresses", () => Address),
 *   },
 * });
 * // Infer<typeof Person>["addresses"] → { id: GUID; street: string }[]
 */
declare function collection<TProperties extends GenericProperties>(name: string, getTable: GetTable<DataverseTable<TProperties>>, options?: FieldOptions<Infer<TProperties>[]>): CollectionProperty<TProperties>;
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
 * @param getTable A thunk that returns the related table definition. It is
 * intentionally untyped (`GetTable` → `() => any`): the related table only
 * contributes GUIDs here, and keeping the thunk non-generic lets two tables
 * reference each other without creating a TypeScript inference cycle.
 *
 * @example
 * const Address = new DataverseTable({
 *   client, entitySetName: "addresses", logicalName: "address",
 *   fields: { id: primaryKey("addressid") },
 * });
 * const Person = new DataverseTable({
 *   client, entitySetName: "people", logicalName: "person",
 *   fields: {
 *     id: primaryKey("personid"),
 *     addressIds: collectionIds("person_addresses", () => Address),
 *   },
 * });
 * // Infer<typeof Person>["addressIds"] → `${string}-${string}-${string}-${string}-${string}`[]
 */
declare function collectionIds(name: string, getTable: GetTable, options?: FieldOptions<GUID[]>): CollectionIdsProperty;
/**
 * Creates a lookup-ID navigation property definition. This stores only the foreign-key
 * GUID of the related record (not the full expanded record).
 *
 * @param name The Dataverse logical name of the lookup column.
 * @param getTable A thunk that returns the related table definition. It is
 * intentionally untyped (`GetTable` → `() => any`): the related table only
 * contributes a GUID here, and keeping the thunk non-generic lets two tables
 * reference each other without creating a TypeScript inference cycle.
 *
 * @example
 * const Address = new DataverseTable({
 *   client, entitySetName: "addresses", logicalName: "address",
 *   fields: { id: primaryKey("addressid") },
 * });
 * const Person = new DataverseTable({
 *   client, entitySetName: "people", logicalName: "person",
 *   fields: {
 *     id: primaryKey("personid"),
 *     primaryAddressId: lookupId("primaryaddressid", () => Address),
 *   },
 * });
 * // Infer<typeof Person>["primaryAddressId"] → `${string}-${string}-${string}-${string}-${string}` | null
 */
declare function lookupId(name: string, getTable: GetTable, options?: FieldOptions<GUID | null>): LookupIdProperty;
declare class LookupProperty<TProperties extends GenericProperties> extends FieldBase<Infer<TProperties> | null> {
  #private;
  kind: "navigation";
  type: "lookup";
  constructor(name: string, getTable: GetTable<DataverseTable<TProperties>>, options?: FieldOptions<Infer<TProperties> | null>);
  get table(): DataverseTable<TProperties>;
  transformValueFromDataverse(value: any): Promise<Infer<TProperties> | null>;
  transformValueToDataverse(): typeof SKIP;
  afterSave(ctx: TransformContext, value: any): Promise<void>;
}
/**
 * Creates a many-to-one (lookup) navigation property definition. The related record
 * can be expanded via OData `$expand` or fetched through the table API.
 *
 * The thunk is strongly typed so the related record appears in `Infer<typeof table>`.
 * Note: if two tables reference each other through the typed navigation factories
 * (`lookup`/`collection`) on **both** ends, TypeScript cannot implicitly infer the
 * mutually recursive types (TS7022) — break the cycle by using `lookupId` or
 * `collectionIds` (untyped thunks) for one direction, or annotate one table explicitly.
 *
 * @param name The Dataverse logical name of the lookup column.
 * @param getTable A thunk that returns the related table definition.
 *
 * @example
 * const Address = new DataverseTable({
 *   client, entitySetName: "addresses", logicalName: "address",
 *   fields: { id: primaryKey("addressid") },
 * });
 * const Person = new DataverseTable({
 *   client, entitySetName: "people", logicalName: "person",
 *   fields: {
 *     id: primaryKey("personid"),
 *     primaryAddress: lookup("primaryaddressid", () => Address),
 *   },
 * });
 * // Infer<typeof Person>["primaryAddress"] → { id: GUID; ... } | null
 */
declare function lookup<TProperties extends GenericProperties>(name: string, getTable: GetTable<DataverseTable<TProperties>>, options?: FieldOptions<Infer<TProperties> | null>): LookupProperty<TProperties>;
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
type GenericValueProperty = PrimaryKeyField | StringField | NullableStringField | NumberField | NullableNumberField | BooleanField | NullableBooleanField | DateTimeField | NullableDateTimeField | DateField | NullableDateField | ImageField | ListField<any> | MultiChoiceField | FileField | FormattedField | ChoiceField<any> | NullableChoiceField<any> | JsonField<any>;
/**
 * Represents a generic property in a Dataverse entity.  A property can be
 * either a navigation property or a value property.
 */
type GenericProperty = GenericNavigationProperty | GenericValueProperty;
type GetTable<T = any> = () => T;
//#endregion
//#region src/util.d.ts
declare const ETAG = "$etag";
declare const rxGUID: RegExp;
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
declare function attachETag<T>(v: T): T;
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
/**
 * Converts a `Date` or ISO timestamp string into the ISO-8601 string
 * Dataverse expects for system datetime attributes such as
 * `overriddencreatedon`.
 */
declare function toTimestampValue(value: Date | string): string;
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
  ifNoneMatch?: string;
};
type PatchRecordOptions = QueryRequestOptions & {
  ifMatch?: string;
  ifNoneMatch?: string;
};
type DeleteRecordOptions = RequestOptions & {
  ifMatch?: string;
};
type PostRecordOptions = QueryRequestOptions & {
  returnRepresentation?: boolean;
  /**
   * Overrides the record's "Created On" (`createdon`) with the given
   * date/time. On the wire this becomes the `overriddencreatedon` system
   * attribute — accepted only on create, and only by principals (or their
   * roles) granted the `prvOverrideCreatedOnCreatedBy` privilege.
   * Accepts a `Date` or an ISO timestamp string.
   */
  overriddenCreatedOn?: Date | string;
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
    ifMatch?: string;
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
  private _batchRequestLine;
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
  /** The aggregate/column alias to order by (used instead of `attribute` in aggregate queries). */
  alias?: string;
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
  /** Result record type, for `typeof q.T` lookups. Mirrors `DataverseTable.T`. */
  T: TResult;
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
  /** Result record type, for `typeof q.T` lookups. Mirrors `DataverseTable.T`. */
  T: Infer<TProps>;
  select(): FetchXmlSelectQuery<TProps, Infer<TProps> & Record<string, any>>;
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
  /** Result record type, for `typeof q.T` lookups. */
  T: TResult;
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
  private static _isFilterOnlyLinkType;
}
declare class EntityQueryBuilder<TProps extends GenericProperties, TResult extends Record<string, any> = {}> {
  protected _linkAlias: {
    value: number;
  };
  private _table;
  /** Result record type, for `typeof q.T` lookups. */
  T: TResult;
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
}
declare function fetchXml<TProps extends GenericProperties>(table: DataverseTable<TProps>): FetchXmlInitial<TProps>;
//#endregion
//#region src/sync/types.d.ts
type QueuedMutation = {
  id: string;
  type: "insert" | "update" | "delete";
  key: string;
  value?: any;
  changes: any;
  entitySetName: string;
  timestamp: number;
  sequence: number;
  attempts: number;
  ifMatch?: string;
  /**
   * When true, the mutation is retried without an `If-Match` precondition:
   * updates become overwrite-if-exists (`If-Match: *`) and deletes run
   * unconditionally. Used to force a mutation that previously failed with a
   * 412 concurrency conflict (see {@link isConcurrencyError}).
   */
  force?: boolean;
  lastAttemptAt?: number;
  nextAttemptAt?: number;
  error?: any;
};
declare class MutationPersistenceError extends Error {
  readonly mutationIds: string[];
  readonly cause: unknown;
  constructor(message: string, mutationIds: string[], cause: unknown);
}
//#endregion
//#region src/sync/queue.d.ts
/** Options for {@link SyncEngine} construction. */
type SyncEngineOptions = {
  /** Name for the engine's IndexedDB database and BroadcastChannel. Unique per instance — two DBs with the same name share the flush lock. */
  name: string;
  /** Tables the engine can sync; keyed by `entitySetName`. */
  tables: DataverseTable<GenericProperties>[];
  /** Schema version for the IndexedDB database; grows when late-registered collections need new stores. */
  version: number;
  /**
   * When true, queued inserts replay with the offline transaction time as
   * `overriddencreatedon` (the "Record Created On" attribute), so the
   * record's `createdon` shows when it was created offline rather than
   * when the queue was flushed. Requires the flushing user's security
   * role to include `prvOverrideCreatedOnCreatedBy`.
   */
  overrideCreatedOn?: boolean;
  /**
   * Retry budget per mutation: failed mutations are re-attempted with
   * exponential backoff until they are sent this many times, then moved to
   * the errored store for operator resolution. Deterministic failures
   * (concurrency conflicts, key violations, validation) bypass the budget
   * and error immediately. Default 3.
   */
  maxAttempts?: number;
  /**
   * Base delay in ms for the exponential retry backoff
   * (`retryBaseDelay * 2^(attempt - 1)`, capped at `retryMaxDelay`).
   * Default 1000.
   */
  retryBaseDelay?: number;
  /**
   * Upper cap in ms for the retry backoff delay. Default 60000.
   */
  retryMaxDelay?: number;
  /**
   * When true (the default), the engine auto-flushes the mutation queue
   * whenever the tab comes back online. Turn off for test environments,
   * web workers (no `navigator.onLine`/Web Locks), or apps that flush only
   * on explicit user action.
   */
  flushOnOnline?: boolean;
};
/**
 * Snapshot for presenting a conflicted mutation to a user: the server's
 * current authoritative record, and which of the mutation's fields the
 * server state actually differs on. A differing etag only *means*
 * something touched the record — the field diff is what makes "Force",
 * "Rebase" or "Discard" an informed choice instead of a blind button.
 */
type ConflictDetails = {
  /**
   * The transformed server record (null when the record was deleted
   * server-side), including *all* of the table's fields — not just the
   * locally changed ones.
   */
  server: any | null;
  /**
   * One entry for every field defined on the table's `fields` map, in map
   * order — a ready-to-render conflict comparison row list.
   */
  fields: FieldDiff[];
  /**
   * Convenience subset: the field names whose diff status is `"conflict"`
   * (i.e. all fields the local mutation touches that genuinely differ from
   * the server snapshot). Empty when the values are equal despite the etag
   * difference (cosmetic churn) — in that case a plain retry is safe.
   */
  conflictingFields: string[];
};
/** Status of one field in a conflict-details comparison. */
type FieldDiffStatus =
/** Touched locally and changed on the server to a different value. */
"conflict" |
/** Changed locally but the server snapshot already matches the local value. */
"local-change" |
/** Untouched locally, but the server state differs from the local row. */
"server-change" |
/** Local proposal and server record agree. */
"unchanged";
/** One table field's comparison row in {@link ConflictDetails.fields}. */
type FieldDiff = {
  /** TypeScript property name, matching the table's `fields` map key. */
  field: string;
  /** The local proposal: the mutation's value/changes overlay. Absent if not set. */
  local?: unknown;
  /** The server record's value. Absent if the field is not on the server record. */
  server?: unknown;
  /**
   * The value carried in the mutation's `changes` delta, when the field is
   * explicitly part of the partial update — `undefined` when the field is
   * only present via the full optimistic row (`value`) or unchanged.
   */
  changed?: unknown;
  status: FieldDiffStatus;
};
/**
 * Retry resolutions for an errored mutation. A resolution is a property of
 * the retry call, not of the mutation: a mutation previously retried with
 * force is un-forced by a later plain or useFreshEtag retry.
 */
type RetryOptions = {
  /** Re-apply without any `If-Match` precondition (local changes win). */
  force?: boolean;
  /** Re-apply on top of the server's current etag (server state is the base). */
  useFreshEtag?: boolean;
};
/**
 * The vanilla offline sync engine: a durable IndexedDB mutation queue with a
 * flush cycle (web-lock serialized, cross-tab broadcast), deterministic
 * failure classification, etag freshness bookkeeping, and conflict
 * resolutions (force / rebase / discard / plain retry). It talks to Dataverse
 * through the registered {@link DataverseTable}s and knows nothing about
 * TanStack DB; adapters (see src/tanstack-db.ts) only map their mutation
 * format into {@link QueuedMutation} and feed it to {@link enqueue}.
 */
declare class SyncEngine {
  name: string;
  version: number;
  readonly tables: Map<string, DataverseTable<GenericProperties>>;
  MUTATION_QUEUE_NAME: string;
  ERRORED_MUTATIONS_NAME: string;
  readonly channel: BroadcastChannel;
  private closed;
  private collectionStores;
  private collectionStorePromises;
  private dbVersion;
  private activeFetchControllers;
  private collectionCleanups;
  private keyEtags;
  private retryTimer;
  private readonly channelMessageHandler;
  private mutationListeners;
  constructor(options: SyncEngineOptions);
  overrideCreatedOn: boolean;
  maxAttempts: number;
  retryBaseDelay: number;
  retryMaxDelay: number;
  flushOnOnline: boolean;
  private onlineHandler;
  sequence: number;
  nextSequence(): number;
  /**
   * Registers a listener invoked (synchronously, best-effort) whenever the
   * offline mutation state changes in this tab: mutations get enqueued,
   * flushed, moved to/from the errored store, or discarded. Returns an
   * unsubscribe function. Cross-tab changes are not delivered directly —
   * each tab's own queueMutations/flushQueue activity fires the hook, so
   * attach a listener per tab that redraws from
   * {@link getQueueCount}/{@link getErroredMutations}.
   */
  onMutationsChanged(listener: () => void): () => void;
  private notifyMutationsChanged;
  private db;
  getDB(): Promise<IDBPDatabase>;
  /**
   * Registers a per-collection cache store (keyed by collection id). If the
   * database is already open without this store, it is reopened with a
   * bumped version so the upgrade callback can create it. The returned
   * promise resolves once the store is safe to read/write.
   *
   * Reopens are serialized through {@link dbReopenPromise}: two collections
   * registered back-to-back must not interleave openDB calls — the first
   * bump creates a store the second bump would otherwise re-check against a
   * stale connection. Before closing an open connection, in-flight fetches
   * are aborted locally and cross-tab, because the new open transaction must
   * wait for every other tab's connection to be closed on versionchange
   * (each getDB registers that handler itself).
   */
  ensureCollectionStore(name: string): Promise<void>;
  private dbReopenPromise;
  /**
   * Ensures the object store for a table's {@link entitySetName} exists. Same
   * reopen machinery as {@link ensureCollectionStore}; use this when a table
   * is registered after the DB has already been opened, because table stores
   * are otherwise only created inside the upgrade callback.
   */
  ensureTableStore(entitySetName: string): Promise<void>;
  /**
   * Instantly aborts any in-flight remote server GET requests across all collections.
   */
  abortActiveFetches(): void;
  /** Registers a collection-scoped cleanup to run when the queue closes. */
  addCollectionCleanup(cleanup: () => void): void;
  /** Registers an in-flight fetch controller so abortActiveFetches can cancel it. */
  trackActiveFetch(controller: AbortController): void;
  /** Unregisters a fetch controller previously registered with trackActiveFetch. */
  untrackActiveFetch(controller: AbortController): void;
  get isClosed(): boolean;
  close(): void;
  /**
   * Flushes the mutation queue to Dataverse. After a successful flush the
   * authoritative server records (carrying fresh etags) are broadcast via the
   * MUTATIONS_ADDED channel so every collection reconciles its in-memory row
   * and IDB cache store — see the offline adapter's handleTabMessage.
   */
  flushQueue(): Promise<void>;
  getQueueCount(): Promise<number>;
  getErroredMutations(): Promise<QueuedMutation[]>;
  /**
   * Snapshot for presenting a conflicted mutation to a user: the server's
   * current authoritative record, and which of the mutation's fields the
   * server state actually differs on. A differing etag only *means*
   * something touched the record — the field diff is what makes "Force",
   * "Rebase" or "Discard" an informed choice instead of a blind button.
   *
   * Semantics:
   * - `server` is the transformed record (null when the record was deleted
   *   server-side), including *all* of the table's fields — not just the
   *   locally changed ones.
   * - `conflictingFields` compares only the fields the local mutation
   *   touches against the server record (see {@link ConflictDetails}).
   * Unknown fields (e.g. navigation blobs not present in the snapshot) are
   * treated as conflicting rather than silently ignored.
   */
  getConflictDetails(mutation: QueuedMutation): Promise<ConflictDetails>;
  /**
   * Moves an errored mutation back into the retry queue and flushes.
   *
   * Resolution options ({@link RetryOptions}):
   *
   * - **Force** (`{ force: true }`): re-applied without its `If-Match`
   *   precondition — updates overwrite the server's current state
   *   (`If-Match: *`) and deletes run unconditionally. Use after a 412
   *   concurrency failure (see {@link isConcurrencyError}) when the local
   *   changes should win regardless of concurrent server-side edits.
   * - **Rebase** (`{ useFreshEtag: true }`): fetches the server's current
   *   record and re-applies the local changes on top of its *fresh* etag
   *   — a "resend my edits, accept the server's state as the base"
   *   resolution. Fails with 412 again if the record is touched between
   *   reading the etag and the write. If the server cannot be reached the
   *   freshest etag already known to this DB is used instead of aborting.
   * - Plain (`{}`): retries with the etag it last carried — useful only if
   *   the server record has since reverted to the expected etag.
   *
   * The resolution is a property of the retry call, not of the mutation:
   * a mutation previously retried with `force` is un-forced by a later
   * plain or `useFreshEtag` retry (and, once un-forced, inherits the
   * freshest known etag rather than a bare precondition).
   */
  retryErroredMutation(id: string, options?: RetryOptions): Promise<void>;
  discardErroredMutation(id: string): Promise<void>;
  queueMutations(mutations: QueuedMutation[]): Promise<void>;
}
//#endregion
//#region src/sync/classifiers.d.ts
/**
 * Reduces a thrown error to a structured-clone-safe plain object before it is
 * persisted into the IndexedDB errored store. Besides keeping the `put` from
 * throwing (`DataverseHttpError.response` holds a live `Response` object,
 * which cannot be cloned), this preserves the HTTP status as an own property
 * so conflict detection keeps working after a page reload — once the error
 * has passed through IndexedDB, `instanceof DataverseHttpError` no longer
 * holds (the class identity is not restored), only the data survives.
 */
declare function serializeError(error: unknown): Record<string, unknown>;
/**
 * Returns true when the error is a Dataverse 412 (Precondition Failed)
 * response — an optimistic-concurrency failure meaning the server's etag no
 * longer matches the etag the mutation was built against. Such mutations are
 * moved to the errored store and can be re-applied with `force` or
 * `useFreshEtag` retry options (see `SyncEngine.retryErroredMutation`).
 *
 * Because stored errors are serialized plain objects ({@link serializeError}),
 * detection cannot rely on `instanceof` alone — it also matches the persisted
 * `status` property shape, so an error read back after a page reload is still
 * recognized.
 *
 * Duplicate-key violations can surface as 412s too, but they are NOT
 * concurrency failures — Force only removes the `If-Match` precondition and
 * cannot make a record unique, and rebasing onto the server's etag changes
 * nothing either. Those are excluded here so resolution UIs don't offer
 * Force/Rebase for them; use {@link isKeyViolation} to detect them instead.
 */
declare function isConcurrencyError(error: unknown): boolean;
/**
 * Returns true when a Dataverse error is a unique-key / duplicate-detection
 * violation (e.g. `DuplicateRecordEntityKey`, `0x80060892`: "Entity Key {0}
 * violated. A record with the same value for {1} already exists."), or the
 * classic duplicate-detection result (`DuplicateRecordsFound`,
 * `0x80040333`). These failures are deterministic — the same payload will
 * keep failing no matter when it is retried and no matter which etag it
 * carries — so they skip the retry cycle entirely and move straight to the
 * errored store. Resolution is never automatic: the payload must be edited
 * (different key values) or discarded.
 */
declare function isKeyViolation(error: unknown): boolean;
//#endregion
//#region src/sync/error-codes.d.ts
/**
 * Curated sub-set of the Dataverse Web API error-code table
 * (https://learn.microsoft.com/en-us/power-apps/developer/data-platform/reference/web-service-error-codes)
 * covering the codes most relevant to offline mutation processing: uniqueness
 * violations, missing records and duplicate detection.
 */
declare const DATVERSE_ERROR_CODES: Record<string, {
  name: string;
  meaning: string;
}>;
/** What category a mutation failure falls into, for resolution UIs. */
type ErrorCategory =
/** Optimistic-concurrency failure: etag no longer matches (resolvable by force/rebase). */
"concurrency" |
/** Unique-key or duplicate detection violation (payload must be edited or discarded). */
"key-violation" |
/** The target record no longer exists (update/delete on a deleted record). */
"missing-record" |
/** Request rejected as malformed/invalid (payload problem, not a race). */
"validation" |
/** Server throttling — the retry cycle should just keep trying. */
"throttled" |
/** Auth token problem — a fresh token should fix it. */
"identity" |
/** Insufficient privileges — requires admin/user action, not a payload fix. */
"permission" |
/** Server-side fault (5xx) or transient network failure — retry is the right move. */
"transient" |
/** Anything not otherwise classified. */
"unknown";
/** Interpretation of a mutation failure, for resolution UIs and retry policy. */
type ErrorGuidance = {
  category: ErrorCategory;
  /**
   * The documented Dataverse code name when known — e.g.
   * `DuplicateRecordEntityKey` for `0x80060892`.
   */
  codeName?: string;
  /** The raw hex code as returned by the server, when available. */
  code?: string;
  /** Human-readable resolution hint for a dashboard. */
  resolution: string;
  /**
   * Deterministic failures cannot behave differently on a retry: re-applying
   * them wastes a request cycle per retry. Getting past one requires a
   * server-side change (revert, recreate) or an operator resolution (force,
   * rebase, edited payload). Transient failures keep the retry/backoff cycle.
   */
  deterministic: boolean;
};
/**
 * Interprets a mutation failure (a live `DataverseHttpError` or a serialized
 * error restored from the errored store) into a {@link ErrorGuidance} for
 * dashboards and retry policy. Guidance-based classification is the source of
 * truth for the flush loop's deterministic skip; the standalone helpers
 * {@link isConcurrencyError} and {@link isKeyViolation} delegate to the same
 * logic for simple yes/no questions.
 */
declare function interpretError(error: unknown): ErrorGuidance;
/** Convenience determination (see {@link interpretError}). */
declare function isDeterministicFailure(error: unknown): boolean;
//#endregion
//#region src/sync/util.d.ts
/**
 * Deep-copies a value into plain objects/arrays. Used to strip the reactive
 * proxies that @tanstack/db's live-query/materialize layer wraps rows in —
 * proxies cannot pass through structuredClone, so any mutation payload that
 * came from a joined row would otherwise throw when written to IndexedDB
 * (or posted over the BroadcastChannel). Reading through the proxy and
 * rebuilding plain containers is enough; no proxy detection is needed.
 */
declare function plainClone<T>(value: T): T;
/**
 * True for the synthetic bookkeeping properties @tanstack/db (and this
 * library's adapters) attach to rows beside the real Dataverse columns —
 * `$key`, `$collectionId`, `$synced`, `$origin`, … — plus `$etag`. They
 * exist only in the optimistic/in-memory row, never on a server snapshot,
 * so they would always pollute a field-level conflict diff with phantom
 * "differences".
 */
declare function isMetaKey(key: string): boolean;
/**
 * True when a delta object contains only bookkeeping keys (`$`-prefixed) —
 * i.e., patching it would write nothing to Dataverse. An empty delta
 * (length 0) is left alone: there is nothing to fall back on and the
 * caller's body building will produce an empty (no-op) request either way.
 */
declare function isMetaOnly(delta: unknown): boolean;
/**
 * Structural equality for comparing a local mutation field value against the
 * server record in conflict inspection. Handles the value shapes Dataverse
 * records carry: primitives, Date instances (compare by timestamp — JSON
 * round-trips make instance identity useless), arrays, nested plain objects,
 * and binary values (Blob identity).
 */
declare function valuesEqual(a: unknown, b: unknown): boolean;
//#endregion
export { Above, AboveOrEqual, Aggregation, AlternateKey, ApplyQuery, BLOB_SCHEMA, BOOLEAN_SCHEMA, Between, BooleanField, ChoiceField, CollectionIdsProperty, CollectionProperty, CollectionSubQuery, type ConflictDetails, ContainsValues, DATE_SCHEMA, DATVERSE_ERROR_CODES, DataverseClient, DataverseClientOptions, DataverseHttpError, DataverseIntersectTable, DataverseKey, DataverseRecord, DataverseTable, DataverseTableOptions, DateField, DateTimeField, DefaultValue, DeleteRecordOptions, DoesNotContainValues, ETAG, EntityQueryBuilder, EqualBusinessId, EqualUserId, EqualUserLanguage, EqualUserOrUserHierarchy, EqualUserOrUserHierarchyAndTeams, EqualUserOrUserTeams, type ErrorCategory, type ErrorGuidance, ExpandObject, ExpandValue, FetchLinkType, FetchXmlAggregateAst, FetchXmlAggregateQuery, FetchXmlAttributeAst, FetchXmlInitial, FetchXmlLinkAst, FetchXmlOrderAst, FetchXmlSelectAst, FetchXmlSelectQuery, FieldBase, type FieldDiff, type FieldDiffStatus, FieldOptions, type FieldPath, FieldProxy, FieldRef, FileField, FileRef, FilterCollector, FilterExpr, FilterField, FormattedField, GUID, GUID_SCHEMA, GenericNavigationProperty, GenericProperties, GenericProperty, GenericValueProperty, GetRecordOptions, GetTable, GroupByExpr, ImageField, ImageRef, In, InFiscalPeriod, InFiscalPeriodAndYear, InFiscalYear, InOrAfterFiscalPeriodAndYear, InOrBeforeFiscalPeriodAndYear, Infer, InitialQuery, JsonField, Last7Days, LastFiscalPeriod, LastFiscalYear, LastMonth, LastWeek, LastXDays, LastXFiscalPeriods, LastXFiscalYears, LastXHours, LastXMonths, LastXWeeks, LastXYears, LastYear, ListField, LookupIdProperty, LookupProperty, LookupSubQuery, MultiChoiceField, MutationOptions, MutationPersistenceError, NUMBER_SCHEMA, Name, NarrowKeysByValue, Next7Days, NextFiscalPeriod, NextFiscalYear, NextMonth, NextWeek, NextXDays, NextXFiscalPeriods, NextXFiscalYears, NextXHours, NextXMonths, NextXWeeks, NextXYears, NextYear, NotBetween, NotEqualBusinessId, NotEqualUserId, NotIn, NotUnder, NullableBooleanField, NullableChoiceField, NullableDateField, NullableDateTimeField, NullableField, NullableNumberField, NullableStringField, NumberField, ODataAggregateAst, ODataAggregateExpressionAst, ODataAggregateOrderAst, ODataAlias, ODataApplyAst, ODataApplyQuery, ODataExpandAst, ODataFilterNode, ODataFilterValue, ODataOrderAst, ODataPath, ODataSelectAst, ODataTableQueryOptions, OlderThanXDays, OlderThanXHours, OlderThanXMinutes, OlderThanXMonths, OlderThanXWeeks, OlderThanXYears, On, OnOrAfter, OnOrBefore, OrderSpec, PatchRecordOptions, PostRecordOptions, PreferOption, PrimaryKeyField, Primitive, type QueryProperty, QueryRequestOptions, type QueuedMutation, RequestOptions, RetrieveAadUserRoles, RetrieveChoices, RetrieveTotalRecordCount, type RetryOptions, SKIP, STRING_SCHEMA, SelectQuery, StandardParseResult, StringField, SyncEngine, type SyncEngineOptions, TableRequestOptions, ThisFiscalPeriod, ThisFiscalYear, ThisMonth, ThisWeek, ThisYear, Today, Tomorrow, TransformContext, Under, UnderOrEqual, ValidationSchema, WhoAmI, Yesterday, all, and, any, arrayOf, asc, attachETag, average, base64ImageToURL, boolean, buildLambdaProxy, buildTableQueryAst, checkSchema, choice, collection, collectionIds, composeRecordSchema, contains, count, date, datetime, desc, endsWith, eq, expand, fetchOdata, fetchXml, file, formatted, ge, getEtag, getImageUrl, getName, groupby, gt, image, interpretError, isActive, isConcurrencyError, isDeterministicFailure, isInactive, isKeyViolation, isMetaKey, isMetaOnly, isNonEmptyString, isNotNull, isNull, json, keys, lazyOf, le, list, lookup, lookupId, lt, mapChoices, max, mergeRecords, min, multiChoice, ne, not, nullableBoolean, nullableChoice, nullableDate, nullableDateTime, nullableNumber, nullableOf, nullableString, number, optionalOf, or, orderby, parseDateOnly, plainClone, primaryKey, requiredOf, rxGUID, select, serializeError, serializeFetchXml, serializeODataAggregate, serializeODataSelect, standardParse, standardSafeParse, startsWith, string, sum, toBase64, toDateOnly, toODataFilterNode, toODataPath, toTimestampValue, valuesEqual, wrapString, xml };