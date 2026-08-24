import { createCollection } from "@tanstack/db"
import { dataverseCollectionOptions } from "../../../../src/tanstack-db/index"
import { Suite } from "../../harness/runner"
import { assert, assertEquals, assertInstanceOf } from "../../harness/assert"
import { seedRow } from "../../harness/seed"
import { waitFor } from "../db-helper"

export const onlineCollectionSuite: Suite = {
  name: "online-collection",
  title: "Online @tanstack/db collection",
  async setup(ctx) {
    ctx.state.row = await seedRow(ctx, { int: 10, text: "online-coll", choice: "B" })
  },
  tests: (ctx) => [
    {
      name: "dataverseCollectionOptions builds a usable Collection",
      fn: async () => {
        const config = dataverseCollectionOptions({ table: ctx.tables.TestTable })
        const collection = createCollection(config) as any
        // The initial sync pulls rows asynchronously; poll until populated.
        await waitFor(() => collection.size >= 1, 8000)
        const found = collection.get(ctx.state.row)
        assert(found, "seeded row present in collection")
        assert(typeof found.int === "number", "row transformed (int is number)")
        assert(typeof found.name === "string", "row transformed (name is string)")
      },
    },
    {
      name: "insert through the collection persists to Dataverse",
      fn: async () => {
        const config = dataverseCollectionOptions({ table: ctx.tables.TestTable })
        const collection = createCollection(config) as any
        await waitFor(() => collection.size >= 1, 8000)
        const name = ctx.fx.name("coll-insert")
        const id = crypto.randomUUID()
        // The collection keys rows via the record's `id`, so it must be present.
        collection.insert({ id, name, int: 77, text: "via-collection" })
        // Allow the onInsert mutation fn to round-trip.
        await waitFor(async () => {
          const rows = await ctx.tables.TestTable.getRecords({
            filter: `nnsyc200_name eq '${name}'`,
          })
          return rows.length === 1 && rows[0].int === 77
        }, 8000)
        const rows = await ctx.tables.TestTable.getRecords({
          filter: `nnsyc200_name eq '${name}'`,
        })
        ctx.fx.track(rows[0].id)
      },
    },
    {
      name: "update through the collection persists to Dataverse",
      fn: async () => {
        const config = dataverseCollectionOptions({ table: ctx.tables.TestTable })
        const collection = createCollection(config) as any
        await waitFor(() => collection.get(ctx.state.row) != null, 8000)
        const entry = collection.get(ctx.state.row)
        assert(entry, "row in collection before update")
        collection.update(ctx.state.row, (d: any) => {
          d.int = 999
        })
        await waitFor(async () => {
          const live = await getRecordSafe(ctx.tables.TestTable, ctx.state.row)
          return live?.int === 999
        }, 8000)
      },
    },
    {
      name: "delete through the collection removes from Dataverse",
      fn: async () => {
        const id = await seedRow(ctx, { int: 5, text: "coll-del" })
        const config = dataverseCollectionOptions({ table: ctx.tables.TestTable })
        const collection = createCollection(config) as any
        await waitFor(() => collection.get(id) != null, 8000)
        collection.delete(id)
        await waitFor(async () => {
          return (await getRecordSafe(ctx.tables.TestTable, id)) == null
        }, 8000)
      },
    },
    {
      name: "forceSync pulls external changes into the collection",
      fn: async () => {
        const config = dataverseCollectionOptions({ table: ctx.tables.TestTable })
        const collection = createCollection(config) as any
        await waitFor(() => collection.get(ctx.state.row) != null, 8000)
        // Mutate directly in Dataverse (bypassing the collection).
        await ctx.tables.TestTable.updateRecord(ctx.state.row, { int: 1234 })
        const utils = collection.utils as { forceSync: () => Promise<void> }
        assert(typeof utils?.forceSync === "function", "forceSync util exposed")
        await utils.forceSync()
        await waitFor(() => collection.get(ctx.state.row)?.int === 1234, 8000)
      },
    },
    {
      name: "utils.table references the configured table",
      fn: async () => {
        const config = dataverseCollectionOptions({ table: ctx.tables.TestTable })
        const collection = createCollection(config) as any
        await new Promise((r) => setTimeout(r, 300))
        const utils = collection.utils as { table: unknown }
        assertInstanceOf(utils.table, ctx.tables.TestTable.constructor, "utils.table")
      },
    },
  ],
}

async function getRecordSafe(table: any, id: string) {
  try {
    return await table.getRecord(id)
  } catch {
    return null
  }
}
