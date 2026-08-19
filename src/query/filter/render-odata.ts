import { wrapString } from "../../util"
import type { FilterNode } from "./ast"
import { fieldPathName } from "../path"

export function renderFilterOdata(node: FilterNode, scope?: string): string {
  const fieldName = (path: readonly any[]) => `${scope ? `${scope}/` : ""}${fieldPathName(path)}`
  switch (node.type) {
    case "comparison": return `(${fieldName(node.field)} ${node.operator} ${wrapString(node.value)})`
    case "null": return `${fieldName(node.field)} ${node.positive ? "eq" : "ne"} null`
    case "contains": return `contains(${fieldName(node.field)},${wrapString(node.value)})`
    case "startsWith": return `startswith(${fieldName(node.field)},${wrapString(node.value)})`
    case "endsWith": return `endswith(${fieldName(node.field)},${wrapString(node.value)})`
    case "compare": return `(${fieldName(node.field)} ${node.operator} ${fieldName(node.otherField)})`
    case "lambda": return `${fieldPathName(node.field)}/${node.operator}(${node.alias}: ${renderFilterOdata(node.condition, node.alias)})`
    case "fn": {
      const field = wrapString(fieldName(node.field))
      const vals = node.values.map(wrapString)
      if (vals.length === 0) return `Microsoft.Dynamics.CRM.${node.fnName}(PropertyName=${field})`
      if (vals.length === 1) return `Microsoft.Dynamics.CRM.${node.fnName}(PropertyName=${field},PropertyValue=${vals[0]})`
      if (node.fnName === "Between" || node.fnName === "NotBetween") return `Microsoft.Dynamics.CRM.${node.fnName}(PropertyName=${field},PropertyValues=[${vals.join(",")}])`
      if (node.fnName === "InFiscalPeriodAndYear" || node.fnName === "InOrAfterFiscalPeriodAndYear" || node.fnName === "InOrBeforeFiscalPeriodAndYear") return `Microsoft.Dynamics.CRM.${node.fnName}(PropertyName=${field},PropertyValue1=${vals[0]},PropertyValue2=${vals[1]})`
      return `Microsoft.Dynamics.CRM.${node.fnName}(PropertyName=${field},PropertyValues=[${vals.join(",")}])`
    }
    case "raw": return node.value
    case "and": return node.conditions.length === 0 ? "" : `(${node.conditions.map(child => renderFilterOdata(child, scope)).join(" and ")})`
    case "or": return node.conditions.length === 0 ? "" : `(${node.conditions.map(child => renderFilterOdata(child, scope)).join(" or ")})`
    case "not": return `not(${renderFilterOdata(node.condition, scope)})`
  }
}
