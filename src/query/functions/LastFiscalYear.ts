/**
 * Generates a query expression for the "LastFiscalYear" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @returns {string} The query expression for the "LastFiscalYear" operator.
 */

export function LastFiscalYear(name: string): string {
  return `Microsoft.Dynamics.CRM.LastFiscalYear(PropertyName=${name})`;
}
