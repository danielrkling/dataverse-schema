import { wrapString } from "../../util";
/**
 * Generates a query expression for the "NextXWeeks" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @param {number} value - The number of next weeks.
 * @returns {string} The query expression for the "NextXWeeks" operator.
 */

export function NextXWeeks(name: string, value: number): string {
  return `Microsoft.Dynamics.CRM.NextXWeeks(PropertyName=${wrapString(name)},PropertyValue=${value})`;
}
