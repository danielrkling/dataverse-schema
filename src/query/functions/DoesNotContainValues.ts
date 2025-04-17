import { wrapString } from "../../util";

/**
 * Generates a query expression for the "DoesNotContainValues" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @param {...string[]} values - The list of values to check if they are not contained.
 * @returns {string} The query expression for the "DoesNotContainValues" operator.
 */

export function DoesNotContainValues(
  name: string,
  ...values: string[]
): string {
  return `Microsoft.Dynamics.CRM.DoesNotContainValues(PropertyName=${wrapString(name)},PropertyValues${values.map(wrapString).join(",")}])`;
}
