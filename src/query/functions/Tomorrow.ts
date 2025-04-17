import { wrapString } from "../../util";
/**
 * Generates a query expression for the "Tomorrow" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @returns {string} The query expression for the "Tomorrow" operator.
 */

export function Tomorrow(name: string): string {
  return `Microsoft.Dynamics.CRM.Tomorrow(PropertyName=${wrapString(name)})`;
}
