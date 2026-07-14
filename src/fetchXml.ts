import { DataverseTable, DataverseIntersectTable } from "./table";
import { GenericProperties, Infer } from "./types";
import { FilterExpr, FieldRef } from "./filter";
import { Aggregation, GroupByExpr } from "./odata";
import { Etag } from "./util";

type AliasInfo = {
    transform: (val: any) => any;
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
    [K in keyof T]: FieldRef<Infer<T[K]>, K extends string ? K : never>
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
    intersect<T2 extends GenericProperties, TJoinResult extends Record<string, any>>(
        intersectTable: DataverseIntersectTable<TProps, T2>,
        subquery: (q: SubJoinBuilder<T2, {}>) => SubJoinBuilder<T2, TJoinResult>,
    ): SubJoinBuilder<TProps, NoOverlap<TResult, TJoinResult>, TSelected>
    intersect<T1 extends GenericProperties, TJoinResult extends Record<string, any>>(
        intersectTable: DataverseIntersectTable<T1, TProps>,
        subquery: (q: SubJoinBuilder<T1, {}>) => SubJoinBuilder<T1, TJoinResult>,
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
    intersect<T2 extends GenericProperties>(
        intersectTable: DataverseIntersectTable<TProps, T2>,
        subquery: (q: SubAggregateJoinBuilder<T2>) => void,
    ): SubAggregateJoinBuilder<TProps, TResult, TApplied>
    intersect<T1 extends GenericProperties>(
        intersectTable: DataverseIntersectTable<T1, TProps>,
        subquery: (q: SubAggregateJoinBuilder<T1>) => void,
    ): SubAggregateJoinBuilder<TProps, TResult, TApplied>
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
    intersect<T2 extends GenericProperties, TJoinResult extends Record<string, any>>(
        intersectTable: DataverseIntersectTable<TProps, T2>,
        subquery: (q: SubJoinBuilder<T2, {}>) => SubJoinBuilder<T2, TJoinResult>,
    ): FetchXmlSelectQuery<TProps, NoOverlap<TResult, TJoinResult>>
    intersect<T1 extends GenericProperties, TJoinResult extends Record<string, any>>(
        intersectTable: DataverseIntersectTable<T1, TProps>,
        subquery: (q: SubJoinBuilder<T1, {}>) => SubJoinBuilder<T1, TJoinResult>,
    ): FetchXmlSelectQuery<TProps, NoOverlap<TResult, TJoinResult>>
    distinct(): FetchXmlSelectQuery<TProps, TResult>
    top(n: number): FetchXmlSelectQuery<TProps, TResult>
    orderby(fieldSelector: (f: FieldProxy<TProps>) => string | FieldRef<any>, direction?: 'asc' | 'desc'): FetchXmlSelectQuery<TProps, TResult>
    orderby(entityname: string, attribute: string, direction?: 'asc' | 'desc'): FetchXmlSelectQuery<TProps, TResult>
    toXml(): string
    toString(): string
    execute(options?: ExecuteOptions): Promise<TResult[]>
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
    intersect<T2 extends GenericProperties, TJoinResult extends Record<string, any>>(
        intersectTable: DataverseIntersectTable<TProps, T2>,
        subquery: (q: SubJoinBuilder<T2, {}>) => SubJoinBuilder<T2, TJoinResult>,
    ): FetchXmlInitial<TProps>
    intersect<T1 extends GenericProperties, TJoinResult extends Record<string, any>>(
        intersectTable: DataverseIntersectTable<T1, TProps>,
        subquery: (q: SubJoinBuilder<T1, {}>) => SubJoinBuilder<T1, TJoinResult>,
    ): FetchXmlInitial<TProps>
    distinct(): FetchXmlInitial<TProps>
    top(n: number): FetchXmlInitial<TProps>
    orderby(fieldSelector: (f: FieldProxy<TProps>) => string | FieldRef<any>, direction?: 'asc' | 'desc'): FetchXmlInitial<TProps>
    orderby(entityname: string, attribute: string, direction?: 'asc' | 'desc'): FetchXmlInitial<TProps>
    toXml(): string
    toString(): string
    execute(options?: ExecuteOptions): Promise<Infer<TProps>[]>
}

export class FilterCollector<TProps extends GenericProperties = any> {
    protected _filters: string[] = []
    private _proxy: FieldProxy<TProps>

    constructor(table: DataverseTable<TProps>) {
        this._proxy = this._buildProxy(table)
    }

    private _buildProxy(table: DataverseTable<TProps>): FieldProxy<TProps> {
        const proxy = {} as FieldProxy<TProps>;
        for (const [key, prop] of Object.entries(table.fields)) {
            (proxy as any)[key] = new FieldRef(prop.name, prop);
        }
        return proxy;
    }

    filter(filter: string | FilterExpr | ((f: FieldProxy<TProps>) => string | FilterExpr)): this {
        let str: string
        if (filter instanceof FilterExpr) {
            str = filter.toFetchXml()
        } else if (typeof filter === "function") {
            const result = filter(this._proxy)
            str = result instanceof FilterExpr ? result.toFetchXml() : result
        } else {
            str = filter
        }
        this._filters.push(str);
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
        const proxy = {} as FieldProxy<TProps>;
        for (const [key, prop] of Object.entries(this._table.fields)) {
            (proxy as any)[key] = new FieldRef(prop.name, prop);
        }
        return proxy;
    }

    private _getEffectiveAttributes(): AttrDef[] {
        return this._attributes;
    }

    filter(filter: string | FilterExpr | ((f: FieldProxy<TProps>) => string | FilterExpr)): this {
        let str: string
        if (filter instanceof FilterExpr) {
            str = filter.toFetchXml()
        } else if (typeof filter === "function") {
            const result = filter(this._proxy)
            str = result instanceof FilterExpr ? result.toFetchXml() : result
        } else {
            str = filter
        }
        this._filters.push(str);
        return this;
    }

    public join<
        TDataverseTable extends DataverseTable<any>,
        TFrom extends keyof TDataverseTable["fields"],
        TTo extends keyof TProps,
    >(
        linkType: FetchLinkType,
        table: TDataverseTable,
        from: TFrom,
        to: TTo,
        subquery: (q: SubAggregateJoinBuilder<TDataverseTable["fields"]>) => void,
        intersect?: boolean,
    ): this {
        const nested = new EntityQueryBuilder<TDataverseTable["fields"], {}>(table, this._linkAlias);
        subquery(nested as unknown as SubAggregateJoinBuilder<TDataverseTable["fields"]>);

        const fromFieldName = table.fields[from].name;
        const toFieldName = this._table.fields[to].name;
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

    public intersect<T2 extends GenericProperties>(
        intersectTable: DataverseIntersectTable<TProps, T2>,
        subquery: (q: SubAggregateJoinBuilder<T2>) => SubAggregateJoinBuilder<T2>,
    ): this;
    public intersect<T1 extends GenericProperties>(
        intersectTable: DataverseIntersectTable<T1, TProps>,
        subquery: (q: SubAggregateJoinBuilder<T1>) => SubAggregateJoinBuilder<T1>,
    ): this;
    public intersect(
        intersectTable: DataverseIntersectTable<any, any>,
        subquery: (q: SubAggregateJoinBuilder<any>) => void,
    ): this {
        let targetTable: DataverseTable<any>;

        if (intersectTable.table1 === this._table) {
            targetTable = intersectTable.table2;
        } else if (intersectTable.table2 === this._table) {
            targetTable = intersectTable.table1;
        } else {
            throw new Error(
                `Table "${this._table.name}" is not related to intersect table "${intersectTable.name}"`,
            );
        }

        const targetBuilder = new EntityQueryBuilder(targetTable, this._linkAlias);
        subquery(targetBuilder as unknown as SubAggregateJoinBuilder<any>);

        const pkName = this._table.getPrimaryKey().property.name;
        const targetPkName = targetTable.getPrimaryKey().property.name;

        const stubTable = { name: intersectTable.name, fields: {}, client: this._table.client } as unknown as DataverseTable<any>;
        const intersectBuilder = new EntityQueryBuilder(stubTable, this._linkAlias);
        (intersectBuilder as any)._links.push({
            name: targetTable.logicalName,
            from: targetPkName,
            to: targetPkName,
            alias: `auto_link_${++this._linkAlias.value}`,
            linkType: "inner",
            builder: targetBuilder,
        });

        const targetAlias = `auto_link_${++this._linkAlias.value}`;

        const intersectAlias = `auto_link_${++this._linkAlias.value}`;
        this._links.push({
            name: intersectTable.name,
            from: pkName,
            to: pkName,
            alias: intersectAlias,
            linkType: "inner",
            builder: intersectBuilder,
            intersect: true,
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

    public async execute(options?: ExecuteOptions): Promise<TResult[]> {
        if (options?.datasource) this._datasource = options.datasource;
        if (options?.lateMaterialize) this._lateMaterialize = true;
        if (options?.aggregateLimit !== undefined) this._aggregateLimit = options.aggregateLimit;
        if (options?.useRawOrderBy) this._useRawOrderBy = true;
        if (options?.options) this._options = options.options;
        const raw = await this._table.client.getRecords(this._table.entitySetName, this.toString());
        const aliasInfo = this._buildAliasInfo();
        if (aliasInfo.size > 0) {
            return raw.map((v: any) => {
                const result: Record<string | symbol, any> = {};
                for (const [alias, info] of aliasInfo) {
                    if (info.name in v) {
                        result[alias] = info.transform(v[info.name]);
                    } else {
                        result[alias] = info.getDefault();
                    }
                }
                result[Etag] = v["@odata.etag"];
                return result as TResult;
            });
        }
        return raw.map((v: any) => {
            const r = this._table.transformValueFromDataverse(v);
            return r;
        }) as TResult[];
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
            const fields = builder._table.fields as Record<string, { fromDataverseName?: string; name: string; transformValueFromDataverse: (val: any) => any; getDefault?: () => any }>;
            const entry = Object.entries(fields).find(
                ([_, f]) => (f.fromDataverseName ?? f.name) === attr.name,
            );
            if (entry) {
                const fieldDef = entry[1];
                const dataverseName = fieldDef.fromDataverseName ?? fieldDef.name;
                map.set(attr.alias, {
                    transform: (val: any) => fieldDef.transformValueFromDataverse(val),
                    getDefault: () => fieldDef.getDefault?.(),
                    name: dataverseName,
                });
            } else {
                map.set(attr.alias, {
                    transform: (val: any) => val,
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
            const fields = (builder as any)._table.fields as Record<string, { fromDataverseName?: string; name: string; transformValueFromDataverse: (val: any) => any; getDefault?: () => any }>;
            const entry = Object.entries(fields).find(
                ([_, f]) => (f.fromDataverseName ?? f.name) === attr.name,
            );
            if (entry) {
                const fieldDef = entry[1];
                const dataverseName = fieldDef.fromDataverseName ?? fieldDef.name;
                map.set(attr.alias, {
                    transform: (val: any) => fieldDef.transformValueFromDataverse(val),
                    getDefault: () => fieldDef.getDefault?.(),
                    name: dataverseName,
                });
            } else {
                map.set(attr.alias, {
                    transform: (val: any) => val,
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
                attrs.push({ name: p.name, alias: key });
            }
        }
        return attrs;
    }

    private _buildProxy(): FieldProxy<TProps> {
        const proxy = {} as FieldProxy<TProps>;
        for (const [key, prop] of Object.entries(this._table.fields)) {
            (proxy as any)[key] = new FieldRef(prop.name, prop);
        }
        return proxy;
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
            this._attributes.push({ name: fieldDef.name, alias });
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
                const fieldName = value.field ? value.field.toString() : this._table.getPrimaryKey().property.name;
                initialAttributes.push({ name: fieldName, alias, aggregate: value.operation });
            }
        }

        const aggregateQuery = new FetchXmlAggregateQuery<TProps, ApplyResultType<R>>(
            this._table,
            initialAttributes,
            this._linkAlias,
            this._filters,
        );

        if (this._datasource) aggregateQuery["_datasource"] = this._datasource;
        if (this._options) aggregateQuery["_options"] = this._options;

        return aggregateQuery;
    }

    public filter(
        filter: string | FilterExpr | ((f: FieldProxy<TProps>) => string | FilterExpr),
    ): this {
        let str: string
        if (filter instanceof FilterExpr) {
            str = filter.toFetchXml()
        } else if (typeof filter === "function") {
            const result = filter(this._proxy)
            str = result instanceof FilterExpr ? result.toFetchXml() : result
        } else {
            str = filter
        }
        this._filters.push(str);
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
    public join(
        linkType: FetchLinkType,
        table: DataverseTable<any>,
        from: string,
        to: string,
        subquery: (q: any) => any,
        intersect?: boolean,
    ): any {
        const isFilterOnly = EntityQueryBuilder._isFilterOnlyLinkType(linkType as FetchLinkType)
        if (isFilterOnly) {
            const collector = new FilterCollector(table)
            subquery(collector)
            const fromFieldName = table.fields[from].name;
            const toFieldName = this._table.fields[to].name;
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
            subquery(nestedBuilder)
            const fromFieldName = table.fields[from].name;
            const toFieldName = this._table.fields[to].name;
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

    public intersect<T2 extends GenericProperties, TJoinResult extends Record<string, any>>(
        intersectTable: DataverseIntersectTable<TProps, T2>,
        subquery: (q: SubJoinBuilder<T2, {}>) => SubJoinBuilder<T2, TJoinResult>,
    ): EntityQueryBuilder<TProps, NoOverlap<TResult, TJoinResult>>;
    public intersect<T1 extends GenericProperties, TJoinResult extends Record<string, any>>(
        intersectTable: DataverseIntersectTable<T1, TProps>,
        subquery: (q: SubJoinBuilder<T1, {}>) => SubJoinBuilder<T1, TJoinResult>,
    ): EntityQueryBuilder<TProps, NoOverlap<TResult, TJoinResult>>;
    public intersect(
        intersectTable: DataverseIntersectTable<any, any>,
        subquery: (q: SubJoinBuilder<any, {}>) => SubJoinBuilder<any, Record<string, any>>,
    ): EntityQueryBuilder<TProps, any> {
        let targetTable: DataverseTable<any>;

        if (intersectTable.table1 === this._table) {
            targetTable = intersectTable.table2;
        } else if (intersectTable.table2 === this._table) {
            targetTable = intersectTable.table1;
        } else {
            throw new Error(
                `Table "${this._table.name}" is not related to intersect table "${intersectTable.name}"`,
            );
        }

        const targetBuilder = new EntityQueryBuilder(targetTable, this._linkAlias);
        subquery(targetBuilder as unknown as SubJoinBuilder<any, {}>);

        const pkName = this._table.getPrimaryKey().property.name;
        const targetPkName = targetTable.getPrimaryKey().property.name;

        const stubTable = { name: intersectTable.name, fields: {}, client: this._table.client } as unknown as DataverseTable<any>;
        const intersectBuilder = new EntityQueryBuilder(stubTable, this._linkAlias);
        (intersectBuilder as any)._links.push({
            name: targetTable.logicalName,
            from: targetPkName,
            to: targetPkName,
            alias: `auto_link_${++this._linkAlias.value}`,
            linkType: "inner",
            builder: targetBuilder,
        });

        this._links.push({
            name: intersectTable.name,
            from: pkName,
            to: pkName,
            alias: `auto_link_${++this._linkAlias.value}`,
            linkType: "inner",
            builder: intersectBuilder,
            intersect: true,
        });

        return this as any;
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

    public async execute(options?: ExecuteOptions): Promise<TResult[]> {
        if (options?.datasource) this._datasource = options.datasource;
        if (options?.lateMaterialize) this._lateMaterialize = true;
        if (options?.aggregateLimit !== undefined) this._aggregateLimit = options.aggregateLimit;
        if (options?.useRawOrderBy) this._useRawOrderBy = true;
        if (options?.options) this._options = options.options;
        const raw = await this._table.client.getRecords(this._table.entitySetName, this.toString());
        const aliasInfo = this._buildAliasInfo();
        if (aliasInfo.size > 0) {
            return raw.map((v: any) => {
                const result: Record<string | symbol, any> = {};
                for (const [alias, info] of aliasInfo) {
                    if (info.name in v) {
                        result[alias] = info.transform(v[info.name]);
                    } else {
                        result[alias] = info.getDefault();
                    }
                }
                result[Etag] = v["@odata.etag"];
                return result as TResult;
            });
        }
        return raw.map((v: any) => {
            const r = this._table.transformValueFromDataverse(v);
            return r;
        }) as TResult[];
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
            const fields = builder._table.fields as Record<string, { fromDataverseName?: string; name: string; transformValueFromDataverse: (val: any) => any; getDefault?: () => any }>;
            const entry = Object.entries(fields).find(
                ([_, f]) => (f.fromDataverseName ?? f.name) === attr.name,
            );
            if (entry) {
                const fieldDef = entry[1];
                const dataverseName = fieldDef.fromDataverseName ?? fieldDef.name;
                map.set(attr.alias, {
                    transform: (val: any) => fieldDef.transformValueFromDataverse(val),
                    getDefault: () => fieldDef.getDefault?.(),
                    name: dataverseName,
                });
            } else {
                map.set(attr.alias, {
                    transform: (val: any) => val,
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
        return this.#builder.apply(expr)
    }

    filter(filter: string | FilterExpr | ((f: FieldProxy<TProps>) => string | FilterExpr)): FetchXmlInitial<TProps> {
        this.#builder.filter(filter)
        return this
    }

    join(...args: any[]): FetchXmlInitial<TProps> {
        ;(this.#builder as any).join(...args)
        return this
    }

    intersect(...args: any[]): FetchXmlInitial<TProps> {
        ;(this.#builder as any).intersect(...args)
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

    toXml(): string {
        return this.#builder.toXml()
    }

    toString(): string {
        return this.#builder.toString()
    }

    async execute(options?: ExecuteOptions): Promise<Infer<TProps>[]> {
        return this.#builder.execute(options)
    }
}
