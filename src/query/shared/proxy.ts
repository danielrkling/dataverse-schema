import { DataverseTable } from "../../table"
import { GenericProperties } from "../../types"
import { FieldRef } from "./field-ref"

export function buildFlatFieldProxy<T extends GenericProperties>(table: DataverseTable<T>): Record<string, FieldRef<any>> {
  const proxy: Record<string, FieldRef<any>> = {}
  for (const [key, property] of Object.entries(table.fields)) {
    proxy[key] = new FieldRef(property)
  }
  return proxy
}
