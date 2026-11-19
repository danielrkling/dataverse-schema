import {
  buildAttributeDefinition,
  buildEntityDefinition,
  buildRelationshipDefinition,
} from "./metadata";
import { throwIfAborted } from "./abort";
import { resolveTable, type ResolvedTable } from "./resolve";
import type {
  ProvisionMetadataWriter,
  ProvisionOptions,
  ProvisionPlan,
  ProvisionResult,
  ProvisionTable,
  ProvisionWarning,
} from "./types";

export type ApplyProvisionOptions = ProvisionOptions & {
  /** Progress callback (one call per table/column/lookup/publish). */
  onProgress?: (message: string) => void;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function itemKey(kind: string, table: string, column?: string): string {
  return `${kind}:${table}:${column ?? ""}`;
}

/**
 * Execute a plan produced by `buildProvisionPlan`.
 *
 * Order matters:
 *   1. tables (the primary name column is created with the table)
 *   2. columns (string/number/choice/file/image/…)
 *   3. lookups (relationships), after every target table exists
 *   4. one publish for every table that changed
 *
 * Failures are collected and independent work continues, so one bad column
 * does not stop the rest. Re-running is safe: the planner sees the created
 * components and skips them.
 */
export async function applyProvisionPlan(
  writer: ProvisionMetadataWriter,
  tables: ProvisionTable | ProvisionTable[],
  plan: ProvisionPlan,
  options: ApplyProvisionOptions = {},
): Promise<ProvisionResult> {
  throwIfAborted(options.signal);

  if (plan.conflicts > 0) {
    throw new Error(
      "The provisioning plan has conflicts; nothing was applied. Resolve them and plan again.",
    );
  }

  const languageCode = options.languageCode ?? 1033;
  const resolved = new Map<string, ResolvedTable>(
    (Array.isArray(tables) ? tables : [tables]).map((table) => {
      const resolvedTable = resolveTable(table);

      return [resolvedTable.logicalName, resolvedTable];
    }),
  );

  const creates = new Set(
    plan.items
      .filter((planItem) => planItem.action === "create")
      .map((planItem) => itemKey(planItem.kind, planItem.table, planItem.column)),
  );

  const result: ProvisionResult = {
    createdTables: [],
    createdColumns: [],
    createdRelationships: [],
    publishedEntities: [],
    failures: [],
    warnings: [...plan.warnings],
  };

  const failedTables = new Set<string>();
  const entitiesToPublish = new Set<string>();

  function warn(warning: ProvisionWarning): void {
    result.warnings.push(warning);
  }

  // --- 1. tables ---------------------------------------------------------
  for (const [logicalName, table] of resolved) {
    throwIfAborted(options.signal);

    if (!creates.has(itemKey("table", logicalName))) {
      continue;
    }

    options.onProgress?.(`Creating table ${logicalName}…`);

    try {
      const created = await writer.createEntity(
        logicalName,
        buildEntityDefinition(table, languageCode),
      );

      result.createdTables.push(logicalName);
      entitiesToPublish.add(logicalName);

      if (created != null) {
        if (created.entitySetName != null && created.entitySetName !== table.entitySetName) {
          warn({
            item: `table ${logicalName}`,
            message: `Dataverse created the entity set "${created.entitySetName}", but the definition declares "${table.entitySetName}". Update entitySetName or every request will miss the table.`,
          });
        }

        const primaryKeyLogicalName = table.table.primaryKey.property.logicalName;

        if (created.primaryIdAttribute != null && created.primaryIdAttribute !== primaryKeyLogicalName) {
          warn({
            item: `table ${logicalName}`,
            message: `Dataverse created the primary key "${created.primaryIdAttribute}", but the definition declares "${primaryKeyLogicalName}".`,
          });
        }
      }
    } catch (error) {
      failedTables.add(logicalName);
      result.failures.push({ item: `table ${logicalName}`, message: errorMessage(error) });
    }
  }

  // --- 2. columns (everything except lookups) ----------------------------
  for (const [logicalName, table] of resolved) {
    if (failedTables.has(logicalName)) {
      continue;
    }

    for (const column of table.columns) {
      throwIfAborted(options.signal);

      if (column.type === "lookup" || !creates.has(itemKey("column", logicalName, column.logicalName))) {
        continue;
      }

      options.onProgress?.(`Creating column ${logicalName}.${column.logicalName}…`);

      try {
        await writer.createAttribute(logicalName, buildAttributeDefinition(column, languageCode));
        result.createdColumns.push(`${logicalName}.${column.logicalName}`);
        entitiesToPublish.add(logicalName);
      } catch (error) {
        result.failures.push({
          item: `column ${logicalName}.${column.logicalName}`,
          message: errorMessage(error),
        });

        continue;
      }

      /*
       * Dataverse rejects IsPrimaryImage on create, so promote the column we
       * just created. Never touches a pre-existing image column.
       */
      if (column.type === "image" && column.isPrimaryImage) {
        options.onProgress?.(`Setting ${logicalName}.${column.logicalName} as the primary image…`);

        try {
          await writer.updateAttribute(logicalName, column.logicalName, {
            "@odata.type": "Microsoft.Dynamics.CRM.ImageAttributeMetadata",
            IsPrimaryImage: true,
          });
        } catch (error) {
          result.failures.push({
            item: `primary image ${logicalName}.${column.logicalName}`,
            message: errorMessage(error),
          });
        }
      }
    }
  }

  // --- 3. lookups --------------------------------------------------------
  for (const [logicalName, table] of resolved) {
    if (failedTables.has(logicalName)) {
      continue;
    }

    for (const column of table.columns) {
      throwIfAborted(options.signal);

      if (column.type !== "lookup" || !creates.has(itemKey("lookup", logicalName, column.logicalName))) {
        continue;
      }

      options.onProgress?.(
        `Creating lookup ${logicalName}.${column.logicalName} → ${column.targetLogicalName}…`,
      );

      try {
        await writer.createRelationship(buildRelationshipDefinition(table, column, languageCode));
        result.createdRelationships.push(`${logicalName}.${column.logicalName}`);
        entitiesToPublish.add(logicalName);
      } catch (error) {
        result.failures.push({
          item: `lookup ${logicalName}.${column.logicalName}`,
          message: errorMessage(error),
        });
      }
    }
  }

  // --- 4. publish --------------------------------------------------------
  if (options.publish !== false && entitiesToPublish.size > 0) {
    throwIfAborted(options.signal);
    options.onProgress?.(`Publishing ${entitiesToPublish.size} table(s)…`);

    try {
      await writer.publishEntities([...entitiesToPublish]);
      result.publishedEntities.push(...entitiesToPublish);
    } catch (error) {
      result.failures.push({ item: "publish", message: errorMessage(error) });
    }
  }

  return result;
}
