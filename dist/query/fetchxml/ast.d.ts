import { FilterNode } from '../filter/ast';
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
export type FetchXmlSelectAst = FetchXmlBaseAst & {
    kind: "xml-select";
};
export type FetchXmlAggregateAst = FetchXmlBaseAst & {
    kind: "xml-aggregate";
};
export declare function serializeFetchXml(ast: FetchXmlSelectAst | FetchXmlAggregateAst): string;
export {};
