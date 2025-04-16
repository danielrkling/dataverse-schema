import { StandardSchemaV1, type Validator } from "./types";
import { required } from "./validators/required";

/**
 * Represents a generic property within a dataverse schema.
 * Implements the StandardSchemaV1 interface.
 *
 * @template T The type of the property's value.
 */
export class Schema<T> implements StandardSchemaV1<T> {
  name: string;
  kind = "schema";
  type = "schema";

  /**
   * The default value of the property. This is a private field.
   */
  #default: T;

  /**
   * Creates a new Property instance.
   *
   * @param name The name of the property.
   * @param defaultValue The default value for the property.
   */
  constructor(name: string, defaultValue: T) {
    this.name = name;
    this.#default = defaultValue;
  }

  /**
   * Sets the default value of the property.
   *
   * @param value The new default value.
   * @returns The Property instance for chaining.
   */
  setDefault(value: T): this {
    this.#default = value;
    return this;
  }

  /**
   * Gets the default value of the property.
   *
   * @returns The default value.
   */
  getDefault(): T {
    return this.#default;
  }

  /**
   * Indicates if the property is read-only. This is a private field.
   */
  #readOnly: boolean = false;

  /**
   * Sets whether the property is read-only.
   *
   * @param [value=true] True if the property should be read-only, false otherwise. Defaults to true.
   * @returns The Property instance for chaining.
   */
  setReadOnly(value: boolean = true): this {
    this.#readOnly = value;
    return this;
  }

  /**
   * Gets whether the property is read-only.
   *
   * @returns True if the property is read-only, false otherwise.
   */
  getReadOnly(): boolean {
    return this.#readOnly;
  }

  /**
   * An array of validators associated with this property.
   */
  #validators: Array<any> = [];

  /**
   * Adds a validator to the property.
   *
   * @param v The validator function or object to add.
   * @returns The Property instance for chaining.
   */
  check(v: Validator<T>): this {
    this.#validators.push(v);
    return this;
  }

  /**
   * Adds a required validator to the property.
   *
   * @returns The Property instance for chaining.
   */
  required(): this {
    return this.check(required());
  }

  /**
   * Transforms a value received from Dataverse into the property's type.
   * By default, it returns the value as is. Subclasses can override this for custom transformations.
   *
   * @param value The value received from Dataverse.
   * @returns The transformed value of type T.
   */
  transformValueFromDataverse(value: any): T {
    return value;
  }

  /**
   * Transforms the property's value into a format suitable for sending to Dataverse.
   * By default, it returns the value as is. Subclasses can override this for custom transformations.
   *
   * @param value The property's value.
   * @returns The transformed value suitable for Dataverse.
   */
  transformValueToDataverse(value: any): any {
    return value;
  }

  getIssues(value: unknown, path: PropertyKey[] = []): StandardSchemaV1.Issue[] {
    const issues: StandardSchemaV1.Issue[] = [];
    this.#validators.forEach((fn: any) => {
      try {
        let message = fn(value);
        if (message) {
          issues.push({
            message,
            path,
          });
        }
      } catch ({ message }: any) {
        issues.push({
          message,
          path,
        });
      }
    });
    return issues;
  }

  validate(value: unknown, path: PropertyKey[] = []): StandardSchemaV1.Result<T> {
    const issues = this.getIssues(value, path);

    return issues.length > 0
      ? { issues }
      : {
          value: value as T,
        };
  }

  parse(value: unknown): T {
    const result = this.validate(value);
    if (result.issues) {
      throw new Error(JSON.stringify(result.issues), {});
    } else {
      return result.value;
    }
  }

  /**
   * Provides access to the standard schema properties for this property.
   * This is a computed property.
   *
   * @returns An object containing the standard schema properties, including version, vendor, and a validation function.
   */
  get ["~standard"](): StandardSchemaV1.Props<T> {
    return {
      version: 1,
      vendor: "dataverse-schema",
      validate: (v: unknown) => this.validate(v),
    };
  }
}
