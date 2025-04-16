import { wrapString } from "../../util";

/**
 * Generates a query expression for the "OnOrBefore" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @param {string} value - The date value.
 * @returns {string} The query expression for the "OnOrBefore" operator.
 */

export function OnOrBefore(name: string, value: string): string {
  return `Microsoft.Dynamics.CRM.OnOrBefore(PropertyName=${name},PropertyValue=${wrapString(
    value
  )})`;
}
