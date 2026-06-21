import { expect, test } from "vitest"
import { Above, FilterExpr } from "../src"

test("debug Above return type", () => {
  const result = Above("field", "value")
  console.log("typeof result:", typeof result)
  console.log("result instanceof FilterExpr:", result instanceof FilterExpr)
  console.log("result.toString():", result.toString())
  console.log("result:", result)
  expect(result).toBeInstanceOf(FilterExpr)
})
