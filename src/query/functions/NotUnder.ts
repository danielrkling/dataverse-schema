import { wrapString } from "../../util";

/**
 * Generates a query expression for the "NotUnder" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @param {string} value - The value to compare.
 * @returns {string} The query expression for the "NotUnder" operator.
 */

export function NotUnder(name: string, value: string): string {
  return `Microsoft.Dynamics.CRM.NotUnder(PropertyName=${name},PropertyValue=${wrapString(
    value
  )})`;
}
