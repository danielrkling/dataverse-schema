import { FieldRef } from './field-ref';
import { FieldPath } from '../path';
export declare class GroupByExpr<V = any> {
    field: string;
    fieldRef?: FieldRef<V>;
    path?: FieldPath;
    constructor(field: string, fieldRef?: FieldRef<V>);
}
export declare class Aggregation<V = any> {
    field?: string;
    fieldRef?: FieldRef<V>;
    path?: FieldPath;
    operation: string;
    constructor(operation: string, field?: string, fieldRef?: FieldRef<V>);
}
type NumericRef = FieldRef<number> | FieldRef<number | null>;
type MinMaxRef = NumericRef | FieldRef<Date> | FieldRef<Date | null>;
export declare function sum(field: NumericRef): Aggregation<number>;
export declare function min(field: MinMaxRef): Aggregation<number | Date>;
export declare function max(field: MinMaxRef): Aggregation<number | Date>;
export declare function average(field: NumericRef): Aggregation<number>;
export declare function count(field?: FieldRef<any>): Aggregation<number>;
export declare function groupby<V>(field: FieldRef<V>): GroupByExpr<V>;
export {};
