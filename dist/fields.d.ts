import { DataverseClient } from './client';
import { DataverseTable } from './table';
import { GenericProperties, GetTable, GUID, Infer } from './types';
import * as v from "valibot";
export type ValidationSchema<T> = v.BaseSchema<T, T, v.BaseIssue<unknown>>;
export type FieldOptions<T> = {
    default?: T;
    readonly?: boolean;
    schema?: ValidationSchema<T>;
};
export declare const SKIP: unique symbol;
export type TransformContext = {
    table: DataverseTable<any>;
    client: DataverseClient;
    recordId: string;
};
export declare abstract class FieldBase<T> {
    #private;
    name: string;
    fromDataverseName: string;
    toDataverseName: string;
    kind: string;
    type: string;
    schema: ValidationSchema<T>;
    constructor(name: string, defaults: {
        defaultValue: T;
        schema: ValidationSchema<T>;
    }, options?: FieldOptions<T>);
    getDefault(): T;
    getReadOnly(): boolean;
    transformValueFromDataverse(value: unknown, ctx?: TransformContext): T;
    transformValueToDataverse(value: unknown, ctx?: TransformContext): unknown;
    afterSave?(ctx: TransformContext, value: any): Promise<void>;
}
export declare class BooleanField extends FieldBase<boolean> {
    kind: "value";
    type: "boolean";
    constructor(name: string, options?: FieldOptions<boolean>);
    transformValueFromDataverse(value: any): boolean;
}
export declare class NullableBooleanField extends FieldBase<boolean | null> {
    kind: "value";
    type: "boolean";
    constructor(name: string, options?: FieldOptions<boolean | null>);
    transformValueFromDataverse(value: any): boolean | null;
}
export declare class NumberField extends FieldBase<number> {
    kind: "value";
    type: "number";
    constructor(name: string, options?: FieldOptions<number>);
    transformValueFromDataverse(value: any): number;
}
export declare class NullableNumberField extends FieldBase<number | null> {
    kind: "value";
    type: "number";
    constructor(name: string, options?: FieldOptions<number | null>);
    transformValueFromDataverse(value: any): number | null;
}
export declare class StringField extends FieldBase<string> {
    kind: "value";
    type: "string";
    constructor(name: string, options?: FieldOptions<string>);
    transformValueFromDataverse(value: any): string;
}
export declare class NullableStringField extends FieldBase<string | null> {
    kind: "value";
    type: "string";
    constructor(name: string, options?: FieldOptions<string | null>);
    transformValueFromDataverse(value: any): string | null;
}
export declare class PrimaryKeyField extends FieldBase<GUID> {
    kind: "value";
    type: "primaryKey";
    constructor(name: string, options?: FieldOptions<GUID>);
    getDefault(): GUID;
}
export declare class ListField<T extends string | number> extends FieldBase<T | null> {
    kind: "value";
    type: "list";
    readonly list: readonly T[];
    constructor(name: string, list: Array<T>, options?: FieldOptions<T | null>);
}
export declare class ChoiceField<T extends Record<number, string>> extends FieldBase<T[keyof T]> {
    #private;
    kind: "value";
    type: "choice";
    constructor(name: string, options: T, fieldOptions?: FieldOptions<T[keyof T]>);
    transformValueFromDataverse(value: any): T[keyof T];
    transformValueToDataverse(value: any): number;
}
export declare class NullableChoiceField<T extends Record<number, string>> extends FieldBase<T[keyof T] | null> {
    #private;
    kind: "value";
    type: "choice";
    constructor(name: string, options: T, fieldOptions?: FieldOptions<T[keyof T] | null>);
    transformValueFromDataverse(value: any): T[keyof T] | null;
    transformValueToDataverse(value: any): number | null;
}
export declare class DateTimeField extends FieldBase<Date> {
    kind: "value";
    type: "date";
    constructor(name: string, options?: FieldOptions<Date>);
    getDefault(): Date;
    transformValueFromDataverse(value: any): Date;
}
export declare class NullableDateTimeField extends FieldBase<Date | null> {
    kind: "value";
    type: "date";
    constructor(name: string, options?: FieldOptions<Date | null>);
    transformValueFromDataverse(value: any): Date | null;
}
export declare class DateField extends FieldBase<Date> {
    kind: "value";
    type: "dateOnly";
    constructor(name: string, options?: FieldOptions<Date>);
    transformValueFromDataverse(value: any): Date;
    transformValueToDataverse(value: any): string | null;
}
export declare class NullableDateField extends FieldBase<Date | null> {
    kind: "value";
    type: "dateOnly";
    constructor(name: string, options?: FieldOptions<Date | null>);
    transformValueFromDataverse(value: any): Date | null;
    transformValueToDataverse(value: any): string | null;
}
export declare class FormattedField extends FieldBase<string | null> {
    kind: "value";
    type: "formatted";
    constructor(name: string, options?: FieldOptions<string | null>);
}
export declare class ImageField extends FieldBase<ImageRef | null> {
    kind: "image";
    type: "image";
    constructor(name: string, options?: FieldOptions<ImageRef | null>);
    transformValueFromDataverse(value: any, ctx?: TransformContext): ImageRef | null;
    transformValueToDataverse(value: ImageRef | null): Promise<string | null | typeof SKIP>;
    afterSave(ctx: TransformContext, value: any): Promise<void>;
}
export type FileRef = {
    name: string;
    url?: string;
    data?: Blob | null;
};
export type ImageRef = {
    readonly url?: string;
    readonly fullSizeUrl?: string;
    data?: Blob | null;
};
export declare class FileField extends FieldBase<FileRef | null> {
    type: "file";
    kind: "file";
    constructor(name: string, options?: FieldOptions<FileRef | null>);
    transformValueFromDataverse(value: any, ctx?: TransformContext): FileRef | null;
    transformValueToDataverse(): typeof SKIP;
    afterSave(ctx: TransformContext, value: FileRef): Promise<void>;
}
export declare class JsonField<T> extends FieldBase<T> {
    kind: "value";
    type: "json";
    constructor(name: string, schema: ValidationSchema<T>, options?: FieldOptions<T>);
    transformValueFromDataverse(value: any): T;
    transformValueToDataverse(value: any): string | null;
}
/**
 * Creates a boolean-typed Dataverse column definition.
 *
 * @param name The Dataverse logical name of the column (e.g. `"is_active"`).
 *
 * @example
 * const table = new DataverseTable({
 *   isActive: boolean("is_active"),
 * });
 * // Infer<typeof table>["isActive"] → boolean
 */
export declare function boolean(name: string, options?: FieldOptions<boolean>): BooleanField;
export declare function nullableBoolean(name: string, options?: FieldOptions<boolean | null>): NullableBooleanField;
/**
 * Creates a number-typed Dataverse column definition.
 *
 * @param name The Dataverse logical name of the column (e.g. `"person_age"`).
 *
 * @example
 * const table = new DataverseTable({
 *   age: number("person_age"),
 * });
 * // Infer<typeof table>["age"] → number
 */
export declare function number(name: string, options?: FieldOptions<number>): NumberField;
/**
 * Creates a nullable number column definition (allows `null`).
 *
 * @param name The Dataverse logical name of the column.
 *
 * @example
 * const table = new DataverseTable({
 *   age: nullableNumber("person_age"),
 * });
 * // Infer<typeof table>["age"] → number | null
 */
export declare function nullableNumber(name: string, options?: FieldOptions<number | null>): NullableNumberField;
/**
 * Creates a string-typed Dataverse column definition.
 *
 * @param name The Dataverse logical name of the column (e.g. `"fullname"`).
 *
 * @example
 * const table = new DataverseTable({
 *   name: string("fullname"),
 * });
 * // Infer<typeof table>["name"] → string
 */
export declare function string(name: string, options?: FieldOptions<string>): StringField;
/**
 * Creates a nullable string column definition (allows `null`).
 *
 * @param name The Dataverse logical name of the column.
 *
 * @example
 * const table = new DataverseTable({
 *   middleName: nullableString("middlename"),
 * });
 * // Infer<typeof table>["middleName"] → string | null
 */
export declare function nullableString(name: string, options?: FieldOptions<string | null>): NullableStringField;
/**
 * Creates a primary key (GUID) column definition for a Dataverse table.
 *
 * @param name The Dataverse logical name of the primary key column (e.g. `"contactid"`).
 *
 * @example
 * const table = new DataverseTable({
 *   id: primaryKey("contactid"),
 * });
 * // Infer<typeof table>["id"] → `${string}-${string}-${string}-${string}-${string}`
 */
export declare function primaryKey(name: string, options?: FieldOptions<GUID>): PrimaryKeyField;
/**
 * Creates a choice/option-set column definition with a fixed set of allowed values.
 *
 * @param name The Dataverse logical name of the column.
 * @param list The array of allowed string or numeric values.
 *
 * @example
 * const table = new DataverseTable({
 *   gender: list("gendercode", [1, 2]),
 * });
 * // Infer<typeof table>["gender"] → 1 | 2 | null
 */
export declare function list<T extends string | number>(name: string, list: Array<T>, options?: FieldOptions<T | null>): ListField<T>;
/**
 * Creates a choice/option-set column definition. Maps Dataverse numeric option values
 * to human-readable string labels.
 *
 * @param name The Dataverse logical name of the column.
 * @param options An object mapping numeric option values to string labels.
 *
 * @example
 * const table = new DataverseTable({
 *   status: choice("statuscode", { 1: "Active", 2: "Inactive", 3: "Archived" }),
 * });
 * // Infer<typeof table>["status"] → "Active" | "Inactive" | "Archived"
 */
export declare function choice<T extends Record<number, string>>(name: string, options: T, fieldOptions?: FieldOptions<T[keyof T]>): ChoiceField<T>;
/**
 * Creates a nullable choice/option-set column definition (allows `null`).
 *
 * @param name The Dataverse logical name of the column.
 * @param options An object mapping numeric option values to string labels.
 *
 * @example
 * const table = new DataverseTable({
 *   priority: nullableChoice("prioritycode", { 1: "Low", 2: "High" }),
 * });
 * // Infer<typeof table>["priority"] → "Low" | "High" | null
 */
export declare function nullableChoice<T extends Record<number, string>>(name: string, options: T, fieldOptions?: FieldOptions<T[keyof T] | null>): NullableChoiceField<T>;
/**
 * Creates a date-time column definition (maps to JavaScript `Date`).
 *
 * @param name The Dataverse logical name of the column.
 *
 * @example
 * const table = new DataverseTable({
 *   createdAt: datetime("createdon"),
 * });
 * // Infer<typeof table>["createdAt"] → Date
 */
export declare function datetime(name: string, options?: FieldOptions<Date>): DateTimeField;
/**
 * Creates a date-only column definition (maps to JavaScript `Date`, time portion is zeroed).
 *
 * @param name The Dataverse logical name of the column.
 *
 * @example
 * const table = new DataverseTable({
 *   birthDate: date("birthdate"),
 * });
 * // Infer<typeof table>["birthDate"] → Date
 */
export declare function date(name: string, options?: FieldOptions<Date>): DateField;
/**
 * Creates a nullable date-only column definition (allows `null`).
 *
 * @param name The Dataverse logical name of the column.
 */
export declare function nullableDate(name: string, options?: FieldOptions<Date | null>): NullableDateField;
/**
 * Creates a nullable date-time column definition (allows `null`).
 *
 * @param name The Dataverse logical name of the column.
 */
export declare function nullableDateTime(name: string, options?: FieldOptions<Date | null>): NullableDateTimeField;
/**
 * Creates a formatted-value column definition for retrieving user-localized display values
 * (e.g. for option-set labels). These are read-only.
 *
 * @param name The Dataverse logical name of the column.
 *
 * @example
 * const table = new DataverseTable({
 *   statusLabel: formatted("statuscode"),
 * });
 */
export declare function formatted(name: string, options?: FieldOptions<string | null>): FormattedField;
/**
 * Creates an image column definition.
 *
 * @param name The Dataverse logical name of the image column.
 */
export declare function image(name: string, options?: FieldOptions<ImageRef | null>): ImageField;
/**
 * Creates a file column definition. File columns are read-only and store the file name.
 *
 * @param name The Dataverse logical name of the file column.
 */
export declare function file(name: string, options?: FieldOptions<FileRef | null>): FileField;
/**
 * Creates a JSON-typed Dataverse column definition. Stores JSON as a text column
 * in Dataverse and parses/validates it using the provided valibot schema.
 *
 * @param name The Dataverse logical name of the column.
 * @param schema A valibot schema that validates the parsed JSON structure.
 * @param options Optional field options (default, readonly).
 *
 * @example
 * const Address = v.object({ street: v.string(), city: v.string() });
 * const table = new DataverseTable({
 *   address: json("address_data", Address),
 * });
 * // Infer<typeof table>["address"] → { street: string; city: string }
 */
export declare function json<T>(name: string, schema: ValidationSchema<T>, options?: FieldOptions<T>): JsonField<T>;
export declare class LookupIdProperty extends FieldBase<GUID | null> {
    #private;
    kind: "navigation";
    type: "lookupId";
    navigationName: string;
    constructor(name: string, getTable: GetTable, options?: FieldOptions<GUID | null>);
    get table(): DataverseTable<{
        id: PrimaryKeyField;
    }>;
    transformValueToDataverse(value: any): string | null;
}
export declare class CollectionProperty<TProperties extends GenericProperties> extends FieldBase<Infer<TProperties>[]> {
    #private;
    kind: "navigation";
    type: "collection";
    constructor(name: string, getTable: GetTable<DataverseTable<TProperties>>, options?: FieldOptions<Infer<TProperties>[]>);
    get table(): DataverseTable<TProperties>;
    transformValueFromDataverse(value: any): Infer<TProperties>[];
    transformValueToDataverse(): typeof SKIP;
    afterSave(ctx: TransformContext, value: any): Promise<void>;
}
/**
 * Creates a one-to-many (collection) navigation property definition. The related records
 * can be expanded via OData `$expand` or fetched through the table API.
 *
 * @param name The Dataverse logical name of the collection navigation property.
 * @param getTable A thunk that returns the related table definition.
 *
 * @example
 * const Address = table(client, "addresses", { id: primaryKey("addressid"), street: string("street"), ... });
 * const Person = table(client, "people", {
 *   id: primaryKey("personid"),
 *   addresses: collection("person_addresses", () => Address),
 * });
 * // Infer<typeof Person>["addresses"] → { id: GUID; street: string }[]
 */
export declare function collection<TProperties extends GenericProperties>(name: string, getTable: GetTable<DataverseTable<TProperties>>): CollectionProperty<TProperties>;
export declare class CollectionIdsProperty extends FieldBase<GUID[]> {
    #private;
    kind: "navigation";
    type: "collectionIds";
    constructor(name: string, getTable: GetTable, options?: FieldOptions<GUID[]>);
    get table(): DataverseTable<{
        id: PrimaryKeyField;
    }>;
    transformValueFromDataverse(value: any): GUID[];
    transformValueToDataverse(): typeof SKIP;
    afterSave(ctx: TransformContext, value: any): Promise<void>;
}
/**
 * Creates a collection-of-IDs navigation property definition. Unlike a full collection,
 * this only stores the related record IDs (GUIDs), not the full records.
 *
 * @param name The Dataverse logical name of the navigation property.
 * @param getTable A thunk that returns the related table definition.
 *
 * @example
 * const Address = table(client, "addresses", { id: primaryKey("addressid"), ... });
 * const Person = table(client, "people", {
 *   id: primaryKey("personid"),
 *   addressIds: collectionIds("person_addresses", () => Address),
 * });
 * // Infer<typeof Person>["addressIds"] → `${string}-${string}-${string}-${string}-${string}`[]
 */
export declare function collectionIds(name: string, getTable: GetTable): CollectionIdsProperty;
/**
 * Creates a lookup-ID navigation property definition. This stores only the foreign-key
 * GUID of the related record (not the full expanded record).
 *
 * @param name The Dataverse logical name of the lookup column.
 * @param getTable A thunk that returns the related table definition.
 *
 * @example
 * const Address = table(client, "addresses", { id: primaryKey("addressid"), ... });
 * const Person = table(client, "people", {
 *   id: primaryKey("personid"),
 *   primaryAddressId: lookupId("primaryaddressid", () => Address),
 * });
 * // Infer<typeof Person>["primaryAddressId"] → `${string}-${string}-${string}-${string}-${string}` | null
 */
export declare function lookupId(name: string, getTable: GetTable): LookupIdProperty;
export declare class LookupProperty<TProperties extends GenericProperties> extends FieldBase<Infer<TProperties> | null> {
    #private;
    kind: "navigation";
    type: "lookup";
    constructor(name: string, getTable: GetTable<DataverseTable<TProperties>>, options?: FieldOptions<Infer<TProperties> | null>);
    get table(): DataverseTable<TProperties>;
    transformValueFromDataverse(value: any): Infer<TProperties> | null;
    transformValueToDataverse(): typeof SKIP;
    afterSave(ctx: TransformContext, value: any): Promise<void>;
}
/**
 * Creates a many-to-one (lookup) navigation property definition. The related record
 * can be expanded via OData `$expand` or fetched through the table API.
 *
 * @param name The Dataverse logical name of the lookup column.
 * @param getTable A thunk that returns the related table definition.
 *
 * @example
 * const Address = table(client, "addresses", { id: primaryKey("addressid"), ... });
 * const Person = table(client, "people", {
 *   id: primaryKey("personid"),
 *   primaryAddress: lookup("primaryaddressid", () => Address),
 * });
 * // Infer<typeof Person>["primaryAddress"] → { id: GUID; ... } | null
 */
export declare function lookup<TProperties extends GenericProperties>(name: string, getTable: GetTable<DataverseTable<TProperties>>): LookupProperty<TProperties>;
