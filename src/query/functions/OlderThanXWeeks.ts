import { wrapString } from "../../util";

/**
 * Generates a query expression for the "OlderThanXWeeks" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @param {number} value - The number of weeks.
 * @returns {string} The query expression for the "OlderThanXWeeks" operator.
 */

export function OlderThanXWeeks(name: string, value: number): string {
  return `Microsoft.Dynamics.CRM.OlderThanXWeeks(PropertyName=${name},PropertyValue=${wrapString(
    value
  )})`;
}
