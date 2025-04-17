import { wrapString } from "../../util";
/**
 * Generates a query expression for the "LastYear" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @returns {string} The query expression for the "LastYear" operator.
 */

export function LastYear(name: string): string {
  return `Microsoft.Dynamics.CRM.LastYear(PropertyName=${wrapString(name)})`;
}
