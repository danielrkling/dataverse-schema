import { wrapString } from "../../util";
/**
 * Generates a query expression for the "ThisYear" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @returns {string} The query expression for the "ThisYear" operator.
 */

export function ThisYear(name: string): string {
  return `Microsoft.Dynamics.CRM.ThisYear(PropertyName=${wrapString(name)})`;
}
