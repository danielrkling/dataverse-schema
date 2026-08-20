import { DataverseTable, DataverseIntersectTable } from '../../table';
import { GenericProperties, Infer } from '../../types';
import { FilterExpr, FieldRef } from '../filter/expr';
import { Aggregation, GroupByExpr } from '../shared/aggregation';
import { FieldBase } from '../../fields';
import { FetchXmlAggregateAst, FetchXmlSelectAst } from './ast';
type ExecuteOptions = {
    datasource?: string;
    lateMaterialize?: boolean;
    aggregateLimit?: number;
    useRawOrderBy?: boolean;
    options?: string;
};
type Simplify<T> = {
    [Key in keyof T]: T[Key];
} & {};
type FieldSelector<TProps extends GenericProperties> = {
    [K in keyof TProps]: K;
};
export type FieldProxy<T extends GenericProperties> = {
    [K in keyof T]: T[K] extends FieldBase<infer V> ? FieldRef<V, K extends string ? K : never, T[K]> : never;
};
export type FetchLinkType = "inner" | "outer" | "any" | "not any" | "all" | "not all" | "exists" | "in" | "matchfirstrowusingcrossapply";
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
type ApplyResultType<R extends Record<string, GroupByExpr<any> | Aggregation<any>>> = {
    [K in keyof R]: R[K] extends GroupByExpr<infer V> ? V : R[K] extends Aggregation<infer V> ? V : never;
};
type ApplyAliasProxy<R extends Record<string, any>> = {
    [K in keyof R]: FieldRef<R[K], K extends string ? K : never>;
};
type SubJoinBuilder<TProps extends GenericProperties, TResult extends Record<string, any>, TSelected extends boolean = false> = {
    select: TSelected extends true ? never : <R extends Record<string, keyof TProps>>(selector: (fields: FieldSelector<TProps>) => R) => SubJoinBuilder<TProps, {
        [K in keyof R]: Infer<TProps[R[K]]>;
    }, true>;
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
export interface FetchXmlSelectQuery<TProps extends GenericProperties, TResult extends Record<string, any>> {
    select<R extends Record<string, keyof TProps>>(selector: (fields: FieldSelector<TProps>) => R): FetchXmlSelectQuery<TProps, {
        [K in keyof R]: Infer<TProps[R[K]]>;
    }>;
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
export interface FetchXmlInitial<TProps extends GenericProperties> {
    select(): FetchXmlSelectQuery<TProps, TProps>;
    select<R extends Record<string, keyof TProps>>(selector: (fields: FieldSelector<TProps>) => R): FetchXmlSelectQuery<TProps, {
        [K in keyof R]: Infer<TProps[R[K]]>;
    }>;
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
export declare class FilterCollector<TProps extends GenericProperties = any> {
    protected _filters: string[];
    private _proxy;
    constructor(table: DataverseTable<TProps>);
    private _buildProxy;
    filter(filter: string | FilterExpr | ((f: FieldProxy<TProps>) => string | FilterExpr)): this;
}
export declare class FetchXmlAggregateQuery<TProps extends GenericProperties, TResult extends Record<string, any> = {}> {
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
export declare class EntityQueryBuilder<TProps extends GenericProperties, TResult extends Record<string, any> = {}> {
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
    select<R extends Record<string, keyof TProps>>(selector: (fields: FieldSelector<TProps>) => R): EntityQueryBuilder<TProps, {
        [K in keyof R]: Infer<TProps[R[K]]>;
    }>;
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
export declare function fetchXml<TProps extends GenericProperties>(table: DataverseTable<TProps>): FetchXmlInitial<TProps>;
export {};
