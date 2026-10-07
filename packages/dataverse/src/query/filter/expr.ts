import { FieldRef } from "../shared/field-ref"
import { FilterNode, FilterValue } from "./ast"
import { renderFilterOdata } from "./render-odata"
import { renderFilterFetchXml } from "./render-fetchxml"
import { NumberField } from "../../fields"
import type { FieldBase } from "../../fields"
import type { FieldPath, QueryProperty } from "../path"

export { FieldRef } from "../shared/field-ref"

/**
 * A field reference for filter expressions: either a typed `FieldRef` (from a
 * query builder proxy) or a raw field instance belonging to the root entity.
 */
export type FilterField = FieldRef<any> | QueryProperty

type NonNullType<T> = T extends Date | null ? Date : Exclude<T, null>

function toRef(field: FilterField): FieldRef<any> {
  if (field instanceof FieldRef) return field
  const f = field as QueryProperty
  return new FieldRef(f, f.fromDataverseName ?? f.logicalName)
}

/** Returns a ref if the value is a field reference or raw property instance, otherwise null. */
function asRef(value: unknown): FieldRef<any> | null {
  if (value instanceof FieldRef) return value as FieldRef<any>
  if (value && typeof value === "object") {
    const v = value as Partial<QueryProperty>
    if (typeof (v.fromDataverseName ?? v.logicalName) === "string") return toRef(value as FilterField)
  }
  return null
}

function pathOf(field: FilterField): FieldPath {
  return toRef(field).path
}

/** Converts typed field values (e.g. choice labels) into their Dataverse representation before rendering. */
function toFilterValue(field: FilterField, value: unknown): FilterValue {
  const f = toRef(field).field
  if (value == null || typeof value !== "string") return value as FilterValue
  if (f?.type !== "choice") return value as FilterValue
  return f.transformValueToDataverse(value) as FilterValue
}

export class FilterExpr {
  constructor(private node: FilterNode) {}

  toString(): string {
    return this.toOdata()
  }

  toOdata(): string {
    return renderFilterOdata(this.node)
  }

  toFetchXml(): string {
    return renderFilterFetchXml(this.node)
  }

  getNode(): FilterNode {
    return this.node
  }
}

function fn(field: FilterField, fnName: string, operator: string, values: FilterValue[]): FilterExpr {
  return new FilterExpr({ type: "fn", field: pathOf(field), fnName, operator, values: values.map(v => toFilterValue(field, v)) })
}

function compare(field: FilterField, operator: string, value: unknown): FilterExpr {
  const other = asRef(value)
  if (other) {
    return new FilterExpr({ type: "compare", field: pathOf(field), operator, otherField: other.path })
  }
  const ref = toRef(field)
  return new FilterExpr({ type: "comparison", field: ref.path, operator, value: toFilterValue(ref, value) })
}

/** A typed field reference (`FieldRef`) or a raw root-level field instance. Both carry the value type `T`. */
type TypedField<T> = FieldRef<T> | FieldBase<T>

export function eq<T>(field: TypedField<T>, value: NoInfer<T> | null | FilterField): FilterExpr {
  return compare(field, "eq", value)
}

export function ne<T>(field: TypedField<T>, value: NoInfer<T> | null | FilterField): FilterExpr {
  return compare(field, "ne", value)
}

export function gt<T extends number | string | Date | null>(field: TypedField<T>, value: NoInfer<NonNullType<T>> | FilterField): FilterExpr {
  return compare(field, "gt", value)
}

export function ge<T extends number | string | Date | null>(field: TypedField<T>, value: NoInfer<NonNullType<T>> | FilterField): FilterExpr {
  return compare(field, "ge", value)
}

export function lt<T extends number | string | Date | null>(field: TypedField<T>, value: NoInfer<NonNullType<T>> | FilterField): FilterExpr {
  return compare(field, "lt", value)
}

export function le<T extends number | string | Date | null>(field: TypedField<T>, value: NoInfer<NonNullType<T>> | FilterField): FilterExpr {
  return compare(field, "le", value)
}

export function isNull(field: FilterField): FilterExpr {
  return new FilterExpr({ type: "null", field: pathOf(field), positive: true })
}

export function isNotNull(field: FilterField): FilterExpr {
  return new FilterExpr({ type: "null", field: pathOf(field), positive: false })
}

export function contains(field: FilterField, value: string): FilterExpr {
  return new FilterExpr({ type: "contains", field: pathOf(field), value })
}

export function startsWith(field: FilterField, value: string): FilterExpr {
  return new FilterExpr({ type: "startsWith", field: pathOf(field), value })
}

export function endsWith(field: FilterField, value: string): FilterExpr {
  return new FilterExpr({ type: "endsWith", field: pathOf(field), value })
}

export function and(...conditions: (FilterExpr | string)[]): FilterExpr {
  const valid = conditions.filter(c => c != null && c !== "")
  const exprs = valid.map(c => typeof c === "string" ? new FilterExpr({ type: "raw", value: c }) : c)
  return new FilterExpr({ type: "and", conditions: exprs.map((expr) => expr.getNode()) })
}

export function or(...conditions: (FilterExpr | string)[]): FilterExpr {
  const valid = conditions.filter(c => c != null && c !== "")
  const exprs = valid.map(c => typeof c === "string" ? new FilterExpr({ type: "raw", value: c }) : c)
  return new FilterExpr({ type: "or", conditions: exprs.map((expr) => expr.getNode()) })
}

export function not(condition: FilterExpr | string): FilterExpr {
  const c = typeof condition === "string" ? new FilterExpr({ type: "raw", value: condition }) : condition
  return new FilterExpr({ type: "not", condition: c.getNode() })
}

export function isActive(): FilterExpr {
  return eq(FieldRef.fromPath(new NumberField("statecode"), "statecode"), 0)
}

export function isInactive(): FilterExpr {
  return eq(FieldRef.fromPath(new NumberField("statecode"), "statecode"), 1)
}

export function Above(field: FilterField, value: string): FilterExpr {
  return fn(field, "Above", "above", [value])
}

export function AboveOrEqual(field: FilterField, value: string): FilterExpr {
  return fn(field, "AboveOrEqual", "above-or-equal", [value])
}

export function Between(field: FilterField, value1: string | number, value2: string | number): FilterExpr {
  return fn(field, "Between", "between", [value1, value2])
}

export function ContainsValues(field: FilterField, values: (string | number)[]): FilterExpr {
  return fn(field, "ContainsValues", "in", values)
}

export function DoesNotContainValues(field: FilterField, values: (string | number)[]): FilterExpr {
  return fn(field, "DoesNotContainValues", "not-in", values)
}

export function EqualBusinessId(field: FilterField): FilterExpr {
  return fn(field, "EqualBusinessId", "eq-businessid", [])
}

export function EqualUserId(field: FilterField): FilterExpr {
  return fn(field, "EqualUserId", "eq-userid", [])
}

export function EqualUserLanguage(field: FilterField): FilterExpr {
  return fn(field, "EqualUserLanguage", "eq-userlanguage", [])
}

export function EqualUserOrUserHierarchy(field: FilterField): FilterExpr {
  return fn(field, "EqualUserOrUserHierarchy", "eq-useroruserhierarchy", [])
}

export function EqualUserOrUserHierarchyAndTeams(field: FilterField): FilterExpr {
  return fn(field, "EqualUserOrUserHierarchyAndTeams", "eq-useroruserhierarchyandteams", [])
}

export function EqualUserOrUserTeams(field: FilterField): FilterExpr {
  return fn(field, "EqualUserOrUserTeams", "eq-useroruserteams", [])
}

export function In<T extends string | number>(field: TypedField<T>, values: NoInfer<T>[]): FilterExpr {
  return fn(field, "In", "in", values)
}

export function InFiscalPeriod(field: FilterField, value: number): FilterExpr {
  return fn(field, "InFiscalPeriod", "in-fiscal-period", [value])
}

export function InFiscalPeriodAndYear(field: FilterField, fiscalPeriod: number, fiscalYear: number): FilterExpr {
  return fn(field, "InFiscalPeriodAndYear", "in-fiscal-period-and-year", [fiscalPeriod, fiscalYear])
}

export function InFiscalYear(field: FilterField, value: number): FilterExpr {
  return fn(field, "InFiscalYear", "in-fiscal-year", [value])
}

export function InOrAfterFiscalPeriodAndYear(field: FilterField, fiscalPeriod: number, fiscalYear: number): FilterExpr {
  return fn(field, "InOrAfterFiscalPeriodAndYear", "in-or-after-fiscal-period-and-year", [fiscalPeriod, fiscalYear])
}

export function InOrBeforeFiscalPeriodAndYear(field: FilterField, fiscalPeriod: number, fiscalYear: number): FilterExpr {
  return fn(field, "InOrBeforeFiscalPeriodAndYear", "in-or-before-fiscal-period-and-year", [fiscalPeriod, fiscalYear])
}

export function Last7Days(field: FilterField): FilterExpr {
  return fn(field, "Last7Days", "last-seven-days", [])
}

export function LastFiscalPeriod(field: FilterField): FilterExpr {
  return fn(field, "LastFiscalPeriod", "last-fiscal-period", [])
}

export function LastFiscalYear(field: FilterField): FilterExpr {
  return fn(field, "LastFiscalYear", "last-fiscal-year", [])
}

export function LastMonth(field: FilterField): FilterExpr {
  return fn(field, "LastMonth", "last-month", [])
}

export function LastWeek(field: FilterField): FilterExpr {
  return fn(field, "LastWeek", "last-week", [])
}

export function LastXDays(field: FilterField, value: number): FilterExpr {
  return fn(field, "LastXDays", "last-x-days", [value])
}

export function LastXFiscalPeriods(field: FilterField, value: number): FilterExpr {
  return fn(field, "LastXFiscalPeriods", "last-x-fiscal-periods", [value])
}

export function LastXFiscalYears(field: FilterField, value: number): FilterExpr {
  return fn(field, "LastXFiscalYears", "last-x-fiscal-years", [value])
}

export function LastXHours(field: FilterField, value: number): FilterExpr {
  return fn(field, "LastXHours", "last-x-hours", [value])
}

export function LastXMonths(field: FilterField, value: number): FilterExpr {
  return fn(field, "LastXMonths", "last-x-months", [value])
}

export function LastXWeeks(field: FilterField, value: number): FilterExpr {
  return fn(field, "LastXWeeks", "last-x-weeks", [value])
}

export function LastXYears(field: FilterField, value: number): FilterExpr {
  return fn(field, "LastXYears", "last-x-years", [value])
}

export function LastYear(field: FilterField): FilterExpr {
  return fn(field, "LastYear", "last-year", [])
}

export function Next7Days(field: FilterField): FilterExpr {
  return fn(field, "Next7Days", "next-seven-days", [])
}

export function NextFiscalPeriod(field: FilterField): FilterExpr {
  return fn(field, "NextFiscalPeriod", "next-fiscal-period", [])
}

export function NextFiscalYear(field: FilterField): FilterExpr {
  return fn(field, "NextFiscalYear", "next-fiscal-year", [])
}

export function NextMonth(field: FilterField): FilterExpr {
  return fn(field, "NextMonth", "next-month", [])
}

export function NextWeek(field: FilterField): FilterExpr {
  return fn(field, "NextWeek", "next-week", [])
}

export function NextXDays(field: FilterField, value: number): FilterExpr {
  return fn(field, "NextXDays", "next-x-days", [value])
}

export function NextXFiscalPeriods(field: FilterField, value: number): FilterExpr {
  return fn(field, "NextXFiscalPeriods", "next-x-fiscal-periods", [value])
}

export function NextXFiscalYears(field: FilterField, value: number): FilterExpr {
  return fn(field, "NextXFiscalYears", "next-x-fiscal-years", [value])
}

export function NextXHours(field: FilterField, value: number): FilterExpr {
  return fn(field, "NextXHours", "next-x-hours", [value])
}

export function NextXMonths(field: FilterField, value: number): FilterExpr {
  return fn(field, "NextXMonths", "next-x-months", [value])
}

export function NextXWeeks(field: FilterField, value: number): FilterExpr {
  return fn(field, "NextXWeeks", "next-x-weeks", [value])
}

export function NextXYears(field: FilterField, value: number): FilterExpr {
  return fn(field, "NextXYears", "next-x-years", [value])
}

export function NextYear(field: FilterField): FilterExpr {
  return fn(field, "NextYear", "next-year", [])
}

export function NotBetween(field: FilterField, value1: string | number, value2: string | number): FilterExpr {
  return fn(field, "NotBetween", "not-between", [value1, value2])
}

export function NotEqualBusinessId(field: FilterField): FilterExpr {
  return fn(field, "NotEqualBusinessId", "neq-businessid", [])
}

export function NotEqualUserId(field: FilterField): FilterExpr {
  return fn(field, "NotEqualUserId", "neq-userid", [])
}

export function NotIn<T extends string | number>(field: TypedField<T>, values: NoInfer<T>[]): FilterExpr {
  return fn(field, "NotIn", "not-in", values)
}

export function NotUnder(field: FilterField, value: string): FilterExpr {
  return fn(field, "NotUnder", "not-under", [value])
}

export function OlderThanXDays(field: FilterField, value: number): FilterExpr {
  return fn(field, "OlderThanXDays", "olderthan-x-days", [value])
}

export function OlderThanXHours(field: FilterField, value: number): FilterExpr {
  return fn(field, "OlderThanXHours", "olderthan-x-hours", [value])
}

export function OlderThanXMinutes(field: FilterField, value: number): FilterExpr {
  return fn(field, "OlderThanXMinutes", "olderthan-x-minutes", [value])
}

export function OlderThanXMonths(field: FilterField, value: number): FilterExpr {
  return fn(field, "OlderThanXMonths", "olderthan-x-months", [value])
}

export function OlderThanXWeeks(field: FilterField, value: number): FilterExpr {
  return fn(field, "OlderThanXWeeks", "olderthan-x-weeks", [value])
}

export function OlderThanXYears(field: FilterField, value: number): FilterExpr {
  return fn(field, "OlderThanXYears", "olderthan-x-years", [value])
}

export function On(field: FilterField, value: string): FilterExpr {
  return fn(field, "On", "on", [value])
}

export function OnOrAfter(field: FilterField, value: string): FilterExpr {
  return fn(field, "OnOrAfter", "on-or-after", [value])
}

export function OnOrBefore(field: FilterField, value: string): FilterExpr {
  return fn(field, "OnOrBefore", "on-or-before", [value])
}

export function ThisFiscalPeriod(field: FilterField): FilterExpr {
  return fn(field, "ThisFiscalPeriod", "this-fiscal-period", [])
}

export function ThisFiscalYear(field: FilterField): FilterExpr {
  return fn(field, "ThisFiscalYear", "this-fiscal-year", [])
}

export function ThisMonth(field: FilterField): FilterExpr {
  return fn(field, "ThisMonth", "this-month", [])
}

export function ThisWeek(field: FilterField): FilterExpr {
  return fn(field, "ThisWeek", "this-week", [])
}

export function ThisYear(field: FilterField): FilterExpr {
  return fn(field, "ThisYear", "this-year", [])
}

export function Today(field: FilterField): FilterExpr {
  return fn(field, "Today", "today", [])
}

export function Tomorrow(field: FilterField): FilterExpr {
  return fn(field, "Tomorrow", "tomorrow", [])
}

export function Under(field: FilterField, value: string): FilterExpr {
  return fn(field, "Under", "under", [value])
}

export function UnderOrEqual(field: FilterField, value: string): FilterExpr {
  return fn(field, "UnderOrEqual", "under-or-equal", [value])
}

export function Yesterday(field: FilterField): FilterExpr {
  return fn(field, "Yesterday", "yesterday", [])
}
