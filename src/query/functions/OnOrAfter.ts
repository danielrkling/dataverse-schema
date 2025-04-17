import { wrapString } from "../../util";

/**
 * Generates a query expression for the "OnOrAfter" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @param {string} value - The date value.
 * @returns {string} The query expression for the "OnOrAfter" operator.
 */

export function OnOrAfter(name: string, value: string): string {
  return `Microsoft.Dynamics.CRM.OnOrAfter(PropertyName=${wrapString(name)},PropertyValue=${wrapString(
    value
  )})`;
}
