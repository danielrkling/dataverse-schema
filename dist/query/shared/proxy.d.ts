import { DataverseTable } from '../../table';
import { GenericProperties } from '../../types';
import { FieldRef } from './field-ref';
export declare function buildFlatFieldProxy<T extends GenericProperties>(table: DataverseTable<T>): Record<string, FieldRef<any>>;
