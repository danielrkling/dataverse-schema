import { expect, test } from "vitest"
import {
  string, nullableString, number, nullableNumber, boolean, primaryKey,
  datetime, nullableDateTime, date, nullableDate, list, image, file, formatted,
  collection, collectionIds, lookupId, lookup, table,
} from "../src"
import { required } from "../src/validators"
import { DataverseClient } from "../src/client"

const testClient = new DataverseClient({ url: "https://test.crm.dynamics.com" })
const testRefTable = table(testClient, "contacts", { id: primaryKey("contactid") })

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
  expect(f.parse("M")).toBe("M")
  expect(f.parse("F")).toBe("F")
  expect(() => f.parse("X")).toThrow()
})

test("list field issues for invalid value", () => {
  const f = list("gender", ["M", "F"])
  const issues = f.getIssues("X")
  expect(issues).toHaveLength(1)
  expect(issues[0].message).toContain("not in")
})

test("image field type", () => {
  const f = image("profilepic")
  expect(f.type).toBe("image")
  expect(f.getDefault()).toBeNull()
})

test("file field uses _name suffix", () => {
  const f = file("document")
  expect(f.type).toBe("file")
  expect(f.fromDataverseName).toBe("document_name")
  expect(f.getReadOnly()).toBe(true)
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

test("setDefault changes default value", () => {
  const f = string("name").setDefault("Default Name")
  expect(f.getDefault()).toBe("Default Name")
})

test("setReadOnly marks field as read-only", () => {
  const f = string("name").setReadOnly(true)
  expect(f.getReadOnly()).toBe(true)
  f.setReadOnly(false)
  expect(f.getReadOnly()).toBe(false)
})

test("required validator returns message for null", () => {
  const f = nullableString("name").check(required())
  const issues = f.getIssues(null)
  expect(issues).toHaveLength(1)
  expect(issues[0].message).toBe("Required")
  // empty string should pass required (it's a valid non-null value)
  const issues2 = f.getIssues("")
  expect(issues2).toHaveLength(0)
})

test("required validator passes for non-empty", () => {
  const f = string("name").check(required())
  const issues = f.getIssues("John")
  expect(issues).toHaveLength(0)
})

test("validate returns success for valid values", () => {
  const f = string("name")
  const result = f.validate("hello")
  expect("value" in result ? result.value : undefined).toBe("hello")
  expect(result.issues).toBeUndefined()
})

test("validate returns issues for invalid values", () => {
  const f = number("age")
  const result = f.validate("not-a-number" as any)
  expect(result.issues).toBeDefined()
})

test("parse returns value for valid", () => {
  const f = string("name")
  expect(f.parse("hello")).toBe("hello")
})

test("parse throws for invalid", () => {
  const f = number("age")
  expect(() => f.parse("bad" as any)).toThrow()
})

test("StandardSchemaV1 ~standard props", async () => {
  const f = string("name")
  const standard = f["~standard"]
  expect(standard.version).toBe(1)
  expect(standard.vendor).toBe("dataverse-schema")
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

test("validation works with multiple validators", () => {
  const f = nullableString("name")
    .check(required())
    .check((v) => v && v.length < 2 ? "Too short" : undefined)
  const issues = f.getIssues(null)
  expect(issues).toHaveLength(1)
  expect(issues[0].message).toBe("Required")
  const issues2 = f.getIssues("A")
  expect(issues2).toHaveLength(1)
  expect(issues2[0].message).toBe("Too short")
  const issues3 = f.getIssues("Alice")
  expect(issues3).toHaveLength(0)
})
