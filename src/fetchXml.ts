import { DataverseClient, GenericProperties, lookup, primaryKey, Schema, string, Table, table } from "./index"; // Adjust imports to your structure

// --- Type Utilities ---
type Simplify<T> = { [Key in keyof T]: T[Key] } & {};
type InferField<T> = T extends Schema<infer U> ? U : any;

// Generates a type where every key maps to its own literal string name
// e.g., { id: "id", name: "name" }
type FieldSelector<TProps extends GenericProperties> = {
    [K in keyof TProps]: K;
};

// All valid FetchXML link types
export type FetchLinkType = "inner" | "outer" | "any" | "not any" | "all" | "not all" | "exists" | "in";

// --- Query Builder Core ---
export class EntityQueryBuilder<TProps extends GenericProperties, TResult extends Record<string, any> = {}> {
    private _table: Table<TProps>;
    private _attributes: Array<{ name: string; alias: string }> = [];
    private _links: Array<{
        name: string;
        alias: string;
        from: string;
        to: string;
        linkType: FetchLinkType;
        builder: EntityQueryBuilder<any, any>;
    }> = [];
    private _isDistinct: boolean = false;
    // private _conditions: any[] = [];

    constructor(table: Table<TProps>) {
        this._table = table;
    }

    /**
     * Select fields and optionally alias them using an object map.
     * Example: .select(f => ({ myIdAlias: f.id, fullName: f.fullName }))
     */
    public select<TSelect extends Record<string, keyof TProps>>(
        selector: (fields: FieldSelector<TProps>) => TSelect,
    ): EntityQueryBuilder<TProps, Simplify<TResult & { [K in keyof TSelect]: InferField<TProps[TSelect[K]]> }>> {
        // 1. Create a runtime object that behaves like the FieldSelector type
        const fieldsMock = {} as FieldSelector<TProps>;
        for (const key of Object.keys(this._table.fields)) {
            (fieldsMock as any)[key] = key;
        }

        // 2. Execute user's callback to get their alias map
        const selectedMap = selector(fieldsMock);

        // 3. Register the selections
        for (const [alias, propKey] of Object.entries(selectedMap)) {
            const fieldDef = this._table.fields[propKey as keyof TProps];
            this._attributes.push({ name: fieldDef.name, alias });
        }

        return this as any;
    }

    /**
     * Generic join method supporting all FetchXML link-types.
     * The alias parameter is removed from the API and auto-generated internally.
     */
    public join<
        TTable extends Table<any>,
        TFrom extends keyof TTable["fields"],
        TTo extends keyof TProps,
        TJoinResult extends Record<string, any>,
    >(
        linkType: FetchLinkType, // <-- Pass "inner", "outer", "any", etc. here
        table: TTable,
        from: TFrom,
        to: TTo,
        subquery: (q: EntityQueryBuilder<TTable["fields"], {}>) => EntityQueryBuilder<TTable["fields"], TJoinResult>,
    ): EntityQueryBuilder<
        TProps,
        Simplify<TResult & TJoinResult> // Properties merge flat into the root!
    > {
        const nestedBuilder = new EntityQueryBuilder(table);
        subquery(nestedBuilder);

        const fromFieldName = table.fields[from].name;
        const toFieldName = this._table.fields[to].name;

        // Auto-generate an alias to keep FetchXML happy without bothering the user
        const autoAlias = `auto_link_${++EntityQueryBuilder._aliasCounter}`;

        this._links.push({
            name: table.logicalName,
            from: fromFieldName,
            to: toFieldName,
            alias: autoAlias, // Internal only
            linkType: linkType,
            builder: nestedBuilder,
        });

        return this as any;
    }

    // You can also expose clean wrapper methods for the most common joins:
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
    ) {
        return this.join("inner", table, from, to, subquery);
    }

    public where(condition: string /* replace with actual filter logic */): this {
        // this._conditions.push(condition);
        return this;
    }

    public distinct(): this {
        this._isDistinct = true;
        return this;
    }

    public toXml(): string {
        const xml: string[] = [];
        const distinctAttr = this._isDistinct ? ` distinct="true"` : "";

        xml.push(`<fetch version="1.0" mapping="logical"${distinctAttr}>`);
        xml.push(`  <entity name="${this._table.logicalName}">`);

        for (const attr of this._attributes) {
            // In FetchXML, if you want the JSON payload key to match your custom alias perfectly, you use the alias attribute.
            xml.push(`    <attribute name="${attr.name}" alias="${attr.alias}" />`);
        }

        for (const link of this._links) {
            xml.push(
                `    <link-entity name="${link.name}" from="${link.from}" to="${link.to}" alias="${link.alias}" link-type="${link.linkType}">`,
            );

            for (const nestedAttr of link.builder._attributes) {
                xml.push(`      <attribute name="${nestedAttr.name}" alias="${nestedAttr.alias}" />`);
            }

            xml.push(`    </link-entity>`);
        }

        xml.push(`  </entity>`);
        xml.push(`</fetch>`);
        return xml.join("\n");
    }

    public async execute(): Promise<TResult[]> {
        const fetchXmlQuery = `fetchXml=${encodeURIComponent(this.toXml())}`;
        return this._table.client.getRecords(this._table.name, fetchXmlQuery);
    }
}

// --- Root Entry Point ---
class RootQueryBuilder {
    from<TProps extends GenericProperties>(table: Table<TProps>) {
        return new EntityQueryBuilder(table);
    }
}

export function fetchXml<TResult>(
    queryBuilderFn: (q: RootQueryBuilder) => EntityQueryBuilder<any, TResult>,
): EntityQueryBuilder<any, TResult> {
    const root = new RootQueryBuilder();
    return queryBuilderFn(root);
}
