import { wrapString } from "../../util";
/**
 * Generates a query expression for the "InOrAfterFiscalPeriodAndYear" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @param {number} fiscalPeriod - The fiscal period value.
 * @param {number} fiscalYear - The fiscal year value.
 * @returns {string} The query expression for the "InOrAfterFiscalPeriodAndYear" operator.
 */

export function InOrAfterFiscalPeriodAndYear(
  name: string,
  fiscalPeriod: number,
  fiscalYear: number
): string {
  return `Microsoft.Dynamics.CRM.InOrAfterFiscalPeriodAndYear(PropertyName=${wrapString(name)},PropertyValue1=${fiscalPeriod},PropertyValue2=${fiscalYear})`;
}
