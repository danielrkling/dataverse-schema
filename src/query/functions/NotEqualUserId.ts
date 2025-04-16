/**
 * Generates a query expression for the "NotEqualUserId" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @returns {string} The query expression for the "NotEqualUserId" operator.
 */

export function NotEqualUserId(name: string): string {
  return `Microsoft.Dynamics.CRM.NotEqualUserId(PropertyName=${name})`;
}
