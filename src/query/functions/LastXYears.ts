import { wrapString } from "../../util";
/**
 * Generates a query expression for the "LastXYears" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @param {number} value - The number of last years.
 * @returns {string} The query expression for the "LastXYears" operator.
 */

export function LastXYears(name: string, value: number): string {
  return `Microsoft.Dynamics.CRM.LastXYears(PropertyName=${wrapString(name)},PropertyValue=${value})`;
}
