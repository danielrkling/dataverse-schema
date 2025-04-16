import { Schema } from "../schema";
import { Table } from "../table";
import { GUID, GenericProperties, GetTable, StandardSchemaV1 } from "../types";
import { PrimaryKeyProperty } from "./primaryKey";

/**
 * Represents a collection of lookup (many-to-many navigation) properties within a dataverse schema.
 * Extends the base Property class to handle arrays of references to other records by their GUIDs.
 */
export class CollectionIdsProperty extends Schema<GUID[]> {
  /**
   * The kind of schema element for a collection of lookups property, which is "navigation".
   */
  kind = "navigation" as const;
  /**
   * The type of the property, which is "lookups".
   */
  type = "collectionIds" as const;

  /**
   * A function that returns the Table definition for the related records.
   */
  #getTable: GetTable;

  /**
   * Creates a new LookupsProperty instance.
   *
   * @param name The name of the collection of lookup properties.
   * @param getTable A function that, when called, returns the Table definition for the related entity. This is used to avoid circular dependencies.
   */
  constructor(name: string, getTable: GetTable) {
    super(name, []);
    this.#getTable = getTable;
    this.check((v) =>
      !Array.isArray(v) ? "value is not an array" : undefined
    );
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
   * Transforms an array of values received from Dataverse into an array of GUIDs of the related records.
   * It iterates over the input array and extracts the value of the primary key property ('id') from each related record.
   *
   * @param value An array of raw data representing the related records from Dataverse.
   * @returns An array of GUIDs of the related records.
   */
  transformValueFromDataverse(value: any): GUID[] {
    return Array.from(value).map((v: any) => v[this.table.properties.id.name]);
  }

  getIssues(value: any, path: PropertyKey[] = []): StandardSchemaV1.Issue[] {
    const issues = super.getIssues(value, path);
    if (Array.isArray(value)) {
      issues.push(
        ...value
          .map((v: any, i: number) => this.table.getIssues(v, [...path, i]))
          .flat(1)
      );
    }
    return issues;
  }
}

/**
 * A factory function to create a new LookupsProperty instance.
 *
 * @param name The name of the collection of lookup properties.
 * @param getTable A function that, when called, returns the Table definition for the related entity.
 * @returns A new LookupsProperty instance.
 */
export function collectionIds(name: string, getTable: GetTable) {
  return new CollectionIdsProperty(name, getTable);
}
