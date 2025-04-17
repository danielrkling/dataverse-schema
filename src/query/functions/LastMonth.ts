import { wrapString } from "../../util";
/**
 * Generates a query expression for the "LastMonth" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @returns {string} The query expression for the "LastMonth" operator.
 */

export function LastMonth(name: string): string {
  return `Microsoft.Dynamics.CRM.LastMonth(PropertyName=${wrapString(name)})`;
}
