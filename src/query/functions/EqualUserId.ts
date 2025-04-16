/**
 * Generates a query expression for the "EqualUserId" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @returns {string} The query expression for the "EqualUserId" operator.
 */

export function EqualUserId(name: string): string {
  return `Microsoft.Dynamics.CRM.EqualUserId(PropertyName=${name})`;
}
