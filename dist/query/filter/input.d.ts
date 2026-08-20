import { FilterExpr } from './expr';
import { FilterNode } from './ast';
export type FilterDialect = "odata" | "fetchXml";
export declare function filterInputNode<TProxy>(filter: string | FilterExpr | ((proxy: TProxy) => string | FilterExpr), proxy: TProxy): FilterNode;
export declare function renderFilterInput<TProxy>(filter: string | FilterExpr | ((proxy: TProxy) => string | FilterExpr), proxy: TProxy, dialect: FilterDialect): string;
