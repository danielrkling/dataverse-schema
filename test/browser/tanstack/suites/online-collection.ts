import { createCollection } from "@tanstack/db"
import type { Collection } from "@tanstack/db"
import { dataverseCollectionOptions } from "../../../../src/tanstack-db/index"
import { Suite } from "../../harness/runner"
import { assert, assertEquals, assertInstanceOf } from "../../harness/assert"
import { seedRow } from "../../harness/seed"

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
        try {
          // The sync fn kicks off synchronously; wait for the first commit.
          await new Promise((r) => setTimeout(r, 500))
          assert(collection.size >= 1, `expected at least the seeded row, got ${collection.size}`)
          const found = collection.get(ctx.state.row)
          assert(found, "seeded row present in collection")
          assert(typeof found.int === "number", "row transformed (int is number)")
          assert(typeof found.name === "string", "row transformed (name is string)")
        } finally {
          collection.delete(ctx.state.row)
        }
      },
    },
    {
      name: "insert through the collection persists to Dataverse",
      fn: async () => {
        const config = dataverseCollectionOptions({ table: ctx.tables.TestTable })
        const collection = createCollection(config) as any
        try {
          await new Promise((r) => setTimeout(r, 500))
          const name = ctx.fx.name("coll-insert")
          collection.insert({ name, int: 77, text: "via-collection" })
          // Allow the onInsert mutation fn to round-trip.
          await new Promise((r) => setTimeout(r, 600))
          const rows = await ctx.tables.TestTable.getRecords({
            filter: `nnsyc200_name eq '${name}'`,
          })
          assert(rows.length === 1, `inserted row not found in Dataverse (got ${rows.length})`)
          assert(rows[0].int === 77, "inserted int persisted")
          ctx.fx.track(rows[0].id)
        } finally {
          collection.delete(ctx.state.row)
        }
      },
    },
    {
      name: "update through the collection persists to Dataverse",
      fn: async () => {
        const config = dataverseCollectionOptions({ table: ctx.tables.TestTable })
        const collection = createCollection(config) as any
        try {
          await new Promise((r) => setTimeout(r, 500))
          const entry = collection.get(ctx.state.row)
          assert(entry, "row in collection before update")
          collection.update(ctx.state.row, (d: any) => {
            d.int = 999
          })
          await new Promise((r) => setTimeout(r, 600))
          const live = await ctx.tables.TestTable.getRecord(ctx.state.row)
          assertEquals(live?.int, 999, "collection-driven update persisted")
        } finally {
          collection.delete(ctx.state.row)
        }
      },
    },
    {
      name: "delete through the collection removes from Dataverse",
      fn: async () => {
        const id = await seedRow(ctx, { int: 5, text: "coll-del" })
        const config = dataverseCollectionOptions({ table: ctx.tables.TestTable })
        const collection = createCollection(config) as any
        try {
          await new Promise((r) => setTimeout(r, 500))
          collection.delete(id)
          await new Promise((r) => setTimeout(r, 600))
          const live = await ctx.tables.TestTable.getRecord(id)
          assertEquals(live, null, "collection-driven delete removed the row")
        } finally {
          collection.delete(id)
        }
      },
    },
    {
      name: "forceSync pulls external changes into the collection",
      fn: async () => {
        const config = dataverseCollectionOptions({ table: ctx.tables.TestTable })
        const collection = createCollection(config) as any
        try {
          await new Promise((r) => setTimeout(r, 500))
          // Mutate directly in Dataverse (bypassing the collection).
          await ctx.tables.TestTable.updateRecord(ctx.state.row, { int: 1234 })
          const utils = collection.utils as { forceSync: () => Promise<void> }
          assert(typeof utils?.forceSync === "function", "forceSync util exposed")
          await utils.forceSync()
          const entry = collection.get(ctx.state.row)
          assertEquals(entry?.int, 1234, "external change reflected after forceSync")
        } finally {
          collection.delete(ctx.state.row)
        }
      },
    },
    {
      name: "utils.table references the configured table",
      fn: async () => {
        const config = dataverseCollectionOptions({ table: ctx.tables.TestTable })
        const collection = createCollection(config) as any
        try {
          const utils = collection.utils as { table: unknown }
          assertInstanceOf(utils.table, ctx.tables.TestTable.constructor, "utils.table")
        } finally {
          collection.delete(ctx.state.row)
        }
      },
    },
  ],
}
