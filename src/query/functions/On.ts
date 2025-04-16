import { wrapString } from "../../util";

/**
 * Generates a query expression for the "On" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @param {string} value - The date value.
 * @returns {string} The query expression for the "On" operator.
 */

export function On(name: string, value: string): string {
  return `Microsoft.Dynamics.CRM.On(PropertyName=${name},PropertyValue=${wrapString(
    value
  )})`;
}
