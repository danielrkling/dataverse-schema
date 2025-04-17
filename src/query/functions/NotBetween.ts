import { wrapString } from "../../util";

/**
 * Generates a query expression for the "NotBetween" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @param {string} value1 - The first value to compare.
 * @param {string} value2 - The second value to compare.
 * @returns {string} The query expression for the "NotBetween" operator.
 */

export function NotBetween(
  name: string,
  value1: string,
  value2: string
): string {
  return `Microsoft.Dynamics.CRM.NotBetween(PropertyName=${wrapString(name)},PropertyValues=[${wrapString(
    value1
  )},${wrapString(value2)}])`;
}
