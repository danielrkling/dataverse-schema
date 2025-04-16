/**
 * Generates a query expression for the "ThisFiscalYear" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @returns {string} The query expression for the "ThisFiscalYear" operator.
 */

export function ThisFiscalYear(name: string): string {
  return `Microsoft.Dynamics.CRM.ThisFiscalYear(PropertyName=${name})`;
}
