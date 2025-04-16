import { Schema } from "../schema";
import { isTypeOrNull } from "../validators/isTypeOrNull";

/**
 * Represents a number property within a dataverse schema.
 * Extends the base Property class with a number or null type and a default value of null.
 */
export class NumberProperty extends Schema<number | null> {
  /**
   * The kind of schema element for a number property, which is "value".
   */
  kind = "value" as const;
  /**
   * The type of the property, which is "number".
   */
  type = "number" as const;

  /**
   * Creates a new NumberProperty instance.
   *
   * @param name The name of the number property.
   */
  constructor(name: string) {
    super(name, null);
    this.check(isTypeOrNull("number"));
  }
}

/**
 * A factory function to create a new NumberProperty instance.
 *
 * @param name The name of the number property.
 * @returns A new NumberProperty instance.
 */
export function number(name: string) {
  return new NumberProperty(name);
}