import { expectTypeOf, test } from "vitest"
import * as v from "valibot"
import {
  Infer, GUID, AlternateKey, DataverseKey, NarrowKeysByValue, GetTable,
  DataverseTable, DataverseIntersectTable, DataverseClient,
  primaryKey, PrimaryKeyField, string, number, boolean,
  datetime, date, list, choice, NumberField, DateTimeField, DateField, FieldValue,
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
    nickname: string("nickname"),
    revenue: number("revenue") as NumberField,
    score: number("score") as NumberField,
    active: boolean("active"),
    flagged: boolean("flagged"),
    createdOn: datetime("createdon") as DateTimeField,
    closedOn: datetime("closedon") as DateTimeField,
    birthDate: date("birthdate") as DateField,
    clearedDate: date("cleareddate") as DateField,
    gender: list("gendercode", ["M", "F"] as const),
    status: choice("statuscode", { 1: "Active", 2: "Inactive" } as const),
    priority: choice("prioritycode", { 1: "Low", 2: "High" } as const),
    label: formatted("statuscode"),
    doc: file("document"),
    months: multiChoice("nnsyc200_choice_month", { 1: "Jan", 2: "Feb" }),
    pic: image("entityimage"),
    primaryContact: lookup("primarycontactid", () => Contact),
    contacts: collection("account_contacts", () => Contact),
    contactId: lookupId("primarycontactid", () => Contact),
    contactIds: collectionIds("account_contacts", () => Contact),
  },
})

// --- Field-level inference ---

test("field factories infer value types through getDefault", () => {
  expectTypeOf(string("a", { required: true }).getDefault()).toBeString()
  expectTypeOf((number("a", { required: true }) as NumberField).getDefault()).toEqualTypeOf<number | null>()
  expectTypeOf(boolean("a", { required: true }).getDefault()).toBeBoolean()
  expectTypeOf(string("a").getDefault()).toBeString()
  // nullable numbers keep 0 as the construction-time default; only null reads stay null
  expectTypeOf((number("a") as NumberField).getDefault()).toEqualTypeOf<number | null>()
  expectTypeOf(boolean("a").getDefault()).toBeBoolean()
  expectTypeOf((datetime("a") as DateTimeField).getDefault()).toEqualTypeOf<FieldValue<Date, true>>()
  expectTypeOf((date("a") as DateField).getDefault()).toEqualTypeOf<FieldValue<Date, true>>()
  expectTypeOf(formatted("a").getDefault()).toEqualTypeOf<string | null>()
})

test("choice and list infer label/element unions", () => {
  const f = choice("statuscode", { 1: "Active", 2: "Inactive" } as const, { required: true })
  // `required` is validation-only now: the nullable instantiation keeps null in reads, and getDefault is the class default
  expectTypeOf(f.getDefault()).toEqualTypeOf<"Active" | "Inactive" | null>()
  const nf = choice("prio", { 1: "Low", 2: "High" } as const)
  expectTypeOf(nf.getDefault()).toEqualTypeOf<"Low" | "High" | null>()
  const lf = list("gendercode", ["M", "F"] as const)
  expectTypeOf(lf.getDefault()).toEqualTypeOf<"M" | "F" | null>()
  // readonly arrays are accepted, and literals infer without `as const`
  const rf = list("gendercode", ["M", "F"] as ReadonlyArray<"M" | "F">)
  expectTypeOf(rf.getDefault()).toEqualTypeOf<"M" | "F" | null>()
  const nf2 = list("gendercode", ["M", "F"])
  expectTypeOf(nf2.getDefault()).toEqualTypeOf<"M" | "F" | null>()
})

test("json infers the schema output type", () => {
  const Address = v.object({ street: v.string(), zip: v.number() })
  const f = json("address_data", { schema: Address })
  expectTypeOf(f.transformValueToDataverse({ street: "Main", zip: 12345 })).toEqualTypeOf<string | null>()
  type T = Awaited<ReturnType<typeof f.transformValueFromDataverse>>
  expectTypeOf<T["street"]>().toBeString()
  expectTypeOf<T["zip"]>().toBeNumber()
})

// --- Table-level inference ---

test("Infer resolves the full record type", () => {
  type R = Infer<typeof Account>
  expectTypeOf<R["id"]>().toEqualTypeOf<GUID>()
  expectTypeOf<R["name"]>().toEqualTypeOf<string>()
  expectTypeOf<R["nickname"]>().toEqualTypeOf<string>()
  expectTypeOf<R["revenue"]>().toEqualTypeOf<number | null>()
  expectTypeOf<R["score"]>().toEqualTypeOf<number | null>()
  expectTypeOf<R["active"]>().toEqualTypeOf<boolean>()
  expectTypeOf<R["flagged"]>().toEqualTypeOf<boolean>()
  expectTypeOf<R["createdOn"]>().toEqualTypeOf<FieldValue<Date, true>>()
  expectTypeOf<R["closedOn"]>().toEqualTypeOf<FieldValue<Date, true>>()
  expectTypeOf<R["birthDate"]>().toEqualTypeOf<FieldValue<Date, true>>()
  expectTypeOf<R["clearedDate"]>().toEqualTypeOf<FieldValue<Date, true>>()
  expectTypeOf<R["gender"]>().toEqualTypeOf<"M" | "F" | null>()
  expectTypeOf<R["status"]>().toEqualTypeOf<"Active" | "Inactive" | null>()
  expectTypeOf<R["priority"]>().toEqualTypeOf<"Low" | "High" | null>()
  expectTypeOf<R["label"]>().toEqualTypeOf<string | null>()
  expectTypeOf<R["contactId"]>().toEqualTypeOf<GUID | null>()
  expectTypeOf<R["contactIds"]>().toEqualTypeOf<GUID[]>()
})

test("multiChoice infers label arrays", () => {
  type R = Infer<typeof Account>
  expectTypeOf<R["months"]>().toEqualTypeOf<("Jan" | "Feb")[]>()
  const f = multiChoice("m", { 1: "Jan", 2: "Feb" })
  expectTypeOf(f.getDefault()).toEqualTypeOf<("Jan" | "Feb")[]>()
})

test("dynamic choice overloads infer raw numeric values", () => {
  const d = choice("statuscode")
  expectTypeOf(d.getDefault()).toEqualTypeOf<number | null>()
  const dm = multiChoice("months")
  expectTypeOf(dm.getDefault()).toEqualTypeOf<number[]>()
  expectTypeOf(d.transformValueFromDataverse(900004)).toEqualTypeOf<number | null>()
  expectTypeOf(dm.transformValueFromDataverse("1,2")).toEqualTypeOf<number[]>()
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

test("mutual table references compile when one direction uses an untyped navigation", () => {
  // lookupId/collectionIds intentionally take untyped `() => any` thunks so the
  // back-reference contributes nothing to Child's inferred type, avoiding TS7022.
  const Parent = new DataverseTable({
    client, entitySetName: "parents", logicalName: "parent",
    fields: {
      id: primaryKey("parentid"),
      child: lookup("child_id", () => Child),
      childIds: collectionIds("children", () => Child),
    },
  })
  const Child = new DataverseTable({
    client, entitySetName: "children", logicalName: "child",
    fields: {
      id: primaryKey("childid"),
      parentId: lookupId("parent_id", () => Parent),
    },
  })
  expectTypeOf<Infer<typeof Child>>().toEqualTypeOf<{ id: GUID; parentId: GUID | null }>()
  expectTypeOf<Infer<typeof Parent>["child"]>().toEqualTypeOf<Infer<typeof Child> | null>()
  expectTypeOf<Infer<typeof Parent>["childIds"]>().toEqualTypeOf<GUID[]>()
})

test("table.T mirrors Infer", () => {
  expectTypeOf<(typeof Account)["T"]>().toEqualTypeOf<Infer<typeof Account>>()
})

// --- Table algebra inference ---

test("pickProperties narrows the inferred record", () => {
  const Picked = Account.pickProperties("name", "status")
  expectTypeOf<Infer<typeof Picked>>().toEqualTypeOf<{ name: string; status: "Active" | "Inactive" | null }>()
})

test("omitProperties removes keys from the inferred record", () => {
  const Without = Account.omitProperties("revenue")
  type R = Infer<typeof Without>
  expectTypeOf<R["name"]>().toEqualTypeOf<string>()
  expectTypeOf<R>().not.toHaveProperty("revenue")
})

test("appendProperties extends the inferred record", () => {
  const Extended = Account.appendProperties({ extra: string("new_col") })
  type R = Infer<typeof Extended>
  expectTypeOf<R["extra"]>().toEqualTypeOf<string>()
  expectTypeOf<R["name"]>().toEqualTypeOf<string>()
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


