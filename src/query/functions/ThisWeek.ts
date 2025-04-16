/**
 * Generates a query expression for the "ThisWeek" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @returns {string} The query expression for the "ThisWeek" operator.
 */

export function ThisWeek(name: string): string {
  return `Microsoft.Dynamics.CRM.ThisWeek(PropertyName=${name})`;
}
