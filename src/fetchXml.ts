import { DataverseTable, DataverseIntersectTable } from "./table";
import { GenericProperties, Infer } from "./types";
import { FilterExpr } from "./filter";
import { Aggregation, GroupByExpr, FieldRef } from "./odata";
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

/**
 * Builds a FetchXML query for Dataverse with full type support.
 *
 * Use `fetchXml(table)` to create a builder, then chain methods to construct
 * the query. Call `execute()` to run it or `toXml()` to get the raw XML.
 *
 * When `select()` is not called, all value/lookupId/file fields are
 * automatically included. Each result from `execute()` includes an `Etag`
 * symbol property for optimistic concurrency.
 *
 * @example
 * const q = fetchXml(contactDataverseTable)
 *   .select(f => ({ name: f.name, email: f.email }))
 *   .where(f => eq(f.status, 1))
 *   .orderby(f => f.name, "desc")
 *   .top(10);
 *
 * const xml = q.toXml();
 * const results = await q.execute();
 */
export class EntityQueryBuilder<
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
        builder: EntityQueryBuilder<any, any>;
        intersect?: boolean;
    }> = [];
    private _isDistinct: boolean = false;
    private _filters: string[] = [];
    private _proxy: FieldProxy<TProps>;
    private _top?: number;
    private _isAggregate: boolean = false;
    private _useRawOrderBy: boolean = false;
    private _lateMaterialize: boolean = false;
    private _aggregateLimit?: number;
    private _orders: OrderDef[] = [];
    private _datasource?: string;
    private _options?: string;

    /** @param table The DataverseTable definition to build the query against. */
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
                attrs.push({ name: p.fromDataverseName ?? p.name, alias: key });
            }
        }
        return attrs;
    }

    private _buildProxy(): FieldProxy<TProps> {
        const proxy = {} as FieldProxy<TProps>;
        for (const [key, prop] of Object.entries(this._table.fields)) {
            (proxy as any)[key] = prop.fromDataverseName ?? prop.name;
        }
        return proxy;
    }

    /**
     * Selects specific fields to include in the FetchXML query.
     * The result type is narrowed to only include selected fields.
     * When this method is not called, all value/lookupId/file fields
     * are automatically included via `_getEffectiveAttributes()`.
     *
     * Use `apply()` instead for aggregate queries.
     *
     * @example
     * fetchXml(contactDataverseTable)
     *   .select(f => ({ name: f.name, email: f.email }))
     */
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

    /**
     * Adds grouping and aggregation to the FetchXML query.
     * The callback receives a field proxy and must return a record where:
     * - Values created with `groupby()` define grouping fields
     * - Values created with `sum()`, `average()`, `min()`, `max()`, `count()` define aggregations
     *
     * Record keys become the alias names in the response.
     *
     * @example
     * fetchXml(Account).apply(v => ({
     *   city: groupby(v.city),
     *   total: sum(v.revenue),
     *   cnt: count(),
     * }))
     */
    public apply<R extends Record<string, GroupByExpr<any> | Aggregation<any>>>(
        expr: (f: FieldProxy<TProps>) => R,
    ): Omit<EntityQueryBuilder<TProps, ApplyResultType<R>>, 'select'> {
        this._isAggregate = true;

        const result = expr(this._proxy as any);

        for (const [alias, value] of Object.entries(result)) {
            if (value instanceof GroupByExpr) {
                this._attributes.push({ name: value.field, alias, groupby: true });
            } else if (value instanceof Aggregation && value.field) {
                this._attributes.push({ name: value.field, alias, aggregate: value.operation });
            }
        }

        return this as any;
    }

    /**
     * Adds a filter condition to the FetchXML query.
     * Accepts a raw filter string or a callback that receives a field proxy.
     * Multiple `where()` calls are combined with AND.
     *
     * @example
     * // With typed filter function
     * fetchXml(contactDataverseTable).where(f => eq(f.status, 1))
     *
     * @example
     * // Raw filter string
     * fetchXml(contactDataverseTable).where(eq("statuscode", "1"))
     */
    public where(
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

    /**
     * Adds a link-entity join to another table. The result type merges the
     * joined entity's selected fields.
     *
     * For filter-only link types (`any`, `not any`, `all`, `not all`,
     * `exists`, `in`), only filters are rendered inside `<link-entity>`;
     * `<attribute>` and `<order>` elements are skipped.
     *
     * @example
     * fetchXml(contactDataverseTable)
     *   .select(f => ({ name: f.name }))
     *   .join("inner", accountDataverseTable, a => a.accountid, c => c.parentcustomerid,
     *     q => q.select(a => ({ accountName: a.name })))
     */
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
        subquery: (q: EntityQueryBuilder<TDataverseTable["fields"], {}>) => EntityQueryBuilder<TDataverseTable["fields"], TJoinResult>,
        intersect?: boolean,
    ): EntityQueryBuilder<TProps, Simplify<TResult & TJoinResult>> {
        const nestedBuilder = new EntityQueryBuilder(table, this._linkAlias);
        subquery(nestedBuilder);

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
            builder: nestedBuilder,
            intersect: isIntersect,
        });

        return this as any;
    }

    /**
     * Shorthand for `join("inner", ...)`. Adds an inner link-entity join.
     *
     * @example
     * fetchXml(contactDataverseTable)
     *   .select(f => ({ name: f.name }))
     *   .innerJoin(accountDataverseTable, a => a.accountid, c => c.parentcustomerid,
     *     q => q.select(a => ({ accountName: a.name })))
     */
    public innerJoin<
        TDataverseTable extends DataverseTable<any>,
        TFrom extends keyof TDataverseTable["fields"],
        TTo extends keyof TProps,
        TJoinResult extends Record<string, any>,
    >(
        table: TDataverseTable,
        from: TFrom,
        to: TTo,
        subquery: (q: EntityQueryBuilder<TDataverseTable["fields"], {}>) => EntityQueryBuilder<TDataverseTable["fields"], TJoinResult>,
        intersect?: boolean,
    ) {
        return this.join("inner", table, from, to, subquery, intersect);
    }

    /**
     * Auto-joins through a DataverseIntersectTable intersect table, detecting
     * which side matches the current query and which is the target.
     * Creates both join legs (source → intersect, intersect → target) so the
     * subquery receives the target table's builder directly.
     *
     * @example
     * fetchXml(Person)
     *   .select(f => ({ name: f.name }))
     *   .through(PersonAccount, sub =>
     *     sub.select(f => ({ accountName: f.name }))
     *   )
     */
    public through<T2 extends GenericProperties, TJoinResult extends Record<string, any>>(
        intersectTable: DataverseIntersectTable<TProps, T2>,
        subquery: (q: EntityQueryBuilder<T2, {}>) => EntityQueryBuilder<T2, TJoinResult>,
    ): EntityQueryBuilder<TProps, Simplify<TResult & TJoinResult>>;
    public through<T1 extends GenericProperties, TJoinResult extends Record<string, any>>(
        intersectTable: DataverseIntersectTable<T1, TProps>,
        subquery: (q: EntityQueryBuilder<T1, {}>) => EntityQueryBuilder<T1, TJoinResult>,
    ): EntityQueryBuilder<TProps, Simplify<TResult & TJoinResult>>;
    public through(
        intersectTable: DataverseIntersectTable<any, any>,
        subquery: (q: EntityQueryBuilder<any, {}>) => EntityQueryBuilder<any, Record<string, any>>,
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
        subquery(targetBuilder);

        const pkName = this._table.getPrimaryKey().property.name;
        const targetPkName = targetTable.getPrimaryKey().property.name;

        const stubTable = { name: intersectTable.name, fields: {}, client: this._table.client } as unknown as DataverseTable<any>;
        const intersectBuilder = new EntityQueryBuilder(stubTable, this._linkAlias);
        intersectBuilder._links.push({
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

    /** Enables distinct (deduplicated) results. */
    public distinct(): this {
        this._isDistinct = true;
        return this;
    }

    /** Limits the number of returned records. */
    public top(n: number): this {
        this._top = n;
        return this;
    }

  /**
   * Adds ordering to the FetchXML query.
   * Matches the OData syntax: pass a field selector callback and optional direction.
   *
   * @example
   * fetchXml(contactDataverseTable).orderby(f => f.name);
   * fetchXml(contactDataverseTable).orderby(f => f.name, "desc");
   *
   * @example
   * // With explicit entity name (for cross-entity ordering)
   * fetchXml(contactDataverseTable).orderby("contact", "createdon", "desc")
   */
  public orderby(
      fieldSelector: (f: FieldProxy<TProps>) => string,
      direction?: 'asc' | 'desc'
  ): this;
  public orderby(entityname: string, attribute: string, direction?: 'asc' | 'desc'): this;
  public orderby(...args: any[]): this {
      if (typeof args[0] === 'function') {
          const name = args[0](this._proxy);
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

    /**
     * Returns the full FetchXML string.
     *
     * @example
     * const xml = fetchXml(contactDataverseTable)
     *   .select(f => ({ name: f.name }))
     *   .toXml();
     * // <fetch version="1.0" mapping="logical">
     * //   <entity name="contact">
     * //     <attribute name="fullname" alias="name" />
     * //   </entity>
     * // </fetch>
     */
    public toXml(): string {
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
            builder: EntityQueryBuilder<any, any>;
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
        const filterOnly = EntityQueryBuilder._isFilterOnlyLinkType(link.linkType);

        if (link.builder._filters.length > 0) {
            lines.push(`${childIndent}<filter type="and">`);
            for (const c of link.builder._filters) {
                lines.push(`${childIndent}  ${c}`);
            }
            lines.push(`${childIndent}</filter>`);
        }

        if (!filterOnly) {
            for (const nestedAttr of link.builder._getEffectiveAttributes()) {
                const attrParts = [`name="${nestedAttr.name}"`, `alias="${nestedAttr.alias}"`];
                if (nestedAttr.aggregate) attrParts.push(`aggregate='${nestedAttr.aggregate}'`);
                if (nestedAttr.groupby) attrParts.push(`groupby='true'`);
                if (nestedAttr.dategrouping) attrParts.push(`dategrouping='${nestedAttr.dategrouping}'`);
                if (nestedAttr.distinct) attrParts.push(`distinct='true'`);
                if (nestedAttr.rowaggregate) attrParts.push(`rowaggregate='${nestedAttr.rowaggregate}'`);
                lines.push(`${childIndent}<attribute ${attrParts.join(" ")} />`);
            }

            for (const order of link.builder._orders) {
                const parts = [`attribute='${order.attribute}'`];
                if (order.descending) parts.push(`descending='true'`);
                lines.push(`${childIndent}<order ${parts.join(" ")} />`);
            }
        }

        for (const nestedLink of link.builder._links) {
            lines.push(...this._renderLinkEntity(nestedLink, childIndent));
        }

        lines.push(`${indent}</link-entity>`);
        return lines;
    }

    /**
     * Returns the URL-encoded query string for use in the Dataverse API.
     *
     * @example
     * fetchXml(contactDataverseTable).select(f => ({ name: f.name })).toString()
     * // "fetchXml=%3Cfetch%20version%3D%221.0%22..."
     */
    public toString(): string {
        return `fetchXml=${encodeURIComponent(this.toXml())}`;
    }

  /**
   * Executes the FetchXML query against Dataverse and returns the parsed results.
   *
   * Each result object includes an `Etag` symbol property (import from
   * `dataverse-schema`) holding the `@odata.etag` value for optimistic
   * concurrency. When `select()` is not called, value/lookupId/file fields
   * are auto-included; missing API fields fall back to the field default.
   *
   * @example
   * const contacts = await fetchXml(contactDataverseTable)
   *   .select(f => ({ name: f.name, email: f.email }))
   *   .where(f => eq(f.status, 1))
   *   .execute();
   * // contacts: Array<{ name: string; email: string }>
   *
   * @example
   * // With optional execute parameters
   * const contacts = await fetchXml(contactDataverseTable)
   *   .select(f => ({ name: f.name }))
   *   .execute({ useRawOrderBy: true, aggregateLimit: 5000 });
   */
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
              this._collectAliases(link.builder, map);
          }
      }
  }
}

// --- Root Entry Point ---

/**
 * Creates a new FetchXML query builder for the given table.
 * Returns an `EntityQueryBuilder` that starts with all table fields selected
 * and narrows the result type as you chain methods.
 *
 * @example
 * const results = await fetchXml(contactDataverseTable)
 *   .select(f => ({ name: f.name }))
 *   .where(f => eq(f.statecode, 0))
 *   .execute();
 */
export function fetchXml<TProps extends GenericProperties>(table: DataverseTable<TProps>): EntityQueryBuilder<TProps, Infer<TProps>> {
    return new EntityQueryBuilder(table);
}
