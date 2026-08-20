import { FieldPath } from '../path';
import { FilterNode } from '../filter/ast';
export type { FieldPath, QueryProperty } from '../path';
export type ODataAlias = string;
export type ODataPath = string;
export type ODataFilterValue = string | number | boolean | Date | null;
export type ODataFilterNode = {
    readonly type: "comparison";
    readonly field: ODataPath;
    readonly operator: string;
    readonly value: ODataFilterValue;
} | {
    readonly type: "null";
    readonly field: ODataPath;
    readonly positive: boolean;
} | {
    readonly type: "contains" | "startsWith" | "endsWith";
    readonly field: ODataPath;
    readonly value: string;
} | {
    readonly type: "compare";
    readonly field: ODataPath;
    readonly operator: string;
    readonly otherField: ODataPath;
} | {
    readonly type: "lambda";
    readonly field: ODataPath;
    readonly operator: "any" | "all";
    readonly alias: string;
    readonly condition: ODataFilterNode;
} | {
    readonly type: "fn";
    readonly field: ODataPath;
    readonly fnName: string;
    readonly operator: string;
    readonly values: readonly ODataFilterValue[];
} | {
    readonly type: "raw";
    readonly value: string;
} | {
    readonly type: "and" | "or";
    readonly conditions: readonly ODataFilterNode[];
} | {
    readonly type: "not";
    readonly condition: ODataFilterNode;
};
export type ODataAggregateExpressionAst = {
    field?: ODataPath;
    operation: string;
    alias: string;
};
export type ODataApplyAst = {
    kind: "groupby";
    fields: ODataPath[];
    next?: ODataApplyAst;
} | {
    kind: "aggregate";
    expressions: ODataAggregateExpressionAst[];
};
export type ODataOrderAst = {
    field: ODataPath;
    direction: "asc" | "desc";
};
export type ODataAggregateOrderAst = {
    field: ODataAlias;
    direction: "asc" | "desc";
};
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
export declare function toODataPath(path: FieldPath): ODataPath;
export declare function toODataFilterNode(node: FilterNode): ODataFilterNode;
export declare function serializeODataSelect(ast: ODataSelectAst, separator?: "&" | ";"): string;
export declare function serializeODataAggregate(ast: ODataAggregateAst): string;
