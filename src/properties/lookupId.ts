import { Schema } from "../schema";
import { Table } from "../table";
import { GUID, GenericProperties, GetTable } from "../types";
import { PrimaryKeyProperty } from "./primaryKey";

/**
 * Represents a lookup (single-valued navigation) property within a dataverse schema.
 * Extends the base Property class to handle references to other records by their GUID.
 */
export class LookupIdProperty extends Schema<GUID | null> {
  /**
   * The kind of schema element for a lookup property, which is "navigation".
   */
  kind = "navigation" as const;
  /**
   * The type of the property, which is "lookup".
   */
  type = "lookupId" as const;
  /**
   * The logical name of the navigation property in the Dataverse entity.
   */
  navigationName: string;

  /**
   * A function that returns the Table definition for the related record.
   */
  #getTable: GetTable;

  /**
   * Creates a new LookupProperty instance.
   * The internal name of the property in Dataverse will be `_${name.toLowerCase()}_value`.
   *
   * @param name The logical name of the navigation property.
   * @param getTable A function that, when called, returns the Table definition for the related entity. This is used to avoid circular dependencies.
   */
  constructor(name: string, getTable: GetTable) {
    super(`_${name.toLowerCase()}_value`, null);
    this.navigationName = name;
    this.#getTable = getTable;
  }

  #table: Table<{ id: PrimaryKeyProperty }> | undefined
  get table(): Table<{ id: PrimaryKeyProperty }> {
    if (!this.#table){
      const table = this.#getTable() as Table<GenericProperties>;
      const { property } = table.getPrimaryKey();
      this.#table = new Table(table.name, { id: property });
    }
    return this.#table
  }

  /**
   * Transforms the property's value (a GUID) into a format suitable for sending to Dataverse for association.
   * If a value (GUID) is provided, it formats it as `entitySetName(value)`. If the value is null, it returns null.
   *
   * @param value The GUID of the related record.
   * @returns A string in the format `entitySetName(guid)` or null.
   */
  transformValueToDataverse(value: any): string | null {
    if (value) {
      return `${this.table.name}(${value})`;
    } else {
      return null;
    }
  }
}

/**
 * A factory function to create a new LookupProperty instance.
 *
 * @param name The logical name of the navigation property.
 * @param getTable A function that, when called, returns the Table definition for the related entity.
 * @returns A new LookupProperty instance.
 */
export function lookupId(name: string, getTable: GetTable) {
  return new LookupIdProperty(name, getTable);
}