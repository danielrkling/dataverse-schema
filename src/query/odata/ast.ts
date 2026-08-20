import { wrapString } from "../../util";
import type { FieldPath } from "../path";
import { fieldPathName } from "../path";
import type { FilterNode } from "../filter/ast";

export type { FieldPath, QueryProperty } from "../path";
export type ODataAlias = string;
export type ODataPath = string;
export type ODataFilterValue = string | number | boolean | Date | null;

export type ODataFilterNode =
  | { readonly type: "comparison"; readonly field: ODataPath; readonly operator: string; readonly value: ODataFilterValue }
  | { readonly type: "null"; readonly field: ODataPath; readonly positive: boolean }
  | { readonly type: "contains" | "startsWith" | "endsWith"; readonly field: ODataPath; readonly value: string }
  | { readonly type: "compare"; readonly field: ODataPath; readonly operator: string; readonly otherField: ODataPath }
  | { readonly type: "lambda"; readonly field: ODataPath; readonly operator: "any" | "all"; readonly alias: string; readonly condition: ODataFilterNode }
  | { readonly type: "fn"; readonly field: ODataPath; readonly fnName: string; readonly operator: string; readonly values: readonly ODataFilterValue[] }
  | { readonly type: "raw"; readonly value: string }
  | { readonly type: "and" | "or"; readonly conditions: readonly ODataFilterNode[] }
  | { readonly type: "not"; readonly condition: ODataFilterNode };

export type ODataAggregateExpressionAst = {
  field?: ODataPath;
  operation: string;
  alias: string;
};

export type ODataApplyAst =
  | { kind: "groupby"; fields: ODataPath[]; next?: ODataApplyAst }
  | { kind: "aggregate"; expressions: ODataAggregateExpressionAst[] };

export type ODataOrderAst = { field: ODataPath; direction: "asc" | "desc" };
export type ODataAggregateOrderAst = { field: ODataAlias; direction: "asc" | "desc" };

export type ODataExpandAst = {
  navigation: ODataPath;
  query?: ODataSelectAst;
};

export type ODataSelectAst = {
  kind: "select";
  select?: ODataPath[];
  filters?: ODataFilterNode[];
  orderby?: ODataOrderAst[];
  expands?: ODataExpandAst[];
  top?: number;
};

export type ODataAggregateAst = {
  kind: "aggregate";
  filters?: ODataFilterNode[];
  apply?: ODataApplyAst;
  orderby?: ODataAggregateOrderAst[];
  top?: number;
};

export function toODataPath(path: FieldPath): ODataPath {
  return fieldPathName(path);
}

export function toODataFilterNode(node: FilterNode): ODataFilterNode {
  switch (node.type) {
    case "comparison": return { ...node, field: toODataPath(node.field) };
    case "null": return { ...node, field: toODataPath(node.field) };
    case "contains":
    case "startsWith":
    case "endsWith": return { ...node, field: toODataPath(node.field) };
    case "compare": return { ...node, field: toODataPath(node.field), otherField: toODataPath(node.otherField) };
    case "lambda": return { ...node, field: toODataPath(node.field), condition: toODataFilterNode(node.condition) };
    case "fn": return { ...node, field: toODataPath(node.field) };
    case "raw": return node;
    case "and":
    case "or": return { ...node, conditions: node.conditions.map(toODataFilterNode) };
    case "not": return { ...node, condition: toODataFilterNode(node.condition) };
  }
}

function renderFilter(node: ODataFilterNode, scope?: string): string {
  const field = (path: string) => `${scope ? `${scope}/` : ""}${path}`;
  switch (node.type) {
    case "comparison": return `(${field(node.field)} ${node.operator} ${wrapString(node.value)})`;
    case "null": return `${field(node.field)} ${node.positive ? "eq" : "ne"} null`;
    case "contains": return `contains(${field(node.field)},${wrapString(node.value)})`;
    case "startsWith": return `startswith(${field(node.field)},${wrapString(node.value)})`;
    case "endsWith": return `endswith(${field(node.field)},${wrapString(node.value)})`;
    case "compare": return `(${field(node.field)} ${node.operator} ${field(node.otherField)})`;
    case "lambda": return `${node.field}/${node.operator}(${node.alias}: ${renderFilter(node.condition, node.alias)})`;
    case "fn": {
      const propertyName = wrapString(field(node.field));
      const values = node.values.map(wrapString);
      if (values.length === 0) return `Microsoft.Dynamics.CRM.${node.fnName}(PropertyName=${propertyName})`;
      if (values.length === 1) return `Microsoft.Dynamics.CRM.${node.fnName}(PropertyName=${propertyName},PropertyValue=${values[0]})`;
      if (node.fnName === "Between" || node.fnName === "NotBetween") return `Microsoft.Dynamics.CRM.${node.fnName}(PropertyName=${propertyName},PropertyValues=[${values.join(",")}])`;
      if (["InFiscalPeriodAndYear", "InOrAfterFiscalPeriodAndYear", "InOrBeforeFiscalPeriodAndYear"].includes(node.fnName)) return `Microsoft.Dynamics.CRM.${node.fnName}(PropertyName=${propertyName},PropertyValue1=${values[0]},PropertyValue2=${values[1]})`;
      return `Microsoft.Dynamics.CRM.${node.fnName}(PropertyName=${propertyName},PropertyValues=[${values.join(",")}])`;
    }
    case "raw": return node.value;
    case "and": return node.conditions.length === 0 ? "" : `(${node.conditions.map(child => renderFilter(child, scope)).join(" and ")})`;
    case "or": return node.conditions.length === 0 ? "" : `(${node.conditions.map(child => renderFilter(child, scope)).join(" or ")})`;
    case "not": return `not(${renderFilter(node.condition, scope)})`;
  }
}

function renderFilters(filters: ODataFilterNode[]): string | undefined {
  if (filters.length === 0) return undefined;
  return `$filter=${filters.map(filter => renderFilter(filter)).join(" and ")}`;
}

function renderOrderby(orderby: ODataOrderAst[]): string | undefined {
  if (orderby.length === 0) return undefined;
  return `$orderby=${orderby.map(order => `${order.field} ${order.direction}`).join(",")}`;
}

function renderAggregateOrderby(orderby: ODataAggregateOrderAst[]): string | undefined {
  if (orderby.length === 0) return undefined;
  return `$orderby=${orderby.map(order => `${order.field} ${order.direction}`).join(",")}`;
}

function serializeApply(ast: ODataApplyAst): string {
  if (ast.kind === "aggregate") {
    return `aggregate(${ast.expressions.map(expression => expression.field
      ? `${expression.field} with ${expression.operation} as ${expression.alias}`
      : `$count as ${expression.alias}`).join(",")})`;
  }
  return `groupby((${ast.fields.join(",")})${ast.next ? `,${serializeApply(ast.next)}` : ""})`;
}

function renderExpands(expands: ODataExpandAst[]): string | undefined {
  if (expands.length === 0) return undefined;
  return `$expand=${expands.map(expand => expand.query
    ? `${expand.navigation}(${serializeODataSelect(expand.query, ";")})`
    : expand.navigation).join(",")}`;
}

export function serializeODataSelect(ast: ODataSelectAst, separator: "&" | ";" = "&"): string {
  return [
    ast.select && ast.select.length > 0 ? `$select=${ast.select.join(",")}` : undefined,
    renderFilters(ast.filters ?? []),
    renderOrderby(ast.orderby ?? []),
    renderExpands(ast.expands ?? []),
    ast.top === undefined ? undefined : `$top=${ast.top}`,
  ].filter((part): part is string => part !== undefined).join(separator);
}

export function serializeODataAggregate(ast: ODataAggregateAst): string {
  return [
    renderFilters(ast.filters ?? []),
    ast.apply ? `$apply=${serializeApply(ast.apply)}` : undefined,
    renderAggregateOrderby(ast.orderby ?? []),
    ast.top === undefined ? undefined : `$top=${ast.top}`,
  ].filter((part): part is string => part !== undefined).join("&");
}
