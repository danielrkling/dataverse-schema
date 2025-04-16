import { Schema } from "../schema";
import { Table } from "../table";
import { GenericProperties, GetTable, Infer, StandardSchemaV1 } from "../types";

/**
 * Represents an expand navigation property within a dataverse schema.
 * Extends the base Property class to handle a single related record that is typically fetched using the `$expand` OData query option.
 *
 * @template TProperties An object defining the properties of the related record.
 */
export class LookupProperty<
  TProperties extends GenericProperties
> extends Schema<Infer<TProperties> | null> {
  /**
   * The kind of schema element for an expand property, which is "navigation".
   */
  kind = "navigation" as const;
  /**
   * The type of the property, which is "expand".
   */
  type = "lookup" as const;

  /**
   * A function that returns the Table definition for the related record.
   */
  #getTable: GetTable<Table<TProperties>>;

  /**
   * Creates a new ExpandProperty instance.
   *
   * @param name The name of the expand property.
   * @param getTable A function that, when called, returns the Table definition for the related record. This is used to avoid circular dependencies.
   */
  constructor(name: string, getTable: GetTable<Table<TProperties>>) {
    super(name, null);
    this.#getTable = getTable;
  }


  #table: Table<TProperties> | undefined
  get table(): Table<TProperties> {
    return this.#table ??= this.#getTable();
  }

  /**
   * Transforms a value received from Dataverse into a transformed related record or null.
   * It uses the `transformValueFromDataverse` method of the related Table to transform the data. If the value is null or undefined, it returns null.
   *
   * @param value The raw data representing the related record from Dataverse.
   * @returns The transformed related record of type `Infer<TProperties>` or null.
   */
  transformValueFromDataverse(value: any): Infer<TProperties> | null {
    return value == null ? null : this.table.transformValueFromDataverse(value);
  }

  getIssues(value: any, path?: PropertyKey[]): StandardSchemaV1.Issue[] {
    const issues = super.getIssues(value, path);
    if (value !== null) {
      issues.push(...this.table.getIssues(value, path));
    }
    return issues;
  }
}

/**
 * A factory function to create a new ExpandProperty instance.
 *
 * @template TProperties An object defining the properties of the related record.
 * @param name The name of the expand property.
 * @param getTable A function that, when called, returns the Table definition for the related record.
 * @returns A new ExpandProperty instance.
 */
export function lookup<TProperties extends GenericProperties>(
  name: string,
  getTable: GetTable<Table<TProperties>>
) {
  return new LookupProperty(name, getTable);
}
