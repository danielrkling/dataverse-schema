import { wrapString } from "../../util";
/**
 * Generates a query expression for the "InFiscalPeriodAndYear" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @param {number} fiscalPeriod - The fiscal period value.
 * @param {number} fiscalYear - The fiscal year value.
 * @returns {string} The query expression for the "InFiscalPeriodAndYear" operator.
 */

export function InFiscalPeriodAndYear(
  name: string,
  fiscalPeriod: number,
  fiscalYear: number
): string {
  return `Microsoft.Dynamics.CRM.InFiscalPeriodAndYear(PropertyName=${wrapString(name)},PropertyValue1=${fiscalPeriod},PropertyValue2=${fiscalYear})`;
}
