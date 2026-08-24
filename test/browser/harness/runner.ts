import { DataverseClient } from "../../../src"
import { BrowserTestConfig } from "./config"
import { Tables } from "./tables"
import { FixtureTracker, deleteByIds } from "./fixtures"
import { SkipError } from "./assert"

export type SuiteCtx = {
  client: DataverseClient
  tables: Tables
  cfg: BrowserTestConfig
  fx: FixtureTracker
  state: Record<string, any>
}

export interface TestCase {
  name: string
  fn: (ctx: SuiteCtx) => Promise<void> | void
}

export interface Suite {
  name: string
  title: string
  setup?: (ctx: SuiteCtx) => Promise<void>
  tests: (ctx: SuiteCtx) => TestCase[]
}

export type TestStatus = "pass" | "fail" | "skip"

export interface TestResult {
  suite: string
  suiteTitle: string
  name: string
  status: TestStatus
  durationMs: number
  error?: string
}

export interface RunSummary {
  results: TestResult[]
  passed: number
  failed: number
  skipped: number
  cleanedUp: number
  startedAt: string
  finishedAt: string
}

export type RunnerEvents = {
  onSuiteStart?: (suite: Suite) => void
  onTestStart?: (suite: Suite, test: TestCase) => void
  onTestEnd?: (result: TestResult) => void
  onFinish?: (summary: RunSummary) => void
}

export class Runner {
  constructor(private readonly base: Omit<SuiteCtx, "state">) {}

  async run(suites: Suite[], events: RunnerEvents = {}): Promise<RunSummary> {
    const results: TestResult[] = []
    const startedAt = new Date().toISOString()
    this.base.fx.beginRun()

    for (const suite of suites) {
      events.onSuiteStart?.(suite)
      this.base.fx.beginSuite(suite.name)
      const ctx: SuiteCtx = { ...this.base, state: {} }

      let setupError: unknown
      const cases = (() => {
        try {
          return suite.tests(ctx)
        } catch (e) {
          setupError = e
          return [] as TestCase[]
        }
      })()

      if (!setupError && suite.setup) {
        try {
          await suite.setup(ctx)
        } catch (e) {
          setupError = e
        }
      }

      for (const test of cases) {
        events.onTestStart?.(suite, test)
        const started = performance.now()
        let result: TestResult
        if (setupError) {
          result = {
            suite: suite.name,
            suiteTitle: suite.title,
            name: test.name,
            status: "skip",
            durationMs: 0,
            error: `suite setup failed: ${messageOf(setupError)}`,
          }
        } else {
          try {
            await test.fn(ctx)
            result = { suite: suite.name, suiteTitle: suite.title, name: test.name, status: "pass", durationMs: performance.now() - started }
          } catch (e) {
            const status: TestStatus = e instanceof SkipError ? "skip" : "fail"
            result = {
              suite: suite.name,
              suiteTitle: suite.title,
              name: test.name,
              status,
              durationMs: performance.now() - started,
              error: status === "fail" ? `${messageOf(e)}\n${stackOf(e)}` : messageOf(e),
            }
          }
        }
        results.push(result)
        events.onTestEnd?.(result)
      }
    }

    const cleanedUp = await deleteByIds(this.base.tables.TestTable, this.base.fx.ids)
    const summary: RunSummary = {
      results,
      passed: results.filter((r) => r.status === "pass").length,
      failed: results.filter((r) => r.status === "fail").length,
      skipped: results.filter((r) => r.status === "skip").length,
      cleanedUp,
      startedAt,
      finishedAt: new Date().toISOString(),
    }
    this.base.fx.ids.length = 0
    events.onFinish?.(summary)
    return summary
  }
}

function messageOf(e: unknown): string {
  if (e instanceof Error) return e.message
  try {
    return JSON.stringify(e)
  } catch {
    return String(e)
  }
}

function stackOf(e: unknown): string {
  return e instanceof Error && e.stack ? e.stack.split("\n").slice(1, 4).join("\n") : ""
}
