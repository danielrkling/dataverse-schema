import { wrapString } from "../../util";

/**
 * Generates a query expression for the "EqualBusinessId" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @returns {string} The query expression for the "EqualBusinessId" operator.
 */
export function EqualBusinessId(name: string): string {
  return `Microsoft.Dynamics.CRM.EqualBusinessId(PropertyName=${wrapString(name)})`;
}
