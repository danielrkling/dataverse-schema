/**
 * Generates a query expression for the "LastXDays" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @param {number} value - The number of last days.
 * @returns {string} The query expression for the "LastXDays" operator.
 */

export function LastXDays(name: string, value: number): string {
  return `Microsoft.Dynamics.CRM.LastXDays(PropertyName=${name},PropertyValue=${value})`;
}
