import type { CollectionProperty, LookupProperty } from "../../fields";
export type { FieldPath, QueryProperty } from "../path";
import { fieldPathName } from "../path";
import type { FieldPath } from "../path";
import type { FilterNode } from "../filter/ast";
import { renderFilterOdata } from "../filter/render-odata";
export type ODataAlias = { kind: "alias"; name: string };

export type ODataAggregateExpressionAst = {
  field?: FieldPath;
  operation: string;
  alias: string;
};

export type ODataApplyAst =
  | { kind: "groupby"; fields: FieldPath[]; next?: ODataApplyAst }
  | { kind: "aggregate"; expressions: ODataAggregateExpressionAst[] };

function propertyName(property: LookupProperty<any> | CollectionProperty<any>): string {
  return property.fromDataverseName ?? property.name;
}

export type ODataOrderAst = {
  field: FieldPath;
  direction: "asc" | "desc";
};

export type ODataAggregateOrderAst = {
  field: ODataAlias;
  direction: "asc" | "desc";
};

export type ODataExpandAst = {
  navigation: LookupProperty<any> | CollectionProperty<any>;
  query?: ODataSelectAst;
};

export type ODataSelectAst = {
  kind: "odata-select";
  select: FieldPath[];
  filters: FilterNode[];
  orderby: ODataOrderAst[];
  expands: ODataExpandAst[];
  top?: number;
};

export type ODataAggregateAst = {
  kind: "odata-aggregate";
  filters: FilterNode[];
  apply?: ODataApplyAst;
  orderby: ODataAggregateOrderAst[];
  top?: number;
};

function renderFilters(filters: FilterNode[]): string | undefined {
  if (filters.length === 0) return undefined;
  return `$filter=${filters.map(filter => renderFilterOdata(filter)).join(" and ")}`;
}

function renderOrderby(orderby: ODataOrderAst[]): string | undefined {
  if (orderby.length === 0) return undefined;
  return `$orderby=${orderby.map((order) => `${fieldPathName(order.field)} ${order.direction}`).join(",")}`;
}

function renderAggregateOrderby(orderby: ODataAggregateOrderAst[]): string | undefined {
  if (orderby.length === 0) return undefined;
  return `$orderby=${orderby.map((order) => `${order.field.name} ${order.direction}`).join(",")}`;
}

function serializeApply(ast: ODataApplyAst): string {
  if (ast.kind === "aggregate") {
    return `aggregate(${ast.expressions.map(expression => expression.field
      ? `${fieldPathName(expression.field)} with ${expression.operation} as ${expression.alias}`
      : `$count as ${expression.alias}`).join(",")})`;
  }
  return `groupby((${ast.fields.map(fieldPathName).join(",")})${ast.next ? `,${serializeApply(ast.next)}` : ""})`;
}

function renderExpands(expands: ODataExpandAst[]): string | undefined {
  if (expands.length === 0) return undefined;
  return `$expand=${expands.map((expand) => {
    const name = propertyName(expand.navigation);
    if (!expand.query) return name;
    return `${name}(${serializeODataSelect(expand.query, ";")})`;
  }).join(",")}`;
}

export function serializeODataSelect(ast: ODataSelectAst, separator: "&" | ";" = "&"): string {
  return [
    ast.select.length > 0 ? `$select=${ast.select.map(fieldPathName).join(",")}` : undefined,
    renderFilters(ast.filters),
    renderOrderby(ast.orderby),
    renderExpands(ast.expands),
    ast.top === undefined ? undefined : `$top=${ast.top}`,
  ].filter((part): part is string => part !== undefined).join(separator);
}

export function serializeODataAggregate(ast: ODataAggregateAst): string {
  return [
    renderFilters(ast.filters),
    ast.apply ? `$apply=${serializeApply(ast.apply)}` : undefined,
    renderAggregateOrderby(ast.orderby),
    ast.top === undefined ? undefined : `$top=${ast.top}`,
  ].filter((part): part is string => part !== undefined).join("&");
}
