import { DataverseTable } from '../../table';
import { GenericProperties, Infer } from '../../types';
import { LookupProperty, CollectionProperty, FieldBase } from '../../fields';
import { FilterExpr, FieldRef } from '../filter/expr';
import { Aggregation, GroupByExpr } from '../shared/aggregation';
import { FilterNode } from '../filter/ast';
import { ODataAggregateAst, ODataApplyAst, ODataSelectAst } from './ast';
export { Aggregation, GroupByExpr, average, count, groupby, max, min, sum } from '../shared/aggregation';
type ODataLambdaProxy<P extends GenericProperties> = {
    [K in keyof P]: FieldRef<any>;
};
type ODataCollectionNavProxy<P extends GenericProperties> = {
    toString(): string;
} & ODataFieldProxy<P>;
type ODataLookupNavProxy<P extends GenericProperties> = {
    toString(): string;
} & ODataFieldProxy<P>;
type ODataFieldProxy<T extends GenericProperties> = {
    [K in keyof T]: T[K] extends CollectionProperty<infer P> ? ODataCollectionNavProxy<P> : T[K] extends LookupProperty<infer P> ? ODataLookupNavProxy<P> : T[K] extends FieldBase<infer V> ? FieldRef<V, K extends string ? K : never, T[K]> : never;
};
type ValueKeys<T extends GenericProperties> = {
    [K in keyof T]: T[K] extends {
        kind: 'value';
    } | {
        type: 'lookupId';
    } | {
        type: 'file';
    } ? K : never;
}[keyof T];
type CollectionKeys<T extends GenericProperties> = {
    [K in keyof T]: T[K] extends CollectionProperty<any> ? K : never;
}[keyof T];
type LookupKeys<T extends GenericProperties> = {
    [K in keyof T]: T[K] extends LookupProperty<any> ? K : never;
}[keyof T];
type NavKeys<T extends GenericProperties> = CollectionKeys<T> | LookupKeys<T>;
type RelatedProps<T extends GenericProperties, K extends keyof T> = T[K] extends CollectionProperty<infer P> ? P : T[K] extends LookupProperty<infer P> ? P : never;
type ApplyResultType<R extends Record<string, GroupByExpr<any> | Aggregation<any>>> = {
    [K in keyof R]: R[K] extends GroupByExpr<infer V> ? V : R[K] extends Aggregation<infer V> ? V : never;
};
type MergeExpand<T, K extends string, V> = {
    [P in keyof T | K]: P extends K ? V : P extends keyof T ? T[P] : never;
};
type ApplyAliasProxy<R extends Record<string, any>> = {
    [K in keyof R]: FieldRef<R[K], K extends string ? K : never>;
};
export interface ApplyQuery<T extends GenericProperties, TResult extends Record<string, any>> {
    filter(filter: string): ApplyQuery<T, TResult>;
    filter(filter: FilterExpr): ApplyQuery<T, TResult>;
    filter(filter: (f: ODataFieldProxy<T>) => string | FilterExpr): ApplyQuery<T, TResult>;
    orderby(fieldSelector: (f: ApplyAliasProxy<TResult>) => string | FieldRef<any>, direction?: "asc" | "desc"): ApplyQuery<T, TResult>;
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
export interface InitialQuery<TAll extends GenericProperties> {
    select(): SelectQuery<TAll, TAll>;
    select<K extends ValueKeys<TAll>>(...keys: K[]): SelectQuery<TAll, {
        [P in K]: TAll[P];
    }, {
        [P in K]: Infer<TAll[P]>;
    }>;
    apply<R extends Record<string, GroupByExpr<any> | Aggregation<any>>>(expr: (f: ODataFieldProxy<TAll>) => R): ApplyQuery<TAll, ApplyResultType<R>>;
}
export interface SelectQuery<TAll extends GenericProperties, TChosen extends Record<string, any>, TResult = Infer<TChosen>> {
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
export interface CollectionSubQuery<TAll extends GenericProperties, TChosen extends Record<string, any>, TResult = Infer<TChosen>> {
    select<K extends ValueKeys<TAll>>(...keys: K[]): CollectionSubQuery<TAll, {
        [P in K]: TAll[P];
    }, {
        [P in K]: Infer<TAll[P]>;
    }>;
    expand<K extends CollectionKeys<TAll>, R extends Record<string, any>>(key: K, sub: (q: CollectionSubQuery<RelatedProps<TAll, K>, RelatedProps<TAll, K>>) => CollectionSubQuery<RelatedProps<TAll, K>, R>): CollectionSubQuery<TAll, MergeExpand<TChosen, K & string, R[]>, MergeExpand<TResult, K & string, Infer<R>[]>>;
    expand<K extends LookupKeys<TAll>, R extends Record<string, any>>(key: K, sub: (q: LookupSubQuery<RelatedProps<TAll, K>, RelatedProps<TAll, K>>) => LookupSubQuery<RelatedProps<TAll, K>, R>): CollectionSubQuery<TAll, MergeExpand<TChosen, K & string, R | null>, MergeExpand<TResult, K & string, Infer<R> | null>>;
    filter(filter: string): CollectionSubQuery<TAll, TChosen, TResult>;
    filter(filter: FilterExpr): CollectionSubQuery<TAll, TChosen, TResult>;
    filter(filter: (f: ODataFieldProxy<TAll>) => string | FilterExpr): CollectionSubQuery<TAll, TChosen, TResult>;
    orderby(fieldSelector: (f: ODataFieldProxy<TAll>) => string | FieldRef<any>, direction?: "asc" | "desc"): CollectionSubQuery<TAll, TChosen, TResult>;
    orderby(alias: string, direction?: "asc" | "desc"): CollectionSubQuery<TAll, TChosen, TResult>;
    top(n: number): CollectionSubQuery<TAll, TChosen, TResult>;
}
export interface LookupSubQuery<TAll extends GenericProperties, TChosen extends Record<string, any>, TResult = Infer<TChosen>> {
    select<K extends ValueKeys<TAll>>(...keys: K[]): LookupSubQuery<TAll, {
        [P in K]: TAll[P];
    }, {
        [P in K]: Infer<TAll[P]>;
    }>;
    expand<K extends CollectionKeys<TAll>, R extends Record<string, any>>(key: K, sub: (q: CollectionSubQuery<RelatedProps<TAll, K>, RelatedProps<TAll, K>>) => CollectionSubQuery<RelatedProps<TAll, K>, R>): LookupSubQuery<TAll, MergeExpand<TChosen, K & string, R[]>, MergeExpand<TResult, K & string, Infer<R>[]>>;
    expand<K extends LookupKeys<TAll>, R extends Record<string, any>>(key: K, sub: (q: LookupSubQuery<RelatedProps<TAll, K>, RelatedProps<TAll, K>>) => LookupSubQuery<RelatedProps<TAll, K>, R>): LookupSubQuery<TAll, MergeExpand<TChosen, K & string, R | null>, MergeExpand<TResult, K & string, Infer<R> | null>>;
}
export declare class ODataApplyQuery<T extends GenericProperties, TResult extends Record<string, any> = Record<string, any>> {
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
    orderby(fieldSelector: (f: ApplyAliasProxy<TResult>) => string | FieldRef<any>, direction?: "asc" | "desc"): this;
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
export declare function buildLambdaProxy<P extends GenericProperties>(alias: string, table: DataverseTable<P>): ODataLambdaProxy<P>;
export declare function any<P extends GenericProperties>(proxy: ODataCollectionNavProxy<P>, condition: (x: ODataLambdaProxy<P>) => string | FilterExpr): FilterExpr;
export declare function all<P extends GenericProperties>(proxy: ODataCollectionNavProxy<P>, condition: (x: ODataLambdaProxy<P>) => string | FilterExpr): FilterExpr;
export declare function fetchOdata<T extends GenericProperties>(table: DataverseTable<T>): InitialQuery<T>;
export type ODataTableQueryOptions = {
    filter?: string;
    orderby?: Partial<Record<string, "asc" | "desc">> | string;
    top?: number;
};
export declare function buildTableQueryAst<T extends GenericProperties>(table: DataverseTable<T>, options?: ODataTableQueryOptions): ODataSelectAst;
