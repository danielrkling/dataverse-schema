import type { FieldPath } from "../path"

export type FilterValue = string | number | boolean | Date | null
export type FilterComparisonOperator = "eq" | "ne" | "gt" | "ge" | "lt" | "le"
export type FilterFunctionName = string

export type FilterNode =
  | { readonly type: "comparison"; readonly field: FieldPath; readonly operator: FilterComparisonOperator | string; readonly value: FilterValue }
  | { readonly type: "null"; readonly field: FieldPath; readonly positive: boolean }
  | { readonly type: "contains"; readonly field: FieldPath; readonly value: string }
  | { readonly type: "startsWith"; readonly field: FieldPath; readonly value: string }
  | { readonly type: "endsWith"; readonly field: FieldPath; readonly value: string }
  | { readonly type: "compare"; readonly field: FieldPath; readonly operator: FilterComparisonOperator | string; readonly otherField: FieldPath }
  | { readonly type: "lambda"; readonly field: FieldPath; readonly operator: "any" | "all"; readonly alias: string; readonly condition: FilterNode }
  | { readonly type: "fn"; readonly field: FieldPath; readonly fnName: FilterFunctionName; readonly operator: string; readonly values: readonly FilterValue[] }
  | { readonly type: "raw"; readonly value: string }
  | { readonly type: "and"; readonly conditions: readonly FilterNode[] }
  | { readonly type: "or"; readonly conditions: readonly FilterNode[] }
  | { readonly type: "not"; readonly condition: FilterNode }
