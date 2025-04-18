import { Schema } from "../schema";

/**
 * Represents a date property within a dataverse schema.
 * Extends the base Property class with a Date or null type and a default value of null.
 */
export class DateOnlyProperty extends Schema<Date | null> {
  /**
   * The kind of schema element for a date property, which is "value".
   */
  kind = "value" as const;
  /**
   * The type of the property, which is "date".
   */
  type = "dateOnly" as const;

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
    return parseDateOnly(value);
  }

  transformValueToDataverse(value: any) {
      return toDateOnly(value)
  }
}

/**
 * A factory function to create a new DateProperty instance.
 *
 * @param name The name of the date property.
 * @returns A new DateProperty instance.
 */
export function dateOnly(name: string) {
  return new DateOnlyProperty(name);
}

 function parseDateOnly(dateString: string): Date {
    const [year, month, day] = dateString.slice(0, 10).split("-").map(Number);
    return new Date(year ?? 0, (month ?? 0) - 1, day);
  }
  
   function toDateOnly(date: Date) {
    try {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0"); // Months are zero-indexed
      const day = String(date.getDate()).padStart(2, "0");
  
      return `${year}-${month}-${day}`;
    } catch (e) {
      return null;
    }
  }