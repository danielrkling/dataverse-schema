import { isNonEmptyString } from "../util";

/**
 * Creates an OData groupby expression.
 *
 * @param values An array of property names to group by.  Empty or null values will be filtered out.
 * @param aggregations Optional aggregation expressions to apply to the grouped data.
 * @returns An OData groupby expression string.
 *
 * @example
 * // Group by a single property:
 * groupby(["category"]); // returns "groupby((category))"
 *
 * // Group by multiple properties:
 * groupby(["category", "region", "year"]); // returns "groupby((category,region,year))"
 *
 * // Group by a single property with aggregation:
 * groupby(["category"], "aggregate(price with average as avgPrice)");
 * // returns "groupby((category),aggregate(price with average as avgPrice))"
 *
 * // Group by multiple properties with multiple aggregations:
 * groupby(["category", "region"], aggregate(price with average as avgPrice, quantity with sum as totalQuantity));
 * // returns "groupby((category,region),aggregate(price with average as avgPrice, quantity with sum as totalQuantity))"
 */
export function groupby(values: string[], aggregations?: string): string {
  return `groupby((${values.filter(isNonEmptyString).join(",")})${
    aggregations ? "," + aggregations : ""
  })`;
}

/**
 * Creates an OData aggregate expression.
 *
 * @param values An array of aggregation expressions (e.g., "price with average as avgPrice"). Empty or null values will be filtered out.
 * @returns An OData aggregate expression string.
 *
 * @example
 * // Aggregate with a single average:
 * aggregate("price with average as avgPrice"); // returns "aggregate(price with average as avgPrice)"
 *
 * // Aggregate with multiple aggregations:
 * aggregate("price with average as avgPrice", "quantity with sum as totalQuantity", "rating with average as avgRating");
 * // returns "aggregate(price with average as avgPrice,quantity with sum as totalQuantity,rating with average as avgRating)"
 */
export function aggregate(...values: string[]): string {
  return `aggregate(${values.filter(isNonEmptyString).join(",")})`;
}

/**
 * Creates an OData aggregation expression for calculating the average of a property.
 *
 * @param name The name of the property to average.
 * @param alias The alias for the resulting average value (defaults to the property name).
 * @returns An OData aggregation expression string for average.
 *
 * @example
 * average("price");             // returns "price with average as price"
 * average("price", "avgPrice"); // returns "price with average as avgPrice"
 */
export function average(name: string, alias: string = name): string {
  return `${name} with average as ${alias}`;
}

/**
 * Creates an OData aggregation expression for calculating the sum of a property.
 *
 * @param name The name of the property to sum.
 * @param alias The alias for the resulting sum value (defaults to the property name).
 * @returns An OData aggregation expression string for sum.
 *
 * @example
 * sum("quantity");           // returns "quantity with sum as quantity"
 * sum("quantity", "total"); // returns "quantity with sum as total"
 */
export function sum(name: string, alias: string = name): string {
  return `${name} with sum as ${alias}`;
}

/**
 * Creates an OData aggregation expression for finding the minimum value of a property.
 *
 * @param name The name of the property to find the minimum of.
 * @param alias The alias for the resulting minimum value (defaults to the property name).
 * @returns An OData aggregation expression string for min.
 *
 * @example
 * min("price");           // returns "price with min as price"
 * min("price", "minPrice"); // returns "price with min as minPrice"
 */
export function min(name: string, alias: string = name): string {
  return `${name} with min as ${alias}`;
}

/**
 * Creates an OData aggregation expression for finding the maximum value of a property.
 *
 * @param name The name of the property to find the maximum of.
 * @param alias The alias for the resulting maximum value (defaults to the property name).
 * @returns An OData aggregation expression string for max.
 *
 * @example
 * max("price");           // returns "price with max as price"
 * max("price", "maxPrice"); // returns "price with max as maxPrice"
 */
export function max(name: string, alias: string = name): string {
  return `${name} with max as ${alias}`;
}

/**
 * Creates an OData aggregation expression for counting the number of records.
 *
 * @param alias The alias for the resulting count value (defaults to "count").
 * @returns An OData aggregation expression string for count.
 *
 * @example
 * count();             // returns "$count as count"
 * count("recordCount"); // returns "$count as recordCount"
 */
export function count(alias = "count"): string {
  return `$count as ${alias}`;
}
