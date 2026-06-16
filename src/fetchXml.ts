import { Table } from "./table";
import { GenericProperties, Infer } from "./types";
import { OrderSpec } from "./query";

type Simplify<T> = { [Key in keyof T]: T[Key] } & {};

type FieldSelector<TProps extends GenericProperties> = {
    [K in keyof TProps]: K;
};

export type FieldProxy<T extends GenericProperties> = {
    [K in keyof T]: string
};

export type FetchLinkType = "inner" | "outer" | "any" | "not any" | "all" | "not all" | "exists" | "in";

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



export class EntityQueryBuilder<TProps extends GenericProperties, TResult extends Record<string, any> = {}> {
    private _aliasCounter = 0;

    private _table: Table<TProps>;
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
    private _page?: number;
    private _pageSize?: number;
    private _isAggregate: boolean = false;
    private _returnTotalRecordCount: boolean = false;
    private _useRawOrderBy: boolean = false;
    private _lateMaterialize: boolean = false;
    private _aggregateLimit?: number;
    private _orders: OrderDef[] = [];
    private _pagingCookie?: string;
    private _datasource?: string;
    private _options?: string;

    constructor(table: Table<TProps>) {
        this._table = table;
        this._proxy = this._buildProxy();
    }

    private _buildProxy(): FieldProxy<TProps> {
        const proxy = {} as FieldProxy<TProps>;
        for (const [key, prop] of Object.entries(this._table.fields)) {
            (proxy as any)[key] = prop.fromDataverseName ?? prop.name;
        }
        return proxy;
    }

    public select<TSelect extends Record<string, keyof TProps>>(
        selector: (fields: FieldSelector<TProps>) => TSelect,
    ): EntityQueryBuilder<TProps, Simplify<TResult & { [K in keyof TSelect]: Infer<TProps[TSelect[K]]> }>> {
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

    public where(
        filter: string | ((f: FieldProxy<TProps>) => string),
    ): this {
        const str = typeof filter === "function" ? filter(this._proxy) : filter;
        this._filters.push(str);
        return this;
    }

    public join<
        TTable extends Table<any>,
        TFrom extends keyof TTable["fields"],
        TTo extends keyof TProps,
        TJoinResult extends Record<string, any>,
    >(
        linkType: FetchLinkType,
        table: TTable,
        from: TFrom,
        to: TTo,
        subquery: (q: EntityQueryBuilder<TTable["fields"], {}>) => EntityQueryBuilder<TTable["fields"], TJoinResult>,
        intersect?: boolean,
    ): EntityQueryBuilder<TProps, Simplify<TResult & TJoinResult>> {
        const nestedBuilder = new EntityQueryBuilder(table);
        subquery(nestedBuilder);

        const fromFieldName = table.fields[from].name;
        const toFieldName = this._table.fields[to].name;

        const autoAlias = `auto_link_${++this._aliasCounter}`;

        this._links.push({
            name: table.name,
            from: fromFieldName,
            to: toFieldName,
            alias: autoAlias,
            linkType: linkType,
            builder: nestedBuilder,
            intersect,
        });

        return this as any;
    }

    public innerJoin<
        TTable extends Table<any>,
        TFrom extends keyof TTable["fields"],
        TTo extends keyof TProps,
        TJoinResult extends Record<string, any>,
    >(
        table: TTable,
        from: TFrom,
        to: TTo,
        subquery: (q: EntityQueryBuilder<TTable["fields"], {}>) => EntityQueryBuilder<TTable["fields"], TJoinResult>,
        intersect?: boolean,
    ) {
        return this.join("inner", table, from, to, subquery, intersect);
    }

    public distinct(): this {
        this._isDistinct = true;
        return this;
    }

    public top(n: number): this {
        this._top = n;
        return this;
    }

    public page(n: number): this {
        this._page = n;
        return this;
    }

    public pageSize(n: number): this {
        this._pageSize = n;
        return this;
    }

    public returnTotalRecordCount(): this {
        this._returnTotalRecordCount = true;
        return this;
    }

    public useRawOrderBy(): this {
        this._useRawOrderBy = true;
        return this;
    }

    public lateMaterialize(): this {
        this._lateMaterialize = true;
        return this;
    }

    public aggregateLimit(n: number): this {
        this._aggregateLimit = n;
        return this;
    }

    public options(value: string): this {
        this._options = value;
        return this;
    }

    public datasource(value: string): this {
        this._datasource = value;
        return this;
    }

    public aggregate(): this {
        this._isAggregate = true;
        return this;
    }

  public orderby(
      spec: ((f: FieldProxy<TProps>) => OrderSpec | OrderSpec[] | Record<string, 'asc' | 'desc'>)
  ): this;
  public orderby(entityname: string, attribute: string, direction?: 'asc' | 'desc'): this;
  public orderby(...args: any[]): this {
      if (typeof args[0] === 'function') {
          const result = args[0](this._proxy);
          if (result instanceof OrderSpec) {
              for (const attr of result.fields) {
                  this._orders.push({ attribute: attr, descending: result.direction === 'desc' });
              }
          } else if (Array.isArray(result)) {
              for (const spec of result) {
                  for (const attr of spec.fields) {
                      this._orders.push({ attribute: attr, descending: spec.direction === 'desc' });
                  }
              }
          } else {
              for (const [attr, dir] of Object.entries(result)) {
                  this._orders.push({ attribute: attr, descending: dir === 'desc' });
              }
          }
      } else {
          const entityname = args[0] as string;
          const attribute = args[1] as string;
          const direction = args[2] as 'asc' | 'desc' | undefined;
          this._orders.push({ attribute, entityname, descending: direction === 'desc' });
      }
      return this;
  }

    public sum(field: keyof TProps, alias: string): this {
        this._isAggregate = true;
        const fieldDef = this._table.fields[field];
        this._attributes.push({ name: fieldDef.name, alias, aggregate: 'sum' });
        return this;
    }

    public avg(field: keyof TProps, alias: string): this {
        this._isAggregate = true;
        const fieldDef = this._table.fields[field];
        this._attributes.push({ name: fieldDef.name, alias, aggregate: 'avg' });
        return this;
    }

    public min(field: keyof TProps, alias: string): this {
        this._isAggregate = true;
        const fieldDef = this._table.fields[field];
        this._attributes.push({ name: fieldDef.name, alias, aggregate: 'min' });
        return this;
    }

    public max(field: keyof TProps, alias: string): this {
        this._isAggregate = true;
        const fieldDef = this._table.fields[field];
        this._attributes.push({ name: fieldDef.name, alias, aggregate: 'max' });
        return this;
    }

    public count(field: keyof TProps, alias: string): this {
        this._isAggregate = true;
        const fieldDef = this._table.fields[field];
        this._attributes.push({ name: fieldDef.name, alias, aggregate: 'count' });
        return this;
    }

    public countColumn(field: keyof TProps, alias: string, distinct?: boolean): this {
        this._isAggregate = true;
        const fieldDef = this._table.fields[field];
        this._attributes.push({ name: fieldDef.name, alias, aggregate: 'countcolumn', distinct });
        return this;
    }

    public rowAggregate(field: keyof TProps, alias: string, rowaggregate: string): this {
        const fieldDef = this._table.fields[field];
        this._attributes.push({ name: fieldDef.name, alias, rowaggregate });
        return this;
    }

    public groupBy(field: keyof TProps, alias: string): this {
        this._isAggregate = true;
        const fieldDef = this._table.fields[field];
        this._attributes.push({ name: fieldDef.name, alias, groupby: true });
        return this;
    }

    public groupByDate(field: keyof TProps, alias: string, dategrouping: string): this {
        this._isAggregate = true;
        const fieldDef = this._table.fields[field];
        this._attributes.push({ name: fieldDef.name, alias, groupby: true, dategrouping });
        return this;
    }

    public pagingCookie(cookie: string): this {
        this._pagingCookie = cookie;
        return this;
    }

    public toXml(): string {
        const lines: string[] = [];
        const fetchAttrs: string[] = [`version="1.0"`, `mapping="logical"`];

        if (this._top !== undefined) fetchAttrs.push(`top='${this._top}'`);
        if (this._isDistinct) fetchAttrs.push(`distinct="true"`);
        if (this._page !== undefined) fetchAttrs.push(`page='${this._page}'`);
        if (this._pageSize !== undefined) fetchAttrs.push(`count='${this._pageSize}'`);
        if (this._isAggregate) fetchAttrs.push(`aggregate="true"`);
        if (this._returnTotalRecordCount) fetchAttrs.push(`returntotalrecordcount="true"`);
        if (this._useRawOrderBy) fetchAttrs.push(`useraworderby="true"`);
        if (this._lateMaterialize) fetchAttrs.push(`latematerialize="true"`);
        if (this._aggregateLimit !== undefined) fetchAttrs.push(`aggregatelimit='${this._aggregateLimit}'`);
        if (this._pagingCookie) fetchAttrs.push(`paging-cookie='${this._pagingCookie}'`);
        if (this._datasource) fetchAttrs.push(`datasource='${this._datasource}'`);
        if (this._options) fetchAttrs.push(`options='${this._options}'`);

        lines.push(`<fetch ${fetchAttrs.join(" ")}>`);
        lines.push(`  <entity name="${this._table.name}">`);

        for (const attr of this._attributes) {
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
            const linkAttrs: string[] = [
                `name="${link.name}"`,
                `from="${link.from}"`,
                `to="${link.to}"`,
                `alias="${link.alias}"`,
                `link-type="${link.linkType}"`,
            ];
            if (link.intersect) linkAttrs.push(`intersect="true"`);

            lines.push(`    <link-entity ${linkAttrs.join(" ")}>`);

            if (link.builder._filters.length > 0) {
                lines.push(`      <filter type="and">`);
                for (const c of link.builder._filters) {
                    const entityScoped = c.replace("<condition", `<condition entityname="${link.alias}"`);
                    lines.push(`        ${entityScoped}`);
                }
                lines.push(`      </filter>`);
            }

            for (const nestedAttr of link.builder._attributes) {
                const attrParts = [`name="${nestedAttr.name}"`, `alias="${nestedAttr.alias}"`];
                if (nestedAttr.aggregate) attrParts.push(`aggregate='${nestedAttr.aggregate}'`);
                if (nestedAttr.groupby) attrParts.push(`groupby='true'`);
                if (nestedAttr.dategrouping) attrParts.push(`dategrouping='${nestedAttr.dategrouping}'`);
                if (nestedAttr.distinct) attrParts.push(`distinct='true'`);
                if (nestedAttr.rowaggregate) attrParts.push(`rowaggregate='${nestedAttr.rowaggregate}'`);
                lines.push(`      <attribute ${attrParts.join(" ")} />`);
            }

            lines.push(`    </link-entity>`);
        }

        lines.push(`  </entity>`);
        lines.push(`</fetch>`);
        return lines.join("\n");
    }

    public toString(): string {
        return `fetchXml=${encodeURIComponent(this.toXml())}`;
    }

  public async execute(): Promise<TResult[]> {
      const raw = await this._table.client.getRecords(this._table.name, this.toString());
      return raw.map((v: any) => this._table.transformValueFromDataverse(v)) as TResult[];
  }
}

// --- Helpers ---

export function condition(attribute: string, operator: string, value: unknown): string {
    return `<condition attribute="${attribute}" operator="${operator}" value="${value}" />`;
}

export function filterAnd(...conditions: string[]): string {
    return `<filter type="and">${conditions.join("")}</filter>`;
}

export function filterOr(...conditions: string[]): string {
    return `<filter type="or">${conditions.join("")}</filter>`;
}

// --- Root Entry Point ---

export function fetchXml<TProps extends GenericProperties>(table: Table<TProps>): EntityQueryBuilder<TProps, Infer<TProps>> {
    return new EntityQueryBuilder(table);
}
