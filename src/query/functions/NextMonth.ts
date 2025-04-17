import { wrapString } from "../../util";
/**
 * Generates a query expression for the "NextMonth" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @returns {string} The query expression for the "NextMonth" operator.
 */

export function NextMonth(name: string): string {
  return `Microsoft.Dynamics.CRM.NextMonth(PropertyName=${wrapString(name)})`;
}
