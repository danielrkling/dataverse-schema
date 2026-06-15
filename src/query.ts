import { Name, getName } from "./util";

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

const rxGUID =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/i;
const rxDateOnly = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Wraps a value in single quotes for OData, unless it's a GUID or date.
 * Escapes existing single quotes.
 */
export function wrapString(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") {
    if (rxGUID.test(value) || rxDateOnly.test(value)) {
      return value;
    }
    // Escape single quotes for OData by doubling them
    return `'${value.replace(/'/g, "''")}'`;
  }
  return String(value);
}

export type ExpandValue =
  | string
  | {
      select?: (Name)[];
      expand?: ExpandObject;
      filter?: string;
      orderby?: { [key: string]: "asc" | "desc" };
    };

export interface ExpandObject {
  [key: string]: ExpandValue;
}

export interface QueryParams {
  select?: string;
  expand?: string;
  orderby?: string;
  filter?: string;
  top?: number;
  apply?: string;
}

/**
 * Constructs a full OData query string from a structured object.
 * @example query({ select: ['name'], filter: equals('statecode', 0) })
 */
export function query(queryObj: QueryParams): string {
  const params = new URLSearchParams();
  if (queryObj.select) params.set("$select", queryObj.select);
  if (queryObj.expand) params.set("$expand", queryObj.expand);
  if (queryObj.orderby) params.set("$orderby", queryObj.orderby);
  if (queryObj.filter) params.set("$filter", queryObj.filter);
  if (queryObj.top) params.set("$top", queryObj.top.toFixed(0));
  if (queryObj.apply) params.set("$apply", queryObj.apply);
  return params.toString();
}

export function fetchXML(xml: string) {
  return `fetchXml=${xml.trim().replace(/>\s+</g, "><")}`;
}

/** Formats a comma-separated list of fields for a $select query. */
export function select(...values: (Name)[]): string {
  return values.map(getName).filter(isNonEmptyString).join(",");
}

/** Formats a comma-separated list of fields for an $orderby query. */
export function orderby(values: { [key: string]: "asc" | "desc" } | string[]): string {
  if (Array.isArray(values)) return values.filter(isNonEmptyString).join(",")
  return Object.entries(values)
    .filter(([, v]) => isNonEmptyString(v))
    .map(([k, v]) => `${k} ${v}`)
    .join(",");
}

export function asc(name: Name){
  return `${getName(name)} asc`
}

export function desc(name: Name){
  return `${getName(name)} desc`
}

/** Formats an object of key-value pairs for alternate key operations. */
export function keys(keyValues: { [key: string]: string | number }): string {
  return Object.entries(keyValues)
    .filter(([, v]) => isNonEmptyString(String(v)))
    .map(([k, v]) => `${k}=${wrapString(v)}`)
    .join(",");
}

/** Formats a $expand query, including nested selects and expands. */
export function expand(values: string | ExpandObject): string {
  if (typeof values === "string") return values;
  return Object.entries(values)
    .map(([name, v]) => {
      if (typeof v === "string") return v; // Already formatted
      const expandParts = [] as string[];
      if (v.select)
        expandParts.push(
          `$select=${select(...(Array.isArray(v.select) ? v.select : [v.select]))}`,
        );
      if (v.filter) expandParts.push(`$filter=${v.filter}`);
      if (v.orderby) expandParts.push(`$orderby=${orderby(v.orderby)}`);
      if (v.expand) expandParts.push(`$expand=${expand(v.expand)}`);
      return `${name}(${expandParts.join(";")})`;
    })
    .join(",");
}

export function and(...conditions: string[]): string {
  const valid = conditions.filter(isNonEmptyString);
  return valid.length === 0 ? "" : `(${valid.join(" and ")})`;
}

export function or(...conditions: string[]): string {
  const valid = conditions.filter(isNonEmptyString);
  return valid.length === 0 ? "" : `(${valid.join(" or ")})`;
}

export function not(condition: string): string {
  return isNonEmptyString(condition) ? `not(${condition})` : "";
}

export function contains(field: Name, value: string): string {
  return `contains(${getName(field)},${wrapString(value)})`;
}

export function startsWith(field: Name, value: string): string {
  return `startswith(${getName(field)},${wrapString(value)})`;
}

export function endsWith(field: Name, value: string): string {
  return `endswith(${getName(field)},${wrapString(value)})`;
}

export function equals(
  field: Name,
  value: string | number | boolean | null,
): string {
  return `(${getName(field)} eq ${wrapString(value)})`;
}

export function notEquals(
  field: Name,
  value: string | number | boolean | null,
): string {
  return `(${getName(field)} ne ${wrapString(value)})`;
}

export function greaterThan(field: Name, value: string | number): string {
  return `(${getName(field)} gt ${wrapString(value)})`;
}

export function greaterThanOrEqual(
  field: Name,
  value: string | number,
): string {
  return `(${getName(field)} ge ${wrapString(value)})`;
}

export function lessThan(field: Name, value: string | number): string {
  return `(${getName(field)} lt ${wrapString(value)})`;
}

export function lessThanOrEqual(
  field: Name,
  value: string | number,
): string {
  return `(${getName(field)} le ${wrapString(value)})`;
}

export function isActive(): string {
  return "statecode eq 0";
}

export function isInactive(): string {
  return "statecode eq 1";
}

export function isNull(field: Name): string {
  return `${getName(field)} eq null`;
}

export function isNotNull(field: Name): string {
  return `${getName(field)} ne null`;
}

export function groupby(values: Name[], aggregations?: string): string {
  return `groupby((${values.map(getName).filter(isNonEmptyString).join(",")})${aggregations ? "," + aggregations : ""})`;
}

export function aggregate(...values: string[]): string {
  return `aggregate(${values.filter(isNonEmptyString).join(",")})`;
}

export function average(field: Name, alias?: string): string {
  const name = getName(field);
  return `${name} with average as ${alias ?? name}`;
}

export function sum(field: Name, alias?: string): string {
  const name = getName(field);
  return `${name} with sum as ${alias ?? name}`;
}

export function min(field: Name, alias?: string): string {
  const name = getName(field);
  return `${name} with min as ${alias ?? name}`;
}

export function max(field: Name, alias?: string): string {
  const name = getName(field);
  return `${name} with max as ${alias ?? name}`;
}

export function count(alias = "count"): string {
  return `$count as ${alias}`;
}

export const Above = (field: Name, value: string) =>
  `Microsoft.Dynamics.CRM.Above(PropertyName=${getName(field)},PropertyValue=${wrapString(value)})`;
export const AboveOrEqual = (field: Name, value: string) =>
  `Microsoft.Dynamics.CRM.AboveOrEqual(PropertyName=${getName(field)},PropertyValue=${wrapString(value)})`;
export const Between = (
  field: Name,
  value1: string | number,
  value2: string | number,
) =>
  `Microsoft.Dynamics.CRM.Between(PropertyName=${getName(field)},PropertyValues=[${wrapString(value1)},${wrapString(value2)}])`;
export const ContainsValues = (field: Name, values: (string | number)[]) =>
  `Microsoft.Dynamics.CRM.ContainsValues(PropertyName=${getName(field)},PropertyValues=[${values.map(wrapString).join(",")}])`;
export const DoesNotContainValues = (
  field: Name,
  values: (string | number)[],
) =>
  `Microsoft.Dynamics.CRM.DoesNotContainValues(PropertyName=${getName(field)},PropertyValues=[${values.map(wrapString).join(",")}])`;
export const EqualBusinessId = (field: Name) =>
  `Microsoft.Dynamics.CRM.EqualBusinessId(PropertyName=${getName(field)})`;
export const EqualUserId = (field: Name) =>
  `Microsoft.Dynamics.CRM.EqualUserId(PropertyName=${wrapString(getName(field))})`;
export const EqualUserLanguage = (field: Name) =>
  `Microsoft.Dynamics.CRM.EqualUserLanguage(PropertyName=${getName(field)})`;
export const EqualUserOrUserHierarchy = (field: Name) =>
  `Microsoft.Dynamics.CRM.EqualUserOrUserHierarchy(PropertyName=${getName(field)})`;
export const EqualUserOrUserHierarchyAndTeams = (field: Name) =>
  `Microsoft.Dynamics.CRM.EqualUserOrUserHierarchyAndTeams(PropertyName=${getName(field)})`;
export const EqualUserOrUserTeams = (field: Name) =>
  `Microsoft.Dynamics.CRM.EqualUserOrUserTeams(PropertyName=${getName(field)})`;
export const In = (field: Name, values: (string | number)[]) =>
  `Microsoft.Dynamics.CRM.In(PropertyName=${getName(field)},PropertyValues=[${values.map(wrapString).join(",")}])`;
export const InFiscalPeriod = (field: Name, value: number) =>
  `Microsoft.Dynamics.CRM.InFiscalPeriod(PropertyName=${getName(field)},PropertyValue=${value})`;
export const InFiscalPeriodAndYear = (
  field: Name,
  fiscalPeriod: number,
  fiscalYear: number,
) =>
  `Microsoft.Dynamics.CRM.InFiscalPeriodAndYear(PropertyName=${getName(field)},PropertyValue1=${fiscalPeriod},PropertyValue2=${fiscalYear})`;
export const InFiscalYear = (field: Name, value: number) =>
  `Microsoft.Dynamics.CRM.InFiscalYear(PropertyName=${getName(field)},PropertyValue=${value})`;
export const InOrAfterFiscalPeriodAndYear = (
  field: Name,
  fiscalPeriod: number,
  fiscalYear: number,
) =>
  `Microsoft.Dynamics.CRM.InOrAfterFiscalPeriodAndYear(PropertyName=${getName(field)},PropertyValue1=${fiscalPeriod},PropertyValue2=${fiscalYear})`;
export const InOrBeforeFiscalPeriodAndYear = (
  field: Name,
  fiscalPeriod: number,
  fiscalYear: number,
) =>
  `Microsoft.Dynamics.CRM.InOrBeforeFiscalPeriodAndYear(PropertyName=${getName(field)},PropertyValue1=${fiscalPeriod},PropertyValue2=${fiscalYear})`;
export const Last7Days = (field: Name) =>
  `Microsoft.Dynamics.CRM.Last7Days(PropertyName=${getName(field)})`;
export const LastFiscalPeriod = (field: Name) =>
  `Microsoft.Dynamics.CRM.LastFiscalPeriod(PropertyName=${getName(field)})`;
export const LastFiscalYear = (field: Name) =>
  `Microsoft.Dynamics.CRM.LastFiscalYear(PropertyName=${getName(field)})`;
export const LastMonth = (field: Name) =>
  `Microsoft.Dynamics.CRM.LastMonth(PropertyName=${getName(field)})`;
export const LastWeek = (field: Name) =>
  `Microsoft.Dynamics.CRM.LastWeek(PropertyName=${getName(field)})`;
export const LastXDays = (field: Name, value: number) =>
  `Microsoft.Dynamics.CRM.LastXDays(PropertyName=${getName(field)},PropertyValue=${value})`;
export const LastXFiscalPeriods = (field: Name, value: number) =>
  `Microsoft.Dynamics.CRM.LastXFiscalPeriods(PropertyName=${getName(field)},PropertyValue=${value})`;
export const LastXFiscalYears = (field: Name, value: number) =>
  `Microsoft.Dynamics.CRM.LastXFiscalYears(PropertyName=${getName(field)},PropertyValue=${value})`;
export const LastXHours = (field: Name, value: number) =>
  `Microsoft.Dynamics.CRM.LastXHours(PropertyName=${getName(field)},PropertyValue=${value})`;
export const LastXMonths = (field: Name, value: number) =>
  `Microsoft.Dynamics.CRM.LastXMonths(PropertyName=${getName(field)},PropertyValue=${value})`;
export const LastXWeeks = (field: Name, value: number) =>
  `Microsoft.Dynamics.CRM.LastXWeeks(PropertyName=${getName(field)},PropertyValue=${value})`;
export const LastXYears = (field: Name, value: number) =>
  `Microsoft.Dynamics.CRM.LastXYears(PropertyName=${getName(field)},PropertyValue=${value})`;
export const LastYear = (field: Name) =>
  `Microsoft.Dynamics.CRM.LastYear(PropertyName=${getName(field)})`;
export const Next7Days = (field: Name) =>
  `Microsoft.Dynamics.CRM.Next7Days(PropertyName=${getName(field)})`;
export const NextFiscalPeriod = (field: Name) =>
  `Microsoft.Dynamics.CRM.NextFiscalPeriod(PropertyName=${getName(field)})`;
export const NextFiscalYear = (field: Name) =>
  `Microsoft.Dynamics.CRM.NextFiscalYear(PropertyName=${getName(field)})`;
export const NextMonth = (field: Name) =>
  `Microsoft.Dynamics.CRM.NextMonth(PropertyName=${getName(field)})`;
export const NextWeek = (field: Name) =>
  `Microsoft.Dynamics.CRM.NextWeek(PropertyName=${getName(field)})`;
export const NextXDays = (field: Name, value: number) =>
  `Microsoft.Dynamics.CRM.NextXDays(PropertyName=${getName(field)},PropertyValue=${value})`;
export const NextXFiscalPeriods = (field: Name, value: number) =>
  `Microsoft.Dynamics.CRM.NextXFiscalPeriods(PropertyName=${getName(field)},PropertyValue=${value})`;
export const NextXFiscalYears = (field: Name, value: number) =>
  `Microsoft.Dynamics.CRM.NextXFiscalYears(PropertyName=${getName(field)},PropertyValue=${value})`;
export const NextXHours = (field: Name, value: number) =>
  `Microsoft.Dynamics.CRM.NextXHours(PropertyName=${getName(field)},PropertyValue=${value})`;
export const NextXMonths = (field: Name, value: number) =>
  `Microsoft.Dynamics.CRM.NextXMonths(PropertyName=${getName(field)},PropertyValue=${value})`;
export const NextXWeeks = (field: Name, value: number) =>
  `Microsoft.Dynamics.CRM.NextXWeeks(PropertyName=${getName(field)},PropertyValue=${value})`;
export const NextXYears = (field: Name, value: number) =>
  `Microsoft.Dynamics.CRM.NextXYears(PropertyName=${getName(field)},PropertyValue=${value})`;
export const NextYear = (field: Name) =>
  `Microsoft.Dynamics.CRM.NextYear(PropertyName=${getName(field)})`;
export const NotBetween = (
  field: Name,
  value1: string | number,
  value2: string | number,
) =>
  `Microsoft.Dynamics.CRM.NotBetween(PropertyName=${getName(field)},PropertyValues=[${wrapString(value1)},${wrapString(value2)}])`;
export const NotEqualBusinessId = (field: Name) =>
  `Microsoft.Dynamics.CRM.NotEqualBusinessId(PropertyName=${getName(field)})`;
export const NotEqualUserId = (field: Name) =>
  `Microsoft.Dynamics.CRM.NotEqualUserId(PropertyName=${getName(field)})`;
export const NotIn = (field: Name, values: (string | number)[]) =>
  `Microsoft.Dynamics.CRM.NotIn(PropertyName=${getName(field)},PropertyValues=[${values.map(wrapString).join(",")}])`;
export const NotUnder = (field: Name, value: string) =>
  `Microsoft.Dynamics.CRM.NotUnder(PropertyName=${getName(field)},PropertyValue=${wrapString(value)})`;
export const OlderThanXDays = (field: Name, value: number) =>
  `Microsoft.Dynamics.CRM.OlderThanXDays(PropertyName=${getName(field)},PropertyValue=${value})`;
export const OlderThanXHours = (field: Name, value: number) =>
  `Microsoft.Dynamics.CRM.OlderThanXHours(PropertyName=${getName(field)},PropertyValue=${value})`;
export const OlderThanXMinutes = (field: Name, value: number) =>
  `Microsoft.Dynamics.CRM.OlderThanXMinutes(PropertyName=${getName(field)},PropertyValue=${value})`;
export const OlderThanXMonths = (field: Name, value: number) =>
  `Microsoft.Dynamics.CRM.OlderThanXMonths(PropertyName=${getName(field)},PropertyValue=${value})`;
export const OlderThanXWeeks = (field: Name, value: number) =>
  `Microsoft.Dynamics.CRM.OlderThanXWeeks(PropertyName=${getName(field)},PropertyValue=${value})`;
export const OlderThanXYears = (field: Name, value: number) =>
  `Microsoft.Dynamics.CRM.OlderThanXYears(PropertyName=${getName(field)},PropertyValue=${value})`;
export const On = (field: Name, value: string) =>
  `Microsoft.Dynamics.CRM.On(PropertyName=${getName(field)},PropertyValue=${wrapString(value)})`;
export const OnOrAfter = (field: Name, value: string) =>
  `Microsoft.Dynamics.CRM.OnOrAfter(PropertyName=${getName(field)},PropertyValue=${wrapString(value)})`;
export const OnOrBefore = (field: Name, value: string) =>
  `Microsoft.Dynamics.CRM.OnOrBefore(PropertyName=${getName(field)},PropertyValue=${wrapString(value)})`;
export const ThisFiscalPeriod = (field: Name) =>
  `Microsoft.Dynamics.CRM.ThisFiscalPeriod(PropertyName=${getName(field)})`;
export const ThisFiscalYear = (field: Name) =>
  `Microsoft.Dynamics.CRM.ThisFiscalYear(PropertyName=${getName(field)})`;
export const ThisMonth = (field: Name) =>
  `Microsoft.Dynamics.CRM.ThisMonth(PropertyName=${getName(field)})`;
export const ThisWeek = (field: Name) =>
  `Microsoft.Dynamics.CRM.ThisWeek(PropertyName=${getName(field)})`;
export const ThisYear = (field: Name) =>
  `Microsoft.Dynamics.CRM.ThisYear(PropertyName=${getName(field)})`;
export const Today = (field: Name) =>
  `Microsoft.Dynamics.CRM.Today(PropertyName=${getName(field)})`;
export const Tomorrow = (field: Name) =>
  `Microsoft.Dynamics.CRM.Tomorrow(PropertyName=${getName(field)})`;
export const Under = (field: Name, value: string) =>
  `Microsoft.Dynamics.CRM.Under(PropertyName=${getName(field)},PropertyValue=${wrapString(value)})`;
export const UnderOrEqual = (field: Name, value: string) =>
  `Microsoft.Dynamics.CRM.UnderOrEqual(PropertyName=${getName(field)},PropertyValue=${wrapString(value)})`;
export const Yesterday = (field: Name) =>
  `Microsoft.Dynamics.CRM.Yesterday(PropertyName=${getName(field)})`;
