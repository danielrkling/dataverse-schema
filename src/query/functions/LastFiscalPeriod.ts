import { wrapString } from "../../util";
/**
 * Generates a query expression for the "LastFiscalPeriod" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @returns {string} The query expression for the "LastFiscalPeriod" operator.
 */

export function LastFiscalPeriod(name: string): string {
  return `Microsoft.Dynamics.CRM.LastFiscalPeriod(PropertyName=${wrapString(name)})`;
}
