import { GUID } from "../../../src"
import { SuiteCtx } from "./runner"

/** Creates a row on the main test table, tracking it for cleanup. */
export async function seedRow(ctx: SuiteCtx, overrides: Record<string, any> = {}): Promise<GUID> {
  const id = await ctx.tables.TestTable.createRecord({
    name: ctx.fx.name("row"),
    ...overrides,
  })
  return ctx.fx.track(id)
}

/** Creates a row on the base (parent) table, tracking it for cleanup. */
export async function seedParent(ctx: SuiteCtx, overrides: Record<string, any> = {}): Promise<GUID> {
  const id = await ctx.tables.TestTable0.createRecord({
    name: ctx.fx.name("parent"),
    ...overrides,
  })
  return ctx.fx.track(id)
}
