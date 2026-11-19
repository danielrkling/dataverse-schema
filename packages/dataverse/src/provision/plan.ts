import { throwIfAborted } from "./abort";
import { expectedAttributeTypeName, resolveTable } from "./resolve";
import type {
  ExistingAttributeMetadata,
  ExistingEntityMetadata,
  ProvisionAction,
  ProvisionColumnType,
  ProvisionItemKind,
  ProvisionMetadataReader,
  ProvisionOptions,
  ProvisionPlan,
  ProvisionPlanItem,
  ProvisionTable,
  ProvisionWarning,
} from "./types";

/*
 * Plan/diff layer for additive-only provisioning.
 *
 * The plan is computed entirely from metadata reads; it never writes. Apply
 * consumes the same plan, so the preview is exactly what will be created.
 */

/** `AttributeType` fallback when `$select` did not return the complex `AttributeTypeName`. */
const ATTRIBUTE_TYPES: Record<string, string> = {
  string: "String",
  memo: "Memo",
  integer: "Integer",
  bigint: "BigInt",
  decimal: "Decimal",
  money: "Money",
  boolean: "Boolean",
  datetime: "DateTime",
  choice: "Picklist",
  multichoice: "Virtual",
  lookup: "Lookup",
  file: "File",
  image: "Image",
};

function existingTypeName(attribute: ExistingAttributeMetadata): string | undefined {
  return attribute.attributeTypeName ?? attribute.attributeType;
}

function typeMatches(attribute: ExistingAttributeMetadata, type: ProvisionColumnType): boolean {
  const actual = existingTypeName(attribute);

  // No type information: never claim a conflict we cannot prove.
  if (actual == null) {
    return true;
  }

  return actual === expectedAttributeTypeName(type) || actual === ATTRIBUTE_TYPES[type];
}

function item(
  kind: ProvisionItemKind,
  action: ProvisionAction,
  table: string,
  schemaName: string,
  label: string,
  reason: string,
  column?: string,
): ProvisionPlanItem {
  return { kind, action, table, column, schemaName, label, reason };
}

function primaryNameItem(table: ReturnType<typeof resolveTable>): ProvisionPlanItem | undefined {
  const primaryName = table.primaryName;

  if (primaryName == null) {
    return undefined;
  }

  return item(
    "column",
    "create",
    table.logicalName,
    primaryName.schemaName,
    primaryName.displayName,
    "primary name column, created with the table",
    primaryName.logicalName,
  );
}

/**
 * Read the org's current metadata and produce a create/skip/conflict plan.
 * Existing components are never updated or deleted.
 */
export async function buildProvisionPlan(
  tables: ProvisionTable | ProvisionTable[],
  reader: ProvisionMetadataReader,
  options: ProvisionOptions = {},
): Promise<ProvisionPlan> {
  throwIfAborted(options.signal);

  const resolvedTables = (Array.isArray(tables) ? tables : [tables]).map(resolveTable);
  const seen = new Set<string>();
  const schemaNames = new Map<string, string>();
  const entitySets = new Map<string, string>();

  for (const table of resolvedTables) {
    if (seen.has(table.logicalName)) {
      throw new Error(`Table "${table.logicalName}" was passed to the provisioner more than once.`);
    }

    seen.add(table.logicalName);

    const schemaKey = table.schemaName.toLowerCase();
    const schemaOwner = schemaNames.get(schemaKey);

    if (schemaOwner != null) {
      throw new Error(
        `Tables "${schemaOwner}" and "${table.logicalName}" both resolve to the schema name "${table.schemaName}".`,
      );
    }

    schemaNames.set(schemaKey, table.logicalName);

    const setKey = table.entitySetName.toLowerCase();
    const setOwner = entitySets.get(setKey);

    if (setOwner != null) {
      throw new Error(
        `Tables "${setOwner}" and "${table.logicalName}" both declare the entity set name "${table.entitySetName}".`,
      );
    }

    entitySets.set(setKey, table.logicalName);
  }

  const items: ProvisionPlanItem[] = [];
  const warnings: ProvisionWarning[] = [];
  const changedEntities = new Set<string>();

  for (const table of resolvedTables) {
    throwIfAborted(options.signal);

    warnings.push(...table.warnings);

    const existing = await reader.getEntity(table.logicalName);

    if (existing == null) {
      items.push(
        item(
          "table",
          "create",
          table.logicalName,
          table.schemaName,
          table.displayName,
          "table does not exist",
        ),
      );

      const createPrimaryName = primaryNameItem(table);

      if (createPrimaryName == null) {
        items.push(
          item(
            "column",
            "conflict",
            table.logicalName,
            table.schemaName,
            table.displayName,
            'set `primaryName` on the table to the key of its string() name field so it can be created',
          ),
        );
      } else {
        items.push(createPrimaryName);
      }

      for (const column of table.columns) {
        items.push(
          item(
            column.type === "lookup" ? "lookup" : "column",
            "create",
            table.logicalName,
            column.schemaName,
            column.displayName,
            "column does not exist",
            column.logicalName,
          ),
        );
      }

      changedEntities.add(table.logicalName);

      continue;
    }

    const entitySetMismatch =
      existing.entitySetName != null && existing.entitySetName !== table.entitySetName;

    if (entitySetMismatch) {
      items.push(
        item(
          "table",
          "conflict",
          table.logicalName,
          table.schemaName,
          table.displayName,
          `existing entity set is "${existing.entitySetName}", but this definition declares "${table.entitySetName}" — every request would target the wrong URL`,
        ),
      );
    } else {
      items.push(
        item(
          "table",
          "skip",
          table.logicalName,
          table.schemaName,
          table.displayName,
          "table already exists",
        ),
      );
    }

    const primaryKeyLogicalName = table.table.primaryKey.property.logicalName;

    if (existing.primaryIdAttribute != null && existing.primaryIdAttribute !== primaryKeyLogicalName) {
      items.push(
        item(
          "column",
          "conflict",
          table.logicalName,
          table.schemaName,
          primaryKeyLogicalName,
          `existing primary key is "${existing.primaryIdAttribute}", but this definition declares "${primaryKeyLogicalName}"`,
          primaryKeyLogicalName,
        ),
      );
    }

    const primaryName = table.primaryName;

    if (primaryName != null) {
      if (existing.primaryNameAttribute != null && existing.primaryNameAttribute !== primaryName.logicalName) {
        items.push(
          item(
            "column",
            "conflict",
            table.logicalName,
            primaryName.schemaName,
            primaryName.displayName,
            `existing primary name column is "${existing.primaryNameAttribute}", but this definition declares "${primaryName.logicalName}"`,
            primaryName.logicalName,
          ),
        );
      } else {
        const existingPrimaryName = existing.attributes.get(primaryName.logicalName);

        if (existingPrimaryName == null) {
          items.push(
            item(
              "column",
              "conflict",
              table.logicalName,
              primaryName.schemaName,
              primaryName.displayName,
              "primary name column is missing and cannot be added to an existing table",
              primaryName.logicalName,
            ),
          );
        } else if (!typeMatches(existingPrimaryName, "string")) {
          items.push(
            item(
              "column",
              "conflict",
              table.logicalName,
              primaryName.schemaName,
              primaryName.displayName,
              `existing ${existingTypeName(existingPrimaryName) ?? "unknown type"}, expected StringType`,
              primaryName.logicalName,
            ),
          );
        } else {
          items.push(
            item(
              "column",
              "skip",
              table.logicalName,
              primaryName.schemaName,
              primaryName.displayName,
              "primary name column already exists",
              primaryName.logicalName,
            ),
          );
        }
      }
    }

    const declaredPrimaryImage = table.columns.find(
      (column) => column.type === "image" && column.isPrimaryImage,
    );
    const primaryImageMismatch =
      declaredPrimaryImage != null &&
      existing.primaryImageAttribute != null &&
      existing.primaryImageAttribute !== declaredPrimaryImage.logicalName;

    if (primaryImageMismatch) {
      items.push(
        item(
          "column",
          "conflict",
          table.logicalName,
          declaredPrimaryImage.schemaName,
          declaredPrimaryImage.displayName,
          `existing primary image column is "${existing.primaryImageAttribute}", but this definition declares "${declaredPrimaryImage.logicalName}"`,
          declaredPrimaryImage.logicalName,
        ),
      );
    }

    for (const column of table.columns) {
      if (primaryImageMismatch && column === declaredPrimaryImage) {
        continue;
      }

      const existingAttribute = existing.attributes.get(column.logicalName);
      const kind: ProvisionItemKind = column.type === "lookup" ? "lookup" : "column";

      if (existingAttribute == null) {
        items.push(
          item(
            kind,
            "create",
            table.logicalName,
            column.schemaName,
            column.displayName,
            "column does not exist",
            column.logicalName,
          ),
        );
        changedEntities.add(table.logicalName);

        continue;
      }

      if (column.type === "image" && column.isPrimaryImage && existing.primaryImageAttribute == null) {
        items.push(
          item(
            kind,
            "conflict",
            table.logicalName,
            column.schemaName,
            column.displayName,
            "image column already exists but is not the primary image; additive provisioning cannot change it",
            column.logicalName,
          ),
        );

        continue;
      }

      if (!typeMatches(existingAttribute, column.type)) {
        items.push(
          item(
            kind,
            "conflict",
            table.logicalName,
            column.schemaName,
            column.displayName,
            `existing ${existingTypeName(existingAttribute) ?? "unknown type"}, expected ${expectedAttributeTypeName(column.type)}`,
            column.logicalName,
          ),
        );
      } else {
        items.push(
          item(
            kind,
            "skip",
            table.logicalName,
            column.schemaName,
            column.displayName,
            "column already exists",
            column.logicalName,
          ),
        );
      }
    }
  }

  let tableCreates = 0;
  let columnCreates = 0;
  let lookupCreates = 0;
  let skips = 0;
  let conflicts = 0;

  for (const planItem of items) {
    if (planItem.action === "skip") {
      skips++;
    } else if (planItem.action === "conflict") {
      conflicts++;
    } else if (planItem.kind === "table") {
      tableCreates++;
    } else if (planItem.kind === "lookup") {
      lookupCreates++;
    } else {
      columnCreates++;
    }
  }

  return {
    items,
    tableCreates,
    columnCreates,
    lookupCreates,
    skips,
    conflicts,
    changedEntities: [...changedEntities],
    warnings,
  };
}
