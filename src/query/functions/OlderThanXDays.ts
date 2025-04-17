import { wrapString } from "../../util";

/**
 * Generates a query expression for the "OlderThanXDays" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @param {number} value - The number of days.
 * @returns {string} The query expression for the "OlderThanXDays" operator.
 */

export function OlderThanXDays(name: string, value: number): string {
  return `Microsoft.Dynamics.CRM.OlderThanXDays(PropertyName=${wrapString(name)},PropertyValue=${wrapString(
    value
  )})`;
}
