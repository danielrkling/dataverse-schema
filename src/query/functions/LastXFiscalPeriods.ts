import { wrapString } from "../../util";
/**
 * Generates a query expression for the "LastXFiscalPeriods" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @param {number} value - The number of last fiscal periods.
 * @returns {string} The query expression for the "LastXFiscalPeriods" operator.
 */

export function LastXFiscalPeriods(name: string, value: number): string {
  return `Microsoft.Dynamics.CRM.LastXFiscalPeriods(PropertyName=${wrapString(name)},PropertyValue=${value})`;
}
