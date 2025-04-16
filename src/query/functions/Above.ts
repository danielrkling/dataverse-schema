import { wrapString } from "../../util";

/**
 * Generates a query expression for the "Above" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @param {string} value - The value to compare.
 * @returns {string} The query expression for the "Above" operator.
 */

export function Above(name: string, value: string): string {
  return `Microsoft.Dynamics.CRM.Above(PropertyName=${name},PropertyValue=${wrapString(value)})`;
}
