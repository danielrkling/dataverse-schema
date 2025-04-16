/**
 * Generates a query expression for the "LastXHours" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @param {number} value - The number of last hours.
 * @returns {string} The query expression for the "LastXHours" operator.
 */

export function LastXHours(name: string, value: number): string {
  return `Microsoft.Dynamics.CRM.LastXHours(PropertyName=${name},PropertyValue=${value})`;
}
