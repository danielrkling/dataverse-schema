import { wrapString } from "../../util";

/**
 * Generates a query expression for the "In" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @param {...string[]} values - The list of values to check if they are in the set.
 * @returns {string} The query expression for the "In" operator.
 */

export function In(name: string, ...values: string[]): string {
  return `Microsoft.Dynamics.CRM.In(PropertyName=${name},PropertyValues${values.map(wrapString).join(",")}])`;
}
