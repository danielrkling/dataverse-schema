import { getName, Name, wrapString } from "./util"

export const Above = (field: Name, value: string) =>
  `Microsoft.Dynamics.CRM.Above(PropertyName=${getName(field)},PropertyValue=${wrapString(value)})`
export const AboveOrEqual = (field: Name, value: string) =>
  `Microsoft.Dynamics.CRM.AboveOrEqual(PropertyName=${getName(field)},PropertyValue=${wrapString(value)})`
export const Between = (
  field: Name,
  value1: string | number,
  value2: string | number,
) =>
  `Microsoft.Dynamics.CRM.Between(PropertyName=${getName(field)},PropertyValues=[${wrapString(value1)},${wrapString(value2)}])`
export const ContainsValues = (field: Name, values: (string | number)[]) =>
  `Microsoft.Dynamics.CRM.ContainsValues(PropertyName=${getName(field)},PropertyValues=[${values.map(wrapString).join(",")}])`
export const DoesNotContainValues = (
  field: Name,
  values: (string | number)[],
) =>
  `Microsoft.Dynamics.CRM.DoesNotContainValues(PropertyName=${getName(field)},PropertyValues=[${values.map(wrapString).join(",")}])`
export const EqualBusinessId = (field: Name) =>
  `Microsoft.Dynamics.CRM.EqualBusinessId(PropertyName=${getName(field)})`
export const EqualUserId = (field: Name) =>
  `Microsoft.Dynamics.CRM.EqualUserId(PropertyName=${wrapString(getName(field))})`
export const EqualUserLanguage = (field: Name) =>
  `Microsoft.Dynamics.CRM.EqualUserLanguage(PropertyName=${getName(field)})`
export const EqualUserOrUserHierarchy = (field: Name) =>
  `Microsoft.Dynamics.CRM.EqualUserOrUserHierarchy(PropertyName=${getName(field)})`
export const EqualUserOrUserHierarchyAndTeams = (field: Name) =>
  `Microsoft.Dynamics.CRM.EqualUserOrUserHierarchyAndTeams(PropertyName=${getName(field)})`
export const EqualUserOrUserTeams = (field: Name) =>
  `Microsoft.Dynamics.CRM.EqualUserOrUserTeams(PropertyName=${getName(field)})`
export const In = (field: Name, values: (string | number)[]) =>
  `Microsoft.Dynamics.CRM.In(PropertyName=${getName(field)},PropertyValues=[${values.map(wrapString).join(",")}])`
export const InFiscalPeriod = (field: Name, value: number) =>
  `Microsoft.Dynamics.CRM.InFiscalPeriod(PropertyName=${getName(field)},PropertyValue=${value})`
export const InFiscalPeriodAndYear = (
  field: Name,
  fiscalPeriod: number,
  fiscalYear: number,
) =>
  `Microsoft.Dynamics.CRM.InFiscalPeriodAndYear(PropertyName=${getName(field)},PropertyValue1=${fiscalPeriod},PropertyValue2=${fiscalYear})`
export const InFiscalYear = (field: Name, value: number) =>
  `Microsoft.Dynamics.CRM.InFiscalYear(PropertyName=${getName(field)},PropertyValue=${value})`
export const InOrAfterFiscalPeriodAndYear = (
  field: Name,
  fiscalPeriod: number,
  fiscalYear: number,
) =>
  `Microsoft.Dynamics.CRM.InOrAfterFiscalPeriodAndYear(PropertyName=${getName(field)},PropertyValue1=${fiscalPeriod},PropertyValue2=${fiscalYear})`
export const InOrBeforeFiscalPeriodAndYear = (
  field: Name,
  fiscalPeriod: number,
  fiscalYear: number,
) =>
  `Microsoft.Dynamics.CRM.InOrBeforeFiscalPeriodAndYear(PropertyName=${getName(field)},PropertyValue1=${fiscalPeriod},PropertyValue2=${fiscalYear})`
export const Last7Days = (field: Name) =>
  `Microsoft.Dynamics.CRM.Last7Days(PropertyName=${getName(field)})`
export const LastFiscalPeriod = (field: Name) =>
  `Microsoft.Dynamics.CRM.LastFiscalPeriod(PropertyName=${getName(field)})`
export const LastFiscalYear = (field: Name) =>
  `Microsoft.Dynamics.CRM.LastFiscalYear(PropertyName=${getName(field)})`
export const LastMonth = (field: Name) =>
  `Microsoft.Dynamics.CRM.LastMonth(PropertyName=${getName(field)})`
export const LastWeek = (field: Name) =>
  `Microsoft.Dynamics.CRM.LastWeek(PropertyName=${getName(field)})`
export const LastXDays = (field: Name, value: number) =>
  `Microsoft.Dynamics.CRM.LastXDays(PropertyName=${getName(field)},PropertyValue=${value})`
export const LastXFiscalPeriods = (field: Name, value: number) =>
  `Microsoft.Dynamics.CRM.LastXFiscalPeriods(PropertyName=${getName(field)},PropertyValue=${value})`
export const LastXFiscalYears = (field: Name, value: number) =>
  `Microsoft.Dynamics.CRM.LastXFiscalYears(PropertyName=${getName(field)},PropertyValue=${value})`
export const LastXHours = (field: Name, value: number) =>
  `Microsoft.Dynamics.CRM.LastXHours(PropertyName=${getName(field)},PropertyValue=${value})`
export const LastXMonths = (field: Name, value: number) =>
  `Microsoft.Dynamics.CRM.LastXMonths(PropertyName=${getName(field)},PropertyValue=${value})`
export const LastXWeeks = (field: Name, value: number) =>
  `Microsoft.Dynamics.CRM.LastXWeeks(PropertyName=${getName(field)},PropertyValue=${value})`
export const LastXYears = (field: Name, value: number) =>
  `Microsoft.Dynamics.CRM.LastXYears(PropertyName=${getName(field)},PropertyValue=${value})`
export const LastYear = (field: Name) =>
  `Microsoft.Dynamics.CRM.LastYear(PropertyName=${getName(field)})`
export const Next7Days = (field: Name) =>
  `Microsoft.Dynamics.CRM.Next7Days(PropertyName=${getName(field)})`
export const NextFiscalPeriod = (field: Name) =>
  `Microsoft.Dynamics.CRM.NextFiscalPeriod(PropertyName=${getName(field)})`
export const NextFiscalYear = (field: Name) =>
  `Microsoft.Dynamics.CRM.NextFiscalYear(PropertyName=${getName(field)})`
export const NextMonth = (field: Name) =>
  `Microsoft.Dynamics.CRM.NextMonth(PropertyName=${getName(field)})`
export const NextWeek = (field: Name) =>
  `Microsoft.Dynamics.CRM.NextWeek(PropertyName=${getName(field)})`
export const NextXDays = (field: Name, value: number) =>
  `Microsoft.Dynamics.CRM.NextXDays(PropertyName=${getName(field)},PropertyValue=${value})`
export const NextXFiscalPeriods = (field: Name, value: number) =>
  `Microsoft.Dynamics.CRM.NextXFiscalPeriods(PropertyName=${getName(field)},PropertyValue=${value})`
export const NextXFiscalYears = (field: Name, value: number) =>
  `Microsoft.Dynamics.CRM.NextXFiscalYears(PropertyName=${getName(field)},PropertyValue=${value})`
export const NextXHours = (field: Name, value: number) =>
  `Microsoft.Dynamics.CRM.NextXHours(PropertyName=${getName(field)},PropertyValue=${value})`
export const NextXMonths = (field: Name, value: number) =>
  `Microsoft.Dynamics.CRM.NextXMonths(PropertyName=${getName(field)},PropertyValue=${value})`
export const NextXWeeks = (field: Name, value: number) =>
  `Microsoft.Dynamics.CRM.NextXWeeks(PropertyName=${getName(field)},PropertyValue=${value})`
export const NextXYears = (field: Name, value: number) =>
  `Microsoft.Dynamics.CRM.NextXYears(PropertyName=${getName(field)},PropertyValue=${value})`
export const NextYear = (field: Name) =>
  `Microsoft.Dynamics.CRM.NextYear(PropertyName=${getName(field)})`
export const NotBetween = (
  field: Name,
  value1: string | number,
  value2: string | number,
) =>
  `Microsoft.Dynamics.CRM.NotBetween(PropertyName=${getName(field)},PropertyValues=[${wrapString(value1)},${wrapString(value2)}])`
export const NotEqualBusinessId = (field: Name) =>
  `Microsoft.Dynamics.CRM.NotEqualBusinessId(PropertyName=${getName(field)})`
export const NotEqualUserId = (field: Name) =>
  `Microsoft.Dynamics.CRM.NotEqualUserId(PropertyName=${getName(field)})`
export const NotIn = (field: Name, values: (string | number)[]) =>
  `Microsoft.Dynamics.CRM.NotIn(PropertyName=${getName(field)},PropertyValues=[${values.map(wrapString).join(",")}])`
export const NotUnder = (field: Name, value: string) =>
  `Microsoft.Dynamics.CRM.NotUnder(PropertyName=${getName(field)},PropertyValue=${wrapString(value)})`
export const OlderThanXDays = (field: Name, value: number) =>
  `Microsoft.Dynamics.CRM.OlderThanXDays(PropertyName=${getName(field)},PropertyValue=${value})`
export const OlderThanXHours = (field: Name, value: number) =>
  `Microsoft.Dynamics.CRM.OlderThanXHours(PropertyName=${getName(field)},PropertyValue=${value})`
export const OlderThanXMinutes = (field: Name, value: number) =>
  `Microsoft.Dynamics.CRM.OlderThanXMinutes(PropertyName=${getName(field)},PropertyValue=${value})`
export const OlderThanXMonths = (field: Name, value: number) =>
  `Microsoft.Dynamics.CRM.OlderThanXMonths(PropertyName=${getName(field)},PropertyValue=${value})`
export const OlderThanXWeeks = (field: Name, value: number) =>
  `Microsoft.Dynamics.CRM.OlderThanXWeeks(PropertyName=${getName(field)},PropertyValue=${value})`
export const OlderThanXYears = (field: Name, value: number) =>
  `Microsoft.Dynamics.CRM.OlderThanXYears(PropertyName=${getName(field)},PropertyValue=${value})`
export const On = (field: Name, value: string) =>
  `Microsoft.Dynamics.CRM.On(PropertyName=${getName(field)},PropertyValue=${wrapString(value)})`
export const OnOrAfter = (field: Name, value: string) =>
  `Microsoft.Dynamics.CRM.OnOrAfter(PropertyName=${getName(field)},PropertyValue=${wrapString(value)})`
export const OnOrBefore = (field: Name, value: string) =>
  `Microsoft.Dynamics.CRM.OnOrBefore(PropertyName=${getName(field)},PropertyValue=${wrapString(value)})`
export const ThisFiscalPeriod = (field: Name) =>
  `Microsoft.Dynamics.CRM.ThisFiscalPeriod(PropertyName=${getName(field)})`
export const ThisFiscalYear = (field: Name) =>
  `Microsoft.Dynamics.CRM.ThisFiscalYear(PropertyName=${getName(field)})`
export const ThisMonth = (field: Name) =>
  `Microsoft.Dynamics.CRM.ThisMonth(PropertyName=${getName(field)})`
export const ThisWeek = (field: Name) =>
  `Microsoft.Dynamics.CRM.ThisWeek(PropertyName=${getName(field)})`
export const ThisYear = (field: Name) =>
  `Microsoft.Dynamics.CRM.ThisYear(PropertyName=${getName(field)})`
export const Today = (field: Name) =>
  `Microsoft.Dynamics.CRM.Today(PropertyName=${getName(field)})`
export const Tomorrow = (field: Name) =>
  `Microsoft.Dynamics.CRM.Tomorrow(PropertyName=${getName(field)})`
export const Under = (field: Name, value: string) =>
  `Microsoft.Dynamics.CRM.Under(PropertyName=${getName(field)},PropertyValue=${wrapString(value)})`
export const UnderOrEqual = (field: Name, value: string) =>
  `Microsoft.Dynamics.CRM.UnderOrEqual(PropertyName=${getName(field)},PropertyValue=${wrapString(value)})`
export const Yesterday = (field: Name) =>
  `Microsoft.Dynamics.CRM.Yesterday(PropertyName=${getName(field)})`
