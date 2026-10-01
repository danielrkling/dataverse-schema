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
    const child = ctx.state.child as string
    const parent = ctx.state.parent as string

    const probe = async (name: string, query: string, keysPredicate?: (row: any) => void): Promise<never> => {
      let payload: Rows | { error: string }
      try {
        payload = await ctx.client.getRecords(entity as never, { query })
      } catch (e) {
        payload = { error: e instanceof Error ? e.message : String(e) }
      }
      let derived = ""
      try {
        keysPredicate?.(payload)
      } catch (e) {
        derived = `\nkeys-check failed: ${e instanceof Error ? e.message : String(e)}`
      }
      // Include the transformed view of the payload as our table would see it
      const diagnostics = (
        ctx.tables.TestTable as any
      ).transformValueFromDataverse
      let transformed = ""
      try {
        if (Array.isArray(payload)) transformed = `\ntransformed: ${JSON.stringify(await Promise.all(payload.map((v) => diagnostics.call(ctx.tables.TestTable, v))))}`
      } catch (e) {
        transformed = `\ntransform THREW: ${e instanceof Error ? e.message : String(e)}`
      }
      skip(`PROBE ${name}\nquery: ${query}\npayload: ${JSON.stringify(payload, null, 2)}${derived}${transformed}`)
    }

    return [
      {
        name: "P1: $select includes _lookup_value (no expand)",
        fn: () => probe("P1",
          `$select=nnsyc200_name,nnsyc200_int,${navValue}&$filter=${pk} eq ${child}`),
      },
      {
        name: "P2: expand lookup WITHOUT _value in $select — is _value returned anyway?",
        fn: () => probe("P2",
          `$select=nnsyc200_name,nnsyc200_int&$expand=${nav}($select=nnsyc200_name,nnsyc200_int,${pk})&$filter=${pk} eq ${child}`),
      },
      {
        name: "P3: expand lookup WITH _value in $select (same-key suspect)",
        fn: () => probe("P3",
          `$select=nnsyc200_name,${navValue}&$expand=${nav}($select=nnsyc200_name,nnsyc200_int,${pk})&$filter=${pk} eq ${child}`),
      },
      {
        name: "P4: lookup expand with EMPTY options (nav())",
        fn: () => probe("P4",
          `$select=nnsyc200_name&$expand=${nav}()&$filter=${pk} eq ${child}`),
      },
      {
        name: "P5: collection expand with $select + $orderby + $top at top level",
        fn: () => probe("P5",
          `$select=nnsyc200_name&$expand=${collection}($select=nnsyc200_name,nnsyc200_int,${pk})&$orderby=nnsyc200_name asc&$top=5`),
      },
      {
        name: "P6: collection expand with $select + $filter at top level (no orderby/top)",
        fn: () => probe("P6",
          `$select=nnsyc200_name&$expand=${collection}($select=nnsyc200_name,nnsyc200_int,${pk})&$filter=${pk} eq ${parent}`),
      },
      {
        name: "P7: bare collection expand (no options)",
        fn: () => probe("P7",
          `$select=nnsyc200_name&$expand=${collection}&$filter=${pk} eq ${parent}`),
      },
      {
        name: "P8: lookup expand nested inside lookup expand (both with $select)",
        fn: () => probe("P8",
          `$select=nnsyc200_name&$expand=${nav}($select=nnsyc200_name,${pk}; $expand=${nav}($select=nnsyc200_name,${pk}))&$filter=${pk} eq ${child}`),
      },
      {
        name: "P9: 1:N expand nested inside 1:N expand",
        fn: () => probe("P9",
          `$select=nnsyc200_name&$expand=${collection}($select=nnsyc200_name; $expand=${collection}($select=nnsyc200_name))&$filter=${pk} eq ${parent}`),
      },
      {
        name: "P10: lookup + collection to same related entity at top level",
        fn: () => probe("P10",
          `$select=nnsyc200_name,${navValue}&$expand=${nav}($select=nnsyc200_name,${pk}),${collection}($select=nnsyc200_name,${pk})&$filter=${pk} eq ${child}`),
      },
      {
        name: "P11: table.getRecords auto-expanded query (exact failing shape)",
        fn: async () => {
          const ast = buildTableQueryAst(ctx.tables.TestTable as any, undefined, true)
          const query = serializeODataSelect(ast)
          // Note: orderby conversion mirrors what the transform test uses.
          const payload = (await ctx.client.getRecords(entity as never, { query })) as Rows
          const keysOfFirst = payload[0] ? Object.keys(payload[0]) : []
          skip(`PROBE P11\nquery: ${query}\nfirst-row keys: ${JSON.stringify(keysOfFirst)}\nfirst-row lookup keys: ${JSON.stringify(keysOfFirst.filter(k => k.includes("lookup")))}`)
        },
      },
      {
        name: "P12: detached child (lookup) — raw keys + transformed view",
        fn: () => probe("P12",
          `$select=nnsyc200_name,nnsyc200_int,${navValue}&$filter=${pk} eq ${ctx.state.detached}`),
      },
    ]
  },
}
