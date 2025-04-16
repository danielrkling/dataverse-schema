/**
 * Generates a query expression for the "NextXFiscalPeriods" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @param {number} value - The number of next fiscal periods.
 * @returns {string} The query expression for the "NextXFiscalPeriods" operator.
 */

export function NextXFiscalPeriods(name: string, value: number): string {
  return `Microsoft.Dynamics.CRM.NextXFiscalPeriods(PropertyName=${name},PropertyValue=${value})`;
}
