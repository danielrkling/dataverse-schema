import { Schema } from "../schema";
import { isTypeOrNull } from "../validators/isTypeOrNull";

/**
 * Represents an image property within a dataverse schema.
 * Extends the base Property class with a string or null type to store the image data (e.g., as a base64 encoded string) and a default value of null.
 */
export class ImageProperty extends Schema<string | null> {
  /**
   * The kind of schema element for an image property, which is "value".
   */
  kind = "value" as const;
  /**
   * The type of the property, which is "image".
   */
  type = "image" as const;

  /**
   * Creates a new ImageProperty instance.
   *
   * @param name The name of the image property.
   */
  constructor(name: string) {
    super(name, null);
    this.check(isTypeOrNull("string"));
  }
}

/**
 * A factory function to create a new ImageProperty instance.
 *
 * @param name The name of the image property.
 * @returns A new ImageProperty instance.
 */
export function image(name: string) {
  return new ImageProperty(name);
}
