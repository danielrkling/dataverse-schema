import type { FilterNode } from "./ast"
import { fieldPathName } from "../path"

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;")
}

export function renderFilterFetchXml(node: FilterNode): string {
  const fieldName = (path: readonly any[]) => fieldPathName(path)
  switch (node.type) {
    case "comparison": return `<condition attribute="${escapeXml(fieldName(node.field))}" operator="${escapeXml(node.operator)}" value="${node.value === null ? "" : escapeXml(String(node.value))}" />`
    case "null": return `<condition attribute="${escapeXml(fieldName(node.field))}" operator="${node.positive ? "null" : "not-null"}" />`
    case "contains": return `<condition attribute="${escapeXml(fieldName(node.field))}" operator="like" value="%${escapeXml(node.value)}%" />`
    case "startsWith": return `<condition attribute="${escapeXml(fieldName(node.field))}" operator="begins-with" value="${escapeXml(node.value)}" />`
    case "endsWith": return `<condition attribute="${escapeXml(fieldName(node.field))}" operator="ends-with" value="${escapeXml(node.value)}" />`
    case "compare": return `<condition attribute="${escapeXml(fieldName(node.field))}" operator="${escapeXml(node.operator)}" valueof="${escapeXml(fieldName(node.otherField))}" />`
    case "lambda": return `<condition entityname="${escapeXml(fieldName(node.field))}" operator="${escapeXml(node.operator)}" value="${escapeXml(`${node.alias}: ${renderFilterFetchXml(node.condition)}`)}" />`
    case "fn": {
      const attr = escapeXml(fieldName(node.field))
      const op = escapeXml(node.operator)
      if (node.values.length === 0) return `<condition attribute="${attr}" operator="${op}" />`
      if (node.values.length === 1) return `<condition attribute="${attr}" operator="${op}" value="${escapeXml(String(node.values[0]))}" />`
      return `<condition attribute="${attr}" operator="${op}">${node.values.map(value => `<value>${escapeXml(String(value))}</value>`).join("")}</condition>`
    }
    case "raw": return node.value
    case "and": return node.conditions.length === 0 ? "" : `<filter type="and">${node.conditions.map(renderFilterFetchXml).join("")}</filter>`
    case "or": return node.conditions.length === 0 ? "" : `<filter type="or">${node.conditions.map(renderFilterFetchXml).join("")}</filter>`
    case "not": return `<filter type="and"><filter type="or">${renderFilterFetchXml(node.condition)}</filter></filter>`
  }
}
