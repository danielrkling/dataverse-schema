import { wrapString } from "../../util";

/**
 * Generates a query expression for the "OlderThanXYears" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @param {number} value - The number of years.
 * @returns {string} The query expression for the "OlderThanXYears" operator.
 */

export function OlderThanXYears(name: string, value: number): string {
  return `Microsoft.Dynamics.CRM.OlderThanXYears(PropertyName=${wrapString(name)},PropertyValue=${wrapString(
    value
  )})`;
}
