import { wrapString } from "../../util";

/**
 * Generates a query expression for the "AboveOrEqual" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @param {string} value - The value to compare.
 * @returns {string} The query expression for the "AboveOrEqual" operator.
 */

export function AboveOrEqual(name: string, value: string): string {
  return `Microsoft.Dynamics.CRM.AboveOrEqual(PropertyName=${wrapString(name)},PropertyValue=${wrapString(value)})`;
}


