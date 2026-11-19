// @vitest-environment node
import { expect, test } from "vitest";
import * as v from "valibot";

import {
  DataverseClient,
  DataverseHttpError,
  DataverseTable,
  boolean,
  choice,
  collection,
  createdOn,
  date,
  datetime,
  file,
  image,
  json,
  list,
  lookup,
  multiChoice,
  number,
  primaryKey,
  string,
} from "../src";
import {
  DataverseProvisionClient,
  applyProvisionPlan,
  buildAttributeDefinition,
  buildEntityDefinition,
  buildProvisionPlan,
  buildRelationshipDefinition,
  defaultDisplayName,
  formatProvisionPlan,
  humanize,
  planProvision,
  provision,
  publishTables,
  publisherPrefixOf,
  resolveTable,
  shortNameOf,
} from "../src/provision";
import type {
  ExistingEntityMetadata,
  ProvisionMetadataReader,
  ProvisionMetadataWriter,
} from "../src/provision";

// --- fixtures ---

const client = new DataverseClient({ url: "https://org.crm.dynamics.com" });

const Account = new DataverseTable({
  client,
  entitySetName: "accounts",
  logicalName: "account",
  fields: {
    id: primaryKey("accountid"),
    name: string("name"),
  },
});

const Project = new DataverseTable({
  client,
  entitySetName: "nnsyc200_projects",
  logicalName: "nnsyc200_project",
  displayName: "Project",
  displayCollectionName: "Projects",
  description: "Delivery projects",
  ownership: "OrganizationOwned",
  primaryName: "name",
  fields: {
    id: primaryKey("nnsyc200_projectid"),
    name: string("nnsyc200_name", { maxLength: 300 }),
    summary: json("nnsyc200_summary", { schema: v.string(), maxLength: 8000 }),
    status: choice("nnsyc200_status", { 100000000: "Active", 100000001: "Closed" }),
    tags: multiChoice("nnsyc200_tags", { 1: "Alpha", 2: "Beta" }),
    score: number("nnsyc200_score", { columnType: "integer", minValue: 0, maxValue: 100 }),
    budget: number("nnsyc200_budget", { columnType: "money", precision: 2 }),
    active: boolean("nnsyc200_active", { trueLabel: "Yes", falseLabel: "No", default: true }),
    code: string("nnsyc200_code", { autoNumberFormat: "PRJ-{SEQNUM:5}" }),
    due: date("nnsyc200_due_date"),
    review: datetime("nnsyc200_review_at"),
    account: lookup("nnsyc200_accountid", () => Account),
    created: createdOn(),
  },
});

const Attachment = new DataverseTable({  client,
  entitySetName: "nnsyc200_attachments",
  logicalName: "nnsyc200_attachment",
  primaryName: "name",
  fields: {
    id: primaryKey("nnsyc200_attachmentid"),
    name: string("nnsyc200_name"),
    document: file("nnsyc200_document", { maxSizeInKB: 10240 }),
    photo: image("nnsyc200_photo", { maxSizeInKB: 5120, canStoreFullImage: true, primary: true }),
    preview: image("nnsyc200_preview", { displayName: "Preview" }),
  },
});

const Appointment = new DataverseTable({
  client,
  entitySetName: "appointments",
  logicalName: "appointment",
  fields: {
    id: primaryKey("activityid"),
    subject: string("subject"),
  },
});

const Meeting = new DataverseTable({
  client,
  entitySetName: "nnsyc200_meetings",
  logicalName: "nnsyc200_meeting",
  primaryName: "name",
  fields: {
    id: primaryKey("nnsyc200_meetingid"),
    name: string("nnsyc200_name"),
    appointment: lookup("nnsyc200_appointmentid", () => Appointment),
  },
});

function columnOf(table: ReturnType<typeof resolveTable>, logicalName: string) {
  return table.columns.find((column) => column.logicalName === logicalName)!;
}

function entity(
  logicalName: string,
  attributes: Record<string, string> = {},
  options: Partial<ExistingEntityMetadata> = {},
): ExistingEntityMetadata {
  return {
    logicalName,
    entitySetName: `${logicalName}s`,
    primaryIdAttribute: `${logicalName}id`,
    primaryNameAttribute: `${logicalName}_name`,
    attributes: new Map(
      Object.entries(attributes).map(([name, type]) => [
        name,
        { logicalName: name, attributeTypeName: type, attributeType: type },
      ]),
    ),
    ...options,
  };
}

function readerOf(entities: Record<string, ExistingEntityMetadata | undefined>): ProvisionMetadataReader {
  return {
    getEntity: async (logicalName) => entities[logicalName],
  };
}

function writerOf() {
  const calls: string[] = [];
  const writer: ProvisionMetadataWriter = {
    createEntity: async (logicalName) => {
      calls.push("entity");

      return { entitySetName: `${logicalName}s` };
    },
    createAttribute: async (logicalName, definition) => {
      calls.push(`column:${logicalName}:${String(definition.SchemaName)}`);
    },
    updateAttribute: async (logicalName, attributeLogicalName, definition) => {
      calls.push(`update:${logicalName}:${attributeLogicalName}:${String(definition.IsPrimaryImage)}`);
    },
    createRelationship: async (definition) => {
      calls.push(`lookup:${String(definition.SchemaName)}`);
    },
    publishEntities: async (logicalNames) => {
      calls.push(`publish:${logicalNames.join(",")}`);
    },
  };

  return { writer, calls };
}

// --- name helpers ---

test("publisherPrefixOf extracts customization prefixes and ignores built-in names", () => {
  expect(publisherPrefixOf("nnsyc200_project")).toBe("nnsyc200_");
  expect(publisherPrefixOf("new_thing")).toBe("new_");
  expect(publisherPrefixOf("account")).toBe("");
  expect(publisherPrefixOf("a_b")).toBe(""); // single-character prefix is invalid
  expect(shortNameOf("nnsyc200_due_date")).toBe("due_date");
});

test("humanize turns logical names into labels", () => {
  expect(humanize("due_date")).toBe("Due Date");
  expect(humanize("reviewDate")).toBe("Review Date");
  expect(humanize("URL")).toBe("URL");
  expect(defaultDisplayName("nnsyc200_due_date")).toBe("Due Date");
});

// --- resolve ---

test("resolveTable derives schema names, labels and ownership from the definition", () => {
  const resolved = resolveTable(Project);

  expect(resolved.schemaName).toBe("nnsyc200_Project");
  expect(resolved.displayName).toBe("Project");
  expect(resolved.displayCollectionName).toBe("Projects");
  expect(resolved.description).toBe("Delivery projects");
  expect(resolved.ownership).toBe("OrganizationOwned");
  expect(resolved.primaryName?.logicalName).toBe("nnsyc200_name");
  expect(resolved.primaryName?.schemaName).toBe("nnsyc200_name");
});

test("resolveTable skips system, primary key and platform fields", () => {
  const resolved = resolveTable(Project);
  const names = resolved.columns.map((column) => column.logicalName);

  expect(names).not.toContain("nnsyc200_projectid");
  expect(names).not.toContain("nnsyc200_name"); // primary name, created with the table
  expect(names).not.toContain("createdon");
});

test("resolveTable warns instead of provisioning app-level and N:N fields", () => {
  const WithWarnings = new DataverseTable({
    client,
    entitySetName: "nnsyc200_widgets",
    logicalName: "nnsyc200_widget",
    primaryName: "name",
    fields: {
      id: primaryKey("nnsyc200_widgetid"),
      name: string("nnsyc200_name"),
      level: list("nnsyc200_level", ["low", "high"]),
      dynamic: multiChoice("nnsyc200_dynamic"),
      linked: collection("nnsyc200_linked", () => Account),
    },
  });

  const resolved = resolveTable(WithWarnings);

  expect(resolved.columns).toHaveLength(0);
  expect(resolved.warnings.map((warning) => warning.item)).toEqual([
    "nnsyc200_widget.nnsyc200_level",
    "nnsyc200_widget.nnsyc200_dynamic",
    "nnsyc200_widget.nnsyc200_linked",
  ]);
});

test("resolveTable maps number() to the requested wire type", () => {
  const resolved = resolveTable(Project);

  expect(columnOf(resolved, "nnsyc200_score")).toMatchObject({
    type: "integer",
    minValue: 0,
    maxValue: 100,
  });
  expect(columnOf(resolved, "nnsyc200_budget")).toMatchObject({
    type: "money",
    precision: 2,
  });
});

test("resolveTable maps date()/datetime() to DateOnly/DateAndTime", () => {
  const resolved = resolveTable(Project);

  expect(columnOf(resolved, "nnsyc200_due_date")).toMatchObject({
    type: "datetime",
    format: "DateOnly",
  });
  expect(columnOf(resolved, "nnsyc200_review_at")).toMatchObject({
    type: "datetime",
    format: "DateAndTime",
  });
});

test("resolveTable maps json() to a memo column", () => {
  expect(columnOf(resolveTable(Project), "nnsyc200_summary")).toMatchObject({
    type: "memo",
    maxLength: 8000,
    format: "TextArea",
  });
});

test("resolveTable maps file() and image() with their size settings", () => {
  const resolved = resolveTable(Attachment);

  expect(columnOf(resolved, "nnsyc200_document")).toMatchObject({
    type: "file",
    maxSizeInKB: 10240,
  });
  expect(columnOf(resolved, "nnsyc200_photo")).toMatchObject({
    type: "image",
    maxSizeInKB: 5120,
    canStoreFullImage: true,
    isPrimaryImage: true,
  });
  expect(columnOf(resolved, "nnsyc200_preview")).toMatchObject({
    type: "image",
    maxSizeInKB: 10240,
    canStoreFullImage: false,
    isPrimaryImage: false,
    displayName: "Preview",
  });
});

test("resolveTable rejects more than one primary image column", () => {
  const TwoPrimaries = new DataverseTable({
    client,
    entitySetName: "nnsyc200_things",
    logicalName: "nnsyc200_thing",
    fields: {
      id: primaryKey("nnsyc200_thingid"),
      first: image("nnsyc200_first", { primary: true }),
      second: image("nnsyc200_second", { primary: true }),
    },
  });

  expect(() => resolveTable(TwoPrimaries)).toThrow("more than one primary image");
});

test("resolveTable reads option sets from the choices map", () => {
  const resolved = resolveTable(Project);

  expect(columnOf(resolved, "nnsyc200_status").options).toEqual([
    { value: 100000000, label: "Active" },
    { value: 100000001, label: "Closed" },
  ]);
  expect(columnOf(resolved, "nnsyc200_tags").type).toBe("multichoice");
});

test("resolveTable derives lookup target and relationship name", () => {
  expect(columnOf(resolveTable(Project), "nnsyc200_accountid")).toMatchObject({
    type: "lookup",
    targetLogicalName: "account",
    targetAttribute: "accountid",
    relationshipName: "nnsyc200_project_nnsyc200_accountid",
  });
});

test("resolveTable uses the target definition's declared primary key for lookups", () => {
  expect(columnOf(resolveTable(Meeting), "nnsyc200_appointmentid")).toMatchObject({
    targetLogicalName: "appointment",
    targetAttribute: "activityid",
  });
});

test("resolveTable uses displayName/description when declared on the field", () => {
  const Table = new DataverseTable({
    client,
    entitySetName: "nnsyc200_things",
    logicalName: "nnsyc200_thing",
    fields: {
      id: primaryKey("nnsyc200_thingid"),
      label: string("nnsyc200_label", { displayName: "Label", description: "Shown in the UI" }),
    },
  });
  const resolved = resolveTable(Table);

  expect(resolved.columns[0]).toMatchObject({
    displayName: "Label",
    description: "Shown in the UI",
    requiredLevel: "None",
  });
});

test("resolveTable maps required:true to ApplicationRequired", () => {
  const Table = new DataverseTable({
    client,
    entitySetName: "nnsyc200_things",
    logicalName: "nnsyc200_thing",
    fields: {
      id: primaryKey("nnsyc200_thingid"),
      label: string("nnsyc200_label", { required: true }),
    },
  });

  expect(resolveTable(Table).columns[0].requiredLevel).toBe("ApplicationRequired");
});

test("resolveTable rejects two fields that declare the same logical name", () => {
  const Duplicates = new DataverseTable({
    client,
    entitySetName: "nnsyc200_things",
    logicalName: "nnsyc200_thing",
    fields: {
      id: primaryKey("nnsyc200_thingid"),
      label: string("nnsyc200_dup"),
      other: number("nnsyc200_dup"),
    },
  });

  expect(() => resolveTable(Duplicates)).toThrow('declares the column "nnsyc200_dup" more than once');
});

// --- payload builders ---

test("buildEntityDefinition includes the primary name attribute and ownership", () => {
  const definition = buildEntityDefinition(resolveTable(Project), 1033);
  const attributes = definition.Attributes as Record<string, unknown>[];

  expect(definition).toMatchObject({
    "@odata.type": "Microsoft.Dynamics.CRM.EntityMetadata",
    SchemaName: "nnsyc200_Project",
    OwnershipType: "OrganizationOwned",
    IsActivity: false,
  });
  expect(attributes).toHaveLength(1);
  expect(attributes[0]).toMatchObject({
    "@odata.type": "Microsoft.Dynamics.CRM.StringAttributeMetadata",
    SchemaName: "nnsyc200_name",
    IsPrimaryName: true,
    MaxLength: 300,
  });
  expect(attributes[0].DisplayName).toMatchObject({
    "@odata.type": "Microsoft.Dynamics.CRM.Label",
    LocalizedLabels: [{ Label: "Name", LanguageCode: 1033 }],
  });
});

test("buildEntityDefinition refuses tables without a publisher prefix", () => {
  const BuiltIn = new DataverseTable({
    client,
    entitySetName: "accounts",
    logicalName: "account",
    primaryName: "name",
    fields: { id: primaryKey("accountid"), name: string("name") },
  });

  expect(() => buildEntityDefinition(resolveTable(BuiltIn), 1033)).toThrow("only custom tables can be created");
});

test("buildEntityDefinition refuses to create a table without primaryName", () => {
  const NoPrimaryName = new DataverseTable({
    client,
    entitySetName: "nnsyc200_things",
    logicalName: "nnsyc200_thing",
    fields: { id: primaryKey("nnsyc200_thingid"), label: string("nnsyc200_label") },
  });

  expect(() => buildEntityDefinition(resolveTable(NoPrimaryName), 1033)).toThrow("primaryName");
});

test("buildEntityDefinition rejects an over-long entity schema name", () => {
  const LongSchemaName = new DataverseTable({
    client,
    entitySetName: "nnsyc200_things",
    logicalName: "nnsyc200_thing",
    schemaName: `nnsyc200_${"A".repeat(50)}`,
    primaryName: "name",
    fields: { id: primaryKey("nnsyc200_thingid"), name: string("nnsyc200_name") },
  });

  expect(() => buildEntityDefinition(resolveTable(LongSchemaName), 1033)).toThrow("limit is 50");
});

test("buildAttributeDefinition emits string, decimal and money payloads", () => {
  const resolved = resolveTable(Project);

  expect(buildAttributeDefinition(columnOf(resolved, "nnsyc200_code"), 1033)).toMatchObject({
    "@odata.type": "Microsoft.Dynamics.CRM.StringAttributeMetadata",
    FormatName: { Value: "Text" },
    AutoNumberFormat: "PRJ-{SEQNUM:5}",
    MaxLength: 200,
  });

  expect(buildAttributeDefinition(columnOf(resolved, "nnsyc200_score"), 1033)).toMatchObject({
    "@odata.type": "Microsoft.Dynamics.CRM.IntegerAttributeMetadata",
    Format: "None",
    MinValue: 0,
    MaxValue: 100,
  });

  expect(buildAttributeDefinition(columnOf(resolved, "nnsyc200_budget"), 1033)).toMatchObject({
    "@odata.type": "Microsoft.Dynamics.CRM.MoneyAttributeMetadata",
    PrecisionSource: 0,
    Precision: 2,
  });
});

test("buildAttributeDefinition emits boolean labels, defaults and choice options", () => {
  const resolved = resolveTable(Project);
  const active = buildAttributeDefinition(columnOf(resolved, "nnsyc200_active"), 1033) as any;

  expect(active.DefaultValue).toBe(true);
  expect(active.OptionSet.TrueOption.Label.LocalizedLabels[0].Label).toBe("Yes");
  expect(active.OptionSet.FalseOption.Label.LocalizedLabels[0].Label).toBe("No");

  const status = buildAttributeDefinition(columnOf(resolved, "nnsyc200_status"), 1033) as any;

  expect(status["@odata.type"]).toBe("Microsoft.Dynamics.CRM.PicklistAttributeMetadata");
  expect(status.OptionSet.Options).toHaveLength(2);
  expect(status.OptionSet.Options[0]).toMatchObject({
    Value: 100000000,
    Label: { LocalizedLabels: [{ Label: "Active" }] },
  });
});

test("buildAttributeDefinition emits file and image payloads", () => {
  const resolved = resolveTable(Attachment);

  expect(buildAttributeDefinition(columnOf(resolved, "nnsyc200_document"), 1033)).toMatchObject({
    "@odata.type": "Microsoft.Dynamics.CRM.FileAttributeMetadata",
    AttributeType: "File",
    AttributeTypeName: { Value: "FileType" },
    MaxSizeInKB: 10240,
  });

  const photo = buildAttributeDefinition(columnOf(resolved, "nnsyc200_photo"), 1033);

  expect(photo).toMatchObject({
    "@odata.type": "Microsoft.Dynamics.CRM.ImageAttributeMetadata",
    AttributeType: "Image",
    AttributeTypeName: { Value: "ImageType" },
    MaxSizeInKB: 5120,
    CanStoreFullImage: true,
  });
  // Dataverse rejects IsPrimaryImage on create; apply promotes the column afterwards.
  expect(photo).not.toHaveProperty("IsPrimaryImage");
});

test("buildRelationshipDefinition targets the related table's primary key", () => {
  const definition = buildRelationshipDefinition(
    resolveTable(Project),
    columnOf(resolveTable(Project), "nnsyc200_accountid"),
    1033,
  );

  expect(definition).toMatchObject({
    "@odata.type": "Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata",
    SchemaName: "nnsyc200_project_nnsyc200_accountid",
    ReferencedEntity: "account",
    ReferencedAttribute: "accountid",
    ReferencingEntity: "nnsyc200_project",
  });
  expect((definition.Lookup as any).SchemaName).toBe("nnsyc200_accountid");
});

// --- plan ---

test("buildProvisionPlan creates a missing table and all of its columns", async () => {
  const plan = await buildProvisionPlan(Project, readerOf({}));

  expect(plan.conflicts).toBe(0);
  expect(plan.tableCreates).toBe(1);
  expect(plan.lookupCreates).toBe(1);
  expect(plan.changedEntities).toEqual(["nnsyc200_project"]);
  expect(plan.items.find((item) => item.kind === "table")?.action).toBe("create");
  expect(plan.items.find((item) => item.column === "nnsyc200_name")?.reason).toContain("primary name");
});

test("buildProvisionPlan skips a table and columns that already exist with matching types", async () => {
  const plan = await buildProvisionPlan(
    Project,
    readerOf({
      nnsyc200_project: entity("nnsyc200_project", {
        nnsyc200_name: "StringType",
        nnsyc200_summary: "MemoType",
        nnsyc200_status: "PicklistType",
        nnsyc200_tags: "MultiSelectPicklistType",
        nnsyc200_score: "IntegerType",
        nnsyc200_budget: "MoneyType",
        nnsyc200_active: "BooleanType",
        nnsyc200_code: "StringType",
        nnsyc200_due_date: "DateTimeType",
        nnsyc200_review_at: "DateTimeType",
        nnsyc200_accountid: "LookupType",
      }, {
        primaryNameAttribute: "nnsyc200_name",
      }),
    }),
  );

  expect(plan.conflicts).toBe(0);
  expect(plan.tableCreates).toBe(0);
  expect(plan.columnCreates).toBe(0);
  expect(plan.lookupCreates).toBe(0);
  expect(plan.skips).toBe(plan.items.length);
});

test("buildProvisionPlan reports a type mismatch as a conflict", async () => {
  const plan = await buildProvisionPlan(
    Project,
    readerOf({
      nnsyc200_project: entity("nnsyc200_project", {
        nnsyc200_name: "StringType",
        nnsyc200_score: "StringType",
      }, { primaryNameAttribute: "nnsyc200_name" }),
    }),
  );

  const conflict = plan.items.find((item) => item.action === "conflict");

  expect(conflict?.column).toBe("nnsyc200_score");
  expect(conflict?.reason).toContain("expected IntegerType");
});

test("buildProvisionPlan reports an entity set mismatch as a conflict", async () => {
  const plan = await buildProvisionPlan(
    Project,
    readerOf({
      nnsyc200_project: entity("nnsyc200_project", { nnsyc200_name: "StringType" }, {
        entitySetName: "nnsyc200_wrongs",
        primaryNameAttribute: "nnsyc200_name",
      }),
    }),
  );

  const conflict = plan.items.find((item) => item.kind === "table" && item.action === "conflict");

  expect(conflict?.reason).toContain("nnsyc200_wrongs");
  expect(conflict?.reason).toContain("nnsyc200_projects");
});

test("buildProvisionPlan reports a missing primary name on an existing table as a conflict", async () => {
  const plan = await buildProvisionPlan(
    Project,
    readerOf({
      nnsyc200_project: entity("nnsyc200_project", {}, {
        primaryNameAttribute: undefined,
        attributes: new Map(),
      }),
    }),
  );

  const conflict = plan.items.find((item) => item.column === "nnsyc200_name");

  expect(conflict?.action).toBe("conflict");
  expect(conflict?.reason).toContain("cannot be added");
});

test("buildProvisionPlan flags a missing primaryName when the table must be created", async () => {
  const NoPrimaryName = new DataverseTable({
    client,
    entitySetName: "nnsyc200_things",
    logicalName: "nnsyc200_thing",
    fields: { id: primaryKey("nnsyc200_thingid"), label: string("nnsyc200_label") },
  });
  const plan = await buildProvisionPlan(NoPrimaryName, readerOf({}));

  expect(plan.conflicts).toBe(1);
  expect(plan.items.find((item) => item.action === "conflict")?.reason).toContain("primaryName");
});

test("buildProvisionPlan adds columns to an existing table", async () => {  const plan = await buildProvisionPlan(
    Project,
    readerOf({
      nnsyc200_project: entity("nnsyc200_project", {
        nnsyc200_name: "StringType",
        nnsyc200_summary: "MemoType",
        nnsyc200_status: "PicklistType",
        nnsyc200_tags: "MultiSelectPicklistType",
        nnsyc200_score: "IntegerType",
        nnsyc200_budget: "MoneyType",
        nnsyc200_active: "BooleanType",
        nnsyc200_code: "StringType",
        nnsyc200_due_date: "DateTimeType",
        nnsyc200_review_at: "DateTimeType",
      }, { primaryNameAttribute: "nnsyc200_name" }),
    }),
  );

  expect(plan.columnCreates).toBe(0);
  expect(plan.lookupCreates).toBe(1);
  expect(plan.items.find((item) => item.column === "nnsyc200_accountid")?.action).toBe("create");
  expect(plan.changedEntities).toEqual(["nnsyc200_project"]);
});

test("buildProvisionPlan creates file and image columns", async () => {
  const plan = await buildProvisionPlan(Attachment, readerOf({}));
  const creates = plan.items.filter((item) => item.action === "create").map((item) => item.column);

  expect(creates).toContain("nnsyc200_document");
  expect(creates).toContain("nnsyc200_photo");
  expect(creates).toContain("nnsyc200_preview");
  expect(plan.conflicts).toBe(0);
});

test("buildProvisionPlan skips existing FileType and ImageType columns", async () => {
  const plan = await buildProvisionPlan(
    Attachment,
    readerOf({
      nnsyc200_attachment: entity("nnsyc200_attachment", {
        nnsyc200_name: "StringType",
        nnsyc200_document: "FileType",
        nnsyc200_photo: "ImageType",
        nnsyc200_preview: "ImageType",
      }, {
        primaryNameAttribute: "nnsyc200_name",
        primaryImageAttribute: "nnsyc200_photo",
      }),
    }),
  );

  expect(plan.conflicts).toBe(0);
  expect(plan.columnCreates).toBe(0);
  expect(plan.items.every((item) => item.action === "skip")).toBe(true);
});

test("buildProvisionPlan conflicts when the org has a different primary image", async () => {
  const plan = await buildProvisionPlan(
    Attachment,
    readerOf({
      nnsyc200_attachment: entity("nnsyc200_attachment", {
        nnsyc200_name: "StringType",
        nnsyc200_photo: "ImageType",
      }, {
        primaryNameAttribute: "nnsyc200_name",
        primaryImageAttribute: "nnsyc200_other",
      }),
    }),
  );

  const conflict = plan.items.find((item) => item.action === "conflict");

  expect(conflict?.column).toBe("nnsyc200_photo");
  expect(conflict?.reason).toContain("nnsyc200_other");
});

test("buildProvisionPlan conflicts when the existing image is not the primary image", async () => {
  const plan = await buildProvisionPlan(
    Attachment,
    readerOf({
      nnsyc200_attachment: entity("nnsyc200_attachment", {
        nnsyc200_name: "StringType",
        nnsyc200_photo: "ImageType",
      }, {
        primaryNameAttribute: "nnsyc200_name",
        primaryImageAttribute: undefined,
      }),
    }),
  );

  const conflict = plan.items.find((item) => item.column === "nnsyc200_photo");

  expect(conflict?.action).toBe("conflict");
  expect(conflict?.reason).toContain("not the primary image");
});

// --- apply ---

function itemsOf(plan: Awaited<ReturnType<typeof buildProvisionPlan>>) {
  return plan.items.map((item) => `${item.action}:${item.table}:${item.column ?? ""}`);
}

test("applyProvisionPlan creates tables before columns, lookups, then publishes once", async () => {
  const plan = await buildProvisionPlan(Project, readerOf({}));
  const { writer, calls } = writerOf();
  const result = await applyProvisionPlan(writer, Project, plan);

  expect(result.createdTables).toEqual(["nnsyc200_project"]);
  expect(result.createdRelationships).toEqual(["nnsyc200_project.nnsyc200_accountid"]);
  expect(result.failures).toEqual([]);
  expect(calls[0]).toBe("entity");
  expect(calls.at(-1)).toBe("publish:nnsyc200_project");
  expect(calls.filter((call) => call.startsWith("lookup:"))).toHaveLength(1);
  expect(calls.some((call) => call.startsWith("column:"))).toBe(true);
  expect(itemsOf(plan).every((item) => !item.startsWith("conflict"))).toBe(true);
});

test("applyProvisionPlan promotes a newly created image column to primary", async () => {
  const plan = await buildProvisionPlan(Attachment, readerOf({}));
  const { writer, calls } = writerOf();
  const result = await applyProvisionPlan(writer, Attachment, plan);

  expect(result.failures).toEqual([]);
  expect(result.createdColumns).toContain("nnsyc200_attachment.nnsyc200_photo");
  expect(calls).toContain("update:nnsyc200_attachment:nnsyc200_photo:true");
  expect(calls.indexOf("update:nnsyc200_attachment:nnsyc200_photo:true")).toBeGreaterThan(
    calls.indexOf("column:nnsyc200_attachment:nnsyc200_photo"),
  );
  // The non-primary image is never patched.
  expect(calls.some((call) => call.startsWith("update:") && call.includes("nnsyc200_preview"))).toBe(false);
});

test("applyProvisionPlan reports a failed primary-image promotion", async () => {
  const plan = await buildProvisionPlan(Attachment, readerOf({}));
  const { writer } = writerOf();
  const failing: ProvisionMetadataWriter = {
    ...writer,
    updateAttribute: async () => {
      throw new Error("promote failed");
    },
  };

  const result = await applyProvisionPlan(failing, Attachment, plan);

  expect(result.createdColumns).toContain("nnsyc200_attachment.nnsyc200_photo");
  expect(result.failures).toContainEqual({
    item: "primary image nnsyc200_attachment.nnsyc200_photo",
    message: "promote failed",
  });
});

test("applyProvisionPlan continues after a column failure and reports it", async () => {
  const plan = await buildProvisionPlan(Project, readerOf({}));
  const calls: string[] = [];

  const writer: ProvisionMetadataWriter = {
    createEntity: async () => ({}),
    createAttribute: async (logicalName, definition) => {
      if (String(definition.SchemaName) === "nnsyc200_score") {
        throw new Error("boom");
      }

      calls.push(`column:${logicalName}`);
    },
    updateAttribute: async () => {},
    createRelationship: async () => {
      calls.push("lookup");
    },
    publishEntities: async () => {
      calls.push("publish");
    },
  };

  const result = await applyProvisionPlan(writer, Project, plan);

  expect(result.failures).toEqual([
    { item: "column nnsyc200_project.nnsyc200_score", message: "boom" },
  ]);
  expect(result.createdColumns.length).toBeGreaterThan(0);
  expect(calls.at(-1)).toBe("publish");
});

test("applyProvisionPlan warns when the created entity set differs from the definition", async () => {
  const plan = await buildProvisionPlan(Project, readerOf({}));
  const writer = {
    createEntity: async () => ({ entitySetName: "nnsyc200_wrongs" }),
    createAttribute: async () => {},
    updateAttribute: async () => {},
    createRelationship: async () => {},
    publishEntities: async () => {},
  };

  const result = await applyProvisionPlan(writer as ProvisionMetadataWriter, Project, plan);

  expect(result.warnings[0].item).toBe("table nnsyc200_project");
  expect(result.warnings[0].message).toContain("nnsyc200_wrongs");
});

test("applyProvisionPlan skips publishing when publish is false", async () => {
  const plan = await buildProvisionPlan(Project, readerOf({}));
  const { writer, calls } = writerOf();

  const result = await applyProvisionPlan(writer, Project, plan, { publish: false });

  expect(result.publishedEntities).toEqual([]);
  expect(calls.some((call) => call.startsWith("publish:"))).toBe(false);
});

test("applyProvisionPlan refuses a plan that reports conflicts", async () => {
  const plan = await buildProvisionPlan(
    Project,
    readerOf({
      nnsyc200_project: entity("nnsyc200_project", {
        nnsyc200_name: "StringType",
        nnsyc200_score: "StringType",
      }, { primaryNameAttribute: "nnsyc200_name" }),
    }),
  );
  const { writer, calls } = writerOf();

  await expect(applyProvisionPlan(writer, Project, plan)).rejects.toThrow("conflicts");
  expect(calls).toEqual([]);
});

// --- plan formatting ---

test("formatProvisionPlan renders a diff with summary and warnings", async () => {
  const plan = await buildProvisionPlan(
    Project,
    readerOf({
      nnsyc200_project: entity("nnsyc200_project", {
        nnsyc200_name: "StringType",
        nnsyc200_summary: "MemoType",
        nnsyc200_status: "PicklistType",
        nnsyc200_tags: "MultiSelectPicklistType",
        nnsyc200_score: "StringType",
        nnsyc200_budget: "MoneyType",
        nnsyc200_active: "BooleanType",
        nnsyc200_code: "StringType",
        nnsyc200_due_date: "DateTimeType",
        nnsyc200_review_at: "DateTimeType",
        nnsyc200_accountid: "LookupType",
      }, { primaryNameAttribute: "nnsyc200_name" }),
    }),
  );

  const text = formatProvisionPlan(plan);

  expect(text).toContain("**Summary:**");
  expect(text).toContain("```diff");
  expect(text).toContain("!   column nnsyc200_score");
  expect(text).toContain("Conflicts block provisioning");
});

// --- robustness ---

test("resolveTable normalizes string formats and rejects unknown ones", () => {
  const Formatted = new DataverseTable({
    client,
    entitySetName: "nnsyc200_contacts",
    logicalName: "nnsyc200_contact",
    fields: {
      id: primaryKey("nnsyc200_contactid"),
      email: string("nnsyc200_email", { format: "email" }),
    },
  });

  expect(buildAttributeDefinition(resolveTable(Formatted).columns[0], 1033)).toMatchObject({
    FormatName: { Value: "Email" },
  });

  const Invalid = new DataverseTable({
    client,
    entitySetName: "nnsyc200_contacts",
    logicalName: "nnsyc200_contact",
    fields: {
      id: primaryKey("nnsyc200_contactid"),
      postcode: string("nnsyc200_postcode", { format: "Postal" }),
    },
  });

  expect(() => resolveTable(Invalid)).toThrow('format "Postal" is not valid');
});

test("resolveTable reports a column that repeats the primary name's logical name", () => {
  const Duplicate = new DataverseTable({
    client,
    entitySetName: "nnsyc200_things",
    logicalName: "nnsyc200_thing",
    primaryName: "name",
    fields: {
      id: primaryKey("nnsyc200_thingid"),
      name: string("nnsyc200_Thing_Name"),
      alias: string("nnsyc200_thing_name"),
    },
  });

  expect(() => resolveTable(Duplicate)).toThrow("more than once");
});

test("buildProvisionPlan rejects tables that collide on schema name", async () => {
  const First = new DataverseTable({
    client,
    entitySetName: "nnsyc200_firsts",
    logicalName: "nnsyc200_first",
    schemaName: "nnsyc200_Thing",
    primaryName: "name",
    fields: { id: primaryKey("nnsyc200_firstid"), name: string("nnsyc200_name") },
  });
  const Second = new DataverseTable({
    client,
    entitySetName: "nnsyc200_seconds",
    logicalName: "nnsyc200_second",
    schemaName: "nnsyc200_thing",
    primaryName: "name",
    fields: { id: primaryKey("nnsyc200_secondid"), name: string("nnsyc200_name") },
  });

  await expect(buildProvisionPlan([First, Second], readerOf({}))).rejects.toThrow(
    "both resolve to the schema name",
  );
});

test("buildProvisionPlan rejects tables that collide on entity set name", async () => {
  const First = new DataverseTable({
    client,
    entitySetName: "nnsyc200_shared",
    logicalName: "nnsyc200_first",
    primaryName: "name",
    fields: { id: primaryKey("nnsyc200_firstid"), name: string("nnsyc200_name") },
  });
  const Second = new DataverseTable({
    client,
    entitySetName: "NNSYC200_SHARED",
    logicalName: "nnsyc200_second",
    primaryName: "name",
    fields: { id: primaryKey("nnsyc200_secondid"), name: string("nnsyc200_name") },
  });

  await expect(buildProvisionPlan([First, Second], readerOf({}))).rejects.toThrow(
    "entity set name",
  );
});

test("planProvision stops before any read when the signal is already aborted", async () => {
  const controller = new AbortController();
  controller.abort();
  let reads = 0;
  const reader: ProvisionMetadataReader = {
    getEntity: async () => {
      reads++;

      return undefined;
    },
  };

  await expect(buildProvisionPlan(Project, reader, { signal: controller.signal })).rejects.toThrow(
    "aborted",
  );
  expect(reads).toBe(0);
});

test("applyProvisionPlan stops before any write when the signal is already aborted", async () => {
  const plan = await buildProvisionPlan(Project, readerOf({}));
  const { writer, calls } = writerOf();
  const controller = new AbortController();
  controller.abort();

  await expect(
    applyProvisionPlan(writer, Project, plan, { signal: controller.signal }),
  ).rejects.toThrow("aborted");
  expect(calls).toEqual([]);
});

test("applyProvisionPlan carries plan warnings into the result", async () => {
  const WithWarnings = new DataverseTable({
    client,
    entitySetName: "nnsyc200_widgets",
    logicalName: "nnsyc200_widget",
    primaryName: "name",
    fields: {
      id: primaryKey("nnsyc200_widgetid"),
      name: string("nnsyc200_name"),
      level: list("nnsyc200_level", ["low", "high"]),
    },
  });
  const plan = await buildProvisionPlan(WithWarnings, readerOf({}));
  const { writer } = writerOf();
  const result = await applyProvisionPlan(writer, WithWarnings, plan);

  expect(plan.warnings).toHaveLength(1);
  expect(result.warnings).toEqual(plan.warnings);
});

test("DataverseProvisionClient retries metadata reads after a transient 5xx", async () => {
  const metadata = new DataverseProvisionClient(client, { readRetries: 1 });
  const original = client.fetch;
  let calls = 0;

  client.fetch = (async () => {
    calls++;

    if (calls === 1) {
      throw new DataverseHttpError("500", 500, "Server Error", {});
    }

    return { LogicalName: "account", Attributes: [] };
  }) as typeof client.fetch;

  try {
    const entity = await metadata.getEntity("account");

    expect(entity?.logicalName).toBe("account");
    expect(calls).toBe(2);
  } finally {
    client.fetch = original;
  }
});

test("DataverseProvisionClient never retries writes", async () => {
  const metadata = new DataverseProvisionClient(client, { readRetries: 3 });
  const original = client.fetch;
  let calls = 0;

  client.fetch = (async () => {
    calls++;

    throw new DataverseHttpError("500", 500, "Server Error", {});
  }) as typeof client.fetch;

  try {
    await expect(metadata.createAttribute("account", {})).rejects.toThrow("500");
    expect(calls).toBe(1);
  } finally {
    client.fetch = original;
  }
});

test("DataverseProvisionClient times out a hanging publish", async () => {
  const metadata = new DataverseProvisionClient(client, { publishTimeoutMs: 20 });
  const original = client.fetch;

  client.fetch = ((_resource: string, init: RequestInit = {}) =>
    new Promise((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(new Error("aborted by signal")));
    })) as typeof client.fetch;

  try {
    await expect(metadata.publishEntities(["account"])).rejects.toThrow("timed out");
  } finally {
    client.fetch = original;
  }
});

// --- adapter ---

test("DataverseProvisionClient reads an entity and normalizes attribute names", async () => {
  const metadata = new DataverseProvisionClient(client);
  const original = client.fetch;
  let requested = "";

  client.fetch = (async (resource: string) => {
    requested = resource;

    return {
      LogicalName: "account",
      EntitySetName: "accounts",
      PrimaryIdAttribute: "accountid",
      PrimaryNameAttribute: "name",
      PrimaryImageAttribute: "entityimage",
      Attributes: [
        { LogicalName: "Name", AttributeType: "String", AttributeTypeName: { Value: "StringType" } },
      ],
    };
  }) as typeof client.fetch;

  try {
    const entity = await metadata.getEntity("account");

    expect(requested).toContain("EntityDefinitions(LogicalName='account')");
    expect(entity?.entitySetName).toBe("accounts");
    expect(entity?.primaryImageAttribute).toBe("entityimage");
    expect(entity?.attributes.get("name")).toMatchObject({
      logicalName: "Name",
      attributeTypeName: "StringType",
    });
  } finally {
    client.fetch = original;
  }
});

test("DataverseProvisionClient returns undefined for a missing table", async () => {
  const metadata = new DataverseProvisionClient(client);
  const original = client.fetch;

  client.fetch = (async () => {
    throw new DataverseHttpError("404", 404, "Not Found", {});
  }) as typeof client.fetch;

  try {
    expect(await metadata.getEntity("missing")).toBeUndefined();
  } finally {
    client.fetch = original;
  }
});

test("DataverseProvisionClient retries without AttributeTypeName on a 400", async () => {
  const metadata = new DataverseProvisionClient(client);
  const original = client.fetch;
  const requested: string[] = [];

  client.fetch = (async (resource: string) => {
    requested.push(resource);

    if (resource.includes("AttributeTypeName")) {
      throw new DataverseHttpError("400", 400, "Bad Request", {});
    }

    return { LogicalName: "account", Attributes: [] };
  }) as typeof client.fetch;

  try {
    const entity = await metadata.getEntity("account");

    expect(entity?.attributes.size).toBe(0);
    expect(requested).toHaveLength(2);
    expect(requested[1]).not.toContain("AttributeTypeName");
  } finally {
    client.fetch = original;
  }
});

test("DataverseProvisionClient reads the created table back when the response has no representation", async () => {
  const metadata = new DataverseProvisionClient(client);
  const original = client.fetch;
  const methods: string[] = [];

  client.fetch = (async (_resource: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    methods.push(method);

    if (method === "POST") {
      return undefined;
    }

    return {
      LogicalName: "nnsyc200_project",
      EntitySetName: "nnsyc200_projects",
      PrimaryIdAttribute: "nnsyc200_projectid",
      PrimaryNameAttribute: "nnsyc200_name",
      Attributes: [],
    };
  }) as typeof client.fetch;

  try {
    const created = await metadata.createEntity("nnsyc200_project", {});

    expect(created).toEqual({
      entitySetName: "nnsyc200_projects",
      primaryIdAttribute: "nnsyc200_projectid",
      primaryNameAttribute: "nnsyc200_name",
    });
    expect(methods).toEqual(["POST", "GET"]);
  } finally {
    client.fetch = original;
  }
});

test("publishTables sends one PublishXml with deduplicated names", async () => {
  const original = client.fetch;
  let body: { ParameterXml?: string } | undefined;

  client.fetch = (async (resource: string, init: RequestInit = {}) => {
    if (resource === "PublishXml") {
      body = JSON.parse(String(init.body));
    }

    return undefined;
  }) as typeof client.fetch;

  try {
    const published = await publishTables(client, [
      "nnsyc200_project",
      " nnsyc200_project ",
      "account",
    ]);

    expect(published).toEqual(["nnsyc200_project", "account"]);
    expect(body?.ParameterXml).toBe(
      "<importexportxml><entities><entity>nnsyc200_project</entity><entity>account</entity></entities></importexportxml>",
    );
  } finally {
    client.fetch = original;
  }
});

test("provision plans and applies through the Web API adapter", async () => {
  const original = client.fetch;
  const requested: { resource: string; method: string }[] = [];

  client.fetch = (async (resource: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    requested.push({ resource, method });

    if (method === "GET") {
      throw new DataverseHttpError("404", 404, "Not Found", {});
    }

    if (resource === "EntityDefinitions" && method === "POST") {
      return { EntitySetName: "nnsyc200_projects" };
    }

    return undefined;
  }) as typeof client.fetch;

  try {
    const run = await provision(client, Project, { solution: "MySolution" });

    expect(run.result?.createdTables).toEqual(["nnsyc200_project"]);
    expect(requested.filter((entry) => entry.method === "POST").map((entry) => entry.resource)).toEqual(
      expect.arrayContaining(["EntityDefinitions", "RelationshipDefinitions", "PublishXml"]),
    );
  } finally {
    client.fetch = original;
  }
});

test("planProvision accepts a reader directly", async () => {
  const plan = await planProvision(readerOf({}), Project);

  expect(plan.tableCreates).toBe(1);
  expect(plan.conflicts).toBe(0);
});
