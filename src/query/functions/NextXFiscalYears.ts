/**
 * Generates a query expression for the "NextXFiscalYears" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @param {number} value - The number of next fiscal years.
 * @returns {string} The query expression for the "NextXFiscalYears" operator.
 */

export function NextXFiscalYears(name: string, value: number): string {
  return `Microsoft.Dynamics.CRM.NextXFiscalYears(PropertyName=${name},PropertyValue=${value})`;
}
