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
 *
 * @example
 * wrapString("hello")     // "'hello'"
 * wrapString("it's")      // "'it''s'"
 * wrapString("123e4567-e89b-12d3-a456-426614174000")  // "123e4567-e89b-12d3-a456-426614174000"
 * wrapString("2025-01-01") // "2025-01-01"
 * wrapString(null)        // "null"
 * wrapString(42)          // "42"
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
 *
 * @example
 * query({ select: ['name'], filter: equals('statecode', 0) })
 * // "$select=name&$filter=(statecode%20eq%200)"
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

/**
 * Wraps a raw FetchXML string into the format expected by the Dataverse API.
 * Trims whitespace and compresses tag gaps.
 *
 * @example
 * fetchXML("<fetch version='1.0'><entity name='contact'>...</entity></fetch>")
 * // "fetchXml=<fetch version='1.0'><entity name='contact'>...</entity></fetch>"
 */
export function fetchXML(xml: string) {
  return `fetchXml=${xml.trim().replace(/>\s+</g, "><")}`;
}

/**
 * Formats a comma-separated list of fields for a `$select` query.
 *
 * @example
 * select("name", "email", "telephone1")
 * // "name,email,telephone1"
 */
export function select(...values: (Name)[]): string {
  return values.map(getName).filter(isNonEmptyString).join(",");
}

/**
 * Formats a comma-separated list of fields for a `$orderby` query.
 *
 * @example
 * orderby({ name: "asc", createdon: "desc" })
 * // "name asc,createdon desc"
 *
 * @example
 * orderby(["name asc", "createdon desc"])
 * // "name asc,createdon desc"
 */
export function orderby(values: { [key: string]: "asc" | "desc" } | string[]): string {
  if (Array.isArray(values)) return values.filter(isNonEmptyString).join(",")
  return Object.entries(values)
    .filter(([, v]) => isNonEmptyString(v))
    .map(([k, v]) => `${k} ${v}`)
    .join(",");
}

/**
 * Represents an ordered list of fields in a given direction.
 * Created by the `asc()` and `desc()` helpers.
 */
export class OrderSpec {
  constructor(
    readonly fields: string[],
    readonly direction: "asc" | "desc",
  ) {}
  toString(): string {
    return this.fields.map(f => `${f} ${this.direction}`).join(",")
  }
}

/**
 * Creates an ascending order specification.
 *
 * @example
 * asc("name", "createdon")
 * // OrderSpec { fields: ["name", "createdon"], direction: "asc" }
 */
export function asc(...fields: Name[]): OrderSpec {
  return new OrderSpec(fields.map(getName), "asc")
}

/**
 * Creates a descending order specification.
 *
 * @example
 * desc("createdon")
 * // OrderSpec { fields: ["createdon"], direction: "desc" }
 */
export function desc(...fields: Name[]): OrderSpec {
  return new OrderSpec(fields.map(getName), "desc")
}

/**
 * Formats an object of key-value pairs for alternate key lookups.
 *
 * @example
 * keys({ name: "John", email: "john@example.com" })
 * // "name='John',email='john@example.com'"
 */
export function keys(keyValues: { [key: string]: string | number }): string {
  return Object.entries(keyValues)
    .filter(([, v]) => isNonEmptyString(String(v)))
    .map(([k, v]) => `${k}=${wrapString(v)}`)
    .join(",");
}

/**
 * Formats a `$expand` query, including nested selects, filters, and expands.
 *
 * @example
 * expand({
 *   primarycontactid: { select: ["fullname", "email"] },
 *   parentcustomerid: {
 *     select: ["name"],
 *     expand: { createdby: { select: ["fullname"] } },
 *   },
 * })
 * // "primarycontactid($select=fullname,email),parentcustomerid($select=name;$expand=createdby($select=fullname))"
 *
 * @example
 * expand("primarycontactid") // simple string passthrough
 */
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

/**
 * Combines filter conditions with logical AND.
 *
 * @example
 * and(equals("statecode", 0), equals("statuscode", 1))
 * // "((statecode eq 0) and (statuscode eq 1))"
 */
export function and(...conditions: string[]): string {
  const valid = conditions.filter(isNonEmptyString);
  return valid.length === 0 ? "" : `(${valid.join(" and ")})`;
}

/**
 * Combines filter conditions with logical OR.
 *
 * @example
 * or(equals("statecode", 0), equals("statecode", 1))
 * // "((statecode eq 0) or (statecode eq 1))"
 */
export function or(...conditions: string[]): string {
  const valid = conditions.filter(isNonEmptyString);
  return valid.length === 0 ? "" : `(${valid.join(" or ")})`;
}

/**
 * Negates a filter condition.
 *
 * @example
 * not(equals("statecode", 0))
 * // "not((statecode eq 0))"
 */
export function not(condition: string): string {
  return isNonEmptyString(condition) ? `not(${condition})` : "";
}

/**
 * Creates a `contains` filter for substring matching.
 *
 * @example
 * contains("fullname", "John")
 * // "contains(fullname,'John')"
 */
export function contains(field: Name, value: string): string {
  return `contains(${getName(field)},${wrapString(value)})`;
}

/**
 * Creates a `startswith` filter.
 *
 * @example
 * startsWith("fullname", "John")
 * // "startswith(fullname,'John')"
 */
export function startsWith(field: Name, value: string): string {
  return `startswith(${getName(field)},${wrapString(value)})`;
}

/**
 * Creates an `endswith` filter.
 *
 * @example
 * endsWith("email", "@example.com")
 * // "endswith(email,'@example.com')"
 */
export function endsWith(field: Name, value: string): string {
  return `endswith(${getName(field)},${wrapString(value)})`;
}

/**
 * Creates an `eq` (equals) filter.
 *
 * @example
 * equals("statecode", 0)
 * // "(statecode eq 0)"
 *
 * equals("email", null)
 * // "(email eq null)"
 */
export function equals(
  field: Name,
  value: string | number | boolean | null,
): string {
  return `(${getName(field)} eq ${wrapString(value)})`;
}

/**
 * Creates a `ne` (not equals) filter.
 *
 * @example
 * notEquals("statecode", 1)
 * // "(statecode ne 1)"
 */
export function notEquals(
  field: Name,
  value: string | number | boolean | null,
): string {
  return `(${getName(field)} ne ${wrapString(value)})`;
}

/**
 * Creates a `gt` (greater than) filter.
 *
 * @example
 * greaterThan("revenue", 10000)
 * // "(revenue gt 10000)"
 */
export function greaterThan(field: Name, value: string | number): string {
  return `(${getName(field)} gt ${wrapString(value)})`;
}

/**
 * Creates a `ge` (greater than or equal) filter.
 *
 * @example
 * greaterThanOrEqual("revenue", 10000)
 * // "(revenue ge 10000)"
 */
export function greaterThanOrEqual(
  field: Name,
  value: string | number,
): string {
  return `(${getName(field)} ge ${wrapString(value)})`;
}

/**
 * Creates a `lt` (less than) filter.
 *
 * @example
 * lessThan("revenue", 10000)
 * // "(revenue lt 10000)"
 */
export function lessThan(field: Name, value: string | number): string {
  return `(${getName(field)} lt ${wrapString(value)})`;
}

/**
 * Creates a `le` (less than or equal) filter.
 *
 * @example
 * lessThanOrEqual("revenue", 10000)
 * // "(revenue le 10000)"
 */
export function lessThanOrEqual(
  field: Name,
  value: string | number,
): string {
  return `(${getName(field)} le ${wrapString(value)})`;
}

/**
 * Filter for active records (statecode eq 0).
 *
 * @example
 * isActive()
 * // "statecode eq 0"
 */
export function isActive(): string {
  return "statecode eq 0";
}

/**
 * Filter for inactive records (statecode eq 1).
 *
 * @example
 * isInactive()
 * // "statecode eq 1"
 */
export function isInactive(): string {
  return "statecode eq 1";
}

/**
 * Filter for null field values.
 *
 * @example
 * isNull("emailaddress1")
 * // "emailaddress1 eq null"
 */
export function isNull(field: Name): string {
  return `${getName(field)} eq null`;
}

/**
 * Filter for non-null field values.
 *
 * @example
 * isNotNull("emailaddress1")
 * // "emailaddress1 ne null"
 */
export function isNotNull(field: Name): string {
  return `${getName(field)} ne null`;
}

/**
 * Creates a `groupby` clause for the `$apply` query option.
 *
 * @example
 * groupby(["statuscode"], average("revenue"))
 * // "groupby((statuscode),revenue with average as revenue)"
 */
export function groupby(values: Name[], aggregations?: string): string {
  return `groupby((${values.map(getName).filter(isNonEmptyString).join(",")})${aggregations ? "," + aggregations : ""})`;
}

/**
 * Creates an `aggregate` clause for the `$apply` query option.
 *
 * @example
 * aggregate(average("revenue"), count())
 * // "aggregate(revenue with average as revenue,$count as count)"
 */
export function aggregate(...values: string[]): string {
  return `aggregate(${values.filter(isNonEmptyString).join(",")})`;
}

/**
 * Creates an `average` aggregation expression for `$apply`.
 *
 * @example
 * average("revenue", "avg_revenue")
 * // "revenue with average as avg_revenue"
 */
export function average(field: Name, alias?: string): string {
  const name = getName(field);
  return `${name} with average as ${alias ?? name}`;
}

/**
 * Creates a `sum` aggregation expression for `$apply`.
 *
 * @example
 * sum("revenue", "total_revenue")
 * // "revenue with sum as total_revenue"
 */
export function sum(field: Name, alias?: string): string {
  const name = getName(field);
  return `${name} with sum as ${alias ?? name}`;
}

/**
 * Creates a `min` aggregation expression for `$apply`.
 *
 * @example
 * min("createdon")
 * // "createdon with min as createdon"
 */
export function min(field: Name, alias?: string): string {
  const name = getName(field);
  return `${name} with min as ${alias ?? name}`;
}

/**
 * Creates a `max` aggregation expression for `$apply`.
 *
 * @example
 * max("createdon")
 * // "createdon with max as createdon"
 */
export function max(field: Name, alias?: string): string {
  const name = getName(field);
  return `${name} with max as ${alias ?? name}`;
}

/**
 * Creates a `$count` aggregation expression for `$apply`.
 *
 * @example
 * count("record_count")
 * // "$count as record_count"
 */
export function count(alias = "count"): string {
  return `$count as ${alias}`;
}

// --- CRM Filter Constants ---
// These implement the Microsoft.Dynamics.CRM query functions for
// advanced filtering scenarios (hierarchical, date-relative, etc.).

/** Filters records above a hierarchical position. */
export const Above = (field: Name, value: string) =>
  `Microsoft.Dynamics.CRM.Above(PropertyName=${getName(field)},PropertyValue=${wrapString(value)})`;
/** Filters records at or above a hierarchical position. */
export const AboveOrEqual = (field: Name, value: string) =>
  `Microsoft.Dynamics.CRM.AboveOrEqual(PropertyName=${getName(field)},PropertyValue=${wrapString(value)})`;
/** Filters between two values. */
export const Between = (
  field: Name,
  value1: string | number,
  value2: string | number,
) =>
  `Microsoft.Dynamics.CRM.Between(PropertyName=${getName(field)},PropertyValues=[${wrapString(value1)},${wrapString(value2)}])`;
/** Filters records containing specified values (multi-select). */
export const ContainsValues = (field: Name, values: (string | number)[]) =>
  `Microsoft.Dynamics.CRM.ContainsValues(PropertyName=${getName(field)},PropertyValues=[${values.map(wrapString).join(",")}])`;
/** Filters records NOT containing specified values (multi-select). */
export const DoesNotContainValues = (
  field: Name,
  values: (string | number)[],
) =>
  `Microsoft.Dynamics.CRM.DoesNotContainValues(PropertyName=${getName(field)},PropertyValues=[${values.map(wrapString).join(",")}])`;
/** Filters records matching the current user's business unit. */
export const EqualBusinessId = (field: Name) =>
  `Microsoft.Dynamics.CRM.EqualBusinessId(PropertyName=${getName(field)})`;
/** Filters records owned by the current user. */
export const EqualUserId = (field: Name) =>
  `Microsoft.Dynamics.CRM.EqualUserId(PropertyName=${wrapString(getName(field))})`;
/** Filters records matching the current user's language. */
export const EqualUserLanguage = (field: Name) =>
  `Microsoft.Dynamics.CRM.EqualUserLanguage(PropertyName=${getName(field)})`;
/** Filters records owned by the user or their hierarchy. */
export const EqualUserOrUserHierarchy = (field: Name) =>
  `Microsoft.Dynamics.CRM.EqualUserOrUserHierarchy(PropertyName=${getName(field)})`;
/** Filters records owned by the user, their hierarchy, or their teams. */
export const EqualUserOrUserHierarchyAndTeams = (field: Name) =>
  `Microsoft.Dynamics.CRM.EqualUserOrUserHierarchyAndTeams(PropertyName=${getName(field)})`;
/** Filters records owned by the user or their teams. */
export const EqualUserOrUserTeams = (field: Name) =>
  `Microsoft.Dynamics.CRM.EqualUserOrUserTeams(PropertyName=${getName(field)})`;
/** Filters records matching any of the specified values (IN clause). */
export const In = (field: Name, values: (string | number)[]) =>
  `Microsoft.Dynamics.CRM.In(PropertyName=${getName(field)},PropertyValues=[${values.map(wrapString).join(",")}])`;
/** Filters records in a specific fiscal period. */
export const InFiscalPeriod = (field: Name, value: number) =>
  `Microsoft.Dynamics.CRM.InFiscalPeriod(PropertyName=${getName(field)},PropertyValue=${value})`;
/** Filters records in a specific fiscal period and year. */
export const InFiscalPeriodAndYear = (
  field: Name,
  fiscalPeriod: number,
  fiscalYear: number,
) =>
  `Microsoft.Dynamics.CRM.InFiscalPeriodAndYear(PropertyName=${getName(field)},PropertyValue1=${fiscalPeriod},PropertyValue2=${fiscalYear})`;
/** Filters records in a specific fiscal year. */
export const InFiscalYear = (field: Name, value: number) =>
  `Microsoft.Dynamics.CRM.InFiscalYear(PropertyName=${getName(field)},PropertyValue=${value})`;
/** Filters records in or after a specific fiscal period and year. */
export const InOrAfterFiscalPeriodAndYear = (
  field: Name,
  fiscalPeriod: number,
  fiscalYear: number,
) =>
  `Microsoft.Dynamics.CRM.InOrAfterFiscalPeriodAndYear(PropertyName=${getName(field)},PropertyValue1=${fiscalPeriod},PropertyValue2=${fiscalYear})`;
/** Filters records in or before a specific fiscal period and year. */
export const InOrBeforeFiscalPeriodAndYear = (
  field: Name,
  fiscalPeriod: number,
  fiscalYear: number,
) =>
  `Microsoft.Dynamics.CRM.InOrBeforeFiscalPeriodAndYear(PropertyName=${getName(field)},PropertyValue1=${fiscalPeriod},PropertyValue2=${fiscalYear})`;
/** Filters records from the last 7 days. */
export const Last7Days = (field: Name) =>
  `Microsoft.Dynamics.CRM.Last7Days(PropertyName=${getName(field)})`;
/** Filters records from the last fiscal period. */
export const LastFiscalPeriod = (field: Name) =>
  `Microsoft.Dynamics.CRM.LastFiscalPeriod(PropertyName=${getName(field)})`;
/** Filters records from the last fiscal year. */
export const LastFiscalYear = (field: Name) =>
  `Microsoft.Dynamics.CRM.LastFiscalYear(PropertyName=${getName(field)})`;
/** Filters records from last month. */
export const LastMonth = (field: Name) =>
  `Microsoft.Dynamics.CRM.LastMonth(PropertyName=${getName(field)})`;
/** Filters records from last week. */
export const LastWeek = (field: Name) =>
  `Microsoft.Dynamics.CRM.LastWeek(PropertyName=${getName(field)})`;
/** Filters records from the last X days. */
export const LastXDays = (field: Name, value: number) =>
  `Microsoft.Dynamics.CRM.LastXDays(PropertyName=${getName(field)},PropertyValue=${value})`;
/** Filters records from the last X fiscal periods. */
export const LastXFiscalPeriods = (field: Name, value: number) =>
  `Microsoft.Dynamics.CRM.LastXFiscalPeriods(PropertyName=${getName(field)},PropertyValue=${value})`;
/** Filters records from the last X fiscal years. */
export const LastXFiscalYears = (field: Name, value: number) =>
  `Microsoft.Dynamics.CRM.LastXFiscalYears(PropertyName=${getName(field)},PropertyValue=${value})`;
/** Filters records from the last X hours. */
export const LastXHours = (field: Name, value: number) =>
  `Microsoft.Dynamics.CRM.LastXHours(PropertyName=${getName(field)},PropertyValue=${value})`;
/** Filters records from the last X months. */
export const LastXMonths = (field: Name, value: number) =>
  `Microsoft.Dynamics.CRM.LastXMonths(PropertyName=${getName(field)},PropertyValue=${value})`;
/** Filters records from the last X weeks. */
export const LastXWeeks = (field: Name, value: number) =>
  `Microsoft.Dynamics.CRM.LastXWeeks(PropertyName=${getName(field)},PropertyValue=${value})`;
/** Filters records from the last X years. */
export const LastXYears = (field: Name, value: number) =>
  `Microsoft.Dynamics.CRM.LastXYears(PropertyName=${getName(field)},PropertyValue=${value})`;
/** Filters records from last year. */
export const LastYear = (field: Name) =>
  `Microsoft.Dynamics.CRM.LastYear(PropertyName=${getName(field)})`;
/** Filters records from the next 7 days. */
export const Next7Days = (field: Name) =>
  `Microsoft.Dynamics.CRM.Next7Days(PropertyName=${getName(field)})`;
/** Filters records from the next fiscal period. */
export const NextFiscalPeriod = (field: Name) =>
  `Microsoft.Dynamics.CRM.NextFiscalPeriod(PropertyName=${getName(field)})`;
/** Filters records from the next fiscal year. */
export const NextFiscalYear = (field: Name) =>
  `Microsoft.Dynamics.CRM.NextFiscalYear(PropertyName=${getName(field)})`;
/** Filters records from next month. */
export const NextMonth = (field: Name) =>
  `Microsoft.Dynamics.CRM.NextMonth(PropertyName=${getName(field)})`;
/** Filters records from next week. */
export const NextWeek = (field: Name) =>
  `Microsoft.Dynamics.CRM.NextWeek(PropertyName=${getName(field)})`;
/** Filters records from the next X days. */
export const NextXDays = (field: Name, value: number) =>
  `Microsoft.Dynamics.CRM.NextXDays(PropertyName=${getName(field)},PropertyValue=${value})`;
/** Filters records from the next X fiscal periods. */
export const NextXFiscalPeriods = (field: Name, value: number) =>
  `Microsoft.Dynamics.CRM.NextXFiscalPeriods(PropertyName=${getName(field)},PropertyValue=${value})`;
/** Filters records from the next X fiscal years. */
export const NextXFiscalYears = (field: Name, value: number) =>
  `Microsoft.Dynamics.CRM.NextXFiscalYears(PropertyName=${getName(field)},PropertyValue=${value})`;
/** Filters records from the next X hours. */
export const NextXHours = (field: Name, value: number) =>
  `Microsoft.Dynamics.CRM.NextXHours(PropertyName=${getName(field)},PropertyValue=${value})`;
/** Filters records from the next X months. */
export const NextXMonths = (field: Name, value: number) =>
  `Microsoft.Dynamics.CRM.NextXMonths(PropertyName=${getName(field)},PropertyValue=${value})`;
/** Filters records from the next X weeks. */
export const NextXWeeks = (field: Name, value: number) =>
  `Microsoft.Dynamics.CRM.NextXWeeks(PropertyName=${getName(field)},PropertyValue=${value})`;
/** Filters records from the next X years. */
export const NextXYears = (field: Name, value: number) =>
  `Microsoft.Dynamics.CRM.NextXYears(PropertyName=${getName(field)},PropertyValue=${value})`;
/** Filters records from next year. */
export const NextYear = (field: Name) =>
  `Microsoft.Dynamics.CRM.NextYear(PropertyName=${getName(field)})`;
/** Filters records NOT between two values. */
export const NotBetween = (
  field: Name,
  value1: string | number,
  value2: string | number,
) =>
  `Microsoft.Dynamics.CRM.NotBetween(PropertyName=${getName(field)},PropertyValues=[${wrapString(value1)},${wrapString(value2)}])`;
/** Filters records NOT matching the current user's business unit. */
export const NotEqualBusinessId = (field: Name) =>
  `Microsoft.Dynamics.CRM.NotEqualBusinessId(PropertyName=${getName(field)})`;
/** Filters records NOT owned by the current user. */
export const NotEqualUserId = (field: Name) =>
  `Microsoft.Dynamics.CRM.NotEqualUserId(PropertyName=${getName(field)})`;
/** Filters records NOT in the specified values (NOT IN clause). */
export const NotIn = (field: Name, values: (string | number)[]) =>
  `Microsoft.Dynamics.CRM.NotIn(PropertyName=${getName(field)},PropertyValues=[${values.map(wrapString).join(",")}])`;
/** Filters records NOT under a specific hierarchical node. */
export const NotUnder = (field: Name, value: string) =>
  `Microsoft.Dynamics.CRM.NotUnder(PropertyName=${getName(field)},PropertyValue=${wrapString(value)})`;
/** Filters records older than X days. */
export const OlderThanXDays = (field: Name, value: number) =>
  `Microsoft.Dynamics.CRM.OlderThanXDays(PropertyName=${getName(field)},PropertyValue=${value})`;
/** Filters records older than X hours. */
export const OlderThanXHours = (field: Name, value: number) =>
  `Microsoft.Dynamics.CRM.OlderThanXHours(PropertyName=${getName(field)},PropertyValue=${value})`;
/** Filters records older than X minutes. */
export const OlderThanXMinutes = (field: Name, value: number) =>
  `Microsoft.Dynamics.CRM.OlderThanXMinutes(PropertyName=${getName(field)},PropertyValue=${value})`;
/** Filters records older than X months. */
export const OlderThanXMonths = (field: Name, value: number) =>
  `Microsoft.Dynamics.CRM.OlderThanXMonths(PropertyName=${getName(field)},PropertyValue=${value})`;
/** Filters records older than X weeks. */
export const OlderThanXWeeks = (field: Name, value: number) =>
  `Microsoft.Dynamics.CRM.OlderThanXWeeks(PropertyName=${getName(field)},PropertyValue=${value})`;
/** Filters records older than X years. */
export const OlderThanXYears = (field: Name, value: number) =>
  `Microsoft.Dynamics.CRM.OlderThanXYears(PropertyName=${getName(field)},PropertyValue=${value})`;
/** Filters records on a specific date. */
export const On = (field: Name, value: string) =>
  `Microsoft.Dynamics.CRM.On(PropertyName=${getName(field)},PropertyValue=${wrapString(value)})`;
/** Filters records on or after a specific date. */
export const OnOrAfter = (field: Name, value: string) =>
  `Microsoft.Dynamics.CRM.OnOrAfter(PropertyName=${getName(field)},PropertyValue=${wrapString(value)})`;
/** Filters records on or before a specific date. */
export const OnOrBefore = (field: Name, value: string) =>
  `Microsoft.Dynamics.CRM.OnOrBefore(PropertyName=${getName(field)},PropertyValue=${wrapString(value)})`;
/** Filters records in the current fiscal period. */
export const ThisFiscalPeriod = (field: Name) =>
  `Microsoft.Dynamics.CRM.ThisFiscalPeriod(PropertyName=${getName(field)})`;
/** Filters records in the current fiscal year. */
export const ThisFiscalYear = (field: Name) =>
  `Microsoft.Dynamics.CRM.ThisFiscalYear(PropertyName=${getName(field)})`;
/** Filters records from this month. */
export const ThisMonth = (field: Name) =>
  `Microsoft.Dynamics.CRM.ThisMonth(PropertyName=${getName(field)})`;
/** Filters records from this week. */
export const ThisWeek = (field: Name) =>
  `Microsoft.Dynamics.CRM.ThisWeek(PropertyName=${getName(field)})`;
/** Filters records from this year. */
export const ThisYear = (field: Name) =>
  `Microsoft.Dynamics.CRM.ThisYear(PropertyName=${getName(field)})`;
/** Filters records from today. */
export const Today = (field: Name) =>
  `Microsoft.Dynamics.CRM.Today(PropertyName=${getName(field)})`;
/** Filters records from tomorrow. */
export const Tomorrow = (field: Name) =>
  `Microsoft.Dynamics.CRM.Tomorrow(PropertyName=${getName(field)})`;
/** Filters records under a specific hierarchical node. */
export const Under = (field: Name, value: string) =>
  `Microsoft.Dynamics.CRM.Under(PropertyName=${getName(field)},PropertyValue=${wrapString(value)})`;
/** Filters records at or under a specific hierarchical node. */
export const UnderOrEqual = (field: Name, value: string) =>
  `Microsoft.Dynamics.CRM.UnderOrEqual(PropertyName=${getName(field)},PropertyValue=${wrapString(value)})`;
/** Filters records from yesterday. */
export const Yesterday = (field: Name) =>
  `Microsoft.Dynamics.CRM.Yesterday(PropertyName=${getName(field)})`;

// --- Lambda operators for collection nav property filters ---

/**
 * Creates an `any` lambda filter for collection navigation properties.
 *
 * @example
 * any("contact_customer_accounts", "a", equals("a", "statecode", 0))
 * // "contact_customer_accounts/any(a: (a/statecode eq 0))"
 */
export function any(
  collectionProperty: Name,
  alias: string,
  condition: string,
): string {
  return `${getName(collectionProperty)}/any(${alias}: ${condition})`;
}

/**
 * Creates an `all` lambda filter for collection navigation properties.
 *
 * @example
 * all("contact_customer_accounts", "a", greaterThan("a", "revenue", 1000))
 * // "contact_customer_accounts/all(a: (a/revenue gt 1000))"
 */
export function all(
  collectionProperty: Name,
  alias: string,
  condition: string,
): string {
  return `${getName(collectionProperty)}/all(${alias}: ${condition})`;
}

// --- Column comparison (valueof) ---

/**
 * Compares two fields directly using the specified operator (column comparison).
 *
 * @example
 * compare("modifiedon", "gt", "createdon")
 * // "(modifiedon gt createdon)"
 */
export function compare(
  field: Name,
  operator: string,
  otherField: Name,
): string {
  return `(${getName(field)} ${operator} ${getName(otherField)})`;
}
