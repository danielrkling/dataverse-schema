import { wrapString } from "../../util";
/**
 * Generates a query expression for the "LastXWeeks" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @param {number} value - The number of last weeks.
 * @returns {string} The query expression for the "LastXWeeks" operator.
 */

export function LastXWeeks(name: string, value: number): string {
  return `Microsoft.Dynamics.CRM.LastXWeeks(PropertyName=${wrapString(name)},PropertyValue=${value})`;
}
