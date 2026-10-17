import type { CollectionProperty, FieldBase, LookupProperty } from "../fields"

export type QueryProperty = FieldBase<any> | LookupProperty<any> | CollectionProperty<any>
export type FieldPath = readonly QueryProperty[]

export type FieldNameDialect = "odata" | "fetchXml"

function propertyName(property: QueryProperty, dialect: FieldNameDialect): string {
  return dialect === "odata"
    ? (property.fromDataverseName ?? property.logicalName)
    : (property.logicalName ?? property.fromDataverseName)
}

/**
 * Joins a field path into the attribute name used by a query dialect.
 *
 * OData addresses lookup id fields through their navigation property
 * (`_accountid_value`), FetchXML uses the plain logical name (`accountid`).
 */
export function fieldPathName(path: FieldPath, dialect: FieldNameDialect = "fetchXml"): string {
  return path.map((p) => propertyName(p, dialect)).join("/")
}
