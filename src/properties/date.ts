import { Schema } from "../schema";

/**
 * Represents a date property within a dataverse schema.
 * Extends the base Property class with a Date or null type and a default value of null.
 */
export class DateProperty extends Schema<Date | null> {
  /**
   * The kind of schema element for a date property, which is "value".
   */
  kind = "value" as const;
  /**
   * The type of the property, which is "date".
   */
  type = "date" as const;

  /**
   * Creates a new DateProperty instance.
   *
   * @param name The name of the date property.
   */
  constructor(name: string) {
    super(name, null);
    this.check((v) =>
      v === null || v instanceof Date ? undefined : "value is not Date or null"
    );
  }

  /**
   * Transforms a value received from Dataverse into a Date object or null.
   * If the value is null, it returns null. Otherwise, it creates a new Date object from the Dataverse value.
   *
   * @param value The value received from Dataverse.
   * @returns A Date object or null.
   */
  transformValueFromDataverse(value: any): Date | null {
    if (value === null) return null;
    return new Date(value);
  }
}

/**
 * A factory function to create a new DateProperty instance.
 *
 * @param name The name of the date property.
 * @returns A new DateProperty instance.
 */
export function date(name: string) {
  return new DateProperty(name);
}