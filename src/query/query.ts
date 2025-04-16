import { AlternateKey, type Primitive } from "../types";
import { isNonEmptyString, wrapString } from "../util";

export type Query = {
  select?: string;
  expand?: string;
  orderby?: string;
  filter?: string;
  top?: number;
  apply?: string;
};

export type NestedQuery =
  | string
  | {
      select?: string | string[];
      expand?: string | Record<string, NestedQuery>;
    };

/**
 * Constructs an OData query string from a query object.
 *
 * @param query An object containing OData query parameters.
 * @returns An OData query string.
 *
 * @example
 * // Simple query with select and filter:
 * query({
 * select: "id,name,email",
 * filter: "age gt 20"
 * });
 * // returns "$select=id,name,email&$filter=age gt 20"
 *
 * // Query with expand and orderby:
 * query({
 * expand: "orders($select=id,orderDate)",
 * orderby: "name asc"
 * });
 * // returns "$expand=orders($select=id,orderDate)&$orderby=name asc"
 *
 * // Query with top:
 * query({ top: 10 });
 * // returns "$top=10"
 */
export function query(query?: Query): string {
  const params = new URLSearchParams();
  if (query?.select) params.set("$select", query.select);
  if (query?.expand) params.set("$expand", query.expand);
  if (query?.orderby) params.set("$orderby", query.orderby);
  if (query?.filter) params.set("$filter", query.filter);
  if (query?.top) params.set("$top", query.top.toFixed(0));
  if (query?.apply) params.set("$apply", query.apply);
  return params.toString();
}

/**
 * Creates an OData key string from a record of key-value pairs.
 * Used for identifying entities by alternate keys.
 *
 * @param keys A record of key-value pairs representing the alternate key.
 * @returns An OData key string.
 *
 * @example
 * // Create key string for a single key:
 * keys({ email: "test@example.com" });
 * // returns "email='test@example.com'"
 *
 * // Create key string for multiple keys:
 * keys({ region: "US", code: 123 });
 * // returns "region='US',code=123"
 */
export function keys(keys: Record<string, Primitive>): AlternateKey {
  return Object.entries(keys)
    .filter((kv) => isNonEmptyString(kv[1]))
    .map(([k, v]) => `${k}=${wrapString(v)}`)
    .join(",") as AlternateKey;
}

/**
 * Creates an OData $select expression.
 *
 * @param values An array of property names to select.
 * @returns A comma-separated string of property names.
 *
 * @example
 * // Select multiple properties:
 * $select("id", "name", "email");
 * // returns "id,name,email"
 *
 * // Select properties including nested properties
 * $select("id", "name", "address/city");
 * // returns "id,name,address/city"
 */
export function select(...values: string[]): string {
  return values.filter(isNonEmptyString).join(",");
}

/**
 * Creates an OData $expand expression.
 *
 * @param values A string or a record representing the properties to expand.
 * If it is a string, it represents the navigation property name.
 * If it is a record, the key is the navigation property name, and the value is a NestedQuery.
 * @returns An OData $expand expression string.
 *
 * @example
 * // Expand a single navigation property:
 * $expand("orders");
 * // returns "orders"
 *
 * // Expand a navigation property with nested select:
 * $expand({ orders: { select: ["id", "orderDate"] } });
 * // returns "orders($select=id,orderDate)"
 *
 * // Expand a navigation property with nested expand:
 * $expand({
 * customer: {
 * select: ["id", "name"],
 * expand: { address: { select: ["city", "street"] } }
 * }
 * });
 * // returns "customer($select=id,name;$expand=address($select=city,street))"
 */
export function expand(values: string | Record<string, NestedQuery>): string {
  if (typeof values === "string") return values;
  return Object.entries(values)
    .map(([name, v]) =>
      typeof v === "string"
        ? v
        : `${name}(${v.select ? `$select=${select(...(Array.isArray(v.select) ? v.select: [v.select]))};` : ""}${
            v.expand ? `$expand=${expand(v.expand)}` : ""
          })`
    )
    .join(",");
}

/**
 * Creates an OData $orderby expression.
 *
 * @param values A record where the key is the property name and the value is "asc" or "desc".
 * @returns An OData $orderby expression string.
 *
 * @example
 * // Order by a single property ascending:
 * $orderby({ name: "asc" });
 * // returns "name asc"
 *
 * // Order by multiple properties:
 * $orderby({ name: "asc", age: "desc" });
 * // returns "name asc,age desc"
 */
export function orderby(values: Record<string, "asc" | "desc">): string {
  return Object.entries(values)
    .filter((kv) => isNonEmptyString(kv[1]))
    .map(([k, v]) => `${k} ${v}`)
    .join(",");
}
