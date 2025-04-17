import { wrapString } from "../../util";
/**
 * Generates a query expression for the "InOrBeforeFiscalPeriodAndYear" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @param {number} fiscalPeriod - The fiscal period value.
 * @param {number} fiscalYear - The fiscal year value.
 * @returns {string} The query expression for the "InOrBeforeFiscalPeriodAndYear" operator.
 */

export function InOrBeforeFiscalPeriodAndYear(
  name: string,
  fiscalPeriod: number,
  fiscalYear: number
): string {
  return `Microsoft.Dynamics.CRM.InOrBeforeFiscalPeriodAndYear(PropertyName=${wrapString(name)},PropertyValue1=${fiscalPeriod},PropertyValue2=${fiscalYear})`;
}
