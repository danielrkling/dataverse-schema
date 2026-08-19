import { FilterExpr } from "../../query"
import type { FilterNode } from "./ast"

export type FilterDialect = "odata" | "fetchXml"

export function filterInputNode<TProxy>(
  filter: string | FilterExpr | ((proxy: TProxy) => string | FilterExpr),
  proxy: TProxy,
): FilterNode {
  const value = typeof filter === "function" ? filter(proxy) : filter
  return typeof value === "string" ? { type: "raw", value } : value.getNode()
}

export function renderFilterInput<TProxy>(
  filter: string | FilterExpr | ((proxy: TProxy) => string | FilterExpr),
  proxy: TProxy,
  dialect: FilterDialect,
): string {
  const value = typeof filter === "function" ? filter(proxy) : filter
  if (typeof value === "string") return value
  return dialect === "odata" ? value.toOdata() : value.toFetchXml()
}
