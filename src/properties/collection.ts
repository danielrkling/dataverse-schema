import { Schema } from "../schema";
import { Table } from "../table";
import { GenericProperties, GetTable, Infer, StandardSchemaV1 } from "../types";

/**
 * Represents a collection-valued navigation property within a dataverse schema.
 * Extends the base Property class to handle arrays of related records.
 *
 * @template TProperties An object defining the properties of the related records in the collection.
 */
export class CollectionProperty<
  TProperties extends GenericProperties
> extends Schema<Infer<TProperties>[]> {
  kind = "navigation" as const;
  type = "collection" as const;
  #getTable: GetTable<Table<TProperties>>;

  /**
   * Creates a new CollectionProperty instance.
   *
   * @param name The name of the collection property.
   * @param getTable A function that, when called, returns the Table definition for the related records. This is used to avoid circular dependencies.
   */
  constructor(name: string, getTable: GetTable<Table<TProperties>>) {
    super(name, []);
    this.#getTable = getTable;
    this.check((v) =>
      !Array.isArray(v) ? "value is not an array" : undefined
    );
  }

  #table: Table<TProperties> | undefined
  get table(): Table<TProperties> {
    return this.#table ??= this.#getTable();
  }

  /**
   * Transforms an array of values received from Dataverse into an array of transformed related records.
   * It iterates over the input array and uses the `transformValueFromDataverse` method of the related Table to transform each individual record.
   *
   * @param value An array of raw data representing the related records from Dataverse.
   * @returns An array of transformed related records of type `Infer<TProperties>[]`.
   */
  transformValueFromDataverse(value: any): Infer<TProperties>[] {
    return Array.from(value).map((v: any) =>
      this.table.transformValueFromDataverse(v)
    );
  }


  getIssues(value: any, path: PropertyKey[] = []): StandardSchemaV1.Issue[] {
    const issues = super.getIssues(value,path)
    if (Array.isArray(value)){
      issues.push(...value.map((v: any, i:number)=>this.table.getIssues(v,[...path,i])).flat(1))
    }    
    return issues
  }
}

/**
 * A factory function to create a new CollectionProperty instance.
 *
 * @template TProperties An object defining the properties of the related records in the collection.
 * @param name The name of the collection property.
 * @param getTable A function that, when called, returns the Table definition for the related records.
 * @returns A new CollectionProperty instance.
 */
export function collection<TProperties extends GenericProperties>(
  name: string,
  getTable: GetTable<Table<TProperties>>
) {
  return new CollectionProperty(name, getTable);
}