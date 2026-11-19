import type { DataverseTable } from "../table";

/*
 * Additive-only metadata provisioning.
 *
 * Every table and column definition comes from the regular `DataverseTable` /
 * field definitions — there is no second schema document. `planProvision` reads
 * the org's metadata and classifies each declared component as create/skip/
 * conflict; `applyProvisionPlan` POSTs only the creates and publishes the
 * affected tables once.
 */

/** Any table definition accepted by the provisioner. */
export type ProvisionTable = DataverseTable<any>;

/** Wire column types this provisioner can create. */
export type ProvisionColumnType =
  | "string"
  | "memo"
  | "integer"
  | "bigint"
  | "decimal"
  | "money"
  | "boolean"
  | "datetime"
  | "choice"
  | "multichoice"
  | "lookup"
  | "file"
  | "image";

export type ProvisionItemKind = "table" | "column" | "lookup";
export type ProvisionAction = "create" | "skip" | "conflict";

export type ProvisionPlanItem = {
  kind: ProvisionItemKind;
  action: ProvisionAction;
  /** Table logical name. */
  table: string;
  /** Column logical name (absent for table items). */
  column?: string;
  /** Schema name that will be created. */
  schemaName: string;
  /** Human-readable label. */
  label: string;
  reason: string;
};

export type ProvisionPlan = {
  items: ProvisionPlanItem[];
  tableCreates: number;
  columnCreates: number;
  lookupCreates: number;
  skips: number;
  conflicts: number;
  /** Tables that will be created or extended (used for the single publish). */
  changedEntities: string[];
  /** Declared fields that cannot be provisioned (N:N, system, file/image, …). */
  warnings: ProvisionWarning[];
};

export type ProvisionWarning = {
  item: string;
  message: string;
};

export type ProvisionFailure = {
  item: string;
  message: string;
};

export type ProvisionResult = {
  createdTables: string[];
  createdColumns: string[];
  createdRelationships: string[];
  publishedEntities: string[];
  failures: ProvisionFailure[];
  /** Non-fatal mismatches found while applying (e.g. a derived entity set name). */
  warnings: ProvisionWarning[];
};

export type ProvisionOptions = {
  /** Locale for labels (default 1033, English). */
  languageCode?: number;
  /** Unmanaged solution to add created components to (`MSCRM.SolutionUniqueName`). */
  solution?: string;
  /** Publish the changed tables once at the end (default `true`). */
  publish?: boolean;
  /** Cancels the in-flight request and stops the plan/apply loops. */
  signal?: AbortSignal;
  /** Timeout per metadata read/write, in ms (default 60000). */
  timeoutMs?: number;
  /** Timeout for the final `PublishXml`, in ms (default 180000). */
  publishTimeoutMs?: number;
  /** Retries for metadata reads on 429/5xx/network errors (default 3). Writes are never retried. */
  readRetries?: number;
};

/** Reader half of the metadata API — used by the planner. */
export type ProvisionMetadataReader = {
  getEntity(logicalName: string): Promise<ExistingEntityMetadata | undefined>;
};

/** Writer half of the metadata API — used by the applier. */
export type ProvisionMetadataWriter = {
  createEntity(
    logicalName: string,
    definition: Record<string, unknown>,
  ): Promise<CreatedEntityMetadata | void>;
  createAttribute(entityLogicalName: string, definition: Record<string, unknown>): Promise<void>;
  /**
   * Updates a column's metadata. Only used for the primary-image follow-up on a
   * column created in the same run (Dataverse rejects `IsPrimaryImage` on create).
   */
  updateAttribute(
    entityLogicalName: string,
    attributeLogicalName: string,
    definition: Record<string, unknown>,
  ): Promise<void>;
  createRelationship(definition: Record<string, unknown>): Promise<void>;
  publishEntities(logicalNames: string[]): Promise<void>;
};

export type ExistingAttributeMetadata = {
  logicalName: string;
  attributeTypeName?: string;
  attributeType?: string;
};

export type ExistingEntityMetadata = {
  logicalName: string;
  entitySetName?: string;
  primaryIdAttribute?: string;
  primaryNameAttribute?: string;
  primaryImageAttribute?: string;
  attributes: Map<string, ExistingAttributeMetadata>;
};

export type CreatedEntityMetadata = {
  entitySetName?: string;
  primaryIdAttribute?: string;
  primaryNameAttribute?: string;
};

/** Result of plan + apply through the convenience `provision()` helper. */
export type ProvisionRun = {
  plan: ProvisionPlan;
  /** Absent when the plan has conflicts (nothing is applied). */
  result?: ProvisionResult;
};
