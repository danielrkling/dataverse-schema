import { wrapString } from "../../util";
/**
 * Generates a query expression for the "NextXDays" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @param {number} value - The number of next days.
 * @returns {string} The query expression for the "NextXDays" operator.
 */

export function NextXDays(name: string, value: number): string {
  return `Microsoft.Dynamics.CRM.NextXDays(PropertyName=${wrapString(name)},PropertyValue=${value})`;
}
