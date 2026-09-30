import { expect, test } from "vitest"
import * as v from "valibot"
import {
  string, number, boolean, primaryKey,
  datetime, date, createdOn, modifiedOn, versionNumber, stateCode, list, image, file, formatted, multiChoice,
  collection, collectionIds, lookupId, lookup, DataverseTable,
  choice, SKIP, json, standardParse, standardSafeParse,
} from "../src"
import { DataverseClient } from "../src/client"

const testClient = new DataverseClient({ url: "https://test.crm.dynamics.com" })
const testRefTable = new DataverseTable({ client: testClient, entitySetName: "contacts", logicalName: "contacts", fields: { id: primaryKey("contactid") } })

test("string factory is non-nullable by design", () => {
  const f = string("fullname")
  expect(f.type).toBe("string")
  expect(f.kind).toBe("value")
  expect(f.logicalName).toBe("fullname")
  expect(f.getDefault()).toBe("")
})

test("required string folds null into its default", () => {
  const f = string("fullname", { required: true })
  expect(f.getDefault()).toBe("")
  expect(f.transformValueFromDataverse(null)).toBe("")
  expect(f.transformValueFromDataverse("Hello")).toBe("Hello")
})

test("string folds null into its empty default", () => {
  const f = string("nickname")
  expect(f.getDefault()).toBe("")
  expect(f.transformValueFromDataverse(null)).toBe("")
})

test("number field is nullable by default", () => {
  const f = number("age")
  expect(f.type).toBe("number")
  expect(f.getDefault()).toBeNull()
})

test("required number is validation-only and stays nullable", () => {
  const f = number("age", { required: true })
  expect(f.getDefault()).toBeNull()
  expect(f.transformValueFromDataverse(null)).toBeNull()
})

test("system number is non-null: null fails fast", () => {
  const f = number("statecode", { system: true })
  expect(f.getDefault()).toBe(0)
  expect(() => f.transformValueFromDataverse(null)).toThrow("non-nullable")
  expect(f.transformValueFromDataverse(42)).toBe(42)
})

test("boolean field is non-nullable by design", () => {
  const f = boolean("active")
  expect(f.getDefault()).toBe(false)
  expect(f.transformValueFromDataverse(null)).toBe(false)
})

test("required boolean folds null into the default", () => {
  const f = boolean("active", { required: true })
  expect(f.getDefault()).toBe(false)
  expect(f.transformValueFromDataverse(null)).toBe(false)
  expect(f.transformValueFromDataverse(true)).toBe(true)
})

test("primaryKey field generates UUID on getDefault", () => {
  const f = primaryKey("accountid")
  expect(f.type).toBe("primaryKey")
  const id = f.getDefault()
  expect(id).toMatch(/^[0-9a-f-]+$/i)
})

test("primaryKey field returns different UUIDs each call", () => {
  const f = primaryKey("accountid")
  expect(f.getDefault()).not.toBe(f.getDefault())
})

test("datetime field is nullable by default", () => {
  const f = datetime("createdon")
  expect(f.getDefault()).toBeNull()
  expect(f.transformValueFromDataverse(null)).toBeNull()
})

test("system datetime is non-null: null fails fast", () => {
  const f = datetime("createdon", { system: true })
  expect(f.getDefault()).toBeInstanceOf(Date)
  expect(() => f.transformValueFromDataverse(null)).toThrow("non-nullable")
  expect(f.transformValueFromDataverse("2024-01-15T10:30:00Z")).toBeInstanceOf(Date)
})

test("sugar factories produce system fields", () => {
  expect(createdOn().getDefault()).toBeInstanceOf(Date)
  expect(modifiedOn().getDefault()).toBeInstanceOf(Date)
  expect(versionNumber().getDefault()).toBe(0)
  expect(stateCode().getDefault()).toBe(0)
})

test("required (validation) datetime still converts strings; reads stay nullable", () => {
  const f = datetime("createdon", { required: true })
  const result = f.transformValueFromDataverse("2024-01-15T10:30:00Z") as Date | null
  expect(result).toBeInstanceOf(Date)
  expect((result as Date).getFullYear()).toBe(2024)
})

test("date field is nullable by default", () => {
  const f = date("birthdate")
  expect(f.type).toBe("dateOnly")
  expect(f.transformValueFromDataverse(null)).toBeNull()
})

test("system date parses date-only strings and is non-null", () => {
  const f = date("birthdate", { system: true })
  const result = f.transformValueFromDataverse("2024-01-15")
  expect(result).toBeInstanceOf(Date)
  expect((result as Date).getMonth()).toBe(0)
  expect((result as Date).getDate()).toBe(15)
})

test("date field transformValueToDataverse formats as date-only", () => {
  const f = date("birthdate")
  const result = f.transformValueToDataverse(new Date(2024, 0, 15))
  expect(result).toBe("2024-01-15")
})

test("system date fails fast on null instead of folding", () => {
  const f = date("birthdate", { system: true })
  expect(() => f.transformValueFromDataverse(null)).toThrow("non-nullable")
  expect(() => f.transformValueFromDataverse(undefined)).toThrow("non-nullable")
})

test("date getDefault (nullable) returns null; system date key still has the class default", () => {
  const f = date("birthdate")
  expect(f.getDefault()).toBeNull()
  const s = date("birthdate", { system: true })
  expect(s.getDefault()).toBeInstanceOf(Date)
  expect(s.getDefault()).not.toBe(s.getDefault())
})

test("list field validates against choices", async () => {
  const f = list("gender", ["M", "F"] as const)
  expect(f.type).toBe("list")
  expect(f.getDefault()).toBeNull()
  expect(await standardParse(f.schema, "M")).toBe("M")
  expect(await standardParse(f.schema, "F")).toBe("F")
  await expect(standardParse(f.schema, "X")).rejects.toThrow()
})

test("list field issues for invalid value", async () => {
  const f = list("gender", ["M", "F"])
  const result = await standardSafeParse(f.schema, "X")
  expect(result.success).toBe(false)
})

test("choice field is nullable by default", () => {
  const f = choice("statuscode", { 1: "Active", 2: "Inactive", 3: "Archived" })
  expect(f.type).toBe("choice")
  expect(f.kind).toBe("value")
  expect(f.logicalName).toBe("statuscode")
  expect(f.getDefault()).toBeNull()
  expect(f.transformValueFromDataverse(null)).toBeNull()
})

test("system choice folds null into its default", () => {
  const f = choice("statuscode", { 1: "Active", 2: "Inactive", 3: "Archived" }, { system: true })
  expect(f.getDefault()).toBe("Active")
  expect(() => f.transformValueFromDataverse(null)).toThrow("non-nullable")
})

test("choice transformValueFromDataverse maps number to string", () => {
  const f = choice("statuscode", { 1: "Active", 2: "Inactive", 3: "Archived" })
  expect(f.transformValueFromDataverse(1)).toBe("Active")
  expect(f.transformValueFromDataverse(2)).toBe("Inactive")
  expect(f.transformValueFromDataverse(3)).toBe("Archived")
})

test("choice transformValueToDataverse maps string to number", () => {
  const f = choice("statuscode", { 1: "Active", 2: "Inactive", 3: "Archived" })
  expect(f.transformValueToDataverse("Active")).toBe(1)
  expect(f.transformValueToDataverse("Inactive")).toBe(2)
  expect(f.transformValueToDataverse("Archived")).toBe(3)
})

test("choice validates against option values", async () => {
  const f = choice("statuscode", { 1: "Active", 2: "Inactive" }, { required: true })
  expect(await standardParse(f.schema, "Active")).toBe("Active")
  expect(await standardParse(f.schema, "Inactive")).toBe("Inactive")
  await expect(standardParse(f.schema, "Unknown" as any)).rejects.toThrow()
})

test("choice issues for invalid value", async () => {
  const f = choice("statuscode", { 1: "Active", 2: "Inactive" }, { required: true })
  const result = await standardSafeParse(f.schema, "Bogus")
  expect(result.success).toBe(false)
})

test("nullable choice default handles null", () => {
  const f = choice("prioritycode", { 1: "Low", 2: "High" })
  expect(f.transformValueFromDataverse(null)).toBeNull()
})

// --- Dynamic choice (no choices provided) ---

test("untyped choice is exactly a number field", () => {
  const f = choice("statuscode")
  expect(f.type).toBe("number")
  expect(f.kind).toBe("value")
  expect(f.getDefault()).toBeNull()
  expect(f.transformValueFromDataverse(null)).toBeNull()
  expect(f.transformValueFromDataverse(900004)).toBe(900004)
  expect(f.transformValueToDataverse(900004)).toBe(900004)
})

test("untyped choice rejects non-numeric payloads like number()", () => {
  const f = choice("statuscode", { required: true })
  expect(() => f.transformValueFromDataverse("Active")).toThrow("Invalid number value: Active")
  expect(f.transformValueToDataverse("Active" as any)).toBe("Active") // writes pass through to the API
})

test("dynamic choice validates numbers only", async () => {
  const f = choice("statuscode", { required: true })
  expect(await standardParse(f.schema, 1)).toBe(1)
  await expect(standardParse(f.schema, 1)).resolves.toBe(1)
  const result = await standardSafeParse(f.schema, "Bogus")
  expect(result.success).toBe(false)
})

test("required dynamic choice is validation-only; nullable default stays null", () => {
  const f = choice("statuscode", { required: true })
  expect(f.getDefault()).toBeNull()
})

test("system dynamic choice is singleton non-null: null fails fast", () => {
  const f = choice("statuscode", { system: true })
  expect(f.getDefault()).toBe(0)
  expect(() => f.transformValueFromDataverse(null)).toThrow("non-nullable")
})

test("nullable dynamic choice passes raw values through", () => {
  const f = choice("statuscode")
  expect(f.getDefault()).toBeNull()
  expect(f.transformValueFromDataverse(null)).toBeNull()
  expect(f.transformValueFromDataverse(900004)).toBe(900004)
  expect(f.transformValueToDataverse(900004)).toBe(900004)
})

test("dynamic multiChoice reads CSV as numbers and writes CSV", () => {
  const f = multiChoice("nnsyc200_months", { required: true })
  expect(f.type).toBe("dynamicMultiChoice")
  expect(f.transformValueFromDataverse("3,4,5")).toEqual([3, 4, 5])
  expect(f.transformValueFromDataverse(null)).toEqual([])
  expect(f.transformValueToDataverse([3, 4, 5])).toBe("3,4,5")
  expect(f.transformValueToDataverse([])).toBeNull()
  expect(() => f.transformValueFromDataverse("3,west")).toThrow("Invalid multi-choice value")
  expect(() => f.transformValueToDataverse("nope" as any)).toThrow("requires an array")
})

test("dynamic multiChoice handles null", () => {
  const f = multiChoice("nnsyc200_months")
  expect(f.transformValueFromDataverse(null)).toEqual([])
  expect(f.transformValueFromDataverse("3,4")).toEqual([3, 4])
})
test("nullableChoice transformValueFromDataverse maps number to string", () => {
  const f = choice("prioritycode", { 1: "Low", 2: "High" })
  expect(f.transformValueFromDataverse(1)).toBe("Low")
  expect(f.transformValueFromDataverse(2)).toBe("High")
})

test("nullableChoice transformValueToDataverse handles null", () => {
  const f = choice("prioritycode", { 1: "Low", 2: "High" })
  expect(f.transformValueToDataverse(null)).toBeNull()
})

test("nullableChoice transformValueToDataverse maps string to number", () => {
  const f = choice("prioritycode", { 1: "Low", 2: "High" })
  expect(f.transformValueToDataverse("Low")).toBe(1)
  expect(f.transformValueToDataverse("High")).toBe(2)
})

test("image field type", () => {
  const f = image("profilepic")
  expect(f.type).toBe("image")
  expect(f.kind).toBe("value")
  expect(f.getReadOnly()).toBe(false)
  expect(f.getDefault()).toBeNull()
})

test("file field uses _name suffix and returns FileRef", () => {
  const f = file("document")
  expect(f.type).toBe("file")
  expect(f.kind).toBe("value")
  expect(f.fromDataverseName).toBe("document_name")
  expect(f.getReadOnly()).toBe(false)
  expect(f.getDefault()).toBeNull()
  expect(f.transformValueFromDataverse("report.pdf")).toEqual({ name: "report.pdf" })
  expect(f.transformValueFromDataverse(null)).toBeNull()
})

test("file field transformValueToDataverse always skips", async () => {
  const f = file("document")
  expect(f.transformValueToDataverse()).toBe(SKIP)
  expect(await f.transformValueToDataverse({ name: "f.pdf", data: new Blob(["x"]) })).toBe(SKIP)
})

test("file field schema preserves upload data and URL", async () => {
  const f = file("document")
  const data = new Blob(["contents"], { type: "text/plain" })
  const result = await standardParse(f.schema, { name: "report.txt", url: "/download", data })
  expect(result).toEqual({ name: "report.txt", url: "/download", data })
})

test("formatted field uses Display.V1.FormattedValue suffix", () => {
  const f = formatted("fullname")
  expect(f.type).toBe("formatted")
  expect(f.fromDataverseName).toBe("fullname@OData.Community.Display.V1.FormattedValue")
  expect(f.getReadOnly()).toBe(true)
})

test("string transformValueFromDataverse folds null into its default", () => {
  const f = string("name")
  expect(f.transformValueFromDataverse(null)).toBe("")
  expect(f.transformValueFromDataverse("Hello")).toBe("Hello")
})

test("number transformValueFromDataverse passes null through", () => {
  const f = number("age")
  expect(f.transformValueFromDataverse(null)).toBeNull()
  expect(f.transformValueFromDataverse(42)).toBe(42)
})

test("boolean transformValueFromDataverse passes through", () => {
  const f = boolean("active")
  expect(f.transformValueFromDataverse(true)).toBe(true)
  expect(f.transformValueFromDataverse(false)).toBe(false)
})

test("default option sets default value", () => {
  const f = string("name", { default: "Default Name" })
  expect(f.getDefault()).toBe("Default Name")
})

test("readonly option marks field as read-only", () => {
  const f = string("name", { readonly: true })
  expect(f.getReadOnly()).toBe(true)
})

test("field without readonly option is not read-only", () => {
  const f = string("name")
  expect(f.getReadOnly()).toBe(false)
})

test("required validator via valibot schema", async () => {
  const f = string("name")
  f.schema = v.pipe(v.string(), v.check(v => v.length > 0, "Required"))
  const result = await standardSafeParse(f.schema, "")
  expect(result.success).toBe(false)
  if (!result.success) {
    expect(result.issues[0].message).toBe("Required")
  }
  const result2 = await standardSafeParse(f.schema, "x")
  expect(result2.success).toBe(true)
})

test("required validator passes for non-empty", async () => {
  const f = string("name")
  f.schema = v.pipe(v.string(), v.check(v => v.length > 0, "Required"))
  const result = await standardSafeParse(f.schema, "John")
  expect(result.success).toBe(true)
})

test("validate returns success for valid values via valibot", async () => {
  const f = string("name")
  const result = await standardSafeParse(f.schema, "hello")
  expect(result.success).toBe(true)
  if (result.success) {
    expect(result.value).toBe("hello")
  }
})

test("validate returns issues for invalid values via valibot", async () => {
  const f = number("age")
  const result = await standardSafeParse(f.schema, "not-a-number")
  expect(result.success).toBe(false)
})

test("parse returns value for valid via valibot", async () => {
  const f = string("name")
  expect(await standardParse(f.schema, "hello")).toBe("hello")
})

test("parse throws for invalid via valibot", async () => {
  const f = number("age")
  await expect(standardParse(f.schema, "bad" as any)).rejects.toThrow()
})

test("StandardSchemaV1 ~standard props via field schema", async () => {
  const f = string("name")
  const standard = f.schema["~standard"]
  expect(standard.version).toBe(1)
  expect(standard.vendor).toBe("dataverse-schema")
  const result = await standard.validate("test")
  expect("issues" in result ? result.issues : []).toHaveLength(0)
})

test("field accepts a non-valibot Standard Schema and the table composes it", async () => {
  // A hand-rolled Standard Schema V1 (mimicking e.g. Zod/ArkType) that only
  // accepts the literal "ok". It is NOT a valibot schema.
  const customStandardSchema = {
    "~standard": {
      version: 1 as const,
      vendor: "test-schema",
      validate(value: unknown) {
        return value === "ok"
          ? { value: "ok" as const }
          : { issues: [{ message: "must be 'ok'" }] }
      },
    },
  }

  const f = string("name", { schema: customStandardSchema as any })
  expect(f.schema["~standard"].vendor).toBe("test-schema")

  // The composed table schema validates through each field's own schema,
  // including the non-valibot one — proving composing is library-agnostic.
  const t = new DataverseTable({
    client: testClient, entitySetName: "accounts", logicalName: "account",
    fields: { id: primaryKey("accountid"), name: f },
  })
  const ok = await standardSafeParse(t.schema, { id: "123e4567-e89b-12d3-a456-426614174000", name: "ok" })
  expect(ok.success).toBe(true)
  const bad = await standardSafeParse(t.schema, { id: "123e4567-e89b-12d3-a456-426614174000", name: "nope" })
  expect(bad.success).toBe(false)
  if (!bad.success) expect(bad.issues[0].message).toBe("must be 'ok'")
})

test("async Standard Schemas are supported through the composed table schema", async () => {
  const asyncSchema = {
    "~standard": {
      version: 1 as const,
      vendor: "async-schema",
      async validate(value: unknown) {
        return typeof value === "number" && value > 0
          ? { value: value as number }
          : { issues: [{ message: "must be positive" }] }
      },
    },
  }
  const t = new DataverseTable({
    client: testClient, entitySetName: "accounts", logicalName: "account",
    fields: { id: primaryKey("accountid"), age: number("age", { schema: asyncSchema as any }) },
  })
  const ok = await standardSafeParse(t.schema, { id: "123e4567-e89b-12d3-a456-426614174000", age: 5 })
  expect(ok.success).toBe(true)
  const bad = await standardSafeParse(t.schema, { id: "123e4567-e89b-12d3-a456-426614174000", age: -1 })
  expect(bad.success).toBe(false)
  if (!bad.success) expect(bad.issues[0].message).toBe("must be positive")
})

test("required option rejects null, undefined, and empty strings", async () => {
  const f = string("name", { required: true })
  const missing = await standardSafeParse(f.schema, null)
  expect(missing.success).toBe(false)
  if (!missing.success) expect(missing.issues[0].message).toBe("Value is required")
  const undef = await standardSafeParse(f.schema, undefined)
  expect(undef.success).toBe(false)
  expect(await standardSafeParse(f.schema, "")).toEqual({ success: false, issues: [{ message: "Value is required" }] })
  expect(await standardSafeParse(f.schema, "   ")).toEqual({ success: false, issues: [{ message: "Value is required" }] })
  expect(await standardSafeParse(f.schema, "Jane")).toEqual({ success: true, value: "Jane" })
})

test("required option composes into the table schema", async () => {
  const t = new DataverseTable({
    client: testClient, entitySetName: "accounts", logicalName: "account",
    fields: { id: primaryKey("accountid"), name: string("name", { required: true }) },
  })
  const bad = await standardSafeParse(t.schema, { id: "123e4567-e89b-12d3-a456-426614174000", name: null })
  expect(bad.success).toBe(false)
  if (!bad.success) {
    expect(bad.issues[0].message).toBe("Value is required")
    expect(bad.issues[0].path?.map((seg) => typeof seg === "object" ? seg.key : seg)).toContain("name")
  }
  const good = await standardSafeParse(t.schema, { id: "123e4567-e89b-12d3-a456-426614174000", name: "Acme" })
  expect(good.success).toBe(true)
})

test("schema option does not change a field default or transforms", () => {
  const f = string("name", { schema: v.pipe(v.string(), v.check(v => v.length >= 0, "Required")) })
  expect(f.getDefault()).toBe("")
  expect(f.transformValueFromDataverse(null)).toBe("")
})

test("string transformValueToDataverse passes through", () => {
  const f = string("name")
  expect(f.transformValueToDataverse("hello")).toBe("hello")
})

test("number transformValueToDataverse passes through", () => {
  const f = number("age")
  expect(f.transformValueToDataverse(42)).toBe(42)
})

test("boolean transformValueToDataverse passes through", () => {
  const f = boolean("active")
  expect(f.transformValueToDataverse(true)).toBe(true)
})

test("lookupId property uses _value suffix for fromDataverseName", () => {
  const f = lookupId("primarycontact", () => testRefTable)
  expect(f.type).toBe("lookupId")
  expect(f.kind).toBe("navigation")
  expect(f.fromDataverseName).toBe("_primarycontact_value")
})

test("lookupId toDataverseName uses @odata.bind", () => {
  const f = lookupId("primarycontact", () => testRefTable)
  expect(f.toDataverseName).toBe("primarycontact@odata.bind")
})

test("lookupId transformValueToDataverse returns entity set reference", () => {
  const f = lookupId("primarycontact", () => testRefTable)
  expect(f.transformValueToDataverse("some-guid")).toBe("contacts(some-guid)")
  expect(f.transformValueToDataverse(null)).toBeNull()
})

test("collectionIds has type collectionIds", () => {
  const f = collectionIds("contact_ids", () => testRefTable)
  expect(f.type).toBe("collectionIds")
  expect(f.kind).toBe("navigation")
})

test("lookup has type lookup", () => {
  const f = lookup("primarycontact", () => testRefTable)
  expect(f.type).toBe("lookup")
  expect(f.kind).toBe("navigation")
})

test("collection has type collection", () => {
  const f = collection("contact_list", () => testRefTable)
  expect(f.type).toBe("collection")
  expect(f.kind).toBe("navigation")
})

test("validation works with valibot pipe", async () => {
  const f = string("name")
  f.schema = v.pipe(
    v.string(),
    v.check(v => v.length > 0, "Required"),
    v.check(v => v.length >= 2, "Too short"),
  )
  const result1 = await standardSafeParse(f.schema, "")
  expect(result1.success).toBe(false)
  if (!result1.success) expect(result1.issues[0].message).toBe("Required")

  const result2 = await standardSafeParse(f.schema, "A")
  expect(result2.success).toBe(false)
  if (!result2.success) expect(result2.issues[0].message).toBe("Too short")

  const result3 = await standardSafeParse(f.schema, "Alice")
  expect(result3.success).toBe(true)
})

test("multiChoice writes null/empty as null to clear the column", () => {
  const f = multiChoice("nnsyc200_months", { 1: "Jan", 2: "Feb" })
  expect(f.transformValueToDataverse(null)).toBeNull()
  expect(f.transformValueToDataverse(undefined)).toBeNull()
  expect(f.transformValueToDataverse([])).toBeNull()
})

test("multiChoice accepts Record value-to-label definitions", () => {
  const f = multiChoice("nnsyc200_months", { 1: "Jan", 2: "Feb" })
  expect(f.choices).toEqual({ 1: "Jan", 2: "Feb" })
  expect(f.labels).toEqual(["Jan","Feb"])
})

test("multiChoice schema validates parsed arrays", async () => {
  const f = multiChoice("nnsyc200_months", { 1: "Jan", 2: "Feb" })
  expect(await standardParse(f.schema, ["Jan"])).toEqual(["Jan"])
  await expect(standardParse(f.schema, ["nope"] as any)).rejects.toThrow()
})

test("multiChoice schema rejects values outside the choice set", async () => {
  const f = multiChoice("nnsyc200_months", { 1: "Jan", 2: "Feb" })
  const result = await standardSafeParse(f.schema, ["Jan", "Oct"])
  expect(result.success).toBe(false)
})

test("required multiChoice getDefault returns independent empty arrays", () => {
  const f = multiChoice("nnsyc200_months", { 1: "Jan", 2: "Feb" }, { required: true })
  const a = f.getDefault()
  const b = f.getDefault()
  expect(a).toEqual([])
  expect(a).not.toBe(b)
})

test("system number coerces numeric FetchXML strings and fails fast on null", () => {
  const f = number("age", { system: true });

  expect(f.transformValueFromDataverse("42")).toBe(42);
  expect(f.transformValueFromDataverse("38.5")).toBe(38.5);

  expect(() => f.transformValueFromDataverse(null)).toThrow("non-nullable");
  expect(() => f.transformValueFromDataverse(undefined)).toThrow("non-nullable");

  expect(() => f.transformValueFromDataverse("junk")).toThrow(
    "Invalid number value: junk",
  );
});

test("nullable number coerces numeric strings and preserves missing Dataverse values", () => {
  const f = number("score");

  expect(f.transformValueFromDataverse("7")).toBe(7);
  expect(f.transformValueFromDataverse("38.5")).toBe(38.5);

  expect(f.transformValueFromDataverse(null)).toBeNull();
  expect(f.transformValueFromDataverse(undefined)).toBeNull();

  expect(() => f.transformValueFromDataverse("junk")).toThrow(
    "Invalid number value: junk",
  );
});

test("number default option is the local default for new records", () => {
  const f = number("score", { default: 100 });

  // Used for new local records.
  expect(f.getDefault()).toBe(100);

  // Server null remains distinguishable.
  expect(f.transformValueFromDataverse(null)).toBeNull();
  expect(f.transformValueFromDataverse(undefined)).toBeNull();
});

test("boolean field coerces stringly true/false", () => {
  expect(boolean("active", { required: true }).transformValueFromDataverse("true")).toBe(true)
  expect(boolean("active", { required: true }).transformValueFromDataverse("False")).toBe(false)
  expect(boolean("flag").transformValueFromDataverse("true")).toBe(true)
  expect(boolean("flag").transformValueFromDataverse(null)).toBe(false)
})

// --- Choice choices accessor ---

test("choice exposes frozen labels via choices", () => {
  const f = choice("statuscode", { 1: "Active", 2: "Inactive" }, { required: true })
  expect(f.labels).toEqual(["Active", "Inactive"])
  expect(Object.isFrozen(f.choices))
})

test("nullable choice exposes frozen labels via choices", () => {
  const f = choice("prioritycode", { 1: "Low", 2: "High" })
  expect(f.labels).toEqual(["Low", "High"])
  expect(Object.isFrozen(f.choices))
})

// --- Date write ---

test("date transformValueToDataverse throws for null (writes need an explicit value)", () => {
  const f = date("birthdate")
  expect(() => f.transformValueToDataverse(null)).toThrow("Invalid date value")
})

test("date transformValueToDataverse throws for non-date values", () => {
  const f = date("birthdate")
  expect(() => f.transformValueToDataverse("2024-01-01" as any)).toThrow("Invalid date value")
})

// --- JsonField options form ---

test("json accepts schema via options and validates parsed values", async () => {
  const Address = v.object({ street: v.string(), city: v.string() })
  const f = json("address_data", { schema: Address })
  expect(await f.transformValueFromDataverse('{"street":"Main","city":"Springfield"}')).toEqual({ street: "Main", city: "Springfield" })
  expect(await f.transformValueFromDataverse(null)).toBeUndefined()
})

test("json supports default and readonly options", async () => {
  const Address = v.object({ street: v.string() })
  const f = json("address_data", { schema: Address, default: { street: "Main" }, readonly: true })
  expect(f.getDefault()).toEqual({ street: "Main" })
  expect(f.getReadOnly()).toBe(true)
  expect(await f.transformValueToDataverse({ street: "Oak" })).toBe("{\"street\":\"Oak\"}")
})

// --- Navigation factory options ---

test("navigation factories pass options through to the property", () => {
  const c = collection("contact_list", () => testRefTable, { readonly: true, default: [] as any[] })
  expect(c.getReadOnly()).toBe(true)

  const l = lookup("primary_contact", () => testRefTable, { readonly: true })
  expect(l.getReadOnly()).toBe(true)

  const li = lookupId("primary_contact_id", () => testRefTable, { readonly: true })
  expect(li.getReadOnly()).toBe(true)

  const ci = collectionIds("contact_ids", () => testRefTable, { readonly: true })
  expect(ci.getReadOnly()).toBe(true)
})
