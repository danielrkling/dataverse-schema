import { expect, test } from "vitest"
import * as v from "valibot"
import {
  string, nullableString, number, nullableNumber, boolean, nullableBoolean, primaryKey,
  datetime, nullableDateTime, date, nullableDate, list, image, file, formatted, multiChoice,
  collection, collectionIds, lookupId, lookup, DataverseTable,
  choice, nullableChoice, SKIP, json,
} from "../src"
import { DataverseClient } from "../src/client"

const testClient = new DataverseClient({ url: "https://test.crm.dynamics.com" })
const testRefTable = new DataverseTable({ client: testClient, entitySetName: "contacts", logicalName: "contacts", fields: { id: primaryKey("contactid") } })

test("string field type and defaults", () => {
  const f = string("fullname")
  expect(f.type).toBe("string")
  expect(f.kind).toBe("value")
  expect(f.logicalName).toBe("fullname")
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

test("boolean field normalizes null to false", () => {
  expect(boolean("active").transformValueFromDataverse(null)).toBe(false)
})

test("nullableBoolean field defaults to null and preserves null", () => {
  const f = nullableBoolean("active")
  expect(f.getDefault()).toBeNull()
  expect(f.transformValueFromDataverse(null)).toBeNull()
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

test("datetime transformValueFromDataverse folds null and absent into the default", () => {
  const f = datetime("createdon")
  expect(f.transformValueFromDataverse(null)).toBeInstanceOf(Date)
  expect(f.transformValueFromDataverse(undefined)).toBeInstanceOf(Date)
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

test("date field folds null and absent into the default", () => {
  const f = date("birthdate")
  expect(f.transformValueFromDataverse(null)).toBeInstanceOf(Date)
  expect(f.transformValueFromDataverse(undefined)).toBeInstanceOf(Date)
})

test("date getDefault returns a fresh date each call", () => {
  const f = date("birthdate")
  expect(f.getDefault()).toBeInstanceOf(Date)
  expect(f.getDefault()).not.toBe(f.getDefault())
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
  expect(f.logicalName).toBe("statuscode")
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

test("file field schema preserves upload data and URL", () => {
  const f = file("document")
  const data = new Blob(["contents"], { type: "text/plain" })
  const result = v.parse(f.schema, { name: "report.txt", url: "/download", data })
  expect(result).toEqual({ name: "report.txt", url: "/download", data })
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

test("multiChoice reads CSV strings as number arrays", () => {
  const f = multiChoice("nnsyc200_months", [1, 2, 3])
  expect(f.type).toBe("multiChoice")
  expect(f.kind).toBe("value")
  expect(f.fromDataverseName).toBe("nnsyc200_months")
  expect(f.transformValueFromDataverse("3,4,5")).toEqual([3, 4, 5])
  expect(f.transformValueFromDataverse("3, 4")).toEqual([3, 4])
  expect(f.transformValueFromDataverse(null)).toEqual([])
  expect(f.transformValueFromDataverse(undefined)).toEqual([])
  expect(f.transformValueFromDataverse("")).toEqual([])
})

test("multiChoice writes number arrays as CSV", () => {
  const f = multiChoice("nnsyc200_months", [1, 2, 3])
  expect(f.transformValueToDataverse([3, 4, 5])).toBe("3,4,5")
  expect(f.transformValueToDataverse(7)).toBe("7")
})

test("multiChoice writes null/empty as null to clear the column", () => {
  const f = multiChoice("nnsyc200_months", [1, 2, 3])
  expect(f.transformValueToDataverse(null)).toBeNull()
  expect(f.transformValueToDataverse(undefined)).toBeNull()
  expect(f.transformValueToDataverse([])).toBeNull()
})

test("multiChoice accepts Record value-to-label definitions", () => {
  const f = multiChoice("nnsyc200_months", { 1: "Jan", 2: "Feb" })
  expect(f.choices).toEqual([1, 2])
})

test("multiChoice schema validates parsed arrays", () => {
  const f = multiChoice("nnsyc200_months", [1, 2, 3])
  expect(v.parse(f.schema, [1, 2])).toEqual([1, 2])
  expect(() => v.parse(f.schema, ["nope"] as any)).toThrow()
})

test("multiChoice schema rejects values outside the choice set", () => {
  const f = multiChoice("nnsyc200_months", [1, 2, 3])
  const result = v.safeParse(f.schema, [1, 9])
  expect(result.success).toBe(false)
})

test("multiChoice getDefault returns independent empty arrays", () => {
  const f = multiChoice("nnsyc200_months", [1, 2, 3])
  const a = f.getDefault()
  const b = f.getDefault()
  expect(a).toEqual([])
  expect(a).not.toBe(b)
})

test("number field coerces stringly values from FetchXML responses", () => {
  const f = number("age")
  expect(f.transformValueFromDataverse("42")).toBe(42)
  expect(f.transformValueFromDataverse("38.5")).toBe(38.5)
  expect(f.transformValueFromDataverse("junk")).toBe(0)
  expect(f.transformValueFromDataverse(null)).toBe(0)
})

test("nullable number coerces strings and preserves null", () => {
  const f = nullableNumber("score")
  expect(f.transformValueFromDataverse("7")).toBe(7)
  expect(f.transformValueFromDataverse("junk")).toBeNull()
  expect(f.transformValueFromDataverse(null)).toBeNull()
})

test("boolean field coerces stringly true/false", () => {
  expect(boolean("active").transformValueFromDataverse("true")).toBe(true)
  expect(boolean("active").transformValueFromDataverse("False")).toBe(false)
  expect(nullableBoolean("flag").transformValueFromDataverse("true")).toBe(true)
  expect(nullableBoolean("flag").transformValueFromDataverse(null)).toBeNull()
})

// --- Choice choices accessor ---

test("choice exposes frozen labels via choices", () => {
  const f = choice("statuscode", { 1: "Active", 2: "Inactive" })
  expect(f.choices).toEqual(["Active", "Inactive"])
  expect(Object.isFrozen(f.choices))
})

test("nullableChoice exposes frozen labels via choices", () => {
  const f = nullableChoice("prioritycode", { 1: "Low", 2: "High" })
  expect(f.choices).toEqual(["Low", "High"])
  expect(Object.isFrozen(f.choices))
})

// --- NullableDateField write ---

test("nullableDate transformValueToDataverse returns null for null input", () => {
  const f = nullableDate("birthdate")
  expect(f.transformValueToDataverse(null)).toBeNull()
})

test("nullableDate transformValueToDataverse throws for non-date values", () => {
  const f = nullableDate("birthdate")
  expect(() => f.transformValueToDataverse("2024-01-01" as any)).toThrow("Invalid date value")
})

// --- JsonField options form ---

test("json accepts schema via options and validates parsed values", () => {
  const Address = v.object({ street: v.string(), city: v.string() })
  const f = json("address_data", { schema: Address })
  expect(f.transformValueFromDataverse('{"street":"Main","city":"Springfield"}')).toEqual({ street: "Main", city: "Springfield" })
  expect(f.transformValueFromDataverse(null)).toBeUndefined()
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
