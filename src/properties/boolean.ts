import { Schema } from "../schema";
import { isType } from "../validators/isType";

/**
 * Represents a boolean property within a dataverse schema.
 * Extends the base Property class with a boolean type and a default value of false.
 */
export class BooleanProperty extends Schema<boolean> {
  /**
   * The kind of schema element for a boolean property, which is "value".
   */
  kind = "value" as const;
  /**
   * The type of the property, which is "boolean".
   */
  type = "boolean" as const;

  /**
   * Creates a new BooleanProperty instance.
   *
   * @param name The name of the boolean property.
   */
  constructor(name: string) {
    super(name, false);
    this.check(isType("boolean"));
  }
}

/**
 * A factory function to create a new BooleanProperty instance.
 *
 * @param name The name of the boolean property.
 * @returns A new BooleanProperty instance.
 */
export function boolean(name: string) {
  return new BooleanProperty(name);
}
