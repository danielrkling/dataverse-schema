import { FieldProxy, fetchXml, eq, gt, lt, and, startsWith, groupby, sum, count, min, max, average } from "../../../src"
import { Suite } from "../harness/runner"
import { assert, assertEquals } from "../harness/assert"
import { seedParent, seedRow } from "../harness/seed"
import { MainFields, ParentFields } from "../harness/tables"

export const fetchxmlSuite: Suite = {
  name: "query-fetchxml",
  title: "FetchXML builder end-to-end",
  async setup(ctx) {
    ctx.state.lonelyName = ctx.fx.name("lonely")
    ctx.state.parentName = ctx.fx.name("parent")
    ctx.state.kidBase = `${ctx.fx.scopePrefix}-kid`
    ctx.state.lonelyParent = await seedParent(ctx, { name: ctx.state.lonelyName, int: 0, text: "fx-parent" })
    ctx.state.parent = await seedParent(ctx, { name: ctx.state.parentName, int: 100, choice: "A", text: "fx-parent" })
    const seeds: Array<[string, number, "A" | "B" | "C"]> = [
      ["c1", 5, "A"],
      ["c2", 7, "C"],
      ["c3", 42, "B"],
    ]
    ctx.state.seeds = [] as Array<{ id: string; kind: string; int: number; choice: string }>
    for (const [kind, int, choice] of seeds) {
      const id = await seedRow(ctx, {
        name: `${ctx.fx.scopePrefix}-${kind}`,
        int,
        choice,
        testLookup: ctx.state.parent,
      })
      ctx.state.seeds.push({ id, kind, int, choice })
    }
  },
  tests: (ctx) => {
    const scopePrefix = ctx.fx.scopePrefix
    const scoped = (f: FieldProxy<MainFields | ParentFields>) => startsWith(f.name, scopePrefix)
    return [
      {
        name: "select with aliases + execute applies transforms",
        fn: async () => {
          const rows = await fetchXml(ctx.tables.TestTable)
            .select((f) => ({ label: f.name, amount: f.int }))
            .filter(scoped)
            .top(10)
            .execute()
          assertEquals(rows.length, 5, "prefixed rows (3 children + 2 parents)")
          for (const r of rows) {
            assert(typeof r.label === "string", "aliased name transformed")
            assert(typeof r.amount === "number", "aliased int transformed")
          }
        },
      },
      {
        name: "distinct collapses duplicate values",
        fn: async () => {
          const rows = await fetchXml(ctx.tables.TestTable)
            .select((f) => ({ c: f.choice }))
            .filter(scoped)
            .distinct()
            .execute()
          const labels = new Set(rows.map((r) => r.c))
          assertEquals(labels.size, rows.length, "no duplicates returned")
          for (const want of ["A", "B", "C"]) assert(labels.has(want), `missing choice ${want}`)
        },
      },
      {
        name: "inner join to parent exposes aliased columns",
        fn: async () => {
          const rows = await fetchXml(ctx.tables.TestTable)
            .select((f) => ({ childName: f.name }))
            .join("inner", ctx.tables.TestTable0, "id", "testLookup", (sub) => sub.select((f) => ({ parentLabel: f.name })))
            .filter((f) => eq(f.id, ctx.state.seeds[0].id))
            .execute()
          assertEquals(rows.length, 1, "one joined row")
          assertEquals(rows[0].parentLabel, ctx.state.parentName, "parent alias resolved")
        },
      },
      {
        name: "outer join keeps parents without children; inner drops them",
        fn: async () => {
          const base = (linkType: "inner" | "outer") =>
            fetchXml(ctx.tables.TestTable0)
              .select((f) => ({ parentName: f.name }))
              .join(linkType, ctx.tables.TestTable, "testLookup", "id", (sub) => sub.select((f) => ({ kid: f.name })))
              .filter(scoped)
              .filter((f) => eq(f.text, "fx-parent"))
              .execute()
          const outer = await base("outer")
          assertEquals(outer.length, 4, "lonely parent once + populated parent per child (join multiplies)")
          const outerNames = new Set(outer.map((r) => r.parentName))
          assertEquals([...outerNames].sort(), [ctx.state.lonelyName, ctx.state.parentName].sort(), "both parents present via outer join")
          const inner = await base("inner")
          assertEquals(inner.length, 3, "populated parent repeated per child")
          assertEquals(inner.every((r) => r.parentName === ctx.state.parentName), true, "inner join hit the right parent")
        },
      },
      {
        name: "filter-only exists join",
        fn: async () => {
          const rows = await fetchXml(ctx.tables.TestTable0)
            .select((f) => ({ parentName: f.name }))
            .join("exists", ctx.tables.TestTable, "testLookup", "id", (sub) =>
              sub.filter((f) => gt(f.int, 6)),
            )
            .filter(scoped)
            .execute()
          assertEquals(rows.length, 1, "only parent with a big-int child")
        },
      },
      {
        name: "aggregate groupby(choice) + sum + count via execute()",
        fn: async () => {
          const rows = await fetchXml(ctx.tables.TestTable)
            .apply((f) => ({ byChoice: groupby(f.choice), totalInt: sum(f.int), n: count(f.id) }))
            .filter(scoped)
            .execute()
          const byChoice = new Map(rows.map((r) => [r.byChoice, r]))
          assertEquals(byChoice.size, 3, "groups A/B/C")
          const a = byChoice.get("A")!
          assertEquals(a.totalInt, 105, "group A sum 100+5")
          assertEquals(a.n, 2, "group A count")
          assertEquals(byChoice.get("B")!.totalInt, 42, "group B sum")
          assertEquals(byChoice.get("C")!.totalInt, 7, "group C sum")
        },
      },
      {
        name: "aggregate min/max/average aliases",
        fn: async () => {
          const rows = await fetchXml(ctx.tables.TestTable)
            .apply((f) => ({ lo: min(f.int), hi: max(f.int), avg: average(f.int), n: count() }))
            .filter(scoped)
            .execute()
          assertEquals(rows.length, 1, "single aggregate row")
          const r = rows[0]
          assertEquals(r.lo, 0, "min includes lonely parent")
          assertEquals(r.hi, 100, "max")
          assertEquals(r.n, 5, "count all prefixed rows")
          assert(Math.abs(r.avg - 30) < 0.51, `average ~30 (Dataverse truncates int avg), got ${r.avg}`)
        },
      },
      {
        name: "orderby desc + top on aliased select",
        fn: async () => {
          const rows = await fetchXml(ctx.tables.TestTable)
            .select((f) => ({ amount: f.int }))
            .filter(scoped)
            .orderby((f) => f.int, "desc")
            .top(3)
            .execute()
          assertEquals(rows.map((r) => r.amount), [100, 42, 7], "descending ints")
        },
      },
      {
        name: "typed FilterExpr composites narrow rows",
        fn: async () => {
          const rows = await fetchXml(ctx.tables.TestTable)
            .select((f) => ({ id: f.id, int: f.int }))
            .filter(scoped)
            .filter((f) => and(gt(f.int, 6), lt(f.int, 50)))
            .execute()
          const ints = rows.map((r) => r.int)
          assertEquals(ints.sort((a, b) => a - b), [7, 42], `windowed ints (raw ${JSON.stringify(rows.map((r) => r.int))})`)
        },
      },
    ]
  },
}
