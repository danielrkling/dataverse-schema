import { wrapString } from "./util"

export class FieldRef<T = any, K extends string = string> {
  readonly fieldDef?: any

  constructor(
    private readonly _dataverseName: string,
    fieldDef?: any,
  ) {
    this.fieldDef = fieldDef
  }

  get dataverseName(): string {
    return this._dataverseName
  }

  toString(): string {
    return this._dataverseName
  }
}

type FilterValue = string | number | boolean | Date | null

type NonNullType<T> = T extends Date | null ? Date : Exclude<T, null>

type FilterNode =
  | { type: "comparison"; field: FieldRef<any>; operator: string; value: FilterValue }
  | { type: "null"; field: FieldRef<any>; positive: boolean }
  | { type: "contains"; field: FieldRef<any>; value: string }
  | { type: "startsWith"; field: FieldRef<any>; value: string }
  | { type: "endsWith"; field: FieldRef<any>; value: string }
  | { type: "compare"; field: FieldRef<any>; operator: string; otherField: FieldRef<any> }
  | { type: "lambda"; field: string; operator: "any" | "all"; alias: string; condition: string }
  | { type: "fn"; field: FieldRef<any>; fnName: string; operator: string; values: FilterValue[] }
  | { type: "raw"; value: string }
  | { type: "and"; conditions: FilterExpr[] }
  | { type: "or"; conditions: FilterExpr[] }
  | { type: "not"; condition: FilterExpr }

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

function serializeOdata(node: FilterNode): string {
  switch (node.type) {
    case "comparison":
      return `(${node.field.toString()} ${node.operator} ${wrapString(node.value)})`
    case "null":
      return `${node.field.toString()} ${node.positive ? "eq" : "ne"} null`
    case "contains":
      return `contains(${node.field.toString()},${wrapString(node.value)})`
    case "startsWith":
      return `startswith(${node.field.toString()},${wrapString(node.value)})`
    case "endsWith":
      return `endswith(${node.field.toString()},${wrapString(node.value)})`
    case "compare":
      return `(${node.field.toString()} ${node.operator} ${node.otherField.toString()})`
    case "lambda":
      return `${node.field}/${node.operator}(${node.alias}: ${node.condition})`
    case "fn": {
      const field = wrapString(node.field.toString())
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
      return `<condition attribute="${escapeXml(node.field.toString())}" operator="${escapeXml(node.operator)}" value="${value}" />`
    }
    case "null":
      return `<condition attribute="${escapeXml(node.field.toString())}" operator="${node.positive ? "null" : "not-null"}" />`
    case "contains":
      return `<condition attribute="${escapeXml(node.field.toString())}" operator="like" value="%${escapeXml(node.value)}%" />`
    case "startsWith":
      return `<condition attribute="${escapeXml(node.field.toString())}" operator="begins-with" value="${escapeXml(node.value)}" />`
    case "endsWith":
      return `<condition attribute="${escapeXml(node.field.toString())}" operator="ends-with" value="${escapeXml(node.value)}" />`
    case "compare":
      return `<condition attribute="${escapeXml(node.field.toString())}" operator="${escapeXml(node.operator)}" valueof="${escapeXml(node.otherField.toString())}" />`
    case "lambda":
      return `<condition entityname="${escapeXml(node.field)}" operator="${escapeXml(node.operator)}" value="${escapeXml(`${node.alias}: ${node.condition}`)}" />`
    case "fn": {
      const attr = escapeXml(node.field.toString())
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

function fn(field: FieldRef<any>, fnName: string, operator: string, values: FilterValue[]): FilterExpr {
  return new FilterExpr({ type: "fn", field, fnName, operator, values })
}

export function eq<T>(field: FieldRef<T>, value: T | null | FieldRef<any>): FilterExpr {
  if (value instanceof FieldRef) {
    return new FilterExpr({ type: "compare", field, operator: "eq", otherField: value })
  }
  return new FilterExpr({ type: "comparison", field, operator: "eq", value: value as FilterValue })
}

export function ne<T>(field: FieldRef<T>, value: T | null | FieldRef<any>): FilterExpr {
  if (value instanceof FieldRef) {
    return new FilterExpr({ type: "compare", field, operator: "ne", otherField: value })
  }
  return new FilterExpr({ type: "comparison", field, operator: "ne", value: value as FilterValue })
}

export function gt<T extends number | string | Date | null>(field: FieldRef<T>, value: NonNullType<T> | FieldRef<any>): FilterExpr {
  if (value instanceof FieldRef) {
    return new FilterExpr({ type: "compare", field, operator: "gt", otherField: value })
  }
  return new FilterExpr({ type: "comparison", field, operator: "gt", value: value as FilterValue })
}

export function ge<T extends number | string | Date | null>(field: FieldRef<T>, value: NonNullType<T> | FieldRef<any>): FilterExpr {
  if (value instanceof FieldRef) {
    return new FilterExpr({ type: "compare", field, operator: "ge", otherField: value })
  }
  return new FilterExpr({ type: "comparison", field, operator: "ge", value: value as FilterValue })
}

export function lt<T extends number | string | Date | null>(field: FieldRef<T>, value: NonNullType<T> | FieldRef<any>): FilterExpr {
  if (value instanceof FieldRef) {
    return new FilterExpr({ type: "compare", field, operator: "lt", otherField: value })
  }
  return new FilterExpr({ type: "comparison", field, operator: "lt", value: value as FilterValue })
}

export function le<T extends number | string | Date | null>(field: FieldRef<T>, value: NonNullType<T> | FieldRef<any>): FilterExpr {
  if (value instanceof FieldRef) {
    return new FilterExpr({ type: "compare", field, operator: "le", otherField: value })
  }
  return new FilterExpr({ type: "comparison", field, operator: "le", value: value as FilterValue })
}

export function isNull(field: FieldRef<any> | { toString(): string }): FilterExpr {
  return new FilterExpr({ type: "null", field: field as FieldRef<any>, positive: true })
}

export function isNotNull(field: FieldRef<any> | { toString(): string }): FilterExpr {
  return new FilterExpr({ type: "null", field: field as FieldRef<any>, positive: false })
}

export function contains<T extends string | null>(field: FieldRef<T>, value: string): FilterExpr {
  return new FilterExpr({ type: "contains", field, value })
}

export function startsWith<T extends string | null>(field: FieldRef<T>, value: string): FilterExpr {
  return new FilterExpr({ type: "startsWith", field, value })
}

export function endsWith<T extends string | null>(field: FieldRef<T>, value: string): FilterExpr {
  return new FilterExpr({ type: "endsWith", field, value })
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
  return eq(new FieldRef("statecode"), 0)
}

export function isInactive(): FilterExpr {
  return eq(new FieldRef("statecode"), 1)
}

export function Above(field: FieldRef<any>, value: string): FilterExpr {
  return fn(field, "Above", "above", [value])
}

export function AboveOrEqual(field: FieldRef<any>, value: string): FilterExpr {
  return fn(field, "AboveOrEqual", "above-or-equal", [value])
}

export function Between(field: FieldRef<any>, value1: string | number, value2: string | number): FilterExpr {
  return fn(field, "Between", "between", [value1, value2])
}

export function ContainsValues(field: FieldRef<any>, values: (string | number)[]): FilterExpr {
  return fn(field, "ContainsValues", "in", values)
}

export function DoesNotContainValues(field: FieldRef<any>, values: (string | number)[]): FilterExpr {
  return fn(field, "DoesNotContainValues", "not-in", values)
}

export function EqualBusinessId(field: FieldRef<any>): FilterExpr {
  return fn(field, "EqualBusinessId", "eq-businessid", [])
}

export function EqualUserId(field: FieldRef<any>): FilterExpr {
  return fn(field, "EqualUserId", "eq-userid", [])
}

export function EqualUserLanguage(field: FieldRef<any>): FilterExpr {
  return fn(field, "EqualUserLanguage", "eq-userlanguage", [])
}

export function EqualUserOrUserHierarchy(field: FieldRef<any>): FilterExpr {
  return fn(field, "EqualUserOrUserHierarchy", "eq-useroruserhierarchy", [])
}

export function EqualUserOrUserHierarchyAndTeams(field: FieldRef<any>): FilterExpr {
  return fn(field, "EqualUserOrUserHierarchyAndTeams", "eq-useroruserhierarchyandteams", [])
}

export function EqualUserOrUserTeams(field: FieldRef<any>): FilterExpr {
  return fn(field, "EqualUserOrUserTeams", "eq-useroruserteams", [])
}

export function In<T extends string | number>(field: FieldRef<T>, values: T[]): FilterExpr {
  return fn(field, "In", "in", values)
}

export function InFiscalPeriod(field: FieldRef<any>, value: number): FilterExpr {
  return fn(field, "InFiscalPeriod", "in-fiscal-period", [value])
}

export function InFiscalPeriodAndYear(field: FieldRef<any>, fiscalPeriod: number, fiscalYear: number): FilterExpr {
  return fn(field, "InFiscalPeriodAndYear", "in-fiscal-period-and-year", [fiscalPeriod, fiscalYear])
}

export function InFiscalYear(field: FieldRef<any>, value: number): FilterExpr {
  return fn(field, "InFiscalYear", "in-fiscal-year", [value])
}

export function InOrAfterFiscalPeriodAndYear(field: FieldRef<any>, fiscalPeriod: number, fiscalYear: number): FilterExpr {
  return fn(field, "InOrAfterFiscalPeriodAndYear", "in-or-after-fiscal-period-and-year", [fiscalPeriod, fiscalYear])
}

export function InOrBeforeFiscalPeriodAndYear(field: FieldRef<any>, fiscalPeriod: number, fiscalYear: number): FilterExpr {
  return fn(field, "InOrBeforeFiscalPeriodAndYear", "in-or-before-fiscal-period-and-year", [fiscalPeriod, fiscalYear])
}

export function Last7Days(field: FieldRef<any>): FilterExpr {
  return fn(field, "Last7Days", "last-seven-days", [])
}

export function LastFiscalPeriod(field: FieldRef<any>): FilterExpr {
  return fn(field, "LastFiscalPeriod", "last-fiscal-period", [])
}

export function LastFiscalYear(field: FieldRef<any>): FilterExpr {
  return fn(field, "LastFiscalYear", "last-fiscal-year", [])
}

export function LastMonth(field: FieldRef<any>): FilterExpr {
  return fn(field, "LastMonth", "last-month", [])
}

export function LastWeek(field: FieldRef<any>): FilterExpr {
  return fn(field, "LastWeek", "last-week", [])
}

export function LastXDays(field: FieldRef<any>, value: number): FilterExpr {
  return fn(field, "LastXDays", "last-x-days", [value])
}

export function LastXFiscalPeriods(field: FieldRef<any>, value: number): FilterExpr {
  return fn(field, "LastXFiscalPeriods", "last-x-fiscal-periods", [value])
}

export function LastXFiscalYears(field: FieldRef<any>, value: number): FilterExpr {
  return fn(field, "LastXFiscalYears", "last-x-fiscal-years", [value])
}

export function LastXHours(field: FieldRef<any>, value: number): FilterExpr {
  return fn(field, "LastXHours", "last-x-hours", [value])
}

export function LastXMonths(field: FieldRef<any>, value: number): FilterExpr {
  return fn(field, "LastXMonths", "last-x-months", [value])
}

export function LastXWeeks(field: FieldRef<any>, value: number): FilterExpr {
  return fn(field, "LastXWeeks", "last-x-weeks", [value])
}

export function LastXYears(field: FieldRef<any>, value: number): FilterExpr {
  return fn(field, "LastXYears", "last-x-years", [value])
}

export function LastYear(field: FieldRef<any>): FilterExpr {
  return fn(field, "LastYear", "last-year", [])
}

export function Next7Days(field: FieldRef<any>): FilterExpr {
  return fn(field, "Next7Days", "next-seven-days", [])
}

export function NextFiscalPeriod(field: FieldRef<any>): FilterExpr {
  return fn(field, "NextFiscalPeriod", "next-fiscal-period", [])
}

export function NextFiscalYear(field: FieldRef<any>): FilterExpr {
  return fn(field, "NextFiscalYear", "next-fiscal-year", [])
}

export function NextMonth(field: FieldRef<any>): FilterExpr {
  return fn(field, "NextMonth", "next-month", [])
}

export function NextWeek(field: FieldRef<any>): FilterExpr {
  return fn(field, "NextWeek", "next-week", [])
}

export function NextXDays(field: FieldRef<any>, value: number): FilterExpr {
  return fn(field, "NextXDays", "next-x-days", [value])
}

export function NextXFiscalPeriods(field: FieldRef<any>, value: number): FilterExpr {
  return fn(field, "NextXFiscalPeriods", "next-x-fiscal-periods", [value])
}

export function NextXFiscalYears(field: FieldRef<any>, value: number): FilterExpr {
  return fn(field, "NextXFiscalYears", "next-x-fiscal-years", [value])
}

export function NextXHours(field: FieldRef<any>, value: number): FilterExpr {
  return fn(field, "NextXHours", "next-x-hours", [value])
}

export function NextXMonths(field: FieldRef<any>, value: number): FilterExpr {
  return fn(field, "NextXMonths", "next-x-months", [value])
}

export function NextXWeeks(field: FieldRef<any>, value: number): FilterExpr {
  return fn(field, "NextXWeeks", "next-x-weeks", [value])
}

export function NextXYears(field: FieldRef<any>, value: number): FilterExpr {
  return fn(field, "NextXYears", "next-x-years", [value])
}

export function NextYear(field: FieldRef<any>): FilterExpr {
  return fn(field, "NextYear", "next-year", [])
}

export function NotBetween(field: FieldRef<any>, value1: string | number, value2: string | number): FilterExpr {
  return fn(field, "NotBetween", "not-between", [value1, value2])
}

export function NotEqualBusinessId(field: FieldRef<any>): FilterExpr {
  return fn(field, "NotEqualBusinessId", "neq-businessid", [])
}

export function NotEqualUserId(field: FieldRef<any>): FilterExpr {
  return fn(field, "NotEqualUserId", "neq-userid", [])
}

export function NotIn<T extends string | number>(field: FieldRef<T>, values: T[]): FilterExpr {
  return fn(field, "NotIn", "not-in", values)
}

export function NotUnder(field: FieldRef<any>, value: string): FilterExpr {
  return fn(field, "NotUnder", "not-under", [value])
}

export function OlderThanXDays(field: FieldRef<any>, value: number): FilterExpr {
  return fn(field, "OlderThanXDays", "olderthan-x-days", [value])
}

export function OlderThanXHours(field: FieldRef<any>, value: number): FilterExpr {
  return fn(field, "OlderThanXHours", "olderthan-x-hours", [value])
}

export function OlderThanXMinutes(field: FieldRef<any>, value: number): FilterExpr {
  return fn(field, "OlderThanXMinutes", "olderthan-x-minutes", [value])
}

export function OlderThanXMonths(field: FieldRef<any>, value: number): FilterExpr {
  return fn(field, "OlderThanXMonths", "olderthan-x-months", [value])
}

export function OlderThanXWeeks(field: FieldRef<any>, value: number): FilterExpr {
  return fn(field, "OlderThanXWeeks", "olderthan-x-weeks", [value])
}

export function OlderThanXYears(field: FieldRef<any>, value: number): FilterExpr {
  return fn(field, "OlderThanXYears", "olderthan-x-years", [value])
}

export function On(field: FieldRef<any>, value: string): FilterExpr {
  return fn(field, "On", "on", [value])
}

export function OnOrAfter(field: FieldRef<any>, value: string): FilterExpr {
  return fn(field, "OnOrAfter", "on-or-after", [value])
}

export function OnOrBefore(field: FieldRef<any>, value: string): FilterExpr {
  return fn(field, "OnOrBefore", "on-or-before", [value])
}

export function ThisFiscalPeriod(field: FieldRef<any>): FilterExpr {
  return fn(field, "ThisFiscalPeriod", "this-fiscal-period", [])
}

export function ThisFiscalYear(field: FieldRef<any>): FilterExpr {
  return fn(field, "ThisFiscalYear", "this-fiscal-year", [])
}

export function ThisMonth(field: FieldRef<any>): FilterExpr {
  return fn(field, "ThisMonth", "this-month", [])
}

export function ThisWeek(field: FieldRef<any>): FilterExpr {
  return fn(field, "ThisWeek", "this-week", [])
}

export function ThisYear(field: FieldRef<any>): FilterExpr {
  return fn(field, "ThisYear", "this-year", [])
}

export function Today(field: FieldRef<any>): FilterExpr {
  return fn(field, "Today", "today", [])
}

export function Tomorrow(field: FieldRef<any>): FilterExpr {
  return fn(field, "Tomorrow", "tomorrow", [])
}

export function Under(field: FieldRef<any>, value: string): FilterExpr {
  return fn(field, "Under", "under", [value])
}

export function UnderOrEqual(field: FieldRef<any>, value: string): FilterExpr {
  return fn(field, "UnderOrEqual", "under-or-equal", [value])
}

export function Yesterday(field: FieldRef<any>): FilterExpr {
  return fn(field, "Yesterday", "yesterday", [])
}
