import { DataverseTable, DataverseIntersectTable } from "../../table";
import { GenericProperties, Infer } from "../../types";
import { FilterExpr, FieldRef } from "../filter/expr";
import { Aggregation, GroupByExpr } from "../shared/aggregation";
import { renderFilterInput } from "../filter/input";
import { buildFlatFieldProxy } from "../shared/proxy";
import type { FieldBase } from "../../fields";
import { Etag } from "../../util";
import {
    FetchXmlAggregateAst,
    FetchXmlAttributeAst,
    FetchXmlLinkAst,
    FetchXmlOrderAst,
    FetchXmlSelectAst,
} from "./ast";

type AliasInfo = {
    field?: FieldRef<any>;
    getDefault: () => any;
    name: string;
};

type ExecuteOptions = {
    datasource?: string;
    lateMaterialize?: boolean;
    aggregateLimit?: number;
    useRawOrderBy?: boolean;
    options?: string;
};

type Simplify<T> = { [Key in keyof T]: T[Key] } & {};

type FieldSelector<TProps extends GenericProperties> = {
    [K in keyof TProps]: K;
};

export type FieldProxy<T extends GenericProperties> = {
    [K in keyof T]: T[K] extends FieldBase<infer V> ? FieldRef<V, K extends string ? K : never, T[K]> : never
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

function fetchAttributeAst(attribute: AttrDef): FetchXmlAttributeAst {
    return { ...attribute };
}

function fetchOrderAst(order: OrderDef): FetchXmlOrderAst {
    return { ...order };
}

type ApplyResultType<R extends Record<string, GroupByExpr<any> | Aggregation<any>>> = {
  [K in keyof R]: R[K] extends GroupByExpr<infer V> ? V
    : R[K] extends Aggregation<infer V> ? V
    : never
}

type ApplyAliasProxy<R extends Record<string, any>> = {
  [K in keyof R]: FieldRef<R[K], K extends string ? K : never>
}

type SubJoinBuilder<TProps extends GenericProperties, TResult extends Record<string, any>, TSelected extends boolean = false> = {
    select: TSelected extends true
        ? never
        : <R extends Record<string, keyof TProps>>(selector: (fields: FieldSelector<TProps>) => R) => SubJoinBuilder<TProps, { [K in keyof R]: Infer<TProps[R[K]]> }, true>
    filter(filter: string | FilterExpr | ((f: FieldProxy<TProps>) => string | FilterExpr)): SubJoinBuilder<TProps, TResult, TSelected>
    join<TDataverseTable extends DataverseTable<any>, TFrom extends keyof TDataverseTable["fields"], TTo extends keyof TProps>(
        linkType: FilterOnlyLinkType,
        table: TDataverseTable,
        from: TFrom,
        to: TTo,
        subquery: (q: FilterCollector<TDataverseTable["fields"]>) => void,
        intersect?: boolean,
    ): SubJoinBuilder<TProps, TResult, TSelected>
    join<TDataverseTable extends DataverseTable<any>, TFrom extends keyof TDataverseTable["fields"], TTo extends keyof TProps, TJoinResult extends Record<string, any>>(
        linkType: NormalLinkType,
        table: TDataverseTable,
        from: TFrom,
        to: TTo,
        subquery: (q: SubJoinBuilder<TDataverseTable["fields"], {}>) => SubJoinBuilder<TDataverseTable["fields"], TJoinResult>,
        intersect?: boolean,
    ): SubJoinBuilder<TProps, NoOverlap<TResult, TJoinResult>, TSelected>
    join<T2 extends GenericProperties>(
        linkType: FilterOnlyLinkType,
        intersectTable: DataverseIntersectTable<TProps, T2>,
        subquery: (q: FilterCollector<T2>) => void,
    ): SubJoinBuilder<TProps, TResult, TSelected>
    join<T2 extends GenericProperties, TJoinResult extends Record<string, any>>(
        linkType: NormalLinkType,
        intersectTable: DataverseIntersectTable<TProps, T2>,
        subquery: (q: SubJoinBuilder<T2, {}>) => SubJoinBuilder<T2, TJoinResult>,
    ): SubJoinBuilder<TProps, NoOverlap<TResult, TJoinResult>, TSelected>
    join<T2 extends GenericProperties>(
        linkType: FilterOnlyLinkType,
        intersectTable: DataverseIntersectTable<T2, TProps>,
        subquery: (q: FilterCollector<T2>) => void,
    ): SubJoinBuilder<TProps, TResult, TSelected>
    join<T2 extends GenericProperties, TJoinResult extends Record<string, any>>(
        linkType: NormalLinkType,
        intersectTable: DataverseIntersectTable<T2, TProps>,
        subquery: (q: SubJoinBuilder<T2, {}>) => SubJoinBuilder<T2, TJoinResult>,
    ): SubJoinBuilder<TProps, NoOverlap<TResult, TJoinResult>, TSelected>
    orderby(fieldSelector: (f: FieldProxy<TProps>) => string | FieldRef<any>, direction?: 'asc' | 'desc'): SubJoinBuilder<TProps, TResult, TSelected>
    orderby(entityname: string, attribute: string, direction?: 'asc' | 'desc'): SubJoinBuilder<TProps, TResult, TSelected>
    toXml(): string
    toString(): string
}

type FilterOnlyLinkType = 'any' | 'not any' | 'all' | 'not all' | 'exists' | 'in'

type NormalLinkType = Exclude<FetchLinkType, FilterOnlyLinkType>

type NoOverlap<T extends Record<string, any>, U extends Record<string, any>> =
    Extract<keyof T, keyof U> extends never ? Simplify<T & U> : never

// --- Aggregate subquery builder (apply path: has apply, no select) ---

type SubAggregateJoinBuilder<TProps extends GenericProperties, TResult extends Record<string, any> = {}, TApplied extends boolean = false> = {
    apply: TApplied extends true
        ? never
        : <R extends Record<string, GroupByExpr<any> | Aggregation<any>>>(
            expr: (f: FieldProxy<TProps>) => R,
        ) => SubAggregateJoinBuilder<TProps, ApplyResultType<R>, true>
    filter(filter: string | FilterExpr | ((f: FieldProxy<TProps>) => string | FilterExpr)): SubAggregateJoinBuilder<TProps, TResult, TApplied>
    join<TDataverseTable extends DataverseTable<any>, TFrom extends keyof TDataverseTable["fields"], TTo extends keyof TProps>(
        linkType: FilterOnlyLinkType,
        table: TDataverseTable,
        from: TFrom,
        to: TTo,
        subquery: (q: FilterCollector<TDataverseTable["fields"]>) => void,
        intersect?: boolean,
    ): SubAggregateJoinBuilder<TProps, TResult, TApplied>
    join<TDataverseTable extends DataverseTable<any>, TFrom extends keyof TDataverseTable["fields"], TTo extends keyof TProps, TJoinResult extends Record<string, any>>(
        linkType: NormalLinkType,
        table: TDataverseTable,
        from: TFrom,
        to: TTo,
        subquery: (q: SubAggregateJoinBuilder<TDataverseTable["fields"], {}>) => SubAggregateJoinBuilder<TDataverseTable["fields"], TJoinResult>,
        intersect?: boolean,
    ): SubAggregateJoinBuilder<TProps, NoOverlap<TResult, TJoinResult>, TApplied>
    join<T2 extends GenericProperties>(
        linkType: FilterOnlyLinkType,
        intersectTable: DataverseIntersectTable<TProps, T2>,
        subquery: (q: FilterCollector<T2>) => void,
    ): SubAggregateJoinBuilder<TProps, TResult, TApplied>
    join<T2 extends GenericProperties, TJoinResult extends Record<string, any>>(
        linkType: NormalLinkType,
        intersectTable: DataverseIntersectTable<TProps, T2>,
        subquery: (q: SubAggregateJoinBuilder<T2, {}>) => SubAggregateJoinBuilder<T2, TJoinResult>,
    ): SubAggregateJoinBuilder<TProps, NoOverlap<TResult, TJoinResult>, TApplied>
    join<T2 extends GenericProperties>(
        linkType: FilterOnlyLinkType,
        intersectTable: DataverseIntersectTable<T2, TProps>,
        subquery: (q: FilterCollector<T2>) => void,
    ): SubAggregateJoinBuilder<TProps, TResult, TApplied>
    join<T2 extends GenericProperties, TJoinResult extends Record<string, any>>(
        linkType: NormalLinkType,
        intersectTable: DataverseIntersectTable<T2, TProps>,
        subquery: (q: SubAggregateJoinBuilder<T2, {}>) => SubAggregateJoinBuilder<T2, TJoinResult>,
    ): SubAggregateJoinBuilder<TProps, NoOverlap<TResult, TJoinResult>, TApplied>
    orderby(fieldSelector: (f: FieldProxy<TProps>) => string | FieldRef<any>, direction?: 'asc' | 'desc'): SubAggregateJoinBuilder<TProps, TResult, TApplied>
    orderby(entityname: string, attribute: string, direction?: 'asc' | 'desc'): SubAggregateJoinBuilder<TProps, TResult, TApplied>
    toXml(): string
    toString(): string
}

// --- Post-select builder interface (no apply/select) ---

export interface FetchXmlSelectQuery<TProps extends GenericProperties, TResult extends Record<string, any>> {
    select<R extends Record<string, keyof TProps>>(selector: (fields: FieldSelector<TProps>) => R): FetchXmlSelectQuery<TProps, { [K in keyof R]: Infer<TProps[R[K]]> }>
    filter(filter: string | FilterExpr | ((f: FieldProxy<TProps>) => string | FilterExpr)): FetchXmlSelectQuery<TProps, TResult>
    join<TDataverseTable extends DataverseTable<any>, TFrom extends keyof TDataverseTable["fields"], TTo extends keyof TProps>(
        linkType: FilterOnlyLinkType,
        table: TDataverseTable,
        from: TFrom,
        to: TTo,
        subquery: (q: FilterCollector<TDataverseTable["fields"]>) => void,
        intersect?: boolean,
    ): FetchXmlSelectQuery<TProps, TResult>
    join<TDataverseTable extends DataverseTable<any>, TFrom extends keyof TDataverseTable["fields"], TTo extends keyof TProps, TJoinResult extends Record<string, any>>(
        linkType: NormalLinkType,
        table: TDataverseTable,
        from: TFrom,
        to: TTo,
        subquery: (q: SubJoinBuilder<TDataverseTable["fields"], {}>) => SubJoinBuilder<TDataverseTable["fields"], TJoinResult>,
        intersect?: boolean,
    ): FetchXmlSelectQuery<TProps, NoOverlap<TResult, TJoinResult>>
    join<T2 extends GenericProperties>(
        linkType: FilterOnlyLinkType,
        intersectTable: DataverseIntersectTable<TProps, T2>,
        subquery: (q: FilterCollector<T2>) => void,
    ): FetchXmlSelectQuery<TProps, TResult>
    join<T2 extends GenericProperties, TJoinResult extends Record<string, any>>(
        linkType: NormalLinkType,
        intersectTable: DataverseIntersectTable<TProps, T2>,
        subquery: (q: SubJoinBuilder<T2, {}>) => SubJoinBuilder<T2, TJoinResult>,
    ): FetchXmlSelectQuery<TProps, NoOverlap<TResult, TJoinResult>>
    join<T2 extends GenericProperties>(
        linkType: FilterOnlyLinkType,
        intersectTable: DataverseIntersectTable<T2, TProps>,
        subquery: (q: FilterCollector<T2>) => void,
    ): FetchXmlSelectQuery<TProps, TResult>
    join<T2 extends GenericProperties, TJoinResult extends Record<string, any>>(
        linkType: NormalLinkType,
        intersectTable: DataverseIntersectTable<T2, TProps>,
        subquery: (q: SubJoinBuilder<T2, {}>) => SubJoinBuilder<T2, TJoinResult>,
    ): FetchXmlSelectQuery<TProps, NoOverlap<TResult, TJoinResult>>
    distinct(): FetchXmlSelectQuery<TProps, TResult>
    top(n: number): FetchXmlSelectQuery<TProps, TResult>
    orderby(fieldSelector: (f: FieldProxy<TProps>) => string | FieldRef<any>, direction?: 'asc' | 'desc'): FetchXmlSelectQuery<TProps, TResult>
    orderby(entityname: string, attribute: string, direction?: 'asc' | 'desc'): FetchXmlSelectQuery<TProps, TResult>
    toXml(): string
    toAst(): FetchXmlSelectAst
    toString(): string
    execute(options?: ExecuteOptions): Promise<TResult[]>
    iterate(options?: ExecuteOptions & { pageSize?: number }): AsyncGenerator<TResult>
    iteratePages(options?: ExecuteOptions & { pageSize?: number }): AsyncGenerator<TResult[]>
}

// --- Initial entry point interface (forces select or apply first) ---

export interface FetchXmlInitial<TProps extends GenericProperties> {
    select(): FetchXmlSelectQuery<TProps, TProps>
    select<R extends Record<string, keyof TProps>>(selector: (fields: FieldSelector<TProps>) => R): FetchXmlSelectQuery<TProps, { [K in keyof R]: Infer<TProps[R[K]]> }>
    apply<R extends Record<string, GroupByExpr<any> | Aggregation<any>>>(
        expr: (f: FieldProxy<TProps>) => R,
    ): FetchXmlAggregateQuery<TProps, ApplyResultType<R>>
    filter(filter: string | FilterExpr | ((f: FieldProxy<TProps>) => string | FilterExpr)): FetchXmlInitial<TProps>
    join<TDataverseTable extends DataverseTable<any>, TFrom extends keyof TDataverseTable["fields"], TTo extends keyof TProps>(
        linkType: FilterOnlyLinkType,
        table: TDataverseTable,
        from: TFrom,
        to: TTo,
        subquery: (q: FilterCollector<TDataverseTable["fields"]>) => void,
        intersect?: boolean,
    ): FetchXmlInitial<TProps>
    join<TDataverseTable extends DataverseTable<any>, TFrom extends keyof TDataverseTable["fields"], TTo extends keyof TProps, TJoinResult extends Record<string, any>>(
        linkType: NormalLinkType,
        table: TDataverseTable,
        from: TFrom,
        to: TTo,
        subquery: (q: SubJoinBuilder<TDataverseTable["fields"], {}>) => SubJoinBuilder<TDataverseTable["fields"], TJoinResult>,
        intersect?: boolean,
    ): FetchXmlInitial<TProps>
    join<T2 extends GenericProperties>(
        linkType: FilterOnlyLinkType,
        intersectTable: DataverseIntersectTable<TProps, T2>,
        subquery: (q: FilterCollector<T2>) => void,
    ): FetchXmlInitial<TProps>
    join<T2 extends GenericProperties, TJoinResult extends Record<string, any>>(
        linkType: NormalLinkType,
        intersectTable: DataverseIntersectTable<TProps, T2>,
        subquery: (q: SubJoinBuilder<T2, {}>) => SubJoinBuilder<T2, TJoinResult>,
    ): FetchXmlInitial<TProps>
    join<T2 extends GenericProperties>(
        linkType: FilterOnlyLinkType,
        intersectTable: DataverseIntersectTable<T2, TProps>,
        subquery: (q: FilterCollector<T2>) => void,
    ): FetchXmlInitial<TProps>
    join<T2 extends GenericProperties, TJoinResult extends Record<string, any>>(
        linkType: NormalLinkType,
        intersectTable: DataverseIntersectTable<T2, TProps>,
        subquery: (q: SubJoinBuilder<T2, {}>) => SubJoinBuilder<T2, TJoinResult>,
    ): FetchXmlInitial<TProps>
    distinct(): FetchXmlInitial<TProps>
    top(n: number): FetchXmlInitial<TProps>
    orderby(fieldSelector: (f: FieldProxy<TProps>) => string | FieldRef<any>, direction?: 'asc' | 'desc'): FetchXmlInitial<TProps>
    orderby(entityname: string, attribute: string, direction?: 'asc' | 'desc'): FetchXmlInitial<TProps>
    toXml(): string
    toAst(): FetchXmlSelectAst
    toString(): string
    execute(options?: ExecuteOptions): Promise<Infer<TProps>[]>
    iterate(options?: ExecuteOptions & { pageSize?: number }): AsyncGenerator<Infer<TProps>>
    iteratePages(options?: ExecuteOptions & { pageSize?: number }): AsyncGenerator<Infer<TProps>[]>
}

export class FilterCollector<TProps extends GenericProperties = any> {
    protected _filters: string[] = []
    private _proxy: FieldProxy<TProps>

    constructor(table: DataverseTable<TProps>) {
        this._proxy = this._buildProxy(table)
    }

    private _buildProxy(table: DataverseTable<TProps>): FieldProxy<TProps> {
        return buildFlatFieldProxy(table) as FieldProxy<TProps>;
    }

    filter(filter: string | FilterExpr | ((f: FieldProxy<TProps>) => string | FilterExpr)): this {
        this._filters.push(renderFilterInput(filter, this._proxy, "fetchXml"));
        return this;
    }
}

export class FetchXmlAggregateQuery<
    TProps extends GenericProperties,
    TResult extends Record<string, any> = {},
> {
    private _linkAlias: { value: number };
    private _table: DataverseTable<TProps>;
    private _attributes: AttrDef[] = [];
    private _links: Array<{
        name: string;
        alias: string;
        from: string;
        to: string;
        linkType: FetchLinkType;
        builder: EntityQueryBuilder<any, any> | FilterCollector<any>;
        intersect?: boolean;
    }> = [];
    protected _filters: string[] = [];
    private _aliasProxy: Record<string, string> = {};
    private _proxy: FieldProxy<TProps>;
    private _top?: number;
    private _useRawOrderBy: boolean = false;
    private _lateMaterialize: boolean = false;
    private _aggregateLimit?: number;
    private _orders: OrderDef[] = [];
    private _datasource?: string;
    private _options?: string;

    constructor(table: DataverseTable<TProps>, initialAttributes?: AttrDef[], _linkAlias?: { value: number }, initialFilters?: string[]) {
        this._table = table;
        this._linkAlias = _linkAlias ?? { value: 0 };
        this._proxy = this._buildProxy();
        if (initialAttributes) this._attributes = initialAttributes;
        if (initialFilters) this._filters = [...initialFilters];
        for (const attr of (initialAttributes ?? [])) {
            this._aliasProxy[attr.alias] = attr.alias;
        }
    }

    private _buildProxy(): FieldProxy<TProps> {
        return buildFlatFieldProxy(this._table) as FieldProxy<TProps>;
    }

    private _getEffectiveAttributes(): AttrDef[] {
        return this._attributes;
    }

    filter(filter: string | FilterExpr | ((f: FieldProxy<TProps>) => string | FilterExpr)): this {
        this._filters.push(renderFilterInput(filter, this._proxy, "fetchXml"));
        return this;
    }

    public join<
        TDataverseTable extends DataverseTable<any>,
        TFrom extends keyof TDataverseTable["fields"],
        TTo extends keyof TProps,
        TJoinResult extends Record<string, any>,
    >(
        linkType: FetchLinkType,
        table: TDataverseTable,
        from: TFrom,
        to: TTo,
        subquery: (q: SubAggregateJoinBuilder<TDataverseTable["fields"], {}>) => SubAggregateJoinBuilder<TDataverseTable["fields"], TJoinResult>,
        intersect?: boolean,
    ): FetchXmlAggregateQuery<TProps, NoOverlap<TResult, TJoinResult>>
    public join<T2 extends GenericProperties, TJoinResult extends Record<string, any>>(
        linkType: FetchLinkType,
        intersectTable: DataverseIntersectTable<TProps, T2>,
        subquery: (q: SubAggregateJoinBuilder<T2, {}>) => SubAggregateJoinBuilder<T2, TJoinResult>,
    ): FetchXmlAggregateQuery<TProps, NoOverlap<TResult, TJoinResult>>
    public join<T2 extends GenericProperties, TJoinResult extends Record<string, any>>(
        linkType: FetchLinkType,
        intersectTable: DataverseIntersectTable<T2, TProps>,
        subquery: (q: SubAggregateJoinBuilder<T2, {}>) => SubAggregateJoinBuilder<T2, TJoinResult>,
    ): FetchXmlAggregateQuery<TProps, NoOverlap<TResult, TJoinResult>>
    public join(
        linkType: FetchLinkType,
        tableOrIntersect: DataverseTable<any> | DataverseIntersectTable<any, any>,
        fromOrSubquery: string | ((q: any) => any),
        to?: string,
        subquery?: (q: any) => any,
        intersect?: boolean,
    ): any {
        if (tableOrIntersect instanceof DataverseIntersectTable) {
            const intersectTable = tableOrIntersect as DataverseIntersectTable<any, any>;
            const subqueryFn = fromOrSubquery as (q: any) => any;
            let targetTable: DataverseTable<any>;

            if (intersectTable.table1 === this._table) {
                targetTable = intersectTable.table2;
            } else if (intersectTable.table2 === this._table) {
                targetTable = intersectTable.table1;
            } else {
                throw new Error(
                    `Table "${this._table.entitySetName}" is not related to intersect table "${intersectTable.name}"`,
                );
            }

            const targetBuilder = new EntityQueryBuilder(targetTable, this._linkAlias);
            subqueryFn(targetBuilder as unknown as SubAggregateJoinBuilder<any>);

            const pkName = this._table.primaryKey.property.logicalName;
            const targetPkName = targetTable.primaryKey.property.logicalName;

            const stubTable = { name: intersectTable.name, fields: {}, client: this._table.client } as unknown as DataverseTable<any>;
            const intersectBuilder = new EntityQueryBuilder(stubTable, this._linkAlias);
            (intersectBuilder as any)._links.push({
                name: targetTable.logicalName,
                from: targetPkName,
                to: targetPkName,
                alias: `auto_link_${++this._linkAlias.value}`,
                linkType,
                builder: targetBuilder,
            });

            const intersectAlias = `auto_link_${++this._linkAlias.value}`;
            this._links.push({
                name: intersectTable.name,
                from: pkName,
                to: pkName,
                alias: intersectAlias,
                linkType,
                builder: intersectBuilder,
                intersect: true,
            });

            return this;
        }

        const table = tableOrIntersect as DataverseTable<any>;
        const from = fromOrSubquery as string;
        const nested = new EntityQueryBuilder(table, this._linkAlias);
        subquery!(nested as unknown as SubAggregateJoinBuilder<any>);

        const fromFieldName = table.fields[from].logicalName;
        const toFieldName = this._table.fields[to!].logicalName;
        const autoAlias = `auto_link_${++this._linkAlias.value}`;
        const isIntersect = intersect ?? ((table as any).intersect === true);

        this._links.push({
            name: table.logicalName,
            from: fromFieldName,
            to: toFieldName,
            alias: autoAlias,
            linkType: linkType,
            builder: nested,
            intersect: isIntersect,
        });

        return this;
    }

    public top(n: number): this {
        this._top = n;
        return this;
    }

    public orderby(
        fieldSelector: (f: ApplyAliasProxy<TResult>) => string | FieldRef<any>,
        direction?: 'asc' | 'desc'
    ): this;
    public orderby(entityname: string, attribute: string, direction?: 'asc' | 'desc'): this;
    public orderby(...args: any[]): this {
        if (typeof args[0] === 'function') {
            const result = args[0](this._aliasProxy as any);
            const name = typeof result === "string" ? result : result.toString();
            const dir = (args[1] as 'asc' | 'desc' | undefined) ?? 'asc';
            this._orders.push({ attribute: name, descending: dir === 'desc' });
        } else {
            const entityname = args[0] as string;
            const attribute = args[1] as string;
            const direction = args[2] as 'asc' | 'desc' | undefined;
            this._orders.push({ attribute, entityname, descending: direction === 'desc' });
        }
        return this;
    }

    toAst(): FetchXmlAggregateAst {
        return {
            kind: "xml-aggregate",
            entity: this._table.logicalName,
            version: "1.0",
            mapping: "logical",
            attributes: this._attributes.map(fetchAttributeAst),
            filters: [...this._filters],
            orders: this._orders.map(fetchOrderAst),
            links: this._links.map((link): FetchXmlLinkAst => {
                const child = link.builder instanceof FilterCollector ? undefined : (link.builder as any).toAst();
                return {
                    name: link.name,
                    from: link.from,
                    to: link.to,
                    alias: link.alias,
                    linkType: link.linkType,
                    intersect: link.intersect,
                    attributes: child?.attributes ?? [],
                    filters: link.builder instanceof FilterCollector ? [...(link.builder as any)._filters] : child?.filters ?? [],
                    orders: child?.orders ?? [],
                    links: child?.links ?? [],
                };
            }),
            top: this._top,
            aggregateLimit: this._aggregateLimit,
            datasource: this._datasource,
            options: this._options,
            lateMaterialize: this._lateMaterialize,
            useRawOrderBy: this._useRawOrderBy,
        };
    }

    toXml(): string {
        const lines: string[] = [];
        const fetchAttrs: string[] = [`version="1.0"`, `mapping="logical"`];

        if (this._top !== undefined) fetchAttrs.push(`top='${this._top}'`);
        fetchAttrs.push(`aggregate="true"`);
        if (this._useRawOrderBy) fetchAttrs.push(`useraworderby="true"`);
        if (this._lateMaterialize) fetchAttrs.push(`latematerialize="true"`);
        if (this._aggregateLimit !== undefined) fetchAttrs.push(`aggregatelimit='${this._aggregateLimit}'`);
        if (this._datasource) fetchAttrs.push(`datasource='${this._datasource}'`);
        if (this._options) fetchAttrs.push(`options='${this._options}'`);

        lines.push(`<fetch ${fetchAttrs.join(" ")}>`);
        lines.push(`  <entity name="${this._table.logicalName}">`);

        for (const attr of this._getEffectiveAttributes()) {
            const attrParts = [`name="${attr.name}"`, `alias="${attr.alias}"`];
            if (attr.aggregate) attrParts.push(`aggregate='${attr.aggregate}'`);
            if (attr.groupby) attrParts.push(`groupby='true'`);
            if (attr.dategrouping) attrParts.push(`dategrouping='${attr.dategrouping}'`);
            if (attr.distinct) attrParts.push(`distinct='true'`);
            if (attr.rowaggregate) attrParts.push(`rowaggregate='${attr.rowaggregate}'`);
            lines.push(`    <attribute ${attrParts.join(" ")} />`);
        }

        for (const order of this._orders) {
            const parts = [];
            if (order.entityname) parts.push(`entityname='${order.entityname}'`);
            parts.push(`attribute='${order.attribute}'`);
            if (order.descending) parts.push(`descending='true'`);
            lines.push(`    <order ${parts.join(" ")} />`);
        }

        if (this._filters.length > 0) {
            lines.push(`    <filter type="and">`);
            for (const c of this._filters) {
                lines.push(`      ${c}`);
            }
            lines.push(`    </filter>`);
        }

        for (const link of this._links) {
            lines.push(...this._renderLinkEntity(link, "    "));
        }

        lines.push(`  </entity>`);
        lines.push(`</fetch>`);
        return lines.join("\n");
    }

    toString(): string {
        return `fetchXml=${encodeURIComponent(this.toXml())}`;
    }

    protected _applyExecuteOptions(options?: ExecuteOptions): void {
        if (options?.datasource) this._datasource = options.datasource;
        if (options?.lateMaterialize) this._lateMaterialize = true;
        if (options?.aggregateLimit !== undefined) this._aggregateLimit = options.aggregateLimit;
        if (options?.useRawOrderBy) this._useRawOrderBy = true;
        if (options?.options) this._options = options.options;
    }

    private _transformRow(v: any): TResult {
        const aliasInfo = this._buildAliasInfo();
        if (aliasInfo.size > 0) {
            const result: Record<string | symbol, any> = {};
            const recordId = v[this._table.primaryKey.property.fromDataverseName] ?? v[this._table.primaryKey.property.logicalName] ?? "";
            const ctx = { table: this._table, client: this._table.client, recordId };
            for (const [alias, info] of aliasInfo) {
                if (info.name in v) {
                    result[alias] = info.field ? info.field.transformFromDataverse(v[info.name], ctx) : v[info.name];
                } else {
                    result[alias] = info.getDefault();
                }
            }
            result[Etag] = v["@odata.etag"];
            return result as TResult;
        }
        return this._table.transformValueFromDataverse(v) as TResult;
    }

    public async execute(options?: ExecuteOptions): Promise<TResult[]> {
        this._applyExecuteOptions(options);
        const results: TResult[] = [];
        for await (const page of this.iteratePages(options)) {
            results.push(...page);
        }
        return results;
    }

    public async *iterate(options?: ExecuteOptions & { pageSize?: number }): AsyncGenerator<TResult> {
        this._applyExecuteOptions(options);
        for await (const page of this.iteratePages(options)) {
            yield* page;
        }
    }

    public async *iteratePages(options?: ExecuteOptions & { pageSize?: number }): AsyncGenerator<TResult[]> {
        this._applyExecuteOptions(options);
        for await (const page of this._table.client.iteratePages(
            this._table.entitySetName,
            { ...options, query: this.toString() },
        )) {
            yield page.map((v: any) => this._transformRow(v));
        }
    }

    private _buildAliasInfo(): Map<string, AliasInfo> {
        const map = new Map<string, AliasInfo>();
        this._collectAliases(this, map);
        return map;
    }

    private _collectAliases(
        builder: FetchXmlAggregateQuery<any, any>,
        map: Map<string, AliasInfo>,
    ): void {
        for (const attr of builder._getEffectiveAttributes()) {
            const fields = builder._table.fields as Record<string, any>;
            const entry = Object.entries(fields).find(
                ([_, f]) => (f.fromDataverseName ?? f.logicalName) === attr.name,
            );
            if (entry) {
                const fieldDef = entry[1];
                const dataverseName = fieldDef.fromDataverseName ?? fieldDef.logicalName;
                map.set(attr.alias, {
                    field: FieldRef.fromPath(fieldDef, dataverseName),
                    getDefault: () => fieldDef.getDefault?.(),
                    name: dataverseName,
                });
            } else {
                map.set(attr.alias, {
                    field: undefined,
                    getDefault: () => undefined,
                    name: attr.name,
                });
            }
        }
        for (const link of builder._links) {
            if (!(link.builder instanceof FilterCollector)) {
                if (!EntityQueryBuilder._isFilterOnlyLinkType(link.linkType)) {
                    const eb = link.builder as EntityQueryBuilder<any, any>;
                    this._collectAliasesFromBuilder(eb, map);
                }
            }
        }
    }

    private static _isFilterOnlyLinkType(linkType: FetchLinkType): boolean {
        return linkType === "any" || linkType === "not any" || linkType === "all" || linkType === "not all" || linkType === "exists" || linkType === "in";
    }

    private _renderLinkEntity(
        link: {
            name: string;
            alias: string;
            from: string;
            to: string;
            linkType: FetchLinkType;
            builder: EntityQueryBuilder<any, any> | FilterCollector<any>;
            intersect?: boolean;
        },
        indent: string,
    ): string[] {
        const lines: string[] = [];
        const linkAttrs: string[] = [
            `name="${link.name}"`,
            `from="${link.from}"`,
            `to="${link.to}"`,
            `alias="${link.alias}"`,
            `link-type="${link.linkType}"`,
        ];
        if (link.intersect) linkAttrs.push(`intersect="true"`);

        lines.push(`${indent}<link-entity ${linkAttrs.join(" ")}>`);

        const childIndent = `${indent}  `;
        const filterOnly = link.builder instanceof FilterCollector || EntityQueryBuilder._isFilterOnlyLinkType(link.linkType);

        const builderFilters: string[] = (link.builder as any)._filters ?? [];
        if (builderFilters.length > 0) {
            lines.push(`${childIndent}<filter type="and">`);
            for (const c of builderFilters) {
                lines.push(`${childIndent}  ${c}`);
            }
            lines.push(`${childIndent}</filter>`);
        }

        if (!filterOnly) {
            const eb = link.builder as EntityQueryBuilder<any, any>;
            for (const nestedAttr of (eb as any)._getEffectiveAttributes()) {
                const attrParts = [`name="${nestedAttr.name}"`, `alias="${nestedAttr.alias}"`];
                if (nestedAttr.aggregate) attrParts.push(`aggregate='${nestedAttr.aggregate}'`);
                if (nestedAttr.groupby) attrParts.push(`groupby='true'`);
                if (nestedAttr.dategrouping) attrParts.push(`dategrouping='${nestedAttr.dategrouping}'`);
                if (nestedAttr.distinct) attrParts.push(`distinct='true'`);
                if (nestedAttr.rowaggregate) attrParts.push(`rowaggregate='${nestedAttr.rowaggregate}'`);
                lines.push(`${childIndent}<attribute ${attrParts.join(" ")} />`);
            }

            for (const order of (eb as any)._orders) {
                const parts = [`attribute='${order.attribute}'`];
                if (order.descending) parts.push(`descending='true'`);
                lines.push(`${childIndent}<order ${parts.join(" ")} />`);
            }
        }

        if (!(link.builder instanceof FilterCollector)) {
            const eb = link.builder as EntityQueryBuilder<any, any>;
            for (const nestedLink of (eb as any)._links) {
                lines.push(...this._renderLinkEntity(nestedLink, childIndent));
            }
        }

        lines.push(`${indent}</link-entity>`);
        return lines;
    }

    private _collectAliasesFromBuilder(
        builder: EntityQueryBuilder<any, any>,
        map: Map<string, AliasInfo>,
    ): void {
        for (const attr of (builder as any)._getEffectiveAttributes()) {
            const fields = (builder as any)._table.fields as Record<string, any>;
            const entry = Object.entries(fields).find(
                ([_, f]) => (f.fromDataverseName ?? f.logicalName) === attr.name,
            );
            if (entry) {
                const fieldDef = entry[1];
                const dataverseName = fieldDef.fromDataverseName ?? fieldDef.logicalName;
                map.set(attr.alias, {
                    field: FieldRef.fromPath(fieldDef, dataverseName),
                    getDefault: () => fieldDef.getDefault?.(),
                    name: dataverseName,
                });
            } else {
                map.set(attr.alias, {
                    field: undefined,
                    getDefault: () => undefined,
                    name: attr.name,
                });
            }
        }
        for (const link of (builder as any)._links) {
            if (!EntityQueryBuilder._isFilterOnlyLinkType(link.linkType)) {
                this._collectAliasesFromBuilder(link.builder as EntityQueryBuilder<any, any>, map);
            }
        }
    }
}

export class EntityQueryBuilder<
    TProps extends GenericProperties,
    TResult extends Record<string, any> = {},
> {
    protected _linkAlias: { value: number };
    private _table: DataverseTable<TProps>;
    private _attributes: AttrDef[] = [];
    protected _links: Array<{
        name: string;
        alias: string;
        from: string;
        to: string;
        linkType: FetchLinkType;
        builder: EntityQueryBuilder<any, any> | FilterCollector<any>;
        intersect?: boolean;
    }> = [];
    protected _orders: OrderDef[] = [];
    protected _filters: string[] = [];
    private _isDistinct: boolean = false;
    private _proxy: FieldProxy<TProps>;
    private _top?: number;
    private _isAggregate: boolean = false;
    private _useRawOrderBy: boolean = false;
    private _lateMaterialize: boolean = false;
    private _aggregateLimit?: number;
    private _datasource?: string;
    private _options?: string;

    constructor(table: DataverseTable<TProps>, _linkAlias?: { value: number }) {
        this._table = table;
        this._linkAlias = _linkAlias ?? { value: 0 };
        this._proxy = this._buildProxy();
    }

    private _getEffectiveAttributes(): AttrDef[] {
        if (this._attributes.length > 0) return this._attributes;
        const attrs: AttrDef[] = [];
        for (const [key, prop] of Object.entries(this._table.fields)) {
            const p = prop as any;
            if (p.kind === "value" || p.type === "lookupId" || p.type === "file") {
                attrs.push({ name: p.logicalName, alias: key });
            }
        }
        return attrs;
    }

    private _buildProxy(): FieldProxy<TProps> {
        return buildFlatFieldProxy(this._table) as FieldProxy<TProps>;
    }

    public select<R extends Record<string, keyof TProps>>(
        selector: (fields: FieldSelector<TProps>) => R,
    ): EntityQueryBuilder<TProps, { [K in keyof R]: Infer<TProps[R[K]]> }> {
        if (this._isAggregate) throw new Error("select() is not supported after apply()")
        const fieldsMock = {} as FieldSelector<TProps>;
        for (const key of Object.keys(this._table.fields)) {
            (fieldsMock as any)[key] = key;
        }
        const selectedMap = selector(fieldsMock);
        for (const [alias, propKey] of Object.entries(selectedMap)) {
            const fieldDef = this._table.fields[propKey as keyof TProps];
            this._attributes.push({ name: fieldDef.logicalName, alias });
        }
        return this as any;
    }

    public apply<R extends Record<string, GroupByExpr<any> | Aggregation<any>>>(
        expr: (f: FieldProxy<TProps>) => R,
    ): FetchXmlAggregateQuery<TProps, ApplyResultType<R>> {
        const result = expr(this._proxy as any);
        const initialAttributes: AttrDef[] = [];

        for (const [alias, value] of Object.entries(result)) {
            if (value instanceof GroupByExpr) {
                initialAttributes.push({ name: value.field, alias, groupby: true });
            } else if (value instanceof Aggregation) {
                const fieldName = value.field ? value.field.toString() : this._table.primaryKey.property.logicalName;
                initialAttributes.push({ name: fieldName, alias, aggregate: value.operation });
            }
        }

        this._attributes = initialAttributes;

        return this as any;
    }

    _toAggregateQuery(): FetchXmlAggregateQuery<TProps, any> {
        const q = new FetchXmlAggregateQuery<TProps, any>(
            this._table,
            this._attributes,
            this._linkAlias,
            [...this._filters],
        );
        if (this._datasource) q["_datasource"] = this._datasource;
        if (this._options) q["_options"] = this._options;
        return q;
    }

    public filter(
        filter: string | FilterExpr | ((f: FieldProxy<TProps>) => string | FilterExpr),
    ): this {
        this._filters.push(renderFilterInput(filter, this._proxy, "fetchXml"));
        return this;
    }

    public join<TDataverseTable extends DataverseTable<any>, TFrom extends keyof TDataverseTable["fields"], TTo extends keyof TProps>(
        linkType: FilterOnlyLinkType,
        table: TDataverseTable,
        from: TFrom,
        to: TTo,
        subquery: (q: FilterCollector<TDataverseTable["fields"]>) => void,
        intersect?: boolean,
    ): EntityQueryBuilder<TProps, TResult>
    public join<TDataverseTable extends DataverseTable<any>, TFrom extends keyof TDataverseTable["fields"], TTo extends keyof TProps, TJoinResult extends Record<string, any>>(
        linkType: NormalLinkType,
        table: TDataverseTable,
        from: TFrom,
        to: TTo,
        subquery: (q: SubJoinBuilder<TDataverseTable["fields"], {}>) => SubJoinBuilder<TDataverseTable["fields"], TJoinResult>,
        intersect?: boolean,
    ): EntityQueryBuilder<TProps, NoOverlap<TResult, TJoinResult>>
    public join<T2 extends GenericProperties>(
        linkType: FilterOnlyLinkType,
        intersectTable: DataverseIntersectTable<TProps, T2>,
        subquery: (q: FilterCollector<T2>) => void,
    ): EntityQueryBuilder<TProps, TResult>
    public join<T2 extends GenericProperties, TJoinResult extends Record<string, any>>(
        linkType: NormalLinkType,
        intersectTable: DataverseIntersectTable<TProps, T2>,
        subquery: (q: SubJoinBuilder<T2, {}>) => SubJoinBuilder<T2, TJoinResult>,
    ): EntityQueryBuilder<TProps, NoOverlap<TResult, TJoinResult>>
    public join<T2 extends GenericProperties>(
        linkType: FilterOnlyLinkType,
        intersectTable: DataverseIntersectTable<T2, TProps>,
        subquery: (q: FilterCollector<T2>) => void,
    ): EntityQueryBuilder<TProps, TResult>
    public join<T2 extends GenericProperties, TJoinResult extends Record<string, any>>(
        linkType: NormalLinkType,
        intersectTable: DataverseIntersectTable<T2, TProps>,
        subquery: (q: SubJoinBuilder<T2, {}>) => SubJoinBuilder<T2, TJoinResult>,
    ): EntityQueryBuilder<TProps, NoOverlap<TResult, TJoinResult>>
    public join(
        linkType: FetchLinkType,
        tableOrIntersect: DataverseTable<any> | DataverseIntersectTable<any, any>,
        fromOrSubquery: string | ((q: any) => any),
        to?: string,
        subquery?: (q: any) => any,
        intersect?: boolean,
    ): any {
        if (tableOrIntersect instanceof DataverseIntersectTable) {
            const intersectTable = tableOrIntersect as DataverseIntersectTable<any, any>;
            const subqueryFn = fromOrSubquery as (q: any) => any;
            let targetTable: DataverseTable<any>;

            if (intersectTable.table1 === this._table) {
                targetTable = intersectTable.table2;
            } else if (intersectTable.table2 === this._table) {
                targetTable = intersectTable.table1;
            } else {
                throw new Error(
                    `Table "${this._table.entitySetName}" is not related to intersect table "${intersectTable.name}"`,
                );
            }

            const targetBuilder = new EntityQueryBuilder(targetTable, this._linkAlias);
            subqueryFn(targetBuilder as unknown as SubJoinBuilder<any, {}>);

            const pkName = this._table.primaryKey.property.logicalName;
            const targetPkName = targetTable.primaryKey.property.logicalName;

            const stubTable = { name: intersectTable.name, fields: {}, client: this._table.client } as unknown as DataverseTable<any>;
            const intersectBuilder = new EntityQueryBuilder(stubTable, this._linkAlias);
            (intersectBuilder as any)._links.push({
                name: targetTable.logicalName,
                from: targetPkName,
                to: targetPkName,
                alias: `auto_link_${++this._linkAlias.value}`,
                linkType,
                builder: targetBuilder,
            });

            this._links.push({
                name: intersectTable.name,
                from: pkName,
                to: pkName,
                alias: `auto_link_${++this._linkAlias.value}`,
                linkType,
                builder: intersectBuilder,
                intersect: true,
            });

            return this as any;
        }

        const table = tableOrIntersect as DataverseTable<any>;
        const from = fromOrSubquery as string;
        const isFilterOnly = EntityQueryBuilder._isFilterOnlyLinkType(linkType as FetchLinkType)
        if (isFilterOnly) {
            const collector = new FilterCollector(table)
            subquery!(collector)
            const fromFieldName = table.fields[from].logicalName;
            const toFieldName = this._table.fields[to!].logicalName;
            this._links.push({
                name: table.logicalName,
                from: fromFieldName,
                to: toFieldName,
                alias: `auto_link_${++this._linkAlias.value}`,
                linkType,
                builder: collector,
                intersect: intersect ?? ((table as any).intersect === true),
            });
        } else {
            const nestedBuilder = new EntityQueryBuilder(table, this._linkAlias)
            subquery!(nestedBuilder)
            const fromFieldName = table.fields[from].logicalName;
            const toFieldName = this._table.fields[to!].logicalName;
            this._links.push({
                name: table.logicalName,
                from: fromFieldName,
                to: toFieldName,
                alias: `auto_link_${++this._linkAlias.value}`,
                linkType,
                builder: nestedBuilder,
                intersect: intersect ?? ((table as any).intersect === true),
            });
        }
        return this;
    }

    public distinct(): this {
        this._isDistinct = true;
        return this;
    }

    public top(n: number): this {
        this._top = n;
        return this;
    }

    public orderby(
        fieldSelector: (f: FieldProxy<TProps>) => string | FieldRef<any>,
        direction?: 'asc' | 'desc'
    ): this;
    public orderby(entityname: string, attribute: string, direction?: 'asc' | 'desc'): this;
    public orderby(...args: any[]): this {
        if (typeof args[0] === 'function') {
            const result = args[0](this._proxy);
            const name = typeof result === "string" ? result : result.toString();
            const dir = (args[1] as 'asc' | 'desc' | undefined) ?? 'asc';
            this._orders.push({ attribute: name, descending: dir === 'desc' });
        } else {
            const entityname = args[0] as string;
            const attribute = args[1] as string;
            const direction = args[2] as 'asc' | 'desc' | undefined;
            this._orders.push({ attribute, entityname, descending: direction === 'desc' });
        }
        return this;
    }

    toAst(): FetchXmlSelectAst {
        return {
            kind: "xml-select",
            entity: this._table.logicalName,
            version: "1.0",
            mapping: "logical",
            attributes: this._getEffectiveAttributes().map(fetchAttributeAst),
            filters: [...this._filters],
            orders: this._orders.map(fetchOrderAst),
            links: this._links.map((link): FetchXmlLinkAst => {
                const child = link.builder instanceof FilterCollector ? undefined : (link.builder as any).toAst();
                return {
                    name: link.name,
                    from: link.from,
                    to: link.to,
                    alias: link.alias,
                    linkType: link.linkType,
                    intersect: link.intersect,
                    attributes: child?.attributes ?? [],
                    filters: link.builder instanceof FilterCollector ? [...(link.builder as any)._filters] : child?.filters ?? [],
                    orders: child?.orders ?? [],
                    links: child?.links ?? [],
                };
            }),
            distinct: this._isDistinct,
            top: this._top,
            aggregateLimit: this._aggregateLimit,
            datasource: this._datasource,
            options: this._options,
            lateMaterialize: this._lateMaterialize,
            useRawOrderBy: this._useRawOrderBy,
        };
    }

    toXml(): string {
        const lines: string[] = [];
        const fetchAttrs: string[] = [`version="1.0"`, `mapping="logical"`];

        if (this._top !== undefined) fetchAttrs.push(`top='${this._top}'`);
        if (this._isDistinct) fetchAttrs.push(`distinct="true"`);
        if (this._isAggregate) fetchAttrs.push(`aggregate="true"`);
        if (this._useRawOrderBy) fetchAttrs.push(`useraworderby="true"`);
        if (this._lateMaterialize) fetchAttrs.push(`latematerialize="true"`);
        if (this._aggregateLimit !== undefined) fetchAttrs.push(`aggregatelimit='${this._aggregateLimit}'`);
        if (this._datasource) fetchAttrs.push(`datasource='${this._datasource}'`);
        if (this._options) fetchAttrs.push(`options='${this._options}'`);

        lines.push(`<fetch ${fetchAttrs.join(" ")}>`);
        lines.push(`  <entity name="${this._table.logicalName}">`);

        for (const attr of this._getEffectiveAttributes()) {
            const attrParts = [`name="${attr.name}"`, `alias="${attr.alias}"`];
            if (attr.aggregate) attrParts.push(`aggregate='${attr.aggregate}'`);
            if (attr.groupby) attrParts.push(`groupby='true'`);
            if (attr.dategrouping) attrParts.push(`dategrouping='${attr.dategrouping}'`);
            if (attr.distinct) attrParts.push(`distinct='true'`);
            if (attr.rowaggregate) attrParts.push(`rowaggregate='${attr.rowaggregate}'`);
            lines.push(`    <attribute ${attrParts.join(" ")} />`);
        }

        for (const order of this._orders) {
            const parts = [];
            if (order.entityname) parts.push(`entityname='${order.entityname}'`);
            parts.push(`attribute='${order.attribute}'`);
            if (order.descending) parts.push(`descending='true'`);
            lines.push(`    <order ${parts.join(" ")} />`);
        }

        if (this._filters.length > 0) {
            lines.push(`    <filter type="and">`);
            for (const c of this._filters) {
                lines.push(`      ${c}`);
            }
            lines.push(`    </filter>`);
        }

        for (const link of this._links) {
            lines.push(...this._renderLinkEntity(link, "    "));
        }

        lines.push(`  </entity>`);
        lines.push(`</fetch>`);
        return lines.join("\n");
    }

    static _isFilterOnlyLinkType(linkType: FetchLinkType): boolean {
        return linkType === "any" || linkType === "not any" || linkType === "all" || linkType === "not all" || linkType === "exists" || linkType === "in";
    }

    private _renderLinkEntity(
        link: {
            name: string;
            alias: string;
            from: string;
            to: string;
            linkType: FetchLinkType;
            builder: EntityQueryBuilder<any, any> | FilterCollector<any>;
            intersect?: boolean;
        },
        indent: string,
    ): string[] {
        const lines: string[] = [];
        const linkAttrs: string[] = [
            `name="${link.name}"`,
            `from="${link.from}"`,
            `to="${link.to}"`,
            `alias="${link.alias}"`,
            `link-type="${link.linkType}"`,
        ];
        if (link.intersect) linkAttrs.push(`intersect="true"`);

        lines.push(`${indent}<link-entity ${linkAttrs.join(" ")}>`);

        const childIndent = `${indent}  `;
        const filterOnly = link.builder instanceof FilterCollector || EntityQueryBuilder._isFilterOnlyLinkType(link.linkType);

        const builderFilters: string[] = (link.builder as any)._filters ?? [];
        if (builderFilters.length > 0) {
            lines.push(`${childIndent}<filter type="and">`);
            for (const c of builderFilters) {
                lines.push(`${childIndent}  ${c}`);
            }
            lines.push(`${childIndent}</filter>`);
        }

        if (!filterOnly) {
            const eb = link.builder as EntityQueryBuilder<any, any>;
            for (const nestedAttr of eb._getEffectiveAttributes()) {
                const attrParts = [`name="${nestedAttr.name}"`, `alias="${nestedAttr.alias}"`];
                if (nestedAttr.aggregate) attrParts.push(`aggregate='${nestedAttr.aggregate}'`);
                if (nestedAttr.groupby) attrParts.push(`groupby='true'`);
                if (nestedAttr.dategrouping) attrParts.push(`dategrouping='${nestedAttr.dategrouping}'`);
                if (nestedAttr.distinct) attrParts.push(`distinct='true'`);
                if (nestedAttr.rowaggregate) attrParts.push(`rowaggregate='${nestedAttr.rowaggregate}'`);
                lines.push(`${childIndent}<attribute ${attrParts.join(" ")} />`);
            }

            const ebOrders: OrderDef[] = (eb as any)._orders ?? [];
            for (const order of ebOrders) {
                const parts = [`attribute='${order.attribute}'`];
                if (order.descending) parts.push(`descending='true'`);
                lines.push(`${childIndent}<order ${parts.join(" ")} />`);
            }
        }

        if (!(link.builder instanceof FilterCollector)) {
            const eb = link.builder as EntityQueryBuilder<any, any>;
            const ebLinks: any[] = (eb as any)._links ?? [];
            for (const nestedLink of ebLinks) {
                lines.push(...this._renderLinkEntity(nestedLink, childIndent));
            }
        }

        lines.push(`${indent}</link-entity>`);
        return lines;
    }

    toString(): string {
        return `fetchXml=${encodeURIComponent(this.toXml())}`;
    }

    protected _applyExecuteOptions(options?: ExecuteOptions): void {
        if (options?.datasource) this._datasource = options.datasource;
        if (options?.lateMaterialize) this._lateMaterialize = true;
        if (options?.aggregateLimit !== undefined) this._aggregateLimit = options.aggregateLimit;
        if (options?.useRawOrderBy) this._useRawOrderBy = true;
        if (options?.options) this._options = options.options;
    }

    private _transformRow(v: any): TResult {
        const aliasInfo = this._buildAliasInfo();
        if (aliasInfo.size > 0) {
            const result: Record<string | symbol, any> = {};
            const recordId = v[this._table.primaryKey.property.fromDataverseName] ?? v[this._table.primaryKey.property.logicalName] ?? "";
            const ctx = { table: this._table, client: this._table.client, recordId };
            for (const [alias, info] of aliasInfo) {
                if (info.name in v) {
                    result[alias] = info.field ? info.field.transformFromDataverse(v[info.name], ctx) : v[info.name];
                } else {
                    result[alias] = info.getDefault();
                }
            }
            result[Etag] = v["@odata.etag"];
            return result as TResult;
        }
        return this._table.transformValueFromDataverse(v) as TResult;
    }

    public async execute(options?: ExecuteOptions): Promise<TResult[]> {
        this._applyExecuteOptions(options);
        const results: TResult[] = [];
        for await (const page of this.iteratePages(options)) {
            results.push(...page);
        }
        return results;
    }

    public async *iterate(options?: ExecuteOptions & { pageSize?: number }): AsyncGenerator<TResult> {
        this._applyExecuteOptions(options);
        for await (const page of this.iteratePages(options)) {
            yield* page;
        }
    }

    public async *iteratePages(options?: ExecuteOptions & { pageSize?: number }): AsyncGenerator<TResult[]> {
        this._applyExecuteOptions(options);
        for await (const page of this._table.client.iteratePages(
            this._table.entitySetName,
            { ...options, query: this.toString() },
        )) {
            yield page.map((v: any) => this._transformRow(v));
        }
    }

    private _buildAliasInfo(): Map<string, AliasInfo> {
        const map = new Map<string, AliasInfo>();
        this._collectAliases(this, map);
        return map;
    }

    private _collectAliases(
        builder: EntityQueryBuilder<any, any>,
        map: Map<string, AliasInfo>,
    ): void {
        for (const attr of builder._getEffectiveAttributes()) {
            const fields = builder._table.fields as Record<string, any>;
            const entry = Object.entries(fields).find(
                ([_, f]) => (f.fromDataverseName ?? f.logicalName) === attr.name,
            );
            if (entry) {
                const fieldDef = entry[1];
                const dataverseName = fieldDef.fromDataverseName ?? fieldDef.logicalName;
                map.set(attr.alias, {
                    field: FieldRef.fromPath(fieldDef, dataverseName),
                    getDefault: () => fieldDef.getDefault?.(),
                    name: dataverseName,
                });
            } else {
                map.set(attr.alias, {
                    field: undefined,
                    getDefault: () => undefined,
                    name: attr.name,
                });
            }
        }
        for (const link of builder._links) {
            if (!EntityQueryBuilder._isFilterOnlyLinkType(link.linkType)) {
                this._collectAliases(link.builder as EntityQueryBuilder<any, any>, map);
            }
        }
    }
}

export function fetchXml<TProps extends GenericProperties>(table: DataverseTable<TProps>): FetchXmlInitial<TProps> {
    return new FetchXmlInitialImpl(table);
}

// --- Initial query implementation ---

class FetchXmlInitialImpl<TProps extends GenericProperties> implements FetchXmlInitial<TProps> {
    #builder: EntityQueryBuilder<TProps, Infer<TProps>>

    constructor(table: DataverseTable<TProps>) {
        this.#builder = new EntityQueryBuilder(table)
    }

    select(): FetchXmlSelectQuery<TProps, TProps>
    select<R extends Record<string, keyof TProps>>(selector: (fields: FieldSelector<TProps>) => R): FetchXmlSelectQuery<TProps, { [K in keyof R]: Infer<TProps[R[K]]> }>
    select(selector?: any): any {
        if (selector) {
            return this.#builder.select(selector)
        }
        return this.#builder.select((f) => {
            const result = {} as Record<string, any>
            for (const key of Object.keys(f)) {
                result[key] = key
            }
            return result
        })
    }

    apply<R extends Record<string, GroupByExpr<any> | Aggregation<any>>>(
        expr: (f: FieldProxy<TProps>) => R,
    ): FetchXmlAggregateQuery<TProps, ApplyResultType<R>> {
        this.#builder.apply(expr)
        return this.#builder._toAggregateQuery()
    }

    filter(filter: string | FilterExpr | ((f: FieldProxy<TProps>) => string | FilterExpr)): FetchXmlInitial<TProps> {
        this.#builder.filter(filter)
        return this
    }

    join(...args: any[]): FetchXmlInitial<TProps> {
        ;(this.#builder as any).join(...args)
        return this
    }

    distinct(): FetchXmlInitial<TProps> {
        this.#builder.distinct()
        return this
    }

    top(n: number): FetchXmlInitial<TProps> {
        this.#builder.top(n)
        return this
    }

    orderby(...args: any[]): FetchXmlInitial<TProps> {
        ;(this.#builder as any).orderby(...args)
        return this
    }

    toAst(): FetchXmlSelectAst {
        return this.#builder.toAst()
    }

    toXml(): string {
        return this.#builder.toXml()
    }

    toString(): string {
        return this.#builder.toString()
    }

    async execute(options?: ExecuteOptions): Promise<Infer<TProps>[]> {
        return this.#builder.execute(options)
    }

    async *iterate(options?: ExecuteOptions & { pageSize?: number }): AsyncGenerator<Infer<TProps>> {
        yield* this.#builder.iterate(options)
    }

    async *iteratePages(options?: ExecuteOptions & { pageSize?: number }): AsyncGenerator<Infer<TProps>[]> {
        yield* this.#builder.iteratePages(options)
    }
}
