import {
  CollectionProperty,
  LookupProperty,
  LookupIdProperty,
  CollectionIdsProperty,
  PrimaryKeyField,
  StringField,
  NumberField,
  BooleanField,
  DateTimeField,
  ImageField,
  ListField,
  NullableStringField,
  NullableNumberField,
  NullableDateTimeField,
  NullableDateField,
  FileField,
  ChoiceField,
  NullableChoiceField,
} from "./fields";
import { DateField } from "./fields";
import { FieldBase } from "./fieldBase";
import { DataverseTable } from "./table";
import { Etag } from "./util";

export type Primitive = string | number | boolean | null;
/**
 * Represents a Dataverse record, which is essentially a JavaScript object
 * with properties corresponding to the columns/attributes in a Dataverse entity.
 * The 'any' type is used here because the structure of a Dataverse record
 * can vary significantly depending on the entity and the selected attributes.
 */
export type DataverseRecord = Record<string, Primitive>;

/**
 * Represents a GUID (Globally Unique Identifier) string, a standard identifier
 * used extensively in Dataverse (and Microsoft technologies in general).
 * The format is a string with five sections separated by hyphens.
 */
export type GUID = `${string}-${string}-${string}-${string}-${string}`;

/**
 * Represents an alternate key for a Dataverse entity.  An alternate key is used
 * to uniquely identify a record instead of using its primary key (GUID).
 * It can be a single key-value pair or a combination of multiple key-value pairs.
 */
export type AlternateKey =
  | `${string}=${string}`
  | `${string}=${string},${string}=${string}`;

/**
 * Represents a Dataverse key, which can be either a GUID (primary key) or an AlternateKey.
 */
export type DataverseKey = GUID | AlternateKey | string;

/**
 * Utility type to narrow down the keys of an object `T`
 * to only those keys whose values are of type `V`.
 *
 * @template T The type of the object.
 * @template V The type of the values to filter for.
 *
 * @example
 * interface MyObject {
 * id: number;
 * name: string;
 * isActive: boolean;
 * email: string;
 * }
 *
 * type StringKeys = NarrowKeysByValue<MyObject, string>;  // "name" | "email"
 */
export type NarrowKeysByValue<T extends object, V> = {
  [K in keyof T]: T[K] extends V ? K : never;
}[keyof T];

/**
 * Infers the TypeScript type from a Dataverse schema definition.  This is a recursive
 * type that drills down through the schema definition (which can be a Table,
 * GenericProperties, or a Property) to extract the corresponding TypeScript type.
 *
 * @template T The Dataverse schema definition.
 */
export type Infer<T> = T extends null | undefined
  ? T
  : T extends DataverseTable<infer U>
  ? Infer<U>
  : T extends CollectionProperty<infer U>
  ? Infer<U>[]
  : T extends LookupProperty<infer U>
  ? Infer<U> | null
  : T extends FieldBase<infer U>
  ? U
  : { [K in keyof T]: Infer<T[K]> }

/**
 * Represents a generic object of properties, where the keys are property names
 * and the values are GenericProperty definitions.  This is used to define the
 * structure of a Dataverse entity.
 */
export type GenericProperties = Record<string, GenericProperty>;

/**
 * Represents a generic navigation property in a Dataverse entity.  Navigation
 * properties are used to define relationships between entities.
 */
export type GenericNavigationProperty =
  | CollectionProperty<GenericProperties> // Represents a one-to-many or many-to-many relationship.
  | LookupProperty<GenericProperties> //Represents a one-to-many or many-to-many relationship for nested object
  | LookupIdProperty // Represents a many-to-one relationship.
  | CollectionIdsProperty; //Represents a one-to-many relationship

/**
 * Represents a generic value property in a Dataverse entity.  Value properties
 * store the actual data of an entity, such as strings, numbers, dates, etc.
 */
export type GenericValueProperty =
  | PrimaryKeyField // Represents the primary key of an entity (usually a GUID).
  | StringField // Represents a string value.
  | NullableStringField
  | NumberField // Represents a numeric value.
  | NullableNumberField
  | BooleanField // Represents a boolean value.
  | DateTimeField // Represents a date and/or time value.
  | NullableDateTimeField
  | DateField  
  | NullableDateField
  | ImageField // Represents an image value.
  | ListField<string | number> // Represents a list of strings or numbers
  | FileField
  | ChoiceField<Record<number, string>>
  | NullableChoiceField<Record<number, string>>

/**
 * Represents a generic property in a Dataverse entity.  A property can be
 * either a navigation property or a value property.
 */
export type GenericProperty = GenericNavigationProperty | GenericValueProperty;

export type GetTable<T = any> = () => T;
