import { wrapString } from "../../util";
/**
 * Generates a query expression for the "ThisMonth" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @returns {string} The query expression for the "ThisMonth" operator.
 */

export function ThisMonth(name: string): string {
  return `Microsoft.Dynamics.CRM.ThisMonth(PropertyName=${wrapString(name)})`;
}
