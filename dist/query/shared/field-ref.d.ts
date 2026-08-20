import { FieldBase, TransformContext } from '../../fields';
import { QueryProperty } from '../path';
export declare class FieldRef<T = any, K extends string = string, F extends FieldBase<T> = FieldBase<T>> {
    readonly field: F;
    readonly path: readonly QueryProperty[];
    private readonly _path;
    constructor(field: F, path?: string, pathSegments?: readonly QueryProperty[]);
    static fromPath<T, F extends FieldBase<T>>(field: F, path: string, pathSegments?: readonly QueryProperty[]): FieldRef<T, string, F>;
    get dataverseName(): string;
    transformFromDataverse(value: unknown, ctx?: TransformContext): T;
    transformToDataverse(value: T, ctx?: TransformContext): unknown;
    toString(): string;
}
