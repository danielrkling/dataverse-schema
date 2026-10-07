import type { SuiteCtx } from "../harness/runner"
import { buildTableQueryAst, serializeODataSelect } from "../../../src"
import { Suite } from "../harness/runner"
import { skip } from "../harness/assert"
import { seedParent, seedRow } from "../harness/seed"

type Rows = Record<string, any>[]

/**
 * Diagnostics suite: each test performs exactly ONE raw GET against the live org,
 * then ends as "skipped" with the observed payload (or the server error) embedded
 * in its skip detail — so the run output shows exact live behavior without
 * polluting pass/fail counts.
 *
 * NOTE: read `ctx.state` INSIDE each test fn — `suite.tests(ctx)` runs before
 * `setup()`, so values captured at test-list build time are undefined.
 */
export const diagnosticsSuite: Suite = {
  name: "diagnostics",
  title: "Live-org probes (skipped, logs raw payloads)",
  async setup(ctx) {
    ctx.state.parent = await seedParent(ctx, { name: ctx.fx.name("probe-parent"), int: 100, text: "probe-parent" })
    ctx.state.child = await seedRow(ctx, {
      name: ctx.fx.name("probe-child"),
      int: 5,
      text: "probe-child",
      testLookup: ctx.state.parent,
    })
    ctx.state.detached = await seedRow(ctx, { name: ctx.fx.name("probe-detached"), int: 1 })
  },
  tests: (ctx) => {
    const entity = ctx.cfg.entitySetName
    const pk = `${ctx.cfg.logicalName}id`
    const nav = "nnsyc200_Test_Lookup"
    const navValue = "_nnsyc200_test_lookup_value"
    const collection = ctx.cfg.collectionNav

    // Probes select a handful of columns, so transforming with the full table
    // would trip the non-nullable system fields (modifiedon etc. are absent from
    // the payload). Narrow the table to the columns the org actually returned so
    // the transformed view in the probe output is meaningful.
    const narrowToPayload = (rows: Rows) => {
      const fields = ctx.tables.TestTable.fields as Record<string, any>
      const dvNameToKey = new Map<string, string>()
      for (const [key, prop] of Object.entries(fields)) {
        dvNameToKey.set(prop.fromDataverseName ?? prop.logicalName, key)
      }
      const keys = new Set<string>()
      for (const row of rows) {
        for (const dvName of Object.keys(row ?? {})) {
          const key = dvNameToKey.get(dvName)
          if (key) keys.add(key)
        }
      }
      return (ctx.tables.TestTable as any).pickProperties(...keys) as typeof ctx.tables.TestTable
    }

    const probe = async (name: string, query: string): Promise<never> => {
      let payload: Rows | { error: string }
      try {
        payload = await ctx.client.getRecords(entity as never, { query })
      } catch (e) {
        payload = { error: e instanceof Error ? e.message : String(e) }
      }
      let transformed = ""
      try {
        if (Array.isArray(payload)) {
          const table = narrowToPayload(payload)
          const rows = await Promise.all(payload.map((v) => table.transformValueFromDataverse(v)))
          transformed = `\ntransformed: ${JSON.stringify(rows, null, 2)}`
        } else {
          transformed = `\ntransformed: (error payload, skipped)`
        }
      } catch (e) {
        transformed = `\ntransform THREW: ${e instanceof Error ? e.message : String(e)}`
      }
      skip(`PROBE ${name}\nquery: ${query}\npayload: ${JSON.stringify(payload, null, 2)}${transformed}`)
    }

    return [
      {
        name: "P1: $select includes _lookup_value (no expand)",
        fn: () => probe("P1",
          `$select=nnsyc200_name,nnsyc200_int,${navValue}&$filter=${pk} eq ${ctx.state.child}`),
      },
      {
        name: "P2: expand lookup WITHOUT _value in $select — is _value returned anyway?",
        fn: () => probe("P2",
          `$select=nnsyc200_name,nnsyc200_int&$expand=${nav}($select=nnsyc200_name,nnsyc200_int,${pk})&$filter=${pk} eq ${ctx.state.child}`),
      },
      {
        name: "P3: expand lookup WITH _value in $select (same-key suspect)",
        fn: () => probe("P3",
          `$select=nnsyc200_name,${navValue}&$expand=${nav}($select=nnsyc200_name,nnsyc200_int,${pk})&$filter=${pk} eq ${ctx.state.child}`),
      },
      {
        name: "P4: bare lookup expand (no options, no parens)",
        fn: () => probe("P4",
          `$select=nnsyc200_name&$expand=${nav}&$filter=${pk} eq ${ctx.state.child}`),
      },
      {
        name: "P5: collection expand with $select + $orderby + $top at top level",
        fn: () => probe("P5",
          `$select=nnsyc200_name&$expand=${collection}($select=nnsyc200_name,nnsyc200_int,${pk})&$orderby=nnsyc200_name asc&$top=5`),
      },
      {
        name: "P6: collection expand with $select + $filter at top level (no orderby/top)",
        fn: () => probe("P6",
          `$select=nnsyc200_name&$expand=${collection}($select=nnsyc200_name,nnsyc200_int,${pk})&$filter=${pk} eq ${ctx.state.parent}`),
      },
      {
        name: "P7: bare collection expand (no options)",
        fn: () => probe("P7",
          `$select=nnsyc200_name&$expand=${collection}&$filter=${pk} eq ${ctx.state.parent}`),
      },
      {
        name: "P8: lookup expand nested inside lookup expand (both with $select)",
        fn: () => probe("P8",
          `$select=nnsyc200_name&$expand=${nav}($select=nnsyc200_name,${pk}; $expand=${nav}($select=nnsyc200_name,${pk}))&$filter=${pk} eq ${ctx.state.child}`),
      },
      {
        name: "P9: 1:N expand nested inside 1:N expand",
        fn: () => probe("P9",
          `$select=nnsyc200_name&$expand=${collection}($select=nnsyc200_name; $expand=${collection}($select=nnsyc200_name))&$filter=${pk} eq ${ctx.state.parent}`),
      },
      {
        name: "P10: lookup + collection to same related entity at top level",
        fn: () => probe("P10",
          `$select=nnsyc200_name,${navValue}&$expand=${nav}($select=nnsyc200_name,${pk}),${collection}($select=nnsyc200_name,${pk})&$filter=${pk} eq ${ctx.state.child}`),
      },
      {
        name: "P11: table.getRecords auto-expanded query, lookup side (no options)",
        fn: async () => {
          const query = serializeODataSelect(buildTableQueryAst(ctx.tables.TestTableLookupSide as any, undefined, true))
          const payload = (await ctx.client.getRecords(entity as never, { query })) as Rows
          const keysOfFirst = payload[0] ? Object.keys(payload[0]) : []
          skip(`PROBE P11\nquery: ${query}\nfirst-row keys: ${JSON.stringify(keysOfFirst)}\nlookup-related keys: ${JSON.stringify(keysOfFirst.filter(k => k.toLowerCase().includes("lookup")))}`)
        },
      },
      {
        name: "P13: table.getRecords auto-expanded query + $filter + $orderby + $top",
        fn: async () => {
          const query = serializeODataSelect(buildTableQueryAst(ctx.tables.TestTableLookupSide as any, undefined, true))
            + `&$filter=nnsyc200_int gt 0 and startswith(nnsyc200_name,'${ctx.fx.scopePrefix}')`
            + `&$orderby=nnsyc200_name asc&$top=10`
          let payload: Rows | { error: string }
          try {
            payload = await ctx.client.getRecords(entity as never, { query })
          } catch (e) {
            payload = { error: e instanceof Error ? e.message : String(e) }
          }
          const childRow = Array.isArray(payload) ? payload.find((r) => r[pk] === ctx.state.child) : null
          skip(`PROBE P13\nquery: ${query}\nchild-row found: ${!!childRow}\nraw child-row: ${JSON.stringify(childRow, null, 2)}`)
        },
      },
      {
        name: "P17: auto-expanded query (TestTableLookupSide) + $filter",
        fn: async () => {
          const query = serializeODataSelect(buildTableQueryAst(ctx.tables.TestTableLookupSide as any, undefined, true))
            + `&$filter=${pk} eq ${ctx.state.child}`
          let payload: Rows | { error: string }
          try {
            payload = await ctx.client.getRecords(entity as never, { query })
          } catch (e) {
            payload = { error: e instanceof Error ? e.message : String(e) }
          }
          skip(`PROBE P17\nquery: ${query}\npayload: ${JSON.stringify(payload, null, 2)}`)
        },
      },
      {
        name: "P18: auto-expanded query (TestTableCollectionSide)",
        fn: async () => {
          const finalQuery = `${serializeODataSelect(buildTableQueryAst(ctx.tables.TestTableCollectionSide as any, undefined, true))}&$filter=${pk} eq ${ctx.state.parent}`
          let payload: Rows | { error: string }
          try {
            payload = await ctx.client.getRecords(entity as never, { query: finalQuery })
          } catch (e) {
            payload = { error: e instanceof Error ? e.message : String(e) }
          }
          skip(`PROBE P18\nquery: ${finalQuery}\npayload: ${JSON.stringify(payload, null, 2)}`)
        },
      },
      {
        name: "P19: bare lookup expand by ID (getRecord shape) + $filter via id",
        fn: () => probe("P19",
          `$select=nnsyc200_name,${navValue}&$expand=${nav}&$filter=${pk} eq ${ctx.state.child}`),
      },
      {
        name: "P20: no $select, no expand — all columns returned (modifiedon/statecode baseline)",
        fn: () => probe("P20",
          `$filter=${pk} eq ${ctx.state.child}`),
      },
      {
        name: "P14: auto-expanded query + $filter only",
        fn: async () => {
          const query = serializeODataSelect(buildTableQueryAst(ctx.tables.TestTableLookupSide as any, undefined, true))
            + `&$filter=${pk} eq ${ctx.state.child}`
          let payload: Rows | { error: string }
          try {
            payload = await ctx.client.getRecords(entity as never, { query })
          } catch (e) {
            payload = { error: e instanceof Error ? e.message : String(e) }
          }
          skip(`PROBE P14\nquery: ${query}\npayload: ${JSON.stringify(payload, null, 2)}`)
        },
      },
      {
        name: "P15: auto-expanded query + $top only",
        fn: async () => {
          const query = serializeODataSelect(buildTableQueryAst(ctx.tables.TestTableLookupSide as any, undefined, true)) + `&$top=10`
          let payload: Rows | { error: string }
          try {
            payload = await ctx.client.getRecords(entity as never, { query })
          } catch (e) {
            payload = { error: e instanceof Error ? e.message : String(e) }
          }
          skip(`PROBE P15\nquery: ${query}\npayload: ${JSON.stringify(payload, null, 2)}`)
        },
      },
      {
        name: "P16: auto-expanded query + $orderby only",
        fn: async () => {
          const query = serializeODataSelect(buildTableQueryAst(ctx.tables.TestTableLookupSide as any, undefined, true)) + `&$orderby=nnsyc200_name asc`
          let payload: Rows | { error: string }
          try {
            payload = await ctx.client.getRecords(entity as never, { query })
          } catch (e) {
            payload = { error: e instanceof Error ? e.message : String(e) }
          }
          skip(`PROBE P16\nquery: ${query}\npayload: ${JSON.stringify(payload, null, 2)}`)
        },
      },
      {
        name: "P12: detached child (no lookup) — raw keys + transformed view",
        fn: () => probe("P12",
          `$select=nnsyc200_name,nnsyc200_int,${navValue}&$filter=${pk} eq ${ctx.state.detached}`),
      },
      {
        // ANSWERED 2026-10-02: this org's `all()` is NOT vacuously true — the
        // childless rows (probe-child, probe-detached) are EXCLUDED while the
        // parent, whose single child (int 5) satisfies `< 40`, is returned.
        // So `all()` needs `any()`-style guards for "no related rows" cases.
        // Keep the probe as the record of that org behaviour.
        name: "P23: all() over an EMPTY collection — vacuously true?",
        fn: () => probe("P23",
          `$select=${pk}&$filter=startswith(nnsyc200_name,'${ctx.fx.scopePrefix}') and ${collection}/all(x: x/nnsyc200_int lt 40)&$top=20`),
      },
    ]
  },
}
