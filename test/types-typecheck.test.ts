import { expectTypeOf, test } from "vitest"
import * as v from "valibot"
import {
  Infer, GUID, AlternateKey, DataverseKey, NarrowKeysByValue, GetTable,
  DataverseTable, DataverseIntersectTable, DataverseClient,
  primaryKey, PrimaryKeyField, string, nullableString, number, nullableNumber, boolean, nullableBoolean,
  datetime, nullableDateTime, date, nullableDate, list, choice, nullableChoice,
  json, formatted, file, image, multiChoice, lookup, collection, lookupId, collectionIds,
} from "../src"

const client = new DataverseClient({ url: "https://test.crm.dynamics.com" })

const Location = new DataverseTable({
  client, entitySetName: "locations", logicalName: "location",
  fields: {
    id: primaryKey("locationid"),
    name: string("location_name"),
  },
})

const Contact = new DataverseTable({
  client, entitySetName: "contacts", logicalName: "contact",
  fields: {
    id: primaryKey("contactid"),
    name: string("fullname"),
    location: lookup("location_id", () => Location),
  },
})

const Account = new DataverseTable({
  client, entitySetName: "accounts", logicalName: "account",
  fields: {
    id: primaryKey("accountid"),
    name: string("name"),
    nickname: nullableString("nickname"),
    revenue: number("revenue"),
    score: nullableNumber("score"),
    active: boolean("active"),
    flagged: nullableBoolean("flagged"),
    createdOn: datetime("createdon"),
    closedOn: nullableDateTime("closedon"),
    birthDate: date("birthdate"),
    clearedDate: nullableDate("cleareddate"),
    gender: list("gendercode", ["M", "F"] as const),
    status: choice("statuscode", { 1: "Active", 2: "Inactive" } as const),
    priority: nullableChoice("prioritycode", { 1: "Low", 2: "High" } as const),
    label: formatted("statuscode"),
    doc: file("document"),
    months: multiChoice("nnsyc200_choice_month", Array.from({ length: 12 }, (_, i) => i + 1)),
    pic: image("entityimage"),
    primaryContact: lookup("primarycontactid", () => Contact),
    contacts: collection("account_contacts", () => Contact),
    contactId: lookupId("primarycontactid", () => Contact),
    contactIds: collectionIds("account_contacts", () => Contact),
  },
})

// --- Field-level inference ---

test("field factories infer value types through getDefault", () => {
  expectTypeOf(string("a").getDefault()).toBeString()
  expectTypeOf(number("a").getDefault()).toBeNumber()
  expectTypeOf(boolean("a").getDefault()).toBeBoolean()
  expectTypeOf(nullableString("a").getDefault()).toEqualTypeOf<string | null>()
  expectTypeOf(nullableNumber("a").getDefault()).toEqualTypeOf<number | null>()
  expectTypeOf(nullableBoolean("a").getDefault()).toEqualTypeOf<boolean | null>()
  expectTypeOf(nullableDateTime("a").getDefault()).toEqualTypeOf<Date | null>()
  expectTypeOf(nullableDate("a").getDefault()).toEqualTypeOf<Date | null>()
  expectTypeOf(formatted("a").getDefault()).toEqualTypeOf<string | null>()
})

test("choice and list infer label/element unions", () => {
  const f = choice("statuscode", { 1: "Active", 2: "Inactive" } as const)
  expectTypeOf(f.getDefault()).toEqualTypeOf<"Active" | "Inactive">()
  const nf = nullableChoice("prio", { 1: "Low", 2: "High" } as const)
  expectTypeOf(nf.getDefault()).toEqualTypeOf<"Low" | "High" | null>()
  const lf = list("gendercode", ["M", "F"] as const)
  expectTypeOf(lf.getDefault()).toEqualTypeOf<"M" | "F" | null>()
})

test("json infers the schema output type", () => {
  const Address = v.object({ street: v.string(), zip: v.number() })
  const f = json("address_data", Address)
  expectTypeOf(f.transformValueToDataverse({ street: "Main", zip: 12345 })).toEqualTypeOf<string | null>()
  type T = ReturnType<typeof f.transformValueFromDataverse>
  expectTypeOf<T["street"]>().toBeString()
  expectTypeOf<T["zip"]>().toBeNumber()
})

// --- Table-level inference ---

test("Infer resolves the full record type", () => {
  type R = Infer<typeof Account>
  expectTypeOf<R["id"]>().toEqualTypeOf<GUID>()
  expectTypeOf<R["name"]>().toBeString()
  expectTypeOf<R["nickname"]>().toEqualTypeOf<string | null>()
  expectTypeOf<R["revenue"]>().toBeNumber()
  expectTypeOf<R["score"]>().toEqualTypeOf<number | null>()
  expectTypeOf<R["active"]>().toBeBoolean()
  expectTypeOf<R["flagged"]>().toEqualTypeOf<boolean | null>()
  expectTypeOf<R["createdOn"]>().toEqualTypeOf<Date>()
  expectTypeOf<R["closedOn"]>().toEqualTypeOf<Date | null>()
  expectTypeOf<R["birthDate"]>().toEqualTypeOf<Date>()
  expectTypeOf<R["clearedDate"]>().toEqualTypeOf<Date | null>()
  expectTypeOf<R["gender"]>().toEqualTypeOf<"M" | "F" | null>()
  expectTypeOf<R["status"]>().toEqualTypeOf<"Active" | "Inactive">()
  expectTypeOf<R["priority"]>().toEqualTypeOf<"Low" | "High" | null>()
  expectTypeOf<R["label"]>().toEqualTypeOf<string | null>()
  expectTypeOf<R["contactId"]>().toEqualTypeOf<GUID | null>()
  expectTypeOf<R["contactIds"]>().toEqualTypeOf<GUID[]>()
})

test("multiChoice infers number[]", () => {
  type R = Infer<typeof Account>
  expectTypeOf<R["months"]>().toEqualTypeOf<number[]>()
  const f = multiChoice("m", [1, 2])
  expectTypeOf(f.getDefault()).toEqualTypeOf<number[]>()
})

test("navigation properties infer as related record or null / arrays", () => {
  type R = Infer<typeof Account>
  expectTypeOf<R["primaryContact"]>().toEqualTypeOf<Infer<typeof Contact> | null>()
  expectTypeOf<R["contacts"]>().toEqualTypeOf<Infer<typeof Contact>[]>()
})

test("navigation inference nests recursively", () => {
  type R = Infer<typeof Account>
  expectTypeOf<R["primaryContact"]>().toEqualTypeOf<{
    id: GUID
    name: string
    location: { id: GUID; name: string } | null
  } | null>()
})

test("table.T mirrors Infer", () => {
  expectTypeOf<(typeof Account)["T"]>().toEqualTypeOf<Infer<typeof Account>>()
})

// --- Table algebra inference ---

test("pickProperties narrows the inferred record", () => {
  const Picked = Account.pickProperties("name", "status")
  expectTypeOf<Infer<typeof Picked>>().toEqualTypeOf<{ name: string; status: "Active" | "Inactive" }>()
})

test("omitProperties removes keys from the inferred record", () => {
  const Without = Account.omitProperties("revenue")
  type R = Infer<typeof Without>
  expectTypeOf<R["name"]>().toBeString()
  expectTypeOf<R>().not.toHaveProperty("revenue")
})

test("appendProperties extends the inferred record", () => {
  const Extended = Account.appendProperties({ extra: string("new_col") })
  type R = Infer<typeof Extended>
  expectTypeOf<R["extra"]>().toBeString()
  expectTypeOf<R["name"]>().toBeString()
})

// --- Utility types ---

test("GUID accepts uuid-shaped strings only", () => {
  const g: GUID = "123e4567-e89b-12d3-a456-426614174000"
  expectTypeOf(g).toEqualTypeOf<GUID>()
  // @ts-expect-error strings without five hyphen-separated sections are not GUIDs
  const bad: GUID = "not-a-guid"
  expectTypeOf(bad).toBeString()
})

test("AlternateKey accepts one or two key=value pairs", () => {
  const single: AlternateKey = "name=Acme"
  const compound: AlternateKey = "name=Acme,code=42"
  expectTypeOf(single).toEqualTypeOf<`${string}=${string}`>()
  expectTypeOf(compound).toBeString()
  // @ts-expect-error missing '=' is not an alternate key
  const bad: AlternateKey = "Acme"
  expectTypeOf(bad).toBeString()
})

test("DataverseKey accepts plain strings", () => {
  const k: DataverseKey = "anything"
  expectTypeOf(k).toBeString()
})

test("NarrowKeysByValue filters keys by property type", () => {
  type NavKeys = NarrowKeysByValue<typeof Account.fields, { kind: "navigation" }>
  expectTypeOf<NavKeys>().toEqualTypeOf<"primaryContact" | "contacts" | "contactId" | "contactIds">()
  type PkKeys = NarrowKeysByValue<typeof Account.fields, PrimaryKeyField>
  expectTypeOf<PkKeys>().toEqualTypeOf<"id">()
})

test("GetTable is a table thunk", () => {
  const getAccount: GetTable<typeof Account> = () => Account
  expectTypeOf(getAccount()).toEqualTypeOf<typeof Account>()
})

test("DataverseIntersectTable preserves both table types", () => {
  const ix = new DataverseIntersectTable("accountcontact", Account, Contact)
  expectTypeOf(ix.table1).toEqualTypeOf<typeof Account>()
  expectTypeOf(ix.table2).toEqualTypeOf<typeof Contact>()
})
