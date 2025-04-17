import { wrapString } from "../../util";
/**
 * Generates a query expression for the "InFiscalPeriod" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @param {number} value - The fiscal period value.
 * @returns {string} The query expression for the "InFiscalPeriod" operator.
 */

export function InFiscalPeriod(name: string, value: number): string {
  return `Microsoft.Dynamics.CRM.InFiscalPeriod(PropertyName=${wrapString(name)},PropertyValue=${value})`;
}
