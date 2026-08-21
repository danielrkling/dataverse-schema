import { fetchXml, eq, gt, groupby, sum, count, min, max, average } from "../../../src"
import { Suite } from "../harness/runner"
import { assert, assertEquals } from "../harness/assert"
import { seedParent, seedRow } from "../harness/seed"

export const fetchxmlSuite: Suite = {
  name: "query-fetchxml",
  title: "FetchXML builder end-to-end",
  async setup(ctx) {
    ctx.state.lonelyParent = await seedParent(ctx, { int: 0 })
    ctx.state.parent = await seedParent(ctx, { int: 100, choice: "A" })
    const seeds: Array<[string, number, "A" | "B" | "C"]> = [
      ["c1", 5, "A"],
      ["c2", 7, "C"],
      ["c3", 42, "B"],
    ]
    ctx.state.seeds = [] as Array<{ id: string; kind: string; int: number; choice: string }>
    for (const [kind, int, choice] of seeds) {
      const id = await seedRow(ctx, {
        name: ctx.fx.name(kind),
        int,
        choice,
        testLookup: ctx.state.parent,
      } as any)
      ctx.state.seeds.push({ id, kind, int, choice })
    }
  },
  tests: (ctx) => {
    const scope = `startswith(nnsyc200_name,'${ctx.fx.runPrefix}')`
    return [
      {
        name: "select with aliases + execute applies transforms",
        fn: async () => {
          const rows = await fetchXml(ctx.tables.TestTable)
            .select((f) => ({ label: f.name, amount: f.int }))
            .filter(scope)
            .top(10)
            .execute()
          assertEquals(rows.length, 4, "seeded rows (3 children + parent)")
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
            .filter(scope)
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
            .filter(`nnsyc200_test_tableid eq ${ctx.state.seeds[0].id}`)
            .execute()
          assertEquals(rows.length, 1, "one joined row")
          assertEquals(rows[0].parentLabel, `${ctx.fx.runPrefix}-parent-2`, "parent alias resolved")
        },
      },
      {
        name: "outer join keeps parents without children; inner drops them",
        fn: async () => {
          const base = (linkType: "inner" | "outer") =>
            fetchXml(ctx.tables.TestTable0)
              .select((f) => ({ parentName: f.name }))
              .join(linkType, ctx.tables.TestTable, "testLookup", "id", (sub) => sub.select((f) => ({ kid: f.name })))
              .filter(scope)
              .execute()
          const outer = await base("outer")
          assertEquals(outer.length, 2, "both parents via outer join")
          const inner = await base("inner")
          assertEquals(inner.length, 1, "only the populated parent via inner join")
          assertEquals(inner[0].parentName, `${ctx.fx.runPrefix}-parent-2`, "inner join hit the right parent")
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
            .filter(scope)
            .execute()
          assertEquals(rows.length, 1, "only parent with a big-int child")
        },
      },
      {
        name: "aggregate groupby(choice) + sum + count via execute()",
        fn: async () => {
          const rows = await fetchXml(ctx.tables.TestTable)
            .apply((f) => ({ byChoice: groupby(f.choice), totalInt: sum(f.int), n: count(f.id) }))
            .filter(scope)
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
            .filter(scope)
            .execute()
          assertEquals(rows.length, 1, "single aggregate row")
          const r = rows[0]
          assertEquals(r.lo, 5, "min")
          assertEquals(r.hi, 100, "max")
          assertEquals(r.n, 4, "count all")
          assert(Math.abs(r.avg - 38.5) < 0.01, `average 38.5, got ${r.avg}`)
        },
      },
      {
        name: "orderby desc + top on aliased select",
        fn: async () => {
          const rows = await fetchXml(ctx.tables.TestTable)
            .select((f) => ({ amount: f.int }))
            .filter(scope)
            .orderby((f) => f.int, "desc")
            .top(3)
            .execute()
          assertEquals(rows.map((r) => r.amount), [100, 42, 7], "descending ints")
        },
      },
      {
        name: "typed FilterExpr inside FetchXML renders numeric choice conditions",
        fn: async () => {
          const rows = await fetchXml(ctx.tables.TestTable)
            .select((f) => ({ id: f.id }))
            .filter((f) => eq(f.choice, "B"))
            .execute()
          assertEquals(rows.length, 1, "choice B row found via numeric condition")
          assertEquals(rows[0].id, ctx.state.seeds[2].id, "c3 is the B row")
        },
      },
    ]
  },
}
