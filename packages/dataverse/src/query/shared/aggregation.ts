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

/** Accepts nullable or non-nullable refs and infers the bare value type. */
type ScalarRef<V extends number | Date> =
  | FieldRef<NonNullable<V>>
  | FieldRef<NonNullable<V> | null>

export function sum<V extends number>(field: NumericRef): Aggregation<number> {
  return new Aggregation("sum", fieldName(field), field as FieldRef<number>)
}

/** min/max keep the field's value type: a date column yields `Date`, a numeric one `number`. */
export function min<V extends number | Date>(field: ScalarRef<V>): Aggregation<NonNullable<V>> {
  return new Aggregation<NonNullable<V>>("min", fieldName(field), field as FieldRef<NonNullable<V>>)
}

export function max<V extends number | Date>(field: ScalarRef<V>): Aggregation<NonNullable<V>> {
  return new Aggregation<NonNullable<V>>("max", fieldName(field), field as FieldRef<NonNullable<V>>)
}

export function average<V extends number>(field: NumericRef): Aggregation<number> {
  return new Aggregation("average", fieldName(field), field as FieldRef<number>)
}

export function count(field?: FieldRef<any>): Aggregation<number> { return new Aggregation<number>("count", field ? fieldName(field) : undefined, field as FieldRef<number> | undefined) }
export function groupby<V>(field: FieldRef<V>): GroupByExpr<V> { return new GroupByExpr(fieldName(field), field) }
