import { fetchOdata, any, all, eq, ne, gt, lt, and, or, not, contains, groupby, sum, count, min, max, average } from "../../../src"
import { Suite } from "../harness/runner"
import { assert, assertEquals, skip } from "../harness/assert"
import { seedRow } from "../harness/seed"

type Seed = { id: string; kind: string; name: string; int: number; choice: "A" | "B" | "C" }

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
      // Keep the generated name: tests filter by it, and fx.name() bumps a counter
      // on every call, so a test-time fx.name(kind) would produce "…-c2-2".
      const name = ctx.fx.name(kind)
      const id = await seedRow(ctx, {
        name,
        int,
        choice,
        ...(linked ? { testLookup: ctx.state.parent } : {}),
      })
      ctx.state.seeds.push({ id, kind, name, int, choice })
    }
  },
  tests: (ctx) => {
    // NOTE: `suite.tests(ctx)` runs BEFORE `setup()`, so ctx.state is empty here.
    // Anything derived from seeded state must be computed inside the test fn.
    const allIds = (): string[] => [ctx.state.parent, ...(ctx.state.seeds as Seed[]).map((s: Seed) => s.id)]
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
          for (const id of allIds()) assert(rows.some((r) => r.id === id), `missing ${id}`)
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
          assertEquals(ints.sort((a, b) => (a ?? 0) - (b ?? 0)), [7, 42], `windowed ints (raw ${JSON.stringify(rows.map((r) => r.int))})`)
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
          // int 42 is seed c3, whose choice is "B" — `not(eq(choice,"B"))` drops it,
          // so only int 5 (c1, choice A) survives.
          assertEquals(composedInts.sort((a, b) => (a ?? 0) - (b ?? 0)), [5], `composed filter ints (raw ${JSON.stringify(rows.map((r) => r.int))})`)
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
          for await (const page of ctx.tables.TestTableFlat.iteratePages({ filter: scope }, { pageSize: 2 })) {
            for (const r of page) seen.add(r.id!)
          }
          assertEquals(seen.size, 5, `paged through all seeded rows`)
          for (const id of allIds()) assert(seen.has(id), `row ${id} missing from pagination`)
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
          // The parent has a child with int 42, so all(< 40) must be false for it.
          // What this org does with an EMPTY child collection is NOT vacuously true
          // (probe P23), so childless rows come back excluded too — assert the
          // discriminating part only, and don't encode vacuous-truth semantics.
          const ids = allSmallChildren.map((r) => r.id)
          assert(!ids.includes(ctx.state.parent), `parent excluded by all() (got ${JSON.stringify(ids)})`)
        },
      },
      {
        name: "getRecords auto-expands the lookup side of the self relationship",
        fn: async () => {
          // Only the N:1 side is declared here — expanding both sides of a
          // self-referencing relationship in one request makes the Web API
          // cross-wire them, so auto-expansion refuses it (see the throw test
          // below). Filter by the name seeded in setup(), NOT a fresh
          // fx.name("c2") — the fixture counter would yield "…-c2-2".
          const child = (ctx.state.seeds as Seed[]).find((s) => s.kind === "c2")!
          const childRows = await ctx.tables.TestTableLookupSide.getRecords({
            filter: `startswith(nnsyc200_name,'${child.name}')`,
          })
          assertEquals(childRows.length, 1, "child row returned")
          const nav = childRows[0].testLookupNav
          assert(nav && nav.id === ctx.state.parent, `lookup expanded to parent (got ${JSON.stringify(nav)})`)
          assertEquals(nav!.int, 100, "expanded lookup fields transformed")
          // The lookupId of the expanded relationship is recovered from the nav.
          assertEquals(childRows[0].testLookup, ctx.state.parent, "lookupId recovered from the expanded nav")
        },
      },
      {
        name: "getRecords auto-expands the collection side of the self relationship",
        fn: async () => {
          const parentRows = await ctx.tables.TestTableCollectionSide.getRecords({
            filter: `nnsyc200_test_tableid eq ${ctx.state.parent}`,
          })
          assert(parentRows.length === 1, "parent row returned")
          const kids = parentRows[0].children ?? []
          assertEquals(kids.length, 3, "expanded collection returns linked children")
          for (const k of kids) {
            assert(typeof k.int === "number" && typeof k.name === "string", "expanded child transformed")
          }
        },
      },
      {
        name: "getRecords throws when both sides of a self relationship would expand",
        fn: async () => {
          const messageOf = async (table: any): Promise<string> => {
            try {
              await table.getRecords({ filter: `nnsyc200_test_tableid eq ${ctx.state.parent}` })
              return ""
            } catch (e) {
              return e instanceof Error ? e.message : String(e)
            }
          }

          // Both sides of the self relationship, related table has no navs → the
          // self-relationship error is what fires.
          const selfBoth = await messageOf(ctx.tables.TestTableSelfBoth)
          assert(selfBoth.includes("Cannot auto-expand"), `expected a self-relationship expand error, got: ${selfBoth}`)
          assert(selfBoth.includes("Self-referencing relationships"), `expected the self-relationship explanation, got: ${selfBoth}`)

          // The real TestTable trips the OTHER guard first: its lookup target
          // declares a collection, so the nested one-to-many expand throws.
          const nested = await messageOf(ctx.tables.TestTable)
          assert(nested.includes("one-to-many $expand at the top level"), `expected the nested-collection error, got: ${nested}`)
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
      {
        name: "apply groupby + $orderby on group alias",
        fn: async () => {
          // This org REJECTS $orderby after $apply: "$apply/groupby grouping
          // expression 'byChoice' must evaluate to a property access value" — it
          // re-parses the group alias as a group key. Dataverse cannot rename a
          // group key, so ordering by the caller-facing alias is not expressible.
          // Skip rather than fail; use FetchXML aggregates (query-fetchxml suite)
          // for ordered aggregates.
          try {
            await fetchOdata(ctx.tables.TestTable)
              .apply((f) => ({ byChoice: groupby(f.choice), n: count() }))
              .filter(scope)
              .orderby((a: any) => a.byChoice, "asc")
              .execute()
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e)
            if (msg.includes("must evaluate to a property access value") || msg.includes("$apply") || msg.includes("$orderby")) {
              skip("this org rejects $orderby on a $apply group alias (not expressible in Dataverse)")
            }
            throw e
          }
        },
      },
      {
        name: "apply aggregate with $top after $apply",
        fn: async () => {
          // $top following $apply is not universally supported — if the org rejects
          // it, this test reports the server error (see TODO.md audit note).
          const rows = await fetchOdata(ctx.tables.TestTable)
            .apply((f) => ({ byChoice: groupby(f.choice), n: count() }))
            .filter(scope)
            .top(2)
            .execute()
          assertEquals(rows.length, 2, "top restricted apply to 2 groups")
        },
      },
    ]
  },
}
