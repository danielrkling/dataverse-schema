import { CollectionProperty, FieldBase, LookupProperty } from '../fields';
export type QueryProperty = FieldBase<any> | LookupProperty<any> | CollectionProperty<any>;
export type FieldPath = readonly QueryProperty[];
export declare function fieldPathName(path: FieldPath): string;
