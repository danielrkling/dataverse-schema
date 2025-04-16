/**
 * Generates a query expression for the "LastWeek" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @returns {string} The query expression for the "LastWeek" operator.
 */

export function LastWeek(name: string): string {
  return `Microsoft.Dynamics.CRM.LastWeek(PropertyName=${name})`;
}
