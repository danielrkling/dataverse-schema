/**
 * Generates a query expression for the "LastXFiscalYears" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @param {number} value - The number of last fiscal years.
 * @returns {string} The query expression for the "LastXFiscalYears" operator.
 */

export function LastXFiscalYears(name: string, value: number): string {
  return `Microsoft.Dynamics.CRM.LastXFiscalYears(PropertyName=${name},PropertyValue=${value})`;
}
