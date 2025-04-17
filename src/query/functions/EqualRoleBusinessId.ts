import { wrapString } from "../../util"

/**
 * Generates a query expression for the "EqualRoleBusinessId" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @returns {string} The query expression for the "EqualRoleBusinessId" operator.
 */
export function EqualRoleBusinessId(name: string): string {
  return `Microsoft.Dynamics.CRM.EqualRoleBusinessId(PropertyName=${wrapString(name)})`;
}
