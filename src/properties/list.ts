import { Schema } from "../schema";

/**
 * Represents a list (picklist or dropdown) property within a dataverse schema.
 * Extends the base Property class to enforce that the value is either null or one of the values in the provided list.
 *
 * @template T The type of the values in the list (either string or number).
 */
export class ListProperty<
  T extends string | number
> extends Schema<T | null> {
  /**
   * The kind of schema element for a list property, which is "value".
   */
  kind = "value" as const;
  /**
   * The type of the property, which is "list".
   */
  type = "list" as const;

  /**
   * The array of valid values for this list property.
   */
  list: Array<T>;

  /**
   * Creates a new ListProperty instance.
   *
   * @param name The name of the list property.
   * @param list An array of valid string or number values for this property.
   */
  constructor(name: string, list: Array<T>) {
    super(name, null);
    this.list = list;
    this.check((v) => {
      if (v !== null && !list.includes(v)) {
        return `${v} not in [${list}]`;
      }
    });
  }
}

/**
 * A factory function to create a new ListProperty instance.
 *
 * @template T The type of the values in the list (either string or number).
 * @param name The name of the list property.
 * @param list An array of valid string or number values for this property.
 * @returns A new ListProperty instance.
 */
export function list<T extends string | number>(name: string, list: Array<T>) {
  return new ListProperty<T>(name, list);
}