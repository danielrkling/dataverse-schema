import { wrapString } from "../../util";

/**
 * Generates a query expression for the "OlderThanXMinutes" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @param {number} value - The number of minutes.
 * @returns {string} The query expression for the "OlderThanXMinutes" operator.
 */

export function OlderThanXMinutes(name: string, value: number): string {
  return `Microsoft.Dynamics.CRM.OlderThanXMinutes(PropertyName=${wrapString(name)},PropertyValue=${wrapString(
    value
  )})`;
}
