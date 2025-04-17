import { wrapString } from "../../util";
/**
 * Generates a query expression for the "EqualUserOrUserHierarchyAndTeams" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @returns {string} The query expression for the "EqualUserOrUserHierarchyAndTeams" operator.
 */

export function EqualUserOrUserHierarchyAndTeams(name: string): string {
  return `Microsoft.Dynamics.CRM.EqualUserOrUserHierarchyAndTeams(PropertyName=${wrapString(name)})`;
}
