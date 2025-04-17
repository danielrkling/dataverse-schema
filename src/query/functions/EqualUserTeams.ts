import { wrapString } from "../../util";
/**
 * Generates a query expression for the "EqualUserTeams" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @returns {string} The query expression for the "EqualUserTeams" operator.
 */

export function EqualUserTeams(name: string): string {
  return `Microsoft.Dynamics.CRM.EqualUserTeams(PropertyName=${wrapString(name)})`;
}
