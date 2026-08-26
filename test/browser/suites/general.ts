import { WhoAmI, fetchOdata, fetchXml, eq, gt, lt, and, count, sum } from "../../../src"
import { Suite } from "../harness/runner"
import { assert, assertEquals } from "../harness/assert"
import { seedParent, seedRow } from "../harness/seed"

const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const generalSuite: Suite = {
  name: "general",
  title: "General smoke",
  async setup(ctx) {
    ctx.state.parentName = ctx.fx.name("parent")
    ctx.state.parent = await seedParent(ctx, { name: ctx.state.parentName, int: 100, bool: true, text: "parent" })
    ctx.state.childName = ctx.fx.name("child")
    ctx.state.child = await seedRow(ctx, {
      name: ctx.state.childName,
      int: 5,
      bool: true,
      text: "child",
      datetime: new Date("2024-01-15T10:30:00Z"),
      dateOnly: new Date("2024-01-15T00:00:00Z"),
      testLookup: ctx.state.parent,
      choice: "B",
    })
  },
  tests: (ctx) => [
    {
      name: "WhoAmI returns a userId",
      fn: async () => {
        const r = await WhoAmI(ctx.client)
        assert(r && r.UserId && GUID_RE.test(r.UserId), "valid UserId missing from WhoAmI response")
      },
    },
    {
      name: "createRecord returns well-formed GUIDs",
      fn: () => {
        assert(GUID_RE.test(ctx.state.parent), `bad parent id ${ctx.state.parent}`)
        assert(GUID_RE.test(ctx.state.child), `bad child id ${ctx.state.child}`)
      },
    },
    {
      name: "getRecords filter/orderby/top (OData, transformed)",
      fn: async () => {
        const rows = await ctx.tables.TestTable.getRecords({
          filter: `nnsyc200_int gt 0 and startswith(nnsyc200_name,'${ctx.fx.scopePrefix}')`,
          orderby: "nnsyc200_name asc",
          top: 10,
        })
        const child = rows.find((r) => r.id === ctx.state.child)
        assert(child, "seeded child not returned by query")
        assertEquals(child.testLookup, ctx.state.parent, "lookupId value persisted")
        assert(typeof child.int === "number" && typeof child.name === "string", "row transforms applied")
      },
    },
    {
      name: "fetchOdata query string works against the API",
      fn: async () => {
        const q = fetchOdata(ctx.tables.TestTable).select("name", "int").filter("nnsyc200_int gt 0").toString()
        const rows = await ctx.client.getRecords(ctx.tables.TestTable.entitySetName, { query: q })
        assert(Array.isArray(rows) && rows.length >= 1, "expected odata rows")
      },
    },
    {
      name: "fetchXml query string works against the API",
      fn: async () => {
        const fx = fetchXml(ctx.tables.TestTable)
          .select((f) => ({ name: f.name, int: f.int }))
          .filter("nnsyc200_int gt 0")
          .top(10)
          .toString()
        const rows = await ctx.client.getRecords(ctx.tables.TestTable.entitySetName, { query: fx })
        assert(Array.isArray(rows) && rows.length >= 1, "expected fetchxml rows")
      },
    },
    {
      name: "fetchOdata FilterExpr operators + row transforms",
      fn: async () => {
        const rows = await fetchOdata(ctx.tables.TestTable)
          .select("name", "int", "bool", "datetime")
          .filter((f) => and(gt(f.int, 0), lt(f.int, 1000)))
          .orderby((f) => f.name, "asc")
          .top(10)
          .execute()
        assert(Array.isArray(rows) && rows.length >= 1, "expected odata rows")
        const r = rows[0]
        assert(typeof r.int === "number", `int not transformed: ${JSON.stringify(r.int)}`)
        assert(typeof r.bool === "boolean", `bool not transformed: ${JSON.stringify(r.bool)}`)
        assert(typeof r.name === "string", `name not transformed: ${JSON.stringify(r.name)}`)
        assert(r.datetime instanceof Date, `datetime not transformed: ${JSON.stringify(r.datetime)}`)
      },
    },
    {
      name: "fetchOdata expand lookup navigation + nested transforms",
      fn: async () => {
        const rows = await fetchOdata(ctx.tables.TestTable)
          .select("name")
          .expand("testLookupNav", (q) => q.select("name", "createdOn", "int"))
          .filter(`nnsyc200_test_tableid eq ${ctx.state.child}`)
          .execute()
        assert(rows.length === 1, "expected exactly the child row")
        const nav = rows[0].testLookupNav
        assert(nav && nav.name === ctx.state.parentName, `expand failed: ${JSON.stringify(nav)}`)
        assert(nav.createdOn instanceof Date, "related createdOn not transformed to Date")
        assert(typeof nav.int === "number", "related int not transformed")
      },
    },
    {
      name: "fetchXml FilterExpr (and/eq) + transforms",
      fn: async () => {
        const rows = await fetchXml(ctx.tables.TestTable)
          .select((f) => ({ name: f.name, int: f.int, bool: f.bool, datetime: f.datetime }))
          .filter((f) => and(eq(f.name, ctx.state.childName), gt(f.int, 0)))
          .execute()
        assert(rows.length >= 1, "expected fetchxml rows")
        const r = rows[0]
        assertEquals(r.int, 5, "int value/transform")
        assert(typeof r.bool === "boolean", "bool transform")
        assert(r.datetime instanceof Date, "datetime transform")
      },
    },
    {
      name: "fetchXml join (link-entity) to parent",
      fn: async () => {
        const base = fetchXml(ctx.tables.TestTable)
          .select((f) => ({ name: f.name, datetime: f.datetime, int: f.int }))
          .join("inner", ctx.tables.TestTable0, "id", "testLookup", (sub) => sub.select((f) => ({ parentName: f.name })))
          .filter((f) => eq(f.id, ctx.state.child))
        const raw = await ctx.client.getRecords(ctx.tables.TestTable.entitySetName, { query: base.toString() })
        assert(Array.isArray(raw) && raw.length === 1, "expected the child row via join")
        assertEquals(raw[0].parentName, ctx.state.parentName, "joined alias column present in raw payload")
        const transformed = await base.execute()
        assert(transformed[0].datetime instanceof Date, "main-entity transforms on joined query")
      },
    },
    {
      name: "fetchXml aggregate (count + sum)",
      fn: async () => {
        const fx = fetchXml(ctx.tables.TestTable)
          .apply((f) => ({ n: count(f.id), totalInt: sum(f.int) }))
          .toString()
        const rows = await ctx.client.getRecords(ctx.tables.TestTable.entitySetName, { query: fx })
        assert(Array.isArray(rows) && rows.length === 1, "expected one aggregate row")
        assert(rows[0].n !== undefined && rows[0].totalInt !== undefined, `aggregate aliases missing: ${JSON.stringify(rows[0])}`)
      },
    },
    {
      name: "getPropertyValue reads a value column",
      fn: async () => {
        const v = await ctx.tables.TestTable.getPropertyValue("text", ctx.state.child)
        assertEquals(v, "child", "text property value")
      },
    },
    {
      name: "updatePropertyValue writes and reads back",
      fn: async () => {
        await ctx.tables.TestTable.updatePropertyValue("text", ctx.state.child, "child-updated")
        const v = await ctx.tables.TestTable.getPropertyValue("text", ctx.state.child)
        assertEquals(v, "child-updated", "updated text")
      },
    },
    {
      name: "deletePropertyValue clears a value",
      fn: async () => {
        await ctx.tables.TestTable.deletePropertyValue("text", ctx.state.child)
        const v = await ctx.tables.TestTable.getPropertyValue("text", ctx.state.child)
        assert(v == null || v === "", `expected cleared value, got ${JSON.stringify(v)}`)
      },
    },
    {
      name: "updateRecord persists changes",
      fn: async () => {
        await ctx.tables.TestTable.updateRecord(ctx.state.child, { int: 42 })
        const rows = await ctx.tables.TestTable.getRecords({ filter: `nnsyc200_test_tableid eq ${ctx.state.child}` })
        assert(rows[0] && rows[0].int === 42, "updateRecord int not persisted")
      },
    },
    {
      name: "upsertRecord update path persists",
      fn: async () => {
        await ctx.tables.TestTable.upsertRecord(ctx.state.child, { text: "upserted" })
        const v = await ctx.tables.TestTable.getPropertyValue("text", ctx.state.child)
        assertEquals(v, "upserted", "upserted text")
      },
    },
    {
      name: "file + image upload via afterSave (updateRecord)",
      fn: async () => {
        await ctx.tables.TestTable.updateRecord(ctx.state.child, {
          file: { name: "smoke.txt", data: new Blob(["hello file"]) },
          image: { data: pngBlobBytes() },
        })
      },
    },
    {
      name: "file + image upload via afterSave (createRecord)",
      fn: async () => {
        const record = await ctx.tables.TestTable.createRecord({
          name: ctx.fx.name("child2"),
          int: 7,
          text: "child2",
          testLookup: ctx.state.parent,
          file: { name: "smoke2.txt", data: new Blob(["hello2"]) },
          image: { data: pngBlobBytes() },
        })
        ctx.fx.track(ctx.tables.TestTable.getPrimaryId(record)!)
      },
    },
    {
      name: "multiChoice round-trips CSV through property APIs",
      fn: async () => {
        await ctx.tables.TestTable.updatePropertyValue("multiChoice", ctx.state.child, [3, 4, 5])
        const raw = await ctx.client.getRecords(ctx.tables.TestTable.entitySetName, {
          query: `$select=nnsyc200_choice_month&$filter=nnsyc200_test_tableid eq ${ctx.state.child}`,
        })
        assertEquals(raw[0]?.nnsyc200_choice_month, "3,4,5", "raw multi-choice payload is CSV")
        const v = await ctx.tables.TestTable.getPropertyValue("multiChoice", ctx.state.child)
        assertEquals(v, [3, 4, 5], "multiChoice transforms to number[]")
      },
    },
  ],
}

function pngBlobBytes(): Blob {
  const b64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
  return new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], { type: "image/png" })
}
