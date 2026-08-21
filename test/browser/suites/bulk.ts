import { fetchOdata, count } from "../../../src"
import { Suite } from "../harness/runner"
import { seedRow } from "../harness/seed"
import { assert, assertEquals } from "../harness/assert"

const BULK = 5

export const bulkSuite: Suite = {
  name: "bulk",
  title: "Bulk operations",
  async setup(ctx) {
    ctx.state.rows = [] as string[]
    for (let i = 0; i < BULK; i++) {
      ctx.state.rows.push(await seedRow(ctx, { name: ctx.fx.name(`bulk-${i}`), int: i + 1 }))
    }
  },
  tests: (ctx) => {
    const scope = `startswith(nnsyc200_name,'${ctx.fx.runPrefix}-bulk-')`
    return [
      {
        name: "seeded bulk rows are all present",
        fn: async () => {
          const rows = await ctx.tables.TestTable.getRecords({ filter: scope })
          assertEquals(rows.length, BULK, "row count")
        },
      },
      {
        name: "updateMultiple applies to every row",
        fn: async () => {
          await ctx.tables.TestTable.updateMultiple(
            (ctx.state.rows as string[]).map((id) => ({ id, int: 555 }) as any),
          )
          const rows = await ctx.tables.TestTable.getRecords({ filter: scope })
          for (const r of rows) assertEquals(r.int, 555, `bulk-updated int on ${r.id}`)
        },
      },
      {
        name: "count aggregate sees bulk rows before deleteMultiple",
        fn: async () => {
          const rows = await fetchOdata(ctx.tables.TestTable)
            .apply((f) => ({ n: count() }))
            .filter(scope)
            .execute()
          assertEquals(rows[0]?.n, BULK, "aggregate count")
        },
      },
      {
        name: "deleteMultiple removes every row",
        fn: async () => {
          try {
            await ctx.tables.TestTable.deleteMultiple(ctx.state.rows as string[])
          } catch (e: any) {
            const msg = e instanceof Error ? e.message : JSON.stringify(e)
            if (msg.includes("has not yet been implemented") || msg.includes("405")) {
              throw new Error("skip: this org has not enabled DeleteMultiple")
            }
            throw e
          }
          const rows = await ctx.tables.TestTable.getRecords({ filter: scope })
          assertEquals(rows.length, 0, "all bulk rows deleted")
        },
      },
    ]
  },
}
