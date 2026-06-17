import { type Validator } from "./types";
import { required } from "./validators";
import { StandardSchemaV1 } from "@standard-schema/spec";

/**
 * Base class for all Dataverse schema properties. Implements the StandardSchemaV1 interface
 * for validation and transformation.
 *
 * @template T The TypeScript type of the property's value (e.g. `string`, `number`, `Date`).
 *
 * @example
 * // Custom string property with a regex validator
 * class SSNField extends Schema<string> {
 *   constructor(name: string) {
 *     super(name, "");
 *     this.check((v) => /^\d{3}-\d{2}-\d{4}$/.test(v) ? undefined : "Invalid SSN");
 *   }
 * }
 */
export class Schema<T> implements StandardSchemaV1<T> {
  name: string;
  toDataverseName: string
  fromDataverseName: string
  kind = "schema";
  type = "schema";

  #default: any;

  /**
   * @param name The Dataverse logical name of the column/attribute.
   * @param defaultValue The default value used when no value is provided.
   */
  constructor(name: string, defaultValue: T) {
    this.name = name;
    this.fromDataverseName = name
    this.toDataverseName = name
    this.#default = defaultValue;
  }

  /**
   * Overrides the default value for this property.
   *
   * @example
   * const field = new StringField("firstname").setDefault("John");
   * field.getDefault(); // "John"
   */
  setDefault(value: T): this {
    this.#default = value;
    return this;
  }

  /**
   * Returns the default value for this property.
   */
  getDefault(): T {
    return this.#default as T;
  }

  #readOnly: boolean = false;

  /**
   * Marks this property as read-only. Read-only properties are excluded
   * when transforming data for Dataverse (e.g. they won't be sent in create/update).
   *
   * @param value Whether the property should be read-only. Defaults to `true`.
   *
   * @example
   * const field = new StringField("createdby").setReadOnly(true);
   * field.getReadOnly(); // true
   */
  setReadOnly(value: boolean = true): this {
    this.#readOnly = value;
    return this;
  }

  /**
   * Returns whether this property is read-only.
   */
  getReadOnly(): boolean {
    return this.#readOnly;
  }

  #validators: Array<Validator<any>> = [];

  /**
   * Adds a validation function to this property. Validators run during
   * {@link validate} and {@link parse}. A validator returns `undefined` if valid,
   * or an error message string if invalid.
   *
   * @example
   * const field = new StringField("zip").check((v) =>
   *   /^\d{5}(-\d{4})?$/.test(v) ? undefined : "Invalid ZIP code"
   * );
   * field.parse("12345"); // ok
   * field.parse("abc");   // throws
   */
  check(v: Validator<T>): this {
    this.#validators.push(v);
    return this;
  }

  /**
   * Adds a "required" validator that rejects `null` or `undefined` values.
   *
   * @example
   * const field = new StringField("email").required();
   * field.validate(null);  // { issues: [{ message: "Required" }] }
   * field.validate("a@b"); // { value: "a@b" }
   */
  required(): this {
    return this.check(required());
  }

  /**
   * Transforms a raw value from Dataverse into the property's TypeScript type.
   * Override this in subclasses for custom deserialization (e.g. string → Date).
   *
   * @param value The raw value from the Dataverse API.
   * @returns The typed value.
   *
   * @example
   * // A custom date-only field
   * class DateOnlyField extends Schema<Date> {
   *   transformValueFromDataverse(value: any): Date {
   *     return new Date(value + "T00:00:00Z");
   *   }
   * }
   */
  transformValueFromDataverse(value: any): T {
    return value;
  }

  /**
   * Transforms the property's value into a format suitable for Dataverse.
   * Override this in subclasses for custom serialization (e.g. Date → string).
   *
   * @param value The property value to send to Dataverse.
   * @returns The serialized value.
   *
   * @example
   * class DateOnlyField extends Schema<Date> {
   *   transformValueToDataverse(value: Date): string {
   *     return value.toISOString().slice(0, 10);
   *   }
   * }
   */
  transformValueToDataverse(value: any): any {
    return value;
  }

  getIssues(
    value: unknown,
    path: PropertyKey[] = [],
  ): StandardSchemaV1.Issue[] {
    const issues: StandardSchemaV1.Issue[] = [];
    this.#validators.forEach((fn) => {
      try {
        let message = fn(value as T);
        if (message) {
          issues.push({
            message,
            path,
          });
        }
      } catch (e: any) {
        issues.push({
          message: e?.message ?? String(e),
          path,
        });
      }
    });
    return issues;
  }

  /**
   * Validates a value against this property's validators. Returns either
   * `{ value }` on success or `{ issues }` on failure.
   *
   * @example
   * const field = new StringField("email").required();
   * field.validate("test@example.com"); // { value: "test@example.com" }
   * field.validate(null);               // { issues: [{ message: "Required", path: [] }] }
   */
  validate(
    value: unknown,
    path: PropertyKey[] = [],
  ): StandardSchemaV1.Result<T> {
    const issues = this.getIssues(value, path);

    return issues.length > 0
      ? { issues }
      : {
          value: value as T,
        };
  }

  /**
   * Validates a value and returns it if valid, or throws if invalid.
   * This is a convenience wrapper around {@link validate}.
   *
   * @throws {Error} If validation fails, the error message contains the JSON-serialized issues.
   *
   * @example
   * const field = new StringField("age").check((v) =>
   *   Number(v) >= 0 ? undefined : "Must be non-negative"
   * );
   * field.parse("25");  // "25"
   * field.parse("-1");  // throws Error("[{\"message\":\"Must be non-negative\",\"path\":[]}]")
   */
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
