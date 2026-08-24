import { GUID, Infer } from "../../../src"
import { SuiteCtx } from "./runner"

type MainRecord = SuiteCtx["tables"]["TestTable"]["T"]
type ParentRecord = SuiteCtx["tables"]["TestTable0"]["T"]

/** Creates a row on the main test table, tracking it for cleanup. */
export async function seedRow(ctx: SuiteCtx, overrides: Partial<MainRecord> = {}): Promise<GUID> {
  const id = await ctx.tables.TestTable.createRecord({
    name: ctx.fx.name("row"),
    ...overrides,
  })
  return ctx.fx.track(id)
}

/** Creates a row on the base (parent) table, tracking it for cleanup. */
export async function seedParent(ctx: SuiteCtx, overrides: Partial<ParentRecord> = {}): Promise<GUID> {
  const id = await ctx.tables.TestTable0.createRecord({
    name: ctx.fx.name("parent"),
    ...overrides,
  })
  return ctx.fx.track(id)
}
