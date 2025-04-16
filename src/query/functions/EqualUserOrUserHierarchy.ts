/**
 * Generates a query expression for the "EqualUserOrUserHierarchy" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @returns {string} The query expression for the "EqualUserOrUserHierarchy" operator.
 */

export function EqualUserOrUserHierarchy(name: string): string {
  return `Microsoft.Dynamics.CRM.EqualUserOrUserHierarchy(PropertyName=${name})`;
}
