import { test, expect } from "vitest"
import { suites } from "./browser/suites"

// The browser harness has no unit-test coverage, and a suite whose `tests()`
// throws used to fail *silently*: Runner caught it, produced zero results, and
// the suite vanished from the run report entirely (this actually happened — the
// whole query-odata suite, including the auto-expansion tests, never ran).
//
// `suite.tests(ctx)` is invoked BEFORE `setup()`, so ctx.state is empty at that
// point. Any suite that reads ctx.state while building its case list will throw
// here instead of disappearing from the report.
const stubCtx = (): any => ({
  tables: {},
  state: {},
  cfg: {},
  client: {},
  fx: { scopePrefix: "p", sessionPrefix: "s", name: () => "n", track: () => "id", ids: [] },
})

test("every browser suite builds a non-empty case list from an empty ctx", () => {
  const broken: string[] = []
  for (const suite of suites) {
    let cases: Array<{ name: string }> = []
    try {
      cases = suite.tests(stubCtx())
    } catch (e) {
      broken.push(`${suite.name}: threw ${(e as Error).message}`)
      continue
    }
    if (cases.length === 0) broken.push(`${suite.name}: produced no tests`)
  }
  expect(broken).toEqual([])
})

test("browser suites have unique names and titles", () => {
  expect(new Set(suites.map((s) => s.name)).size).toBe(suites.length)
  expect(new Set(suites.map((s) => s.title)).size).toBe(suites.length)
})

test("every browser suite test has a name", () => {
  const unnamed = suites.flatMap((suite) =>
    suite.tests(stubCtx())
      .filter((t) => !t.name || !t.name.trim())
      .map((t) => suite.name),
  )
  expect(unnamed).toEqual([])
})