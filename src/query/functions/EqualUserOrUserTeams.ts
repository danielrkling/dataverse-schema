/**
 * Generates a query expression for the "EqualUserOrUserTeams" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @returns {string} The query expression for the "EqualUserOrUserTeams" operator.
 */

export function EqualUserOrUserTeams(name: string): string {
  return `Microsoft.Dynamics.CRM.EqualUserOrUserTeams(PropertyName=${name})`;
}
