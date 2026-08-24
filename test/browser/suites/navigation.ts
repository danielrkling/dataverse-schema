import { fetchOdata, eq } from "../../../src"
import { Suite } from "../harness/runner"
import { assert, assertEquals } from "../harness/assert"
import { seedParent, seedRow } from "../harness/seed"

export const navigationSuite: Suite = {
  name: "navigation",
  title: "Navigation properties",
  async setup(ctx) {
    ctx.state.parentName = ctx.fx.name("nav-parent")
    ctx.state.parent = await seedParent(ctx, { name: ctx.state.parentName, int: 100 })
    ctx.state.kid1 = await seedRow(ctx, { int: 5, testLookup: ctx.state.parent })
    ctx.state.kid2 = await seedRow(ctx, { int: 7, testLookup: ctx.state.parent })
    ctx.state.detached = await seedRow(ctx, { int: 9 })
  },
  tests: (ctx) => [
    {
      name: "expanded children collection returns linked rows",
      fn: async () => {
        const rows = await fetchOdata(ctx.tables.TestTable0)
          .select("name")
          .expand("children", (sub) => sub.select("name"))
          .filter(`nnsyc200_test_tableid eq ${ctx.state.parent}`)
          .execute()
        assertEquals(rows[0].children?.length, 2, "two linked kids")
      },
    },
    {
      name: "getPropertyValue supports lookupId and lookup navigation",
      fn: async () => {
        const idValue = await ctx.tables.TestTable.getPropertyValue("testLookup", ctx.state.kid2)
        assertEquals(idValue, ctx.state.parent, "raw lookupId value")
        const nav = await ctx.tables.TestTable.getPropertyValue("testLookupNav", ctx.state.kid2)
        assert(nav && typeof nav === "object", "expanded lookup object returned")
        assertEquals(nav.name, ctx.state.parentName, "nav record transformed")
      },
    },
    {
      name: "getPropertyValue returns linked ids for collection navigation",
      fn: async () => {
        const kids = await ctx.tables.TestTable0.getPropertyValue("children", ctx.state.parent)
        assert(Array.isArray(kids), "array returned")
        assertEquals(kids.length, 2, "both kids listed")
      },
    },
    {
      name: "choice column round-trips label ↔ value",
      fn: async () => {
        await ctx.tables.TestTable.updateRecord(ctx.state.kid1, { choice: "C" })
        const kid = await ctx.tables.TestTable.getRecord(ctx.state.kid1)
        assertEquals(kid?.choice, "C", "choice persisted")
      },
    },
    {
      name: "associateRecord links a detached row through the lookup",
      fn: async () => {
        await ctx.tables.TestTable.associateRecord("testLookup", ctx.state.detached, ctx.state.parent)
        const kid = await ctx.tables.TestTable.getRecord(ctx.state.detached)
        assertEquals(kid?.testLookup, ctx.state.parent, "lookupId set by associate")
      },
    },
    {
      name: "dissociateRecord clears a collection link",
      fn: async () => {
        await ctx.tables.TestTable.dissociateRecord("children", ctx.state.parent, ctx.state.kid2)
        const rows = await fetchOdata(ctx.tables.TestTable0)
          .select("id")
          .expand("children", (sub) => sub.select("name"))
          .filter(`nnsyc200_test_tableid eq ${ctx.state.parent}`)
          .execute()
        assertEquals(rows[0].children?.length ?? 0, 2, "kid2 removed, detached still linked")
        await ctx.tables.TestTable.associateRecord("testLookup", ctx.state.kid2, ctx.state.parent)
      },
    },
    {
      name: "lookup navigation afterSave creates + associates a new related record",
      fn: async () => {
        const navName = ctx.fx.name("nav-created")
        await ctx.tables.TestTable.updateRecord(ctx.state.kid1, {
          text: "nav-created-target",
          testLookupNav: { name: navName },
        })
        const kid = await ctx.tables.TestTable.getRecord(ctx.state.kid1)
        assert(kid?.testLookup, "lookupId now points at the created record")
        if (kid.testLookup) ctx.fx.track(kid.testLookup)
        const target = await ctx.tables.TestTable.getRecord(kid.testLookup)
        assertEquals(target?.name, navName, "created record carries the given name")
      },
    },
    {
      name: "lookup navigation null clears the lookup",
      fn: async () => {
        await ctx.tables.TestTable.updateRecord(ctx.state.kid1, { text: "nav-clear", testLookupNav: null })
        const kid = await ctx.tables.TestTable.getRecord(ctx.state.kid1)
        assertEquals(kid?.testLookup, null, "lookup cleared")
      },
    },
  ],
}
