/**
 * Generates a query expression for the "Last7Days" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @returns {string} The query expression for the "Last7Days" operator.
 */

export function Last7Days(name: string): string {
  return `Microsoft.Dynamics.CRM.Last7Days(PropertyName=${name})`;
}
