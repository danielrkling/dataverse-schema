import { wrapString } from "../../util";
/**
 * Generates a query expression for the "Today" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @returns {string} The query expression for the "Today" operator.
 */

export function Today(name: string): string {
  return `Microsoft.Dynamics.CRM.Today(PropertyName=${wrapString(name)})`;
}
