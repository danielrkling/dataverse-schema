import type { Primitive } from "../types";
import { isNonEmptyString, wrapString } from "../util";

/**
 * Combines multiple OData filter conditions with the "and" operator.
 * Filters out any null or undefined conditions.
 *
 * @param conditions An array of OData filter conditions (strings), which can be null or undefined.
 * @returns A string representing the combined conditions, or an empty string if no valid conditions are provided.
 *
 * @example
 * // Example 1: Combining equals and greaterThan
 * and(equals("name", "John"), greaterThan("age", 30));
 * // returns "(name eq 'John' and age gt 30)"
 *
 * // Example 2: Combining with contains
 * and(contains("description", "software"), equals("category", "application"));
 * // returns "(contains(description,'software') and category eq 'application')"
 *
 * // Example 3: Handling null/undefined conditions
 * and("name eq 'John'", null, greaterThan("age", 30));
 * // returns "(name eq 'John' and age gt 30)"
 */
export function and(...conditions: (string | null | undefined)[]): string {
  const validConditions = conditions.filter(isNonEmptyString);
  if (validConditions.length === 0) return "";
  return `(${validConditions.join(" and ")})`;
}

/**
 * Combines multiple OData filter conditions with the "or" operator.
 * Filters out any null or undefined conditions.
 *
 * @param conditions An array of OData filter conditions (strings), which can be null or undefined.
 * @returns A string representing the combined conditions, or an empty string if no valid conditions are provided.
 *
 * @example
 * // Example 1: Combining equals conditions
 * or(equals("name", "John"), equals("name", "Jane"));
 * // returns "(name eq 'John' or name eq 'Jane')"
 *
 * // Example 2: Combining with not
 * or(not(equals("status", "completed")), equals("priority", "high"));
 * // returns "(not(status eq 'completed') or priority eq 'high')"
 *
 * // Example 3: Handling null/undefined conditions
 * or("name eq 'John'", null, "name eq 'Jane'");
 * // returns "(name eq 'John' or name eq 'Jane')"
 */
export function or(...conditions: (string | null | undefined)[]): string {
  const validConditions = conditions.filter(isNonEmptyString);
  if (validConditions.length === 0) return "";
  return `(${validConditions.join(" or ")})`;
}

/**
 * Negates an OData filter condition using the "not" operator.
 * Returns an empty string if the provided condition is null, undefined, or an empty string.
 *
 * @param condition The OData filter condition to negate.
 * @returns A string representing the negated condition, or an empty string if the condition is invalid.
 *
 * @example
 * // Example 1: Negating an equals condition
 * not(equals("name", "John")); // returns "not(name eq 'John')"
 *
 * // Example 2: Negating a combined condition
 * not(and(equals("age", 30), equals("city", "New York")));
 * // returns "not((age eq 30 and city eq 'New York'))"
 *
 * // Example 3: Handling empty condition
 * not("");            // returns ""
 */
export function not(condition: string): string {
  return isNonEmptyString(condition) ? `not(${condition})` : "";
}

/**
 * Creates an OData filter condition using the "contains" operator.
 * Checks if a string property contains a specified substring.
 *
 * @param name The name of the string property to check.
 * @param value The substring to search for.
 * @returns A string representing the "contains" filter condition.
 *
 * @example
 * contains("description", "software");
 * // returns "contains(description,'software')"
 *
 * // Example: Combining with equals
 * and(contains("description", "software"), equals("category", "application"));
 * // returns "contains(description,'software') and (category eq 'application')"
 */
export function contains(name: string, value: Primitive) {
  return `contains(${name},${wrapString(value)})`;
}

/**
 * Creates an OData filter condition using the "startswith" operator.
 * Checks if a string property starts with a specified substring.
 *
 * @param name The name of the string property to check.
 * @param value The substring to search for at the beginning of the property's value.
 * @returns A string representing the "startswith" filter condition.
 *
 * @example
 * startsWith("name", "A"); // returns "startswith(name,'A')"
 *
 * // Example: Combining with and
 * and(startsWith("name", "A"), lessThan("age", 20));
 * // returns "startswith(name,'A') and (age lt 20)"
 */
export function startsWith(name: string, value: Primitive) {
  return `startswith(${name},${wrapString(value)})`;
}

/**
 * Creates an OData filter condition using the "endswith" operator.
 * Checks if a string property ends with a specified substring.
 *
 * @param name The name of the string property to check.
 * @param value The substring to search for at the end of the property's value.
 * @returns A string representing the "endswith" filter condition.
 *
 * @example
 * endsWith("filename", ".txt"); // returns "endswith(filename,'.txt')"
 *
 * // Example: Combining with or
 * or(endsWith("filename", ".txt"), endsWith("filename", ".pdf"));
 * // returns "endswith(filename,'.txt') or endswith(filename,'.pdf')"
 */
export function endsWith(name: string, value: Primitive) {
  return `endswith(${name},${wrapString(value)})`;
}

/**
 * Creates an OData filter condition using the "eq" (equals) operator.
 * Checks if a property is equal to a specified value.
 *
 * @param name The name of the property to compare.
 * @param value The value to compare the property against.
 * @returns A string representing the "equals" filter condition.
 *
 * @example
 * equals("age", 30);       // returns "(age eq 30)"
 * equals("name", "John"); // returns "(name eq 'John')"
 *
 * // Example: Combining with and
 * and(equals("age", 30), equals("name", "John"));
 * // returns "(age eq 30) and (name eq 'John')"
 */
export function equals(name: string, value: Primitive) {
  return `(${name} eq ${wrapString(value)})`;
}

/**
 * Creates an OData filter condition using the "ne" (not equals) operator.
 * Checks if a property is not equal to a specified value.
 *
 * @param name The name of the property to compare.
 * @param value The value to compare the property against.
 * @returns A string representing the "not equals" filter condition.
 *
 * @example
 * notEquals("age", 30);       // returns "(age ne 30)"
 * notEquals("name", "John"); // returns "(name ne 'John')"
 *
 * // Example: Combining with or and not
 * or(notEquals("status", "completed"), not(equals("priority", "low")));
 * // returns "(status ne 'completed') or not(priority eq 'low')"
 */
export function notEquals(name: string, value: Primitive) {
  return `(${name} ne ${wrapString(value)})`;
}

/**
 * Creates an OData filter condition using the "gt" (greater than) operator.
 * Checks if a property is greater than a specified value.
 *
 * @param name The name of the property to compare.
 * @param value The value to compare the property against.
 * @returns A string representing the "greater than" filter condition.
 *
 * @example
 * greaterThan("price", 10.50); // returns "(price gt 10.50)"
 *
 * // Example: Combining with and
 * and(greaterThan("price", 10), lessThan("price", 20));
 * // returns "(price gt 10 and price lt 20)"
 */
export function greaterThan(name: string, value: Primitive) {
  return `(${name} gt ${wrapString(value)})`;
}

/**
 * Creates an OData filter condition using the "ge" (greater than or equal) operator.
 * Checks if a property is greater than or equal to a specified value.
 *
 * @param name The name of the property to compare.
 * @param value The value to compare the property against.
 * @returns A string representing the "greater than or equal" filter condition.
 *
 * @example
 * greaterThanOrEqual("quantity", 10); // returns "(quantity ge 10)"
 *
 * // Example: Combining with or
 * or(greaterThanOrEqual("quantity", 10), equals("quantity", 5));
 * // returns "(quantity ge 10) or (quantity eq 5)"
 */
export function greaterThanOrEqual(name: string, value: Primitive) {
  return `(${name} ge ${wrapString(value)})`;
}

/**
 * Creates an OData filter condition using the "lt" (less than) operator.
 * Checks if a property is less than a specified value.
 *
 * @param name The name of the property to compare.
 * @param value The value to compare the property against.
 * @returns A string representing the "less than" filter condition.
 *
 * @example
 * lessThan("temperature", 0); // returns "(temperature lt 0)"
 *
 * // Example: Combining with and
 * and(lessThan("temperature", 0), greaterThan("temperature", -10));
 * // returns "(temperature lt 0 and temperature gt -10)"
 */
export function lessThan(name: string, value: Primitive) {
  return `(${name} lt ${wrapString(value)})`;
}

/**
 * Creates an OData filter condition using the "le" (less than or equal) operator.
 * Checks if a property is less than or equal to a specified value.
 *
 * @param name The name of the property to compare.
 * @param value The value to compare the property against.
 * @returns A string representing the "less than or equal" filter condition.
 *
 * @example
 * lessThanOrEqual("rating", 5); // returns "(rating le 5)"
 *
 * // Example: Combining with or
 * or(lessThanOrEqual("rating", 5), equals("rating", 1));
 * // returns "(rating le 5) or (rating eq 1)"
 */
export function lessThanOrEqual(name: string, value: Primitive) {
  return `(${name} le ${wrapString(value)})`;
}


export function isActive(): string {
  return "statecode eq 0";
}

export function isInactive(): string {
  return "statecode eq 1";
}

export function isNull(name: string): string {
  return `${name} eq null`;
}

export function isNotNull(name: string): string {
  return `${name} ne null`;
}