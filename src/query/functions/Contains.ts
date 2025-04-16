import { wrapString } from "../../util";

/**
 * Generates a query expression for the "Contains" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @param {string} value - The value to check if it contains.
 * @returns {string} The query expression for the "Contains" operator.
 */

export function Contains(name: string, value: string): string {
  return `Microsoft.Dynamics.CRM.Contains(PropertyName=${name},PropertyValue=${wrapString(value)})`;
}
