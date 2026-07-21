import { expect, test } from "vitest"
import * as v from "valibot"
import {
  string, nullableString, number, nullableNumber, boolean, primaryKey,
  datetime, nullableDateTime, date, nullableDate, list, image, file, formatted,
  collection, collectionIds, lookupId, lookup, DataverseTable,
  choice, nullableChoice,
} from "../src"
import { DataverseClient } from "../src/client"

const testClient = new DataverseClient({ url: "https://test.crm.dynamics.com" })
const testRefTable = new DataverseTable({ client: testClient, entitySetName: "contacts", logicalName: "contacts", fields: { id: primaryKey("contactid") } })

test("string field type and defaults", () => {
  const f = string("fullname")
  expect(f.type).toBe("string")
  expect(f.kind).toBe("value")
  expect(f.name).toBe("fullname")
  expect(f.getDefault()).toBe("")
})

test("nullableString field defaults to null", () => {
  const f = nullableString("nickname")
  expect(f.getDefault()).toBeNull()
})

test("number field type and defaults", () => {
  const f = number("age")
  expect(f.type).toBe("number")
  expect(f.getDefault()).toBe(0)
})

test("nullableNumber field defaults to null", () => {
  const f = nullableNumber("score")
  expect(f.getDefault()).toBeNull()
})

test("boolean field defaults to false", () => {
  const f = boolean("active")
  expect(f.getDefault()).toBe(false)
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

test("datetime field defaults to Date", () => {
  const f = datetime("createdon")
  expect(f.getDefault()).toBeInstanceOf(Date)
})

test("datetime transformValueFromDataverse converts string to Date", () => {
  const f = datetime("createdon")
  const result = f.transformValueFromDataverse("2024-01-15T10:30:00Z")
  expect(result).toBeInstanceOf(Date)
  expect(result.getFullYear()).toBe(2024)
})

test("datetime transformValueFromDataverse handles null", () => {
  const f = datetime("createdon")
  const result = f.transformValueFromDataverse(null)
  expect(result).toBeInstanceOf(Date)
})

test("nullableDateTime field defaults to null", () => {
  const f = nullableDateTime("deletedon")
  expect(f.getDefault()).toBeNull()
})

test("nullableDateTime transformValueFromDataverse returns null for null input", () => {
  const f = nullableDateTime("deletedon")
  expect(f.transformValueFromDataverse(null)).toBeNull()
})

test("date field parses date-only strings", () => {
  const f = date("birthdate")
  expect(f.type).toBe("dateOnly")
  const result = f.transformValueFromDataverse("2024-01-15")
  expect(result).toBeInstanceOf(Date)
  expect(result.getMonth()).toBe(0)
  expect(result.getDate()).toBe(15)
})

test("date field transformValueToDataverse formats as date-only", () => {
  const f = date("birthdate")
  const result = f.transformValueToDataverse(new Date(2024, 0, 15))
  expect(result).toBe("2024-01-15")
})

test("date field handles null input", () => {
  const f = date("birthdate")
  const result = f.transformValueFromDataverse(null)
  expect(result).toBeInstanceOf(Date)
})

test("nullableDate field defaults to null", () => {
  const f = nullableDate("birthdate")
  expect(f.getDefault()).toBeNull()
})

test("nullableDate transformValueFromDataverse returns null for null", () => {
  const f = nullableDate("birthdate")
  expect(f.transformValueFromDataverse(null)).toBeNull()
})

test("list field validates against choices", () => {
  const f = list("gender", ["M", "F"] as const)
  expect(f.type).toBe("list")
  expect(f.getDefault()).toBeNull()
  expect(v.parse(f.schema, "M")).toBe("M")
  expect(v.parse(f.schema, "F")).toBe("F")
  expect(() => v.parse(f.schema, "X")).toThrow()
})

test("list field issues for invalid value", () => {
  const f = list("gender", ["M", "F"])
  const result = v.safeParse(f.schema, "X")
  expect(result.success).toBe(false)
})

test("choice field type and defaults", () => {
  const f = choice("statuscode", { 1: "Active", 2: "Inactive", 3: "Archived" })
  expect(f.type).toBe("choice")
  expect(f.kind).toBe("value")
  expect(f.name).toBe("statuscode")
  expect(f.getDefault()).toBe("Active")
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

test("choice validates against option values", () => {
  const f = choice("statuscode", { 1: "Active", 2: "Inactive" })
  expect(v.parse(f.schema, "Active")).toBe("Active")
  expect(v.parse(f.schema, "Inactive")).toBe("Inactive")
  expect(() => v.parse(f.schema, "Unknown" as any)).toThrow()
})

test("choice issues for invalid value", () => {
  const f = choice("statuscode", { 1: "Active", 2: "Inactive" })
  const result = v.safeParse(f.schema, "Bogus")
  expect(result.success).toBe(false)
})

test("nullableChoice field defaults to null", () => {
  const f = nullableChoice("prioritycode", { 1: "Low", 2: "High" })
  expect(f.type).toBe("choice")
  expect(f.getDefault()).toBeNull()
})

test("nullableChoice transformValueFromDataverse handles null", () => {
  const f = nullableChoice("prioritycode", { 1: "Low", 2: "High" })
  expect(f.transformValueFromDataverse(null)).toBeNull()
})

test("nullableChoice transformValueFromDataverse maps number to string", () => {
  const f = nullableChoice("prioritycode", { 1: "Low", 2: "High" })
  expect(f.transformValueFromDataverse(1)).toBe("Low")
  expect(f.transformValueFromDataverse(2)).toBe("High")
})

test("nullableChoice transformValueToDataverse handles null", () => {
  const f = nullableChoice("prioritycode", { 1: "Low", 2: "High" })
  expect(f.transformValueToDataverse(null)).toBeNull()
})

test("nullableChoice transformValueToDataverse maps string to number", () => {
  const f = nullableChoice("prioritycode", { 1: "Low", 2: "High" })
  expect(f.transformValueToDataverse("Low")).toBe(1)
  expect(f.transformValueToDataverse("High")).toBe(2)
})

test("image field type", () => {
  const f = image("profilepic")
  expect(f.type).toBe("image")
  expect(f.kind).toBe("image")
  expect(f.getReadOnly()).toBe(false)
  expect(f.getDefault()).toBeNull()
})

test("file field uses _name suffix and returns FileRef", () => {
  const f = file("document")
  expect(f.type).toBe("file")
  expect(f.fromDataverseName).toBe("document_name")
  expect(f.getReadOnly()).toBe(true)
  expect(f.getDefault()).toBeNull()
  expect(f.transformValueFromDataverse("report.pdf")).toEqual({ name: "report.pdf" })
  expect(f.transformValueFromDataverse(null)).toBeNull()
})

test("formatted field uses Display.V1.FormattedValue suffix", () => {
  const f = formatted("fullname")
  expect(f.type).toBe("formatted")
  expect(f.fromDataverseName).toBe("fullname@OData.Community.Display.V1.FormattedValue")
  expect(f.getReadOnly()).toBe(true)
})

test("string transformValueFromDataverse handles null", () => {
  const f = string("name")
  expect(f.transformValueFromDataverse(null)).toBe("")
  expect(f.transformValueFromDataverse("Hello")).toBe("Hello")
})

test("number transformValueFromDataverse handles null", () => {
  const f = number("age")
  expect(f.transformValueFromDataverse(null)).toBe(0)
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

test("required validator via valibot schema", () => {
  const f = nullableString("name")
  f.schema = v.pipe(v.nullable(v.string()), v.check(v => v != null, "Required"))
  const result = v.safeParse(f.schema, null)
  expect(result.success).toBe(false)
  if (!result.success) {
    expect(result.issues[0].message).toBe("Required")
  }
  const result2 = v.safeParse(f.schema, "")
  expect(result2.success).toBe(true)
})

test("required validator passes for non-empty", () => {
  const f = string("name")
  f.schema = v.pipe(v.string(), v.check(v => v.length > 0, "Required"))
  const result = v.safeParse(f.schema, "John")
  expect(result.success).toBe(true)
})

test("validate returns success for valid values via valibot", () => {
  const f = string("name")
  const result = v.safeParse(f.schema, "hello")
  expect(result.success).toBe(true)
  if (result.success) {
    expect(result.output).toBe("hello")
  }
})

test("validate returns issues for invalid values via valibot", () => {
  const f = number("age")
  const result = v.safeParse(f.schema, "not-a-number")
  expect(result.success).toBe(false)
})

test("parse returns value for valid via valibot", () => {
  const f = string("name")
  expect(v.parse(f.schema, "hello")).toBe("hello")
})

test("parse throws for invalid via valibot", () => {
  const f = number("age")
  expect(() => v.parse(f.schema, "bad" as any)).toThrow()
})

test("StandardSchemaV1 ~standard props via field schema", async () => {
  const f = string("name")
  const standard = f.schema["~standard"]
  expect(standard.version).toBe(1)
  expect(standard.vendor).toBe("valibot")
  const result = await standard.validate("test")
  expect("issues" in result ? result.issues : []).toHaveLength(0)
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

test("validation works with valibot pipe", () => {
  const f = nullableString("name")
  f.schema = v.pipe(
    v.nullable(v.string()),
    v.check(v => v != null, "Required"),
    v.check(v => v == null || v.length >= 2, "Too short"),
  )
  const result1 = v.safeParse(f.schema, null)
  expect(result1.success).toBe(false)
  if (!result1.success) expect(result1.issues[0].message).toBe("Required")

  const result2 = v.safeParse(f.schema, "A")
  expect(result2.success).toBe(false)
  if (!result2.success) expect(result2.issues[0].message).toBe("Too short")

  const result3 = v.safeParse(f.schema, "Alice")
  expect(result3.success).toBe(true)
})
