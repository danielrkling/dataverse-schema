/**
 * Generates a query expression for the "NextXMonths" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @param {number} value - The number of next months.
 * @returns {string} The query expression for the "NextXMonths" operator.
 */

export function NextXMonths(name: string, value: number): string {
  return `Microsoft.Dynamics.CRM.NextXMonths(PropertyName=${name},PropertyValue=${value})`;
}
