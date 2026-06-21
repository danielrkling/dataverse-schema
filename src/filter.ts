import { getName, Name, wrapString } from "./util"

// --- Types ---

type FilterValue = string | number | boolean | null

type FilterNode =
  | { type: "comparison"; field: string; operator: string; value: FilterValue }
  | { type: "null"; field: string; positive: boolean }
  | { type: "contains"; field: string; value: string }
  | { type: "startsWith"; field: string; value: string }
  | { type: "endsWith"; field: string; value: string }
  | { type: "compare"; field: string; operator: string; otherField: string }
  | { type: "lambda"; field: string; operator: "any" | "all"; alias: string; condition: string }
  | { type: "fn"; field: string; fnName: string; operator: string; values: FilterValue[] }
  | { type: "raw"; value: string }
  | { type: "and"; conditions: FilterExpr[] }
  | { type: "or"; conditions: FilterExpr[] }
  | { type: "not"; condition: FilterExpr }

// --- FilterExpr class ---

export class FilterExpr {
  constructor(private node: FilterNode) {}

  toString(): string {
    return this.toOdata()
  }

  toOdata(): string {
    return serializeOdata(this.node)
  }

  toFetchXml(): string {
    return serializeFetchXml(this.node)
  }
}

// --- OData serialization ---

function serializeOdata(node: FilterNode): string {
  switch (node.type) {
    case "comparison":
      return `(${node.field} ${node.operator} ${wrapString(node.value)})`
    case "null":
      return `${node.field} ${node.positive ? "eq" : "ne"} null`
    case "contains":
      return `contains(${node.field},${wrapString(node.value)})`
    case "startsWith":
      return `startswith(${node.field},${wrapString(node.value)})`
    case "endsWith":
      return `endswith(${node.field},${wrapString(node.value)})`
    case "compare":
      return `(${node.field} ${node.operator} ${node.otherField})`
    case "lambda":
      return `${node.field}/${node.operator}(${node.alias}: ${node.condition})`
    case "fn": {
      const field = wrapString(node.field)
      const vals = node.values.map(wrapString)
      if (vals.length === 0) {
        return `Microsoft.Dynamics.CRM.${node.fnName}(PropertyName=${field})`
      }
      if (vals.length === 1) {
        return `Microsoft.Dynamics.CRM.${node.fnName}(PropertyName=${field},PropertyValue=${vals[0]})`
      }
      if (node.fnName === "Between" || node.fnName === "NotBetween") {
        return `Microsoft.Dynamics.CRM.${node.fnName}(PropertyName=${field},PropertyValues=[${vals.join(",")}])`
      }
      if (node.fnName === "InFiscalPeriodAndYear" || node.fnName === "InOrAfterFiscalPeriodAndYear" || node.fnName === "InOrBeforeFiscalPeriodAndYear") {
        return `Microsoft.Dynamics.CRM.${node.fnName}(PropertyName=${field},PropertyValue1=${vals[0]},PropertyValue2=${vals[1]})`
      }
      return `Microsoft.Dynamics.CRM.${node.fnName}(PropertyName=${field},PropertyValues=[${vals.join(",")}])`
    }
    case "raw":
      return node.value
    case "and":
      if (node.conditions.length === 0) return ""
      return `(${node.conditions.map(c => c.toOdata()).join(" and ")})`
    case "or":
      if (node.conditions.length === 0) return ""
      return `(${node.conditions.map(c => c.toOdata()).join(" or ")})`
    case "not":
      return `not(${node.condition.toOdata()})`
  }
}

// --- FetchXML serialization ---

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

function serializeFetchXml(node: FilterNode): string {
  switch (node.type) {
    case "comparison": {
      const value =
        node.value === null ? "" : escapeXml(String(node.value))
      return `<condition attribute="${escapeXml(node.field)}" operator="${escapeXml(node.operator)}" value="${value}" />`
    }
    case "null":
      return `<condition attribute="${escapeXml(node.field)}" operator="${node.positive ? "null" : "not-null"}" />`
    case "contains":
      return `<condition attribute="${escapeXml(node.field)}" operator="like" value="%${escapeXml(node.value)}%" />`
    case "startsWith":
      return `<condition attribute="${escapeXml(node.field)}" operator="begins-with" value="${escapeXml(node.value)}" />`
    case "endsWith":
      return `<condition attribute="${escapeXml(node.field)}" operator="ends-with" value="${escapeXml(node.value)}" />`
    case "compare":
      return `<condition attribute="${escapeXml(node.field)}" operator="${escapeXml(node.operator)}" valueof="${escapeXml(node.otherField)}" />`
    case "lambda":
      return `<condition entityname="${escapeXml(node.field)}" operator="${escapeXml(node.operator)}" value="${escapeXml(`${node.alias}: ${node.condition}`)}" />`
    case "fn": {
      const attr = escapeXml(node.field)
      const op = escapeXml(node.operator)
      if (node.values.length === 0) {
        return `<condition attribute="${attr}" operator="${op}" />`
      }
      if (node.values.length === 1) {
        return `<condition attribute="${attr}" operator="${op}" value="${escapeXml(String(node.values[0]))}" />`
      }
      return `<condition attribute="${attr}" operator="${op}">${node.values.map(v => `<value>${escapeXml(String(v))}</value>`).join("")}</condition>`
    }
    case "raw":
      return node.value
    case "and":
      if (node.conditions.length === 0) return ""
      return `<filter type="and">${node.conditions.map(c => c.toFetchXml()).join("")}</filter>`
    case "or":
      if (node.conditions.length === 0) return ""
      return `<filter type="or">${node.conditions.map(c => c.toFetchXml()).join("")}</filter>`
    case "not":
      return `<filter type="and"><filter type="or">${node.condition.toFetchXml()}</filter></filter>`
  }
}

// --- Internal helper ---

function fn(field: Name, fnName: string, operator: string, values: FilterValue[]): FilterExpr {
  return new FilterExpr({ type: "fn", field: getName(field), fnName, operator, values })
}

// --- Factory functions ---

export function eq(field: string, value: FilterValue): FilterExpr {
  return new FilterExpr({ type: "comparison", field, operator: "eq", value })
}

export function ne(field: string, value: FilterValue): FilterExpr {
  return new FilterExpr({ type: "comparison", field, operator: "ne", value })
}

export function gt(field: string, value: string | number): FilterExpr {
  return new FilterExpr({ type: "comparison", field, operator: "gt", value })
}

export function ge(field: string, value: string | number): FilterExpr {
  return new FilterExpr({ type: "comparison", field, operator: "ge", value })
}

export function lt(field: string, value: string | number): FilterExpr {
  return new FilterExpr({ type: "comparison", field, operator: "lt", value })
}

export function le(field: string, value: string | number): FilterExpr {
  return new FilterExpr({ type: "comparison", field, operator: "le", value })
}

export function isNull(field: string): FilterExpr {
  return new FilterExpr({ type: "null", field, positive: true })
}

export function isNotNull(field: string): FilterExpr {
  return new FilterExpr({ type: "null", field, positive: false })
}

export function contains(field: string, value: string): FilterExpr {
  return new FilterExpr({ type: "contains", field, value })
}

export function startsWith(field: string, value: string): FilterExpr {
  return new FilterExpr({ type: "startsWith", field, value })
}

export function endsWith(field: string, value: string): FilterExpr {
  return new FilterExpr({ type: "endsWith", field, value })
}

export function compare(
  field: string,
  operator: string,
  otherField: string,
): FilterExpr {
  return new FilterExpr({ type: "compare", field, operator, otherField })
}

export function and(...conditions: (FilterExpr | string)[]): FilterExpr {
  const valid = conditions.filter(c => c != null && c !== "")
  const exprs = valid.map(c => typeof c === "string" ? new FilterExpr({ type: "raw", value: c }) : c)
  return new FilterExpr({ type: "and", conditions: exprs })
}

export function or(...conditions: (FilterExpr | string)[]): FilterExpr {
  const valid = conditions.filter(c => c != null && c !== "")
  const exprs = valid.map(c => typeof c === "string" ? new FilterExpr({ type: "raw", value: c }) : c)
  return new FilterExpr({ type: "or", conditions: exprs })
}

export function not(condition: FilterExpr | string): FilterExpr {
  const c = typeof condition === "string" ? new FilterExpr({ type: "raw", value: condition }) : condition
  return new FilterExpr({ type: "not", condition: c })
}

export function isActive(): FilterExpr {
  return eq("statecode", 0)
}

export function isInactive(): FilterExpr {
  return eq("statecode", 1)
}

// --- CRM Dataverse OData functions (merged into FilterExpr) ---

export function Above(field: Name, value: string): FilterExpr {
  return fn(field, "Above", "above", [value])
}

export function AboveOrEqual(field: Name, value: string): FilterExpr {
  return fn(field, "AboveOrEqual", "above-or-equal", [value])
}

export function Between(field: Name, value1: string | number, value2: string | number): FilterExpr {
  return fn(field, "Between", "between", [value1, value2])
}

export function ContainsValues(field: Name, values: (string | number)[]): FilterExpr {
  return fn(field, "ContainsValues", "in", values)
}

export function DoesNotContainValues(field: Name, values: (string | number)[]): FilterExpr {
  return fn(field, "DoesNotContainValues", "not-in", values)
}

export function EqualBusinessId(field: Name): FilterExpr {
  return fn(field, "EqualBusinessId", "eq-businessid", [])
}

export function EqualUserId(field: Name): FilterExpr {
  return fn(field, "EqualUserId", "eq-userid", [])
}

export function EqualUserLanguage(field: Name): FilterExpr {
  return fn(field, "EqualUserLanguage", "eq-userlanguage", [])
}

export function EqualUserOrUserHierarchy(field: Name): FilterExpr {
  return fn(field, "EqualUserOrUserHierarchy", "eq-useroruserhierarchy", [])
}

export function EqualUserOrUserHierarchyAndTeams(field: Name): FilterExpr {
  return fn(field, "EqualUserOrUserHierarchyAndTeams", "eq-useroruserhierarchyandteams", [])
}

export function EqualUserOrUserTeams(field: Name): FilterExpr {
  return fn(field, "EqualUserOrUserTeams", "eq-useroruserteams", [])
}

export function In(field: Name, values: (string | number)[]): FilterExpr {
  return fn(field, "In", "in", values)
}

export function InFiscalPeriod(field: Name, value: number): FilterExpr {
  return fn(field, "InFiscalPeriod", "in-fiscal-period", [value])
}

export function InFiscalPeriodAndYear(field: Name, fiscalPeriod: number, fiscalYear: number): FilterExpr {
  return fn(field, "InFiscalPeriodAndYear", "in-fiscal-period-and-year", [fiscalPeriod, fiscalYear])
}

export function InFiscalYear(field: Name, value: number): FilterExpr {
  return fn(field, "InFiscalYear", "in-fiscal-year", [value])
}

export function InOrAfterFiscalPeriodAndYear(field: Name, fiscalPeriod: number, fiscalYear: number): FilterExpr {
  return fn(field, "InOrAfterFiscalPeriodAndYear", "in-or-after-fiscal-period-and-year", [fiscalPeriod, fiscalYear])
}

export function InOrBeforeFiscalPeriodAndYear(field: Name, fiscalPeriod: number, fiscalYear: number): FilterExpr {
  return fn(field, "InOrBeforeFiscalPeriodAndYear", "in-or-before-fiscal-period-and-year", [fiscalPeriod, fiscalYear])
}

export function Last7Days(field: Name): FilterExpr {
  return fn(field, "Last7Days", "last-seven-days", [])
}

export function LastFiscalPeriod(field: Name): FilterExpr {
  return fn(field, "LastFiscalPeriod", "last-fiscal-period", [])
}

export function LastFiscalYear(field: Name): FilterExpr {
  return fn(field, "LastFiscalYear", "last-fiscal-year", [])
}

export function LastMonth(field: Name): FilterExpr {
  return fn(field, "LastMonth", "last-month", [])
}

export function LastWeek(field: Name): FilterExpr {
  return fn(field, "LastWeek", "last-week", [])
}

export function LastXDays(field: Name, value: number): FilterExpr {
  return fn(field, "LastXDays", "last-x-days", [value])
}

export function LastXFiscalPeriods(field: Name, value: number): FilterExpr {
  return fn(field, "LastXFiscalPeriods", "last-x-fiscal-periods", [value])
}

export function LastXFiscalYears(field: Name, value: number): FilterExpr {
  return fn(field, "LastXFiscalYears", "last-x-fiscal-years", [value])
}

export function LastXHours(field: Name, value: number): FilterExpr {
  return fn(field, "LastXHours", "last-x-hours", [value])
}

export function LastXMonths(field: Name, value: number): FilterExpr {
  return fn(field, "LastXMonths", "last-x-months", [value])
}

export function LastXWeeks(field: Name, value: number): FilterExpr {
  return fn(field, "LastXWeeks", "last-x-weeks", [value])
}

export function LastXYears(field: Name, value: number): FilterExpr {
  return fn(field, "LastXYears", "last-x-years", [value])
}

export function LastYear(field: Name): FilterExpr {
  return fn(field, "LastYear", "last-year", [])
}

export function Next7Days(field: Name): FilterExpr {
  return fn(field, "Next7Days", "next-seven-days", [])
}

export function NextFiscalPeriod(field: Name): FilterExpr {
  return fn(field, "NextFiscalPeriod", "next-fiscal-period", [])
}

export function NextFiscalYear(field: Name): FilterExpr {
  return fn(field, "NextFiscalYear", "next-fiscal-year", [])
}

export function NextMonth(field: Name): FilterExpr {
  return fn(field, "NextMonth", "next-month", [])
}

export function NextWeek(field: Name): FilterExpr {
  return fn(field, "NextWeek", "next-week", [])
}

export function NextXDays(field: Name, value: number): FilterExpr {
  return fn(field, "NextXDays", "next-x-days", [value])
}

export function NextXFiscalPeriods(field: Name, value: number): FilterExpr {
  return fn(field, "NextXFiscalPeriods", "next-x-fiscal-periods", [value])
}

export function NextXFiscalYears(field: Name, value: number): FilterExpr {
  return fn(field, "NextXFiscalYears", "next-x-fiscal-years", [value])
}

export function NextXHours(field: Name, value: number): FilterExpr {
  return fn(field, "NextXHours", "next-x-hours", [value])
}

export function NextXMonths(field: Name, value: number): FilterExpr {
  return fn(field, "NextXMonths", "next-x-months", [value])
}

export function NextXWeeks(field: Name, value: number): FilterExpr {
  return fn(field, "NextXWeeks", "next-x-weeks", [value])
}

export function NextXYears(field: Name, value: number): FilterExpr {
  return fn(field, "NextXYears", "next-x-years", [value])
}

export function NextYear(field: Name): FilterExpr {
  return fn(field, "NextYear", "next-year", [])
}

export function NotBetween(field: Name, value1: string | number, value2: string | number): FilterExpr {
  return fn(field, "NotBetween", "not-between", [value1, value2])
}

export function NotEqualBusinessId(field: Name): FilterExpr {
  return fn(field, "NotEqualBusinessId", "neq-businessid", [])
}

export function NotEqualUserId(field: Name): FilterExpr {
  return fn(field, "NotEqualUserId", "neq-userid", [])
}

export function NotIn(field: Name, values: (string | number)[]): FilterExpr {
  return fn(field, "NotIn", "not-in", values)
}

export function NotUnder(field: Name, value: string): FilterExpr {
  return fn(field, "NotUnder", "not-under", [value])
}

export function OlderThanXDays(field: Name, value: number): FilterExpr {
  return fn(field, "OlderThanXDays", "olderthan-x-days", [value])
}

export function OlderThanXHours(field: Name, value: number): FilterExpr {
  return fn(field, "OlderThanXHours", "olderthan-x-hours", [value])
}

export function OlderThanXMinutes(field: Name, value: number): FilterExpr {
  return fn(field, "OlderThanXMinutes", "olderthan-x-minutes", [value])
}

export function OlderThanXMonths(field: Name, value: number): FilterExpr {
  return fn(field, "OlderThanXMonths", "olderthan-x-months", [value])
}

export function OlderThanXWeeks(field: Name, value: number): FilterExpr {
  return fn(field, "OlderThanXWeeks", "olderthan-x-weeks", [value])
}

export function OlderThanXYears(field: Name, value: number): FilterExpr {
  return fn(field, "OlderThanXYears", "olderthan-x-years", [value])
}

export function On(field: Name, value: string): FilterExpr {
  return fn(field, "On", "on", [value])
}

export function OnOrAfter(field: Name, value: string): FilterExpr {
  return fn(field, "OnOrAfter", "on-or-after", [value])
}

export function OnOrBefore(field: Name, value: string): FilterExpr {
  return fn(field, "OnOrBefore", "on-or-before", [value])
}

export function ThisFiscalPeriod(field: Name): FilterExpr {
  return fn(field, "ThisFiscalPeriod", "this-fiscal-period", [])
}

export function ThisFiscalYear(field: Name): FilterExpr {
  return fn(field, "ThisFiscalYear", "this-fiscal-year", [])
}

export function ThisMonth(field: Name): FilterExpr {
  return fn(field, "ThisMonth", "this-month", [])
}

export function ThisWeek(field: Name): FilterExpr {
  return fn(field, "ThisWeek", "this-week", [])
}

export function ThisYear(field: Name): FilterExpr {
  return fn(field, "ThisYear", "this-year", [])
}

export function Today(field: Name): FilterExpr {
  return fn(field, "Today", "today", [])
}

export function Tomorrow(field: Name): FilterExpr {
  return fn(field, "Tomorrow", "tomorrow", [])
}

export function Under(field: Name, value: string): FilterExpr {
  return fn(field, "Under", "under", [value])
}

export function UnderOrEqual(field: Name, value: string): FilterExpr {
  return fn(field, "UnderOrEqual", "under-or-equal", [value])
}

export function Yesterday(field: Name): FilterExpr {
  return fn(field, "Yesterday", "yesterday", [])
}
