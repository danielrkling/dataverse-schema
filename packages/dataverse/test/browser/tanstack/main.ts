import { DataverseClient } from "../../../src"
import { loadConfig } from "../harness/config"
import { buildTables } from "../harness/tables"
import { FixtureTracker, sweepOrphans } from "../harness/fixtures"
import { Runner } from "../harness/runner"
import { Reporter } from "../harness/reporter"
import { suites } from "./suites"
import { sweepTestDbs, closeAllEngines } from "./db-helper"

async function boot(): Promise<void> {
  const cfg = loadConfig()
  const client = new DataverseClient()
  const tables = buildTables(client, cfg)
  const fx = new FixtureTracker()
  const runner = new Runner({ client, tables, cfg, fx })
  const reporter = new Reporter(runner, suites, {
    orgUrl: client.options.url ?? "unknown",
    dataStem: fx.sessionPrefix,
    sweep: () => sweepOrphans(tables.TestTable),
    // Purge the durable dvt-db-* mutation-queue databases from this and
    // earlier runs (queued mutations, errored store, collection caches).
    // Close any engines whose suites may have leaked before deleting so the
    // deletions are never held open.
    sweepDbs: async () => {
      closeAllEngines()
      return await sweepTestDbs()
    },
  })
  reporter.mount(document.body)

  const params = new URLSearchParams(location.search)
  if (params.get("autorun") === "1") void reporter.runSelected()

  window.addEventListener("unload", () => {
    // No global SyncEngine is owned here (each suite creates its own),
    // but call sweep on leave so interrupted runs don't leave dvt* rows
    // or dvt-db-* IndexedDB databases behind.
    void sweepOrphans(tables.TestTable)
    void sweepTestDbs()
  })
}

if (document.body) {
  void boot()
} else {
  window.addEventListener("DOMContentLoaded", () => void boot(), { once: true })
}
