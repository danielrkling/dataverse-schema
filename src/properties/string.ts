import { Schema } from "../schema";
import { isTypeOrNull } from "../validators/isTypeOrNull";

/**
 * Represents a string property within a dataverse schema.
 * Extends the base Property class with a string or null type and a default value of null.
 */
export class StringProperty extends Schema<string | null> {
  /**
   * The kind of schema element for a string property, which is "value".
   */
  kind = "value" as const;
  /**
   * The type of the property, which is "string".
   */
  type = "string" as const;

  /**
   * Creates a new StringProperty instance.
   *
   * @param name The name of the string property.
   */
  constructor(name: string) {
    super(name, null);
    this.check(isTypeOrNull("string"));
  }
}

/**
 * A factory function to create a new StringProperty instance.
 *
 * @param name The name of the string property.
 * @returns A new StringProperty instance.
 */
export function string(name: string) {
  return new StringProperty(name);
}
