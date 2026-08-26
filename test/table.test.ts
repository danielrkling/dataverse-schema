import { expect, test } from "vitest"
import * as v from "valibot"
import {
  DataverseTable, DataverseIntersectTable, DataverseClient,
  primaryKey, string, nullableString, number, choice, nullableChoice,
  datetime, date, boolean, json, formatted, file, image,
  lookup, collection, lookupId, collectionIds,
} from "../src"

const client = new DataverseClient({ url: "https://test.crm.dynamics.com" })

const Contact = new DataverseTable({
  client, entitySetName: "contacts", logicalName: "contact",
  fields: { id: primaryKey("contactid"), name: string("fullname") },
})

const Account = new DataverseTable({
  client, entitySetName: "accounts", logicalName: "account",
  fields: {
    id: primaryKey("accountid"),
    name: string("name"),
    revenue: number("revenue"),
    status: choice("statuscode", { 1: "Active", 2: "Inactive" }),
    createdOn: datetime("createdon"),
    primaryContact: lookup("primarycontactid", () => Contact),
    contacts: collection("account_contacts", () => Contact),
    contactId: lookupId("primarycontactid", () => Contact),
    contactIds: collectionIds("account_contacts_ids", () => Contact),
  },
})

// --- Construction ---

test("constructor auto-detects the primary key field", () => {
  expect(Account.primaryKey.key).toBe("id")
  expect(Account.primaryKey.property.logicalName).toBe("accountid")
})

test("constructor throws when no primary key exists", () => {
  expect(() => new DataverseTable({
    client, entitySetName: "things", logicalName: "thing",
    fields: { name: string("name") },
  })).toThrow("No Primary Key found in schema")
})

test("constructor respects explicit primaryKey option", () => {
  const pk = primaryKey("otherid")
  const t = new DataverseTable({
    client, entitySetName: "things", logicalName: "thing",
    fields: { id: primaryKey("realid"), alt: pk },
    primaryKey: { key: "alt", property: pk },
  })
  expect(t.primaryKey.key).toBe("alt")
  expect(t.primaryKey.property.logicalName).toBe("otherid")
})

test("table exposes client, entitySetName and logicalName", () => {
  expect(Account.client).toBe(client)
  expect(Account.entitySetName).toBe("accounts")
  expect(Account.logicalName).toBe("account")
})

// --- Schema & defaults ---

test("table.schema composes valibot object schema from fields", () => {
  const schema = Account.schema
  const result = v.safeParse(schema, {
    id: "123e4567-e89b-12d3-a456-426614174000",
    name: "Acme",
    revenue: 10,
    status: "Active",
    createdOn: new Date(),
    primaryContact: null,
    contacts: [],
    contactId: null,
    contactIds: [],
  })
  expect(result.success).toBe(true)
})

test("table.schema returns custom schema when provided", () => {
  const custom = v.object({ name: v.string() })
  const t = new DataverseTable({
    client, entitySetName: "accounts", logicalName: "account",
    fields: Account.fields, schema: custom as any,
  })
  expect(t.schema).toBe(custom)
})

test("getDefault returns defaults for every field", () => {
  const d = Contact.getDefault()
  expect(d.name).toBe("")
  expect(d.id).toMatch(/^[0-9a-f-]{36}$/i)
})

test("getDefault applies partial overrides", () => {
  const d = Contact.getDefault({ name: "Override" })
  expect(d.name).toBe("Override")
  expect(d.id).toMatch(/^[0-9a-f-]{36}$/i)
})

// --- Transform from Dataverse ---

test("transformValueFromDataverse maps raw record to typed record", () => {
  const result = Account.transformValueFromDataverse({
    accountid: "abc",
    name: "Acme",
    revenue: 500,
    statuscode: 2,
    createdon: "2024-01-15T10:30:00Z",
    "@odata.etag": "W/\"1\"",
  })
  expect(result.id).toBe("abc")
  expect(result.name).toBe("Acme")
  expect(result.revenue).toBe(500)
  expect(result.status).toBe("Inactive")
  expect(result.createdOn).toBeInstanceOf(Date)
})

test("transformValueFromDataverse copies @odata.etag", () => {
  const result = Contact.transformValueFromDataverse({
    contactid: "x", fullname: "A", "@odata.etag": "W/\"9\"",
  })
  expect((result as any)["$etag"]).toBe("W/\"9\"")
})

test("transformValueFromDataverse defaults fields absent from the payload", () => {
  const result = Account.transformValueFromDataverse({
    accountid: "a1", statuscode: 1,
    // name, revenue, createdon intentionally absent (e.g. partial select)
  })
  expect(result.name).toBe("")
  expect(result.revenue).toBe(0)
  expect(result.createdOn).toBeInstanceOf(Date)
})

test("transformValueFromDataverse normalizes nulls for non-nullable fields", () => {
  const result = Account.transformValueFromDataverse({
    accountid: null, name: null, revenue: null, statuscode: 1, createdon: null,
  })
  expect(result.name).toBe("")
  expect(result.revenue).toBe(0)
  expect(result.createdOn).toBeInstanceOf(Date)
})

test("transformValueFromDataverse transforms expanded navigation records", () => {
  const result = Account.transformValueFromDataverse({
    accountid: "a1", name: "Acme", revenue: 0, statuscode: 1, createdon: new Date(),
    primarycontactid: { contactid: "c1", fullname: "Neo" },
    account_contacts: [{ contactid: "c2", fullname: "Trin" }],
  })
  expect(result.primaryContact).toEqual({ id: "c1", name: "Neo" })
  expect(result.contacts).toEqual([{ id: "c2", name: "Trin" }])
})

test("transformValueFromDataverse returns null lookup for missing expansion", () => {
  const result = Account.transformValueFromDataverse({
    accountid: "a1", name: "A", revenue: 0, statuscode: 1, createdon: new Date(),
  })
  expect(result.primaryContact).toBeNull()
  expect(result.contacts).toEqual([])
})

// --- Transform to Dataverse ---

test("transformValueToDataverse maps labels and skips readonly/navigation", async () => {
  const result = await Account.transformValueToDataverse({
    name: "Acme",
    revenue: 42,
    status: "Active",
    createdOn: new Date(2024, 0, 15),
    contactId: "00000000-0000-0000-0000-000000000001",
    contacts: [{ id: "00000000-0000-0000-0000-000000000002", name: "ignored" }],
    primaryContact: null,
  })
  expect(result).toEqual({
    name: "Acme",
    revenue: 42,
    statuscode: 1,
    createdon: new Date(2024, 0, 15),
    "primarycontactid@odata.bind": "contacts(00000000-0000-0000-0000-000000000001)",
  })
})

test("transformValueToDataverse omits keys not present in value", async () => {
  const result = await Account.transformValueToDataverse({ name: "Only Name" })
  expect(Object.keys(result)).toEqual(["name"])
})

test("transformValueToDataverse formats date-only fields", async () => {
  const Birth = new DataverseTable({
    client, entitySetName: "people", logicalName: "person",
    fields: { id: primaryKey("personid"), born: date("birthdate") },
  })
  const result = await Birth.transformValueToDataverse({ born: new Date(2024, 2, 9) })
  expect(result).toEqual({ birthdate: "2024-03-09" })
})

test("transformValueToDataverse handles null values", async () => {
  const T = new DataverseTable({
    client, entitySetName: "people", logicalName: "person",
    fields: { id: primaryKey("personid"), nick: nullableString("nickname"), priority: nullableChoice("prio", { 1: "Low" }) },
  })
  const result = await T.transformValueToDataverse({ nick: null, priority: null })
  expect(result).toEqual({ nickname: null, prio: null })
})

// --- Table algebra ---

test("pickProperties narrows fields and keeps identity", () => {
  const Picked = Account.pickProperties("name", "id")
  expect(Object.keys(Picked.fields).sort()).toEqual(["id", "name"])
  expect(Picked.entitySetName).toBe("accounts")
  expect(Picked.logicalName).toBe("account")
  expect(Picked.client).toBe(client)
  expect(Picked.primaryKey.key).toBe("id")
})

test("omitProperties removes selected fields", () => {
  const Without = Account.omitProperties("revenue", "status")
  expect(Object.keys(Without.fields)).not.toContain("revenue")
  expect(Object.keys(Without.fields)).not.toContain("status")
  expect(Without.fields.name).toBeDefined()
})

test("appendProperties adds new fields", () => {
  const Extended = Account.appendProperties({ extra: string("new_col") })
  expect(Extended.fields.extra).toBeDefined()
  expect(Extended.fields.name).toBe(Account.fields.name)
})

// --- Keys ---

test("getAlternateKeys builds logical-name pairs", () => {
  expect(Account.getAlternateKeys({ name: "Acme" })).toBe("name=Acme")
})

test("getPrimaryId extracts primary key value", () => {
  expect(Account.getPrimaryId({ id: "guid-1" } as any)).toBe("guid-1")
  expect(Account.getPrimaryId({} as any)).toBeUndefined()
})

// --- Navigation property tables ---

test("lookup property exposes related table lazily", () => {
  expect(Account.fields.primaryContact.table).toBe(Contact)
})

test("collection property exposes related table lazily", () => {
  expect(Account.fields.contacts.table).toBe(Contact)
})

test("lookupId property builds a pk-only projection of the related table", () => {
  const t = Account.fields.contactId.table
  expect(t.entitySetName).toBe("contacts")
  expect(Object.keys(t.fields)).toEqual(["id"])
})

test("collectionIds property builds a pk-only projection of the related table", () => {
  const t = Account.fields.contactIds.table
  expect(t.entitySetName).toBe("contacts")
  expect(Object.keys(t.fields)).toEqual(["id"])
})

test("collectionIds transformValueFromDataverse maps records to ids", () => {
  const prop = Account.fields.contactIds
  expect(prop.fromDataverseName).toBe("account_contacts_ids")
  const result = (prop as any).transformValueFromDataverse([
    { contactid: "g1" }, { contactid: "g2" },
  ])
  expect(result).toEqual(["g1", "g2"])
})

test("collectionIds transformValueFromDataverse handles null", () => {
  const prop = Account.fields.contactIds
  expect((prop as any).transformValueFromDataverse(null)).toEqual([])
})

// --- Intersect table ---

test("DataverseIntersectTable stores name and both tables", () => {
  const intersect = new DataverseIntersectTable("accountcontact", Account, Contact)
  expect(intersect.intersect).toBe(true)
  expect(intersect.name).toBe("accountcontact")
  expect(intersect.table1).toBe(Account)
  expect(intersect.table2).toBe(Contact)
})

// --- Misc typed helpers ---

test("json field round-trips through table transform", async () => {
  const Address = v.object({ street: v.string() })
  const T = new DataverseTable({
    client, entitySetName: "places", logicalName: "place",
    fields: { id: primaryKey("placeid"), address: json("address_data", { schema: Address }) },
  })
  const from = T.transformValueFromDataverse({ placeid: "p1", address_data: "{\"street\":\"Main\"}" })
  expect(from.address).toEqual({ street: "Main" })
  const to = await T.transformValueToDataverse({ address: { street: "Oak" } })
  expect(to).toEqual({ address_data: "{\"street\":\"Oak\"}" })
})

test("formatted and file/image fields are excluded from write bodies", async () => {
  const T = new DataverseTable({
    client, entitySetName: "people", logicalName: "person",
    fields: {
      id: primaryKey("personid"),
      label: formatted("fullname"),
      doc: file("document"),
      pic: image("entityimage"),
    },
  })
  const result = await T.transformValueToDataverse({ label: "x", doc: { name: "f.pdf" }, pic: null })
  expect(result).toEqual({})
})

// --- Readonly guards ---

test("updatePropertyValue throws for readonly fields", async () => {
  const T = new DataverseTable({
    client, entitySetName: "people", logicalName: "person",
    fields: { id: primaryKey("personid"), label: formatted("fullname") },
  })
  await expect(T.updatePropertyValue("label", "g1", "x")).rejects.toThrow('Cannot update readonly property "label"')
})

test("deletePropertyValue throws for readonly fields", async () => {
  const T = new DataverseTable({
    client, entitySetName: "people", logicalName: "person",
    fields: { id: primaryKey("personid"), label: formatted("fullname") },
  })
  await expect(T.deletePropertyValue("label", "g1")).rejects.toThrow('Cannot delete readonly property "label"')
})

test("updatePropertyValue routes file data through the upload channel", async () => {
  const T = new DataverseTable({
    client, entitySetName: "people", logicalName: "person",
    fields: { id: primaryKey("personid"), doc: file("document") },
  })
  const uploaded: any[][] = []
  ;(T.client as any).updateFileProperty = async (...args: any[]) => { uploaded.push(args) }

  await T.updatePropertyValue("doc", "g1", { name: "f.pdf", data: new Blob(["x"]) })
  expect(uploaded).toHaveLength(1)
  expect(uploaded[0][3]).toBe("f.pdf")
  expect(uploaded[0][4]).toBeInstanceOf(Blob)

  uploaded.length = 0
  await T.updatePropertyValue("doc", "g1", { name: "stale.pdf" }) // no explicit data → no-op
  expect(uploaded).toHaveLength(0)
})

test("updatePropertyValue clears image data via explicit null", async () => {
  const T = new DataverseTable({
    client, entitySetName: "people", logicalName: "person",
    fields: { id: primaryKey("personid"), pic: image("entityimage") },
  })
  const deleted: string[] = []
  ;(T.client as any).deletePropertyValue = async (_e: unknown, _id: unknown, property: string) => {
    deleted.push(property)
  }

  await T.updatePropertyValue("pic", "g1", { data: null })
  expect(deleted).toEqual(["entityimage"])
})
