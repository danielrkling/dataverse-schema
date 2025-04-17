import { wrapString } from "../../util";
/**
 * Generates a query expression for the "NotEqualBusinessId" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @returns {string} The query expression for the "NotEqualBusinessId" operator.
 */

export function NotEqualBusinessId(name: string): string {
  return `Microsoft.Dynamics.CRM.NotEqualBusinessId(PropertyName=${wrapString(name)})`;
}
