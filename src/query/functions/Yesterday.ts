/**
 * Generates a query expression for the "Yesterday" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @returns {string} The query expression for the "Yesterday" operator.
 */
export function Yesterday(name: string): string {
  return `Microsoft.Dynamics.CRM.Yesterday(PropertyName=${name})`;
}
