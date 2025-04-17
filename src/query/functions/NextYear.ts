import { wrapString } from "../../util";
/**
 * Generates a query expression for the "NextYear" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @returns {string} The query expression for the "NextYear" operator.
 */

export function NextYear(name: string): string {
  return `Microsoft.Dynamics.CRM.NextYear(PropertyName=${wrapString(name)})`;
}
