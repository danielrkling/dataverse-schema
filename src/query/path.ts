import type { CollectionProperty, FieldBase, LookupProperty } from "../fields"

export type QueryProperty = FieldBase<any> | LookupProperty<any> | CollectionProperty<any>
export type FieldPath = readonly QueryProperty[]

function propertyName(property: QueryProperty): string {
  return property.fromDataverseName ?? property.name
}

export function fieldPathName(path: FieldPath): string {
  return path.map(propertyName).join("/")
}
