import { wrapString } from "../../util";

/**
 * Generates a query expression for the "NotIn" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @param {...string[]} values - The list of values to check if they are not in the set.
 * @returns {string} The query expression for the "NotIn" operator.
 */

export function NotIn(name: string, ...values: string[]): string {
  return `Microsoft.Dynamics.CRM.NotIn(PropertyName=${wrapString(name)},PropertyValues=[${values
    .map(wrapString)
    .join(",")}])`;
}
