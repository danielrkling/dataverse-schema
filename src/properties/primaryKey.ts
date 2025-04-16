import { Schema } from "../schema";
import { GUID } from "../types";
import { isType } from "../validators/isType";

/**
 * Represents the primary key property within a dataverse schema.
 * Extends the base Property class with a GUID type and is set to read-only by default.
 */
export class PrimaryKeyProperty extends Schema<GUID> {
  /**
   * The kind of schema element for a primary key property, which is "value".
   */
  kind = "value" as const;
  /**
   * The type of the property, which is "primaryKey".
   */
  type = "primaryKey" as const;

  /**
   * Creates a new PrimaryKeyProperty instance.
   * Sets the property to read-only upon creation.
   *
   * @param name The name of the primary key property (typically the logical name of the primary key attribute).
   */
  constructor(name: string) {
    super(name, "" as GUID);
    this.setReadOnly();
    this.check(isType("string"))
  }
}

/**
 * A factory function to create a new PrimaryKeyProperty instance.
 *
 * @param name The name of the primary key property.
 * @returns A new PrimaryKeyProperty instance.
 */
export function primaryKey(name: string) {
  return new PrimaryKeyProperty(name);
}