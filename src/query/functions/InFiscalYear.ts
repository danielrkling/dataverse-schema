import { wrapString } from "../../util";
/**
 * Generates a query expression for the "InFiscalYear" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @param {number} value - The fiscal year value.
 * @returns {string} The query expression for the "InFiscalYear" operator.
 */

export function InFiscalYear(name: string, value: number): string {
  return `Microsoft.Dynamics.CRM.InFiscalYear(PropertyName=${wrapString(name)},PropertyValue=${value})`;
}
