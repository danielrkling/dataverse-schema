import { wrapString } from "../../util";
/**
 * Generates a query expression for the "NextFiscalPeriod" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @returns {string} The query expression for the "NextFiscalPeriod" operator.
 */

export function NextFiscalPeriod(name: string): string {
  return `Microsoft.Dynamics.CRM.NextFiscalPeriod(PropertyName=${wrapString(name)})`;
}
