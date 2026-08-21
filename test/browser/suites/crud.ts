import { Suite } from "../harness/runner"
import { assert, assertEquals, assertInstanceOf, assertRejects } from "../harness/assert"
import { seedRow } from "../harness/seed"

export const crudSuite: Suite = {
  name: "crud",
  title: "CRUD & concurrency",
  async setup(ctx) {
    ctx.state.row = await seedRow(ctx, { int: 10, text: "crud-row", choice: "B" })
  },
  tests: (ctx) => [
    {
      name: "getRecord transforms all field kinds",
      fn: async () => {
        const r = await ctx.tables.TestTable.getRecord(ctx.state.row)
        assert(r, "record not found")
        assertEquals(r.id, ctx.state.row, "primary key")
        assertEquals(r.int, 10, "int")
        assertEquals(r.bool, false, "bool default false")
        assertEquals(r.choice, "B", "choice label")
        assertEquals(r.statusCode, "Active", "statusCode label")
        assert(r.createdOn instanceof Date, "createdOn is Date")
        assertEquals<number[]>(r.multiChoice, [], "multiChoice reads as empty array")
      },
    },
    {
      name: "getRecord with ifNoneMatch * on existing returns null (304)",
      fn: async () => {
        const r = await ctx.tables.TestTable.getRecord(ctx.state.row, { ifNoneMatch: "*" })
        assertEquals(r, null, "304 Not Modified maps to null")
      },
    },
    {
      name: "readonly formula column is skipped on update",
      fn: async () => {
        await ctx.tables.TestTable.updateRecord(ctx.state.row, { formula: "SHOULD_NOT_APPLY", int: 99 })
        const r = await ctx.tables.TestTable.getRecord(ctx.state.row)
        assert(r, "row missing after update")
        assertEquals(r.int, 99, "writable int applied")
        assert(r.formula !== "SHOULD_NOT_APPLY", `readonly formula must not be written, got ${JSON.stringify(r.formula)}`)
      },
    },
    {
      name: "upsertRecord create path creates a new record",
      fn: async () => {
        const id = await ctx.tables.TestTable.upsertRecord(undefined, {
          name: ctx.fx.name("upsert-create"),
          int: 11,
        })
        ctx.fx.track(id)
        const r = await ctx.tables.TestTable.getRecord(id)
        assertEquals(r?.int, 11, "created via upsert")
      },
    },
    {
      name: "pickProperties table queries a subset",
      fn: async () => {
        const NameOnly = ctx.tables.TestTable.pickProperties("name", "int", "id")
        const rows = await NameOnly.getRecords({ filter: `nnsyc200_test_tableid eq ${ctx.state.row}` })
        assert(rows.length === 1, "subset query returned row")
        const keys = Object.keys(rows[0]).sort()
        assertEquals(keys, ["$etag", "id", "int", "name"], "only picked fields present")
      },
    },
    {
      name: "activateRecord / deactivateRecord round-trip statecode",
      fn: async () => {
        await ctx.tables.TestTable.deactivateRecord(ctx.state.row)
        let r = await ctx.tables.TestTable.getRecord(ctx.state.row)
        assertEquals(r?.stateCode, 1, "deactivated")
        await ctx.tables.TestTable.activateRecord(ctx.state.row)
        r = await ctx.tables.TestTable.getRecord(ctx.state.row)
        assertEquals(r?.stateCode, 0, "reactivated")
      },
    },
    {
      name: "deleteRecord removes the record",
      fn: async () => {
        const id = await seedRow(ctx, { int: 12 })
        await ctx.tables.TestTable.deleteRecord(id)
        const r = await ctx.tables.TestTable.getRecord(id)
        assertEquals(r, null, "deleted record is gone")
      },
    },
    {
      name: "alternate key lookup resolves the created record",
      fn: async () => {
        if (!ctx.cfg.altKeyAttribute) throw new Error("skip: set altKeyAttribute in config")
        const unique = ctx.fx.name("altkey")
        const created = await seedRow(ctx, { altKey: unique })
        const found = await ctx.tables.TestTable.getRecord(`${ctx.cfg.altKeyAttribute}='${unique}'`)
        assert(found, "record not found via alternate key")
        assertEquals(found.id, created, "alternate key resolves to the created record")
      },
    },
  ],
}
