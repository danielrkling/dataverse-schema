import { wrapString } from "../../util";
/**
 * Generates a query expression for the "Next7Days" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @returns {string} The query expression for the "Next7Days" operator.
 */

export function Next7Days(name: string): string {
  return `Microsoft.Dynamics.CRM.Next7Days(PropertyName=${wrapString(name)})`;
}
