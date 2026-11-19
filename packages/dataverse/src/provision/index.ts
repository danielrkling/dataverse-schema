import { DataverseClient } from "../client";
import { applyProvisionPlan, type ApplyProvisionOptions } from "./apply";
import { DataverseProvisionClient } from "./client";
import { buildProvisionPlan } from "./plan";
import type {
  ProvisionMetadataReader,
  ProvisionOptions,
  ProvisionPlan,
  ProvisionRun,
  ProvisionTable,
} from "./types";

export * from "./types";
export * from "./abort";
export * from "./resolve";
export * from "./metadata";
export * from "./plan";
export * from "./apply";
export * from "./client";

/** Build a metadata client over an existing {@link DataverseClient}. */
export function createProvisionClient(
  client: DataverseClient,
  options: ProvisionOptions = {},
): DataverseProvisionClient {
  return new DataverseProvisionClient(client, options);
}

/**
 * Read the org's metadata and diff it against the declared tables.
 * Never writes; a conflict blocks `applyProvisionPlan`.
 */
export async function planProvision(
  target: DataverseClient | ProvisionMetadataReader,
  tables: ProvisionTable | ProvisionTable[],
  options: ProvisionOptions = {},
): Promise<ProvisionPlan> {
  const reader =
    target instanceof DataverseClient ? new DataverseProvisionClient(target, options) : target;

  return buildProvisionPlan(tables, reader, options);
}

/**
 * Plan, then create every missing table/column/lookup and publish the changed
 * tables once. Existing components are never updated or deleted.
 *
 * Nothing is applied when the plan reports conflicts — inspect the returned
 * plan to see which declarations clash with the org.
 */
export async function provision(
  client: DataverseClient,
  tables: ProvisionTable | ProvisionTable[],
  options: ApplyProvisionOptions = {},
): Promise<ProvisionRun> {
  const metadata = new DataverseProvisionClient(client, options);
  const plan = await buildProvisionPlan(tables, metadata, options);

  if (plan.conflicts > 0) {
    return { plan };
  }

  return { plan, result: await applyProvisionPlan(metadata, tables, plan, options) };
}

/**
 * Publish the given tables. Useful when a previous run created metadata but
 * its single publish step failed; creating the same definitions again would
 * correctly find nothing to do.
 */
export async function publishTables(
  client: DataverseClient,
  tables: string | string[],
  options: ProvisionOptions = {},
): Promise<string[]> {
  const logicalNames = [
    ...new Set(
      (typeof tables === "string" ? [tables] : tables)
        .map((name) => name.trim())
        .filter((name) => name.length > 0),
    ),
  ];

  await new DataverseProvisionClient(client, options).publishEntities(logicalNames);

  return logicalNames;
}

function actionSymbol(action: ProvisionPlan["items"][number]["action"]): string {
  switch (action) {
    case "create":
      return "+";
    case "skip":
      return "=";
    case "conflict":
      return "!";
  }
}

/** Render a plan as a markdown document with a diff-like block (CLI-friendly). */
export function formatProvisionPlan(plan: ProvisionPlan): string {
  const lines: string[] = [];

  lines.push("# Dataverse provisioning plan");
  lines.push("");
  lines.push(
    `**Summary:** ${plan.tableCreates} table(s), ${plan.columnCreates} column(s), ${plan.lookupCreates} lookup(s) to create · ${plan.skips} already present · ${plan.conflicts} conflict(s)`,
  );
  lines.push("");
  lines.push(
    "> Additive only: existing tables and columns are never updated or deleted. To change one, delete it in Dataverse and run the plan again.",
  );
  lines.push("");

  if (plan.items.length === 0) {
    lines.push("_No tables declared._");

    return lines.join("\n");
  }

  lines.push("```diff");

  for (const item of plan.items) {
    const indent = item.kind === "table" ? "" : "  ";
    const name = item.kind === "table" ? item.table : (item.column ?? "");

    lines.push(
      `${actionSymbol(item.action)} ${indent}${item.kind} ${name} — ${item.label} (${item.action} — ${item.reason})`,
    );
  }

  lines.push("```");
  lines.push("");

  for (const warning of plan.warnings) {
    lines.push(`- **Skipped** ${warning.item}: ${warning.message}`);
  }

  if (plan.warnings.length > 0) {
    lines.push("");
  }

  if (plan.conflicts > 0) {
    lines.push(
      "**Conflicts block provisioning.** Delete the conflicting component in Dataverse, or change the definition, then plan again.",
    );
  } else if (plan.tableCreates + plan.columnCreates + plan.lookupCreates === 0) {
    lines.push("**Nothing to create.** The organisation already matches the declared tables.");
  }

  return lines.join("\n");
}
