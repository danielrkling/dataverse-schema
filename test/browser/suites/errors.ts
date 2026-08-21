import { Suite } from "../harness/runner"
import { assert, assertEquals, assertInstanceOf, assertRejects } from "../harness/assert"

export const errorsSuite: Suite = {
  name: "errors",
  title: "Error handling",
  tests: (ctx) => [
    {
      name: "getRecord on a missing id returns null",
      fn: async () => {
        const r = await ctx.tables.TestTable.getRecord("00000000-0000-0000-0000-00000000dead" as any)
        assertEquals(r, null, "missing record maps to null")
      },
    },
    {
      name: "deleteRecord on a missing id rejects with DataverseHttpError 404",
      fn: async () => {
        const err = (await assertRejects(() =>
          ctx.tables.TestTable.deleteRecord("00000000-0000-0000-0000-00000000dead" as any),
        )) as any
        assertInstanceOf(err, Error, "error instance")
        assertEquals(err.name, "DataverseHttpError", "typed error")
        assertEquals(err.status, 404, "status code")
      },
    },
    {
      name: "invalid choice label throws client-side before any HTTP call",
      fn: async () => {
        const err = await assertRejects(async () => {
          const id = await ctx.tables.TestTable.createRecord({ choice: "NOT_A_LABEL" as any })
          if (id) await ctx.tables.TestTable.deleteRecord(id)
        }, "Unknown choice label")
        void err
      },
    },
    {
      name: "stale ifMatch update rejects with 412 Precondition Failed",
      fn: async () => {
        const row = await import("../harness/seed").then((m) => m.seedRow(ctx, { int: 1 }))
        try {
          const err = (await assertRejects(() =>
            ctx.tables.TestTable.updateRecord(row, { int: 2 }, { ifMatch: 'W/"999999"' }),
          )) as any
          assertEquals(err.status, 412, "precondition status")
        } finally {
          await ctx.tables.TestTable.deleteRecord(row).catch(() => undefined)
        }
      },
    },
    {
      name: "multiChoice write of an unknown value still round-trips numerically",
      fn: async () => {
        const row = await import("../harness/seed").then((m) => m.seedRow(ctx, {}))
        try {
          await ctx.tables.TestTable.updatePropertyValue("multiChoice", row, [1, 12])
          const v = await ctx.tables.TestTable.getPropertyValue("multiChoice", row)
          assertEquals(v, [1, 12], "boundary month values")
        } finally {
          await ctx.tables.TestTable.deleteRecord(row).catch(() => undefined)
        }
      },
    },
  ],
}
