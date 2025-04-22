import { wrapString } from "../../util";

/**
 * Generates a query expression for the "ContainsValues" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @param {...string[]} values - The list of values to check if they are contained.
 * @returns {string} The query expression for the "ContainsValues" operator.
 */

export function ContainsValues(name: string, ...values: string[]): string {
  return `Microsoft.Dynamics.CRM.ContainsValues(PropertyName=${wrapString(name)},PropertyValues=[${values.map(wrapString).join(",")}])`;
}
