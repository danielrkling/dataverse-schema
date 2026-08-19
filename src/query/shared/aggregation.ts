import { FieldRef } from "./field-ref"
import type { FieldPath } from "../path"

function fieldName(field: FieldRef<any> | string): string {
  return typeof field === "string" ? field : field.toString()
}

export class GroupByExpr<V = any> {
  field: string
  fieldRef?: FieldRef<V>
  path?: FieldPath
  constructor(field: string, fieldRef?: FieldRef<V>) { this.field = field; this.fieldRef = fieldRef; this.path = fieldRef?.path }
}

export class Aggregation<V = any> {
  field?: string
  fieldRef?: FieldRef<V>
  path?: FieldPath
  operation: string
  constructor(operation: string, field?: string, fieldRef?: FieldRef<V>) {
    this.operation = operation
    this.field = field
    this.fieldRef = fieldRef
    this.path = fieldRef?.path
  }
}

type NumericRef = FieldRef<number> | FieldRef<number | null>
type MinMaxRef = NumericRef | FieldRef<Date> | FieldRef<Date | null>

export function sum(field: NumericRef): Aggregation<number> { return new Aggregation("sum", fieldName(field), field as FieldRef<number>) }
export function min(field: MinMaxRef): Aggregation<number | Date> { return new Aggregation("min", fieldName(field), field as FieldRef<number | Date>) }
export function max(field: MinMaxRef): Aggregation<number | Date> { return new Aggregation("max", fieldName(field), field as FieldRef<number | Date>) }
export function average(field: NumericRef): Aggregation<number> { return new Aggregation("average", fieldName(field), field as FieldRef<number>) }
export function count(field?: FieldRef<any>): Aggregation<number> { return new Aggregation<number>("count", field ? fieldName(field) : undefined, field as FieldRef<number> | undefined) }
export function groupby<V>(field: FieldRef<V>): GroupByExpr<V> { return new GroupByExpr(fieldName(field), field) }
