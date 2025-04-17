import { wrapString } from "../../util";
/**
 * Generates a query expression for the "NextWeek" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @returns {string} The query expression for the "NextWeek" operator.
 */

export function NextWeek(name: string): string {
  return `Microsoft.Dynamics.CRM.NextWeek(PropertyName=${wrapString(name)})`;
}
