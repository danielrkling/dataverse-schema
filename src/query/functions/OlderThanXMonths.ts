import { wrapString } from "../../util";

/**
 * Generates a query expression for the "OlderThanXMonths" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @param {number} value - The number of months.
 * @returns {string} The query expression for the "OlderThanXMonths" operator.
 */

export function OlderThanXMonths(name: string, value: number): string {
  return `Microsoft.Dynamics.CRM.OlderThanXMonths(PropertyName=${wrapString(name)},PropertyValue=${wrapString(
    value
  )})`;
}
