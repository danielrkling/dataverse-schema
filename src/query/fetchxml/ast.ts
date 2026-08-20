import type { FilterNode } from "../filter/ast";
import { renderFilterFetchXml } from "../filter/render-fetchxml";

export type FetchXmlAttributeAst = {
  name: string;
  alias?: string;
  aggregate?: string;
  groupby?: boolean;
  dategrouping?: string;
  distinct?: boolean;
  rowaggregate?: string;
};

export type FetchXmlOrderAst = {
  attribute: string;
  entityname?: string;
  descending?: boolean;
};

export type FetchXmlLinkAst = {
  name: string;
  from?: string;
  to?: string;
  linkType: string;
  alias?: string;
  intersect?: boolean;
  attributes: FetchXmlAttributeAst[];
  filters: Array<FilterNode | string>;
  orders: FetchXmlOrderAst[];
  links: FetchXmlLinkAst[];
};

type FetchXmlBaseAst = {
  entity: string;
  attributes: FetchXmlAttributeAst[];
  filters: Array<FilterNode | string>;
  orders: FetchXmlOrderAst[];
  links: FetchXmlLinkAst[];
  distinct?: boolean;
  top?: number;
  datasource?: string;
  options?: string;
  lateMaterialize?: boolean;
  aggregateLimit?: number;
  useRawOrderBy?: boolean;
  version?: string;
  mapping?: string;
};

export type FetchXmlSelectAst = FetchXmlBaseAst & { kind: "xml-select" };
export type FetchXmlAggregateAst = FetchXmlBaseAst & { kind: "xml-aggregate" };

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function serializeAttribute(attribute: FetchXmlAttributeAst): string {
  const values = [
    `name="${escapeXml(attribute.name)}"`,
    attribute.alias === undefined ? undefined : `alias="${escapeXml(attribute.alias)}"`,
    attribute.aggregate === undefined ? undefined : `aggregate="${escapeXml(attribute.aggregate)}"`,
    attribute.groupby ? `groupby="true"` : undefined,
    attribute.dategrouping === undefined ? undefined : `dategrouping="${escapeXml(attribute.dategrouping)}"`,
    attribute.distinct ? `distinct="true"` : undefined,
    attribute.rowaggregate === undefined ? undefined : `rowaggregate="${escapeXml(attribute.rowaggregate)}"`,
  ].filter((value): value is string => value !== undefined);
  return `<attribute ${values.join(" ")}/>`;
}

function serializeOrder(order: FetchXmlOrderAst): string {
  const values = [
    `attribute="${escapeXml(order.attribute)}"`,
    order.entityname === undefined ? undefined : `entityname="${escapeXml(order.entityname)}"`,
    order.descending ? `descending="true"` : undefined,
  ].filter((value): value is string => value !== undefined);
  return `<order ${values.join(" ")}/>`;
}

function serializeLink(link: FetchXmlLinkAst): string {
  const values = [
    `name="${escapeXml(link.name)}"`,
    link.from === undefined ? undefined : `from="${escapeXml(link.from)}"`,
    link.to === undefined ? undefined : `to="${escapeXml(link.to)}"`,
    `link-type="${escapeXml(link.linkType)}"`,
    link.alias === undefined ? undefined : `alias="${escapeXml(link.alias)}"`,
    link.intersect ? `intersect="true"` : undefined,
  ].filter((value): value is string => value !== undefined);
  return `<link-entity ${values.join(" ")}>${serializeContents(link)}</link-entity>`;
}

function serializeContents(ast: Pick<FetchXmlBaseAst, "attributes" | "filters" | "orders" | "links">): string {
  const attributes = ast.attributes.map(serializeAttribute).join("");
  const filters = ast.filters.map(filter => typeof filter === "string" ? filter : renderFilterFetchXml(filter)).join("");
  const orders = ast.orders.map(serializeOrder).join("");
  const links = ast.links.map(serializeLink).join("");
  return `${attributes}${filters}${orders}${links}`;
}

export function serializeFetchXml(ast: FetchXmlSelectAst | FetchXmlAggregateAst): string {
  const values = [
    `name="${escapeXml(ast.entity)}"`,
    ast.version === undefined ? undefined : `version="${escapeXml(ast.version)}"`,
    ast.mapping === undefined ? undefined : `mapping="${escapeXml(ast.mapping)}"`,
    ast.distinct ? `distinct="true"` : undefined,
    ast.top === undefined ? undefined : `top="${ast.top}"`,
    ast.datasource === undefined ? undefined : `datasource="${escapeXml(ast.datasource)}"`,
    ast.options === undefined ? undefined : `options="${escapeXml(ast.options)}"`,
    ast.lateMaterialize ? `latematerialize="true"` : undefined,
    ast.aggregateLimit === undefined ? undefined : `aggregatelimit="${ast.aggregateLimit}"`,
    ast.useRawOrderBy ? `useraworderby="true"` : undefined,
  ].filter((value): value is string => value !== undefined);
  return `<fetch${ast.kind === "xml-aggregate" ? ` aggregate="true"` : ""}><entity ${values.join(" ")}>${serializeContents(ast)}</entity></fetch>`;
}
