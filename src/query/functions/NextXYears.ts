/**
 * Generates a query expression for the "NextXYears" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @param {number} value - The number of next years.
 * @returns {string} The query expression for the "NextXYears" operator.
 */

export function NextXYears(name: string, value: number): string {
  return `Microsoft.Dynamics.CRM.NextXYears(PropertyName=${name},PropertyValue=${value})`;
}
