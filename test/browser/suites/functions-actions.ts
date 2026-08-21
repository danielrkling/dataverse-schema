import { WhoAmI, RetrieveTotalRecordCount, RetrieveChoices } from "../../../src"
import { Suite } from "../harness/runner"
import { assert } from "../harness/assert"

const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const functionsSuite: Suite = {
  name: "functions-actions",
  title: "Functions & actions",
  tests: (ctx) => [
    {
      name: "WhoAmI returns the three org ids",
      fn: async () => {
        const r = await WhoAmI(ctx.client)
        for (const key of ["BusinessUnitId", "UserId", "OrganizationId"] as const) {
          assert(GUID_RE.test(r[key]), `${key} is a GUID`)
        }
      },
    },
    {
      name: "RetrieveTotalRecordCount returns a number",
      fn: async () => {
        const n = await RetrieveTotalRecordCount(ctx.client, ctx.cfg.logicalName)
        assert(typeof n === "number" && n >= 0, `count was ${JSON.stringify(n)}`)
      },
    },
    {
      name: "unbound function RetrieveVersion via client.fetch",
      fn: async () => {
        const v = await ctx.client.fetch("RetrieveVersion()")
        assert(v && typeof v.Version === "string", `version missing: ${JSON.stringify(v)}`)
        assert(v.Version.split(".").length >= 2, `unexpected version format: ${v.Version}`)
      },
    },
    {
      name: "RetrieveChoices maps a global option set (config.globalOptionSet)",
      fn: async () => {
        if (!ctx.cfg.globalOptionSet) throw new Error("skip: set globalOptionSet in config to a global choice schema name")
        const choices = await RetrieveChoices(ctx.client, ctx.cfg.globalOptionSet)
        assert(Array.isArray(choices) && choices.length > 0, "choices returned")
        for (const c of choices.slice(0, 3)) {
          assert(typeof c.value === "number" && typeof c.label === "string", `bad choice mapping: ${JSON.stringify(c)}`)
        }
      },
    },
  ],
}
