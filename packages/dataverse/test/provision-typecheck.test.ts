// @vitest-environment node
import { expectTypeOf, test } from "vitest";

import {
  DataverseClient,
  DataverseTable,
  boolean,
  file,
  image,
  lookup,
  number,
  primaryKey,
  string,
} from "../src";

// Compile-time checks for the definition metadata used by `dataverse-schema/provision`.

const client = new DataverseClient({ url: "https://org.crm.dynamics.com" });

const Account = new DataverseTable({
  client,
  entitySetName: "accounts",
  logicalName: "account",
  fields: { id: primaryKey("accountid"), name: string("name") },
});

test("table options accept display metadata and a typed primary name key", () => {
  const Project = new DataverseTable({
    client,
    entitySetName: "nnsyc200_projects",
    logicalName: "nnsyc200_project",
    schemaName: "nnsyc200_Project",
    displayName: "Project",
    displayCollectionName: "Projects",
    description: "Delivery projects",
    ownership: "OrganizationOwned",
    primaryName: "name",
    fields: {
      id: primaryKey("nnsyc200_projectid"),
      name: string("nnsyc200_name"),
    },
  });

  expectTypeOf(Project.displayName).toEqualTypeOf<string | undefined>();
  expectTypeOf(Project.ownership).toEqualTypeOf<"UserOwned" | "OrganizationOwned">();
  expectTypeOf(Project.primaryName).toEqualTypeOf<string | undefined>();
});

test("primaryName must be a field key", () => {
  const compileOnly = () => {
    new DataverseTable({
      client,
      entitySetName: "nnsyc200_bads",
      logicalName: "nnsyc200_bad",
      // @ts-expect-error - "nope" is not a field of this table
      primaryName: "nope",
      fields: {
        id: primaryKey("nnsyc200_badid"),
        name: string("nnsyc200_name"),
      },
    });
  };

  void compileOnly;
});

test("field options expose per-kind provisioning metadata", () => {
  string("nnsyc200_code", { displayName: "Code", maxLength: 80, format: "Text", autoNumberFormat: "C-{SEQNUM:4}" });
  number("nnsyc200_budget", { columnType: "money", minValue: 0, maxValue: 1000, precision: 2 });
  boolean("nnsyc200_active", { trueLabel: "Yes", falseLabel: "No", displayName: "Active" });
  file("nnsyc200_doc", { maxSizeInKB: 10240, displayName: "Document" });
  image("nnsyc200_pic", { maxSizeInKB: 5120, canStoreFullImage: true, primary: true });
  lookup("nnsyc200_accountid", () => Account, { relationshipName: "nnsyc200_project_account", targetAttribute: "accountid", description: "Owning account" });

  const compileOnly = () => {
    // @ts-expect-error - money is the only currency wire type; "currency" is not valid
    number("nnsyc200_bad", { columnType: "currency" });
    // @ts-expect-error - trueLabel belongs to boolean fields, not strings
    string("nnsyc200_bad", { trueLabel: "Yes" });
    // @ts-expect-error - canStoreFullImage is image-only
    file("nnsyc200_bad", { canStoreFullImage: true });
  };

  void compileOnly;
});
