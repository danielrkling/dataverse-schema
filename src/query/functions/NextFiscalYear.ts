import { wrapString } from "../../util";
/**
 * Generates a query expression for the "NextFiscalYear" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @returns {string} The query expression for the "NextFiscalYear" operator.
 */

export function NextFiscalYear(name: string): string {
  return `Microsoft.Dynamics.CRM.NextFiscalYear(PropertyName=${wrapString(name)})`;
}
