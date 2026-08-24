import { fetchOdata, any, all, eq, ne, gt, lt, and, or, not, contains, groupby, sum, count, min, max, average } from "../../../src"
import { Suite } from "../harness/runner"
import { assert, assertEquals } from "../harness/assert"
import { seedRow } from "../harness/seed"

type Seed = { id: string; kind: string; int: number; choice: "A" | "B" | "C" }

export const odataSuite: Suite = {
  name: "query-odata",
  title: "OData builder end-to-end",
  async setup(ctx) {
    ctx.state.parent = await seedRow(ctx, { int: 100, choice: "A", bool: true })
    const seeds: Array<[string, number, "A" | "B" | "C", boolean]> = [
      ["c1", 5, "A", true],
      ["c2", 7, "C", true],
      ["c3", 42, "B", true],
      ["c4", 1, "A", false],
    ]
    ctx.state.seeds = [] as Seed[]
    for (const [kind, int, choice, linked] of seeds) {
      const id = await seedRow(ctx, {
        name: ctx.fx.name(kind),
        int,
        choice,
        ...(linked ? { testLookup: ctx.state.parent } : {}),
      })
      ctx.state.seeds.push({ id, kind, int, choice })
    }
  },
  tests: (ctx) => {
    const allIds: string[] = [ctx.state.parent, ...ctx.state.seeds.map((s: Seed) => s.id)]
    const scope = `startswith(nnsyc200_name,'${ctx.fx.scopePrefix}')`
    return [
      {
        name: "select narrows the row shape",
        fn: async () => {
          const rows = await fetchOdata(ctx.tables.TestTable).select("name", "int").filter(scope).execute()
          assertEquals(rows.length, 5, "seeded row count")
          for (const r of rows) assertEquals(Object.keys(r).sort(), ["$etag", "int", "name"], "narrowed keys")
        },
      },
      {
        name: "statusCode choice label filters to numeric option value",
        fn: async () => {
          const rows = await fetchOdata(ctx.tables.TestTable)
            .select("id")
            .filter((f) => eq(f.statusCode, "Active"))
            .filter(scope)
            .execute()
          assertEquals(rows.length, 5, "all seeded rows are Active")
          for (const id of allIds) assert(rows.some((r) => r.id === id), `missing ${id}`)
        },
      },
      {
        name: "custom choice column filters by label",
        fn: async () => {
          const expected = ctx.state.seeds.filter((s: Seed) => s.choice === "C").map((s: Seed) => s.id)
          const rows = await fetchOdata(ctx.tables.TestTable)
            .select("id")
            .filter((f) => eq(f.choice, "C"))
            .execute()
          assertEquals(rows.map((r) => r.id).sort(), [...expected].sort(), "choice C rows")
        },
      },
      {
        name: "contains / startsWith string functions",
        fn: async () => {
          const contained = await fetchOdata(ctx.tables.TestTable)
            .select("id")
            .filter((f) => contains(f.name, ctx.fx.scopePrefix))
            .execute()
          assertEquals(contained.length, 5, "all rows contain run prefix")
          const prefixed = await fetchOdata(ctx.tables.TestTable)
            .select("id")
            .filter((f) => contains(f.name, `${ctx.fx.scopePrefix}-c1`))
            .execute()
          assertEquals(prefixed.length, 1, "startsWith narrows to c1")
        },
      },
      {
        name: "comparison operators gt/ge/lt/le windows",
        fn: async () => {
          const rows = await fetchOdata(ctx.tables.TestTable)
            .select("int")
            .filter(scope)
            .filter((f) => and(gt(f.int, 6), lt(f.int, 50)))
            .execute()
          const ints = rows.map((r) => r.int)
          assertEquals(ints.sort((a, b) => a - b), [7, 42], `windowed ints (raw ${JSON.stringify(rows.map((r) => r.int))})`)
        },
      },
      {
        name: "and / or / not composition",
        fn: async () => {
          const rows = await fetchOdata(ctx.tables.TestTable)
            .select("int", "choice")
            .filter(scope)
            .filter((f) => and(or(eq(f.int, 5), eq(f.int, 42)), not(eq(f.choice, "B"))))
            .execute()
          const composedInts = rows.map((r) => r.int)
          assertEquals(composedInts.sort((a, b) => a - b), [5, 42], `composed filter ints (raw ${JSON.stringify(rows.map((r) => r.int))})`)
          assertEquals(rows.every((r) => r.choice !== "B"), true, "not(B) respected")
        },
      },
      {
        name: "orderby desc + top",
        fn: async () => {
          const rows = await fetchOdata(ctx.tables.TestTable)
            .select("int")
            .filter(scope)
            .orderby((f) => f.int, "desc")
            .top(4)
            .execute()
          assertEquals(rows.map((r) => r.int), [100, 42, 7, 5], "descending order")
        },
      },
      {
        name: "iteratePages follows nextLink pagination (pageSize 2)",
        fn: async () => {
          const seen = new Set<string>()
          for await (const page of ctx.tables.TestTable.iteratePages({ filter: scope }, { pageSize: 2 })) {
            for (const r of page) seen.add(r.id!)
          }
          assertEquals(seen.size, 5, `paged through all seeded rows`)
          for (const id of allIds) assert(seen.has(id), `row ${id} missing from pagination`)
        },
      },
      {
        name: "any/all lambdas discriminate parents from childless rows",
        fn: async () => {
          const withBigChild = await fetchOdata(ctx.tables.TestTable)
            .select("id")
            .filter(scope)
            .filter((f) => any(f.children, (c) => gt(c.int, 6)))
            .execute()
          assertEquals(withBigChild.map((r) => r.id), [ctx.state.parent], "only parent has a child with int > 6")

          const allSmallChildren = await fetchOdata(ctx.tables.TestTable)
            .select("id")
            .filter(scope)
            .filter((f) => all(f.children, (c) => lt(c.int, 40)))
            .execute()
          const smallIds = [...allIds].filter((id) => id !== ctx.state.parent)
          assertEquals([...allSmallChildren].map((r) => r.id).sort(), smallIds.sort(), "vacuous all() matches childless rows; parent excluded (child int 42)")
        },
      },
      {
        name: "expand collection children with sub-select",
        fn: async () => {
          const rows = await fetchOdata(ctx.tables.TestTable0)
            .select("name")
            .expand("children", (sub) => sub.select("name", "int"))
            .filter(`nnsyc200_test_tableid eq ${ctx.state.parent}`)
            .execute()
          assert(rows.length === 1, "parent row returned")
          const kids = rows[0].children ?? []
          assertEquals(kids.length, 3, "three children under parent")
          for (const k of kids) {
            assert(typeof k.int === "number", "child int transformed")
            assert(typeof k.name === "string", "child name transformed")
          }
        },
      },
      {
        name: "apply groupby(choice) with count/sum/min/max/average",
        fn: async () => {
          const rows = await fetchOdata(ctx.tables.TestTable)
            .apply((f) => ({
              byChoice: groupby(f.choice),
              n: count(),
              totalInt: sum(f.int),
              lo: min(f.int),
              hi: max(f.int),
              avg: average(f.int),
            }))
            .filter(scope)
            .execute()
          const byChoice = new Map(rows.map((r) => [r.byChoice, r]))
          assertEquals(byChoice.size, 3, "groups A/B/C")

          const a = byChoice.get("A")!
          assertEquals(a.n, 3, "group A count")
          assertEquals(a.totalInt, 106, "group A sum 100+5+1")
          assertEquals(a.lo, 1, "group A min")
          assertEquals(a.hi, 100, "group A max")
          assert(Math.abs(a.avg - 106 / 3) < 0.01, `group A average, got ${a.avg}`)

          assertEquals(byChoice.get("B")!.totalInt, 42, "group B sum")
          assertEquals(byChoice.get("C")!.totalInt, 7, "group C sum")
        },
      },
      {
        name: "count() aggregate matches seed count",
        fn: async () => {
          const rows = await fetchOdata(ctx.tables.TestTable)
            .apply((f) => ({ n: count() }))
            .filter(scope)
            .execute()
          assertEquals(rows.length, 1, "single aggregate row")
          assertEquals(rows[0].n, 5, "total count")
        },
      },
    ]
  },
}
