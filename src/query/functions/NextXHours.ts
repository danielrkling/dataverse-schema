import { wrapString } from "../../util";
/**
 * Generates a query expression for the "NextXHours" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @param {number} value - The number of next hours.
 * @returns {string} The query expression for the "NextXHours" operator.
 */

export function NextXHours(name: string, value: number): string {
  return `Microsoft.Dynamics.CRM.NextXHours(PropertyName=${wrapString(name)},PropertyValue=${value})`;
}
