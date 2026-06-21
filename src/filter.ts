import { wrapString } from "./util"

// --- Types ---

type FilterValue = string | number | boolean | null

type FilterNode =
  | { type: "comparison"; field: string; operator: string; value: FilterValue }
  | { type: "null"; field: string; positive: boolean }
  | { type: "contains"; field: string; value: string }
  | { type: "startsWith"; field: string; value: string }
  | { type: "endsWith"; field: string; value: string }
  | { type: "compare"; field: string; operator: string; otherField: string }
  | { type: "lambda"; field: string; operator: "any" | "all"; alias: string; condition: string }
  | { type: "raw"; value: string }
  | { type: "and"; conditions: FilterExpr[] }
  | { type: "or"; conditions: FilterExpr[] }
  | { type: "not"; condition: FilterExpr }

// --- FilterExpr class ---

export class FilterExpr {
  constructor(private node: FilterNode) {}

  toString(): string {
    return this.toOdata()
  }

  toOdata(): string {
    return serializeOdata(this.node)
  }

  toFetchXml(): string {
    return serializeFetchXml(this.node)
  }
}

// --- OData serialization ---

function serializeOdata(node: FilterNode): string {
  switch (node.type) {
    case "comparison":
      return `(${node.field} ${node.operator} ${wrapString(node.value)})`
    case "null":
      return `${node.field} ${node.positive ? "eq" : "ne"} null`
    case "contains":
      return `contains(${node.field},${wrapString(node.value)})`
    case "startsWith":
      return `startswith(${node.field},${wrapString(node.value)})`
    case "endsWith":
      return `endswith(${node.field},${wrapString(node.value)})`
    case "compare":
      return `(${node.field} ${node.operator} ${node.otherField})`
    case "lambda":
      return `${node.field}/${node.operator}(${node.alias}: ${node.condition})`
    case "raw":
      return node.value
    case "and":
      if (node.conditions.length === 0) return ""
      return `(${node.conditions.map(c => c.toOdata()).join(" and ")})`
    case "or":
      if (node.conditions.length === 0) return ""
      return `(${node.conditions.map(c => c.toOdata()).join(" or ")})`
    case "not":
      return `not(${node.condition.toOdata()})`
  }
}

// --- FetchXML serialization ---

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

function serializeFetchXml(node: FilterNode): string {
  switch (node.type) {
    case "comparison": {
      const value =
        node.value === null ? "" : escapeXml(String(node.value))
      return `<condition attribute="${escapeXml(node.field)}" operator="${escapeXml(node.operator)}" value="${value}" />`
    }
    case "null":
      return `<condition attribute="${escapeXml(node.field)}" operator="${node.positive ? "null" : "not-null"}" />`
    case "contains":
      return `<condition attribute="${escapeXml(node.field)}" operator="like" value="%${escapeXml(node.value)}%" />`
    case "startsWith":
      return `<condition attribute="${escapeXml(node.field)}" operator="begins-with" value="${escapeXml(node.value)}" />`
    case "endsWith":
      return `<condition attribute="${escapeXml(node.field)}" operator="ends-with" value="${escapeXml(node.value)}" />`
    case "compare":
      return `<condition attribute="${escapeXml(node.field)}" operator="${escapeXml(node.operator)}" valueof="${escapeXml(node.otherField)}" />`
    case "lambda":
      return `<condition entityname="${escapeXml(node.field)}" operator="${escapeXml(node.operator)}" value="${escapeXml(`${node.alias}: ${node.condition}`)}" />`
    case "raw":
      return node.value
    case "and":
      if (node.conditions.length === 0) return ""
      return `<filter type="and">${node.conditions.map(c => c.toFetchXml()).join("")}</filter>`
    case "or":
      if (node.conditions.length === 0) return ""
      return `<filter type="or">${node.conditions.map(c => c.toFetchXml()).join("")}</filter>`
    case "not":
      return `<filter type="and"><filter type="or">${node.condition.toFetchXml()}</filter></filter>`
  }
}

// --- Factory functions ---

export function eq(field: string, value: FilterValue): FilterExpr {
  return new FilterExpr({ type: "comparison", field, operator: "eq", value })
}

export function ne(field: string, value: FilterValue): FilterExpr {
  return new FilterExpr({ type: "comparison", field, operator: "ne", value })
}

export function gt(field: string, value: string | number): FilterExpr {
  return new FilterExpr({ type: "comparison", field, operator: "gt", value })
}

export function ge(field: string, value: string | number): FilterExpr {
  return new FilterExpr({ type: "comparison", field, operator: "ge", value })
}

export function lt(field: string, value: string | number): FilterExpr {
  return new FilterExpr({ type: "comparison", field, operator: "lt", value })
}

export function le(field: string, value: string | number): FilterExpr {
  return new FilterExpr({ type: "comparison", field, operator: "le", value })
}

export function isNull(field: string): FilterExpr {
  return new FilterExpr({ type: "null", field, positive: true })
}

export function isNotNull(field: string): FilterExpr {
  return new FilterExpr({ type: "null", field, positive: false })
}

export function contains(field: string, value: string): FilterExpr {
  return new FilterExpr({ type: "contains", field, value })
}

export function startsWith(field: string, value: string): FilterExpr {
  return new FilterExpr({ type: "startsWith", field, value })
}

export function endsWith(field: string, value: string): FilterExpr {
  return new FilterExpr({ type: "endsWith", field, value })
}

export function compare(
  field: string,
  operator: string,
  otherField: string,
): FilterExpr {
  return new FilterExpr({ type: "compare", field, operator, otherField })
}

export function and(...conditions: (FilterExpr | string)[]): FilterExpr {
  const valid = conditions.filter(c => c != null && c !== "")
  const exprs = valid.map(c => typeof c === "string" ? new FilterExpr({ type: "raw", value: c }) : c)
  return new FilterExpr({ type: "and", conditions: exprs })
}

export function or(...conditions: (FilterExpr | string)[]): FilterExpr {
  const valid = conditions.filter(c => c != null && c !== "")
  const exprs = valid.map(c => typeof c === "string" ? new FilterExpr({ type: "raw", value: c }) : c)
  return new FilterExpr({ type: "or", conditions: exprs })
}

export function not(condition: FilterExpr | string): FilterExpr {
  const c = typeof condition === "string" ? new FilterExpr({ type: "raw", value: condition }) : condition
  return new FilterExpr({ type: "not", condition: c })
}

export function isActive(): FilterExpr {
  return eq("statecode", 0)
}

export function isInactive(): FilterExpr {
  return eq("statecode", 1)
}
