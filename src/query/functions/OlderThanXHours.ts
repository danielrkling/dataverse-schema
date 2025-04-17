import { wrapString } from "../../util";

/**
 * Generates a query expression for the "OlderThanXHours" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @param {number} value - The number of hours.
 * @returns {string} The query expression for the "OlderThanXHours" operator.
 */

export function OlderThanXHours(name: string, value: number): string {
  return `Microsoft.Dynamics.CRM.OlderThanXHours(PropertyName=${wrapString(name)},PropertyValue=${wrapString(
    value
  )})`;
}
