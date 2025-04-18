import {
  CollectionProperty,
  LookupProperty,
  LookupIdProperty,
  CollectionIdsProperty,
  PrimaryKeyProperty,
  StringProperty,
  NumberProperty,
  BooleanProperty,
  DateProperty,
  ImageProperty,
  ListProperty,
} from "./properties";
import { DateOnlyProperty } from "./properties/dateOnly";
import { Schema } from "./schema";
import { Table } from "./table";
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
export type DataverseKey = GUID | AlternateKey;

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
export type Infer<T> = T extends Table<infer U>
  ? Infer<U> // If it's a Table, infer from its properties.
  : T extends GenericProperties
  ? {
      [K in keyof T]: Infer<T[K]>;
    } // If it's GenericProperties, infer each property's type.
  : T extends CollectionProperty<infer U>
  ? Infer<U>[] // If it's a CollectionProperty, infer the type of the items in the collection and make it an array.
  : T extends LookupProperty<infer U>
  ? Infer<U> | null // If it's an ExpandProperty, infer the type of the expanded entity and allow null (for optional expansion).
  : T extends Schema<infer U>
  ? U // If it's a Property, extract the underlying type.
  : never;

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
  | PrimaryKeyProperty // Represents the primary key of an entity (usually a GUID).
  | StringProperty // Represents a string value.
  | NumberProperty // Represents a numeric value.
  | BooleanProperty // Represents a boolean value.
  | DateProperty // Represents a date and/or time value.
  | DateOnlyProperty
  | ImageProperty // Represents an image value.
  | ListProperty<string | number>; // Represents a list of strings or numbers

/**
 * Represents a generic property in a Dataverse entity.  A property can be
 * either a navigation property or a value property.
 */
export type GenericProperty = GenericNavigationProperty | GenericValueProperty;

/** The Standard Schema interface. */
interface StandardSchemaV1<Input = unknown, Output = Input> {
  /** The Standard Schema properties. */
  readonly "~standard": StandardSchemaV1.Props<Input, Output>;
}
declare namespace StandardSchemaV1 {
  /** The Standard Schema properties interface. */
  export interface Props<Input = unknown, Output = Input> {
    /** The version number of the standard. */
    readonly version: 1;
    /** The vendor name of the schema library. */
    readonly vendor: string;
    /** Validates unknown input values. */
    readonly validate: (
      value: unknown
    ) => Result<Output> | Promise<Result<Output>>;
    /** Inferred types associated with the schema. */
    readonly types?: Types<Input, Output> | undefined;
  }
  /** The result interface of the validate function. */
  export type Result<Output> = SuccessResult<Output> | FailureResult;
  /** The result interface if validation succeeds. */
  export interface SuccessResult<Output> {
    /** The typed output value. */
    readonly value: Output;
    /** The non-existent issues. */
    readonly issues?: undefined;
  }
  /** The result interface if validation fails. */
  export interface FailureResult {
    /** The issues of failed validation. */
    readonly issues: ReadonlyArray<Issue>;
  }
  /** The issue interface of the failure output. */
  export interface Issue {
    /** The error message of the issue. */
    readonly message: string;
    /** The path of the issue, if any. */
    readonly path?: ReadonlyArray<PropertyKey | PathSegment> | undefined;
  }
  /** The path segment interface of the issue. */
  export interface PathSegment {
    /** The key representing a path segment. */
    readonly key: PropertyKey;
  }
  /** The Standard Schema types interface. */
  export interface Types<Input = unknown, Output = Input> {
    /** The input type of the schema. */
    readonly input: Input;
    /** The output type of the schema. */
    readonly output: Output;
  }
  /** Infers the input type of a Standard Schema. */
  export type InferInput<Schema extends StandardSchemaV1> = NonNullable<
    Schema["~standard"]["types"]
  >["input"];
  /** Infers the output type of a Standard Schema. */
  export type InferOutput<Schema extends StandardSchemaV1> = NonNullable<
    Schema["~standard"]["types"]
  >["output"];
}

export { type StandardSchemaV1 };
export type GetTable<T = any> = () => T;
export type Validator<T> = (value: T) => void | undefined | string;
