import { wrapString } from "../../util";
/**
 * Generates a query expression for the "ThisFiscalPeriod" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @returns {string} The query expression for the "ThisFiscalPeriod" operator.
 */

export function ThisFiscalPeriod(name: string): string {
  return `Microsoft.Dynamics.CRM.ThisFiscalPeriod(PropertyName=${wrapString(name)})`;
}
