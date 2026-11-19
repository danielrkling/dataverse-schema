import type { FilterNode } from "./ast"
import { fieldPathName } from "../path"

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;")
}

const INVERTED_OPERATORS: Record<string, string> = {
  eq: "ne",
  ne: "eq",
  gt: "le",
  ge: "lt",
  lt: "ge",
  le: "gt",
}

function invertedOperator(operator: string): string {
  const inverted = INVERTED_OPERATORS[operator]
  if (!inverted) throw new Error(`FetchXML does not support negating the "${operator}" comparison`)
  return inverted
}

/** Renders De Morgan/operator-lowered negation; FetchXML has no general NOT filter. */
function renderNegatedFetchXml(node: FilterNode): string {
  const fieldName = (path: readonly any[]) => fieldPathName(path, "fetchXml")
  switch (node.type) {
    case "comparison": {
      if (node.value === null && (node.operator === "eq" || node.operator === "ne")) {
        return `<condition attribute="${escapeXml(fieldName(node.field))}" operator="${node.operator === "eq" ? "not-null" : "null"}" />`
      }
      return `<condition attribute="${escapeXml(fieldName(node.field))}" operator="${escapeXml(invertedOperator(node.operator))}" value="${node.value === null ? "" : escapeXml(String(node.value))}" />`
    }
    case "null": return `<condition attribute="${escapeXml(fieldName(node.field))}" operator="${node.positive ? "not-null" : "null"}" />`
    case "compare": return `<condition attribute="${escapeXml(fieldName(node.field))}" operator="${escapeXml(invertedOperator(node.operator))}" valueof="${escapeXml(fieldName(node.otherField))}" />`
    case "and":
    case "or": {
      if (node.conditions.length === 0) return ""
      const type = node.type === "and" ? "or" : "and"
      return `<filter type="${type}">${node.conditions.map(renderNegatedFetchXml).join("")}</filter>`
    }
    case "not": return renderFilterFetchXml(node.condition)
    default: throw new Error(`FetchXML does not support negating ${node.type} expressions`)
  }
}

export function renderFilterFetchXml(node: FilterNode): string {
  const fieldName = (path: readonly any[]) => fieldPathName(path, "fetchXml")
  switch (node.type) {
    case "comparison": {
      if (node.value === null && (node.operator === "eq" || node.operator === "ne")) {
        return `<condition attribute="${escapeXml(fieldName(node.field))}" operator="${node.operator === "eq" ? "null" : "not-null"}" />`
      }
      return `<condition attribute="${escapeXml(fieldName(node.field))}" operator="${escapeXml(node.operator)}" value="${node.value === null ? "" : escapeXml(String(node.value))}" />`
    }
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
    case "not": return renderNegatedFetchXml(node.condition)
  }
}
