/**
 * Generates a query expression for the "LastXMonths" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @param {number} value - The number of last months.
 * @returns {string} The query expression for the "LastXMonths" operator.
 */

export function LastXMonths(name: string, value: number): string {
  return `Microsoft.Dynamics.CRM.LastXMonths(PropertyName=${name},PropertyValue=${value})`;
}
