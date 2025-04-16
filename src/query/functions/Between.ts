import { wrapString } from "../../util";

/**
 * Generates a query expression for the "Between" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @param {string} value1 - The first value to compare.
 * @param {string} value2 - The second value to compare.
 * @returns {string} The query expression for the "Between" operator.
 */

export function Between(name: string, value1: string, value2: string): string {
  return `Microsoft.Dynamics.CRM.Between(PropertyName=${name},PropertyValues${wrapString(value1)},${wrapString(
    value2
  )}])`;
}
