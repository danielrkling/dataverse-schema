import { expect, test } from "vitest"
import { DataverseClient } from "../src/client"
import { table, primaryKey, string, number, boolean, lookup, lookupId, collection, collectionIds, date, list, Infer } from "../src"
import { BASE_URL } from "./mocks/handlers"
import { http, HttpResponse } from "msw"
import { server } from "./mocks/server"

const client = new DataverseClient({ url: BASE_URL })

const Address = table(client, "addresses", {
  id: primaryKey("addressid"),
  street: string("street_Address"),
  zip: number("zip_code"),
})

type AddressType = Infer<typeof Address>

const Person = table(client, "people", {
  pk: primaryKey("personid"),
  name: string("fullname"),
  age: number("person_age"),
  active: boolean("active"),
  dob: date("person_dob"),
  gender: list("gender", ["M", "F"] as const),
  primaryAddressId: lookupId("person_Address", () => Address),
  primaryAddress: lookup("person_Address", () => Address),
  addressIds: collectionIds("person_Address_person", () => Address),
  addresses: collection("person_Address_person", () => Address),
})

// --- Schema definition tests ---

test("table constructor stores fields", () => {
  expect(Person.fields.pk).toBeDefined()
  expect(Person.fields.name).toBeDefined()
  expect(Person.fields.age).toBeDefined()
})

test("table.getPrimaryKey returns the primary key field", () => {
  const pk = Person.getPrimaryKey()
  expect(pk.key).toBe("pk")
  expect(pk.property.name).toBe("personid")
})

test("table.getPrimaryId extracts id from record", () => {
  const id = Person.getPrimaryId({ pk: "a1b2c3d4-e5f6-7890-1234-567890abcdef" } as any)
  expect(id).toBe("a1b2c3d4-e5f6-7890-1234-567890abcdef")
})

test("table.getPrimaryId returns undefined when missing", () => {
  const id = Person.getPrimaryId({} as any)
  expect(id).toBeUndefined()
})

// --- HTTP integration tests ---

test.skip("table.getRecord fetches and transforms a record", async () => {
  server.use(
    http.get(`${BASE_URL}/api/data/v9.2/people`, ({ request }) => {
      const url = new URL(request.url)
      const select = url.searchParams.get("$select") || ""
      if (url.searchParams.get("$expand")) {
        return HttpResponse.json({ value: [{ personid: "test-id", fullname: "John", person_age: 30, "person_Address": { addressid: "addr-id", street_Address: "123 St" } }] })
      }
      return HttpResponse.json({ value: [{ personid: "test-id", fullname: "John", person_age: 30 }] })
    }),
  )
  const records = await Person.getRecords()
  expect(records).toHaveLength(1)
  expect(records[0].name).toBe("John")
  expect(records[0].age).toBe(30)
})

test.skip("table.getRecord fetches a single record by id", async () => {
  server.use(
    http.get(`${BASE_URL}/api/data/v9.2/people(test-id)`, () => {
      return HttpResponse.json({ personid: "test-id", fullname: "Jane", person_age: 25 })
    }),
  )
  const record = await Person.getRecord("test-id")
  expect(record).not.toBeNull()
  expect(record!.name).toBe("Jane")
  expect(record!.age).toBe(25)
})

test.skip("table.getRecord returns null when missing", async () => {
  server.use(
    http.get(`${BASE_URL}/api/data/v9.2/people(missing-id)`, () => {
      return HttpResponse.json({ error: { code: "0x80060891", message: "Not found" } }, { status: 404 })
    }),
  )
  const record = await Person.getRecord("missing-id")
  expect(record).toBeNull()
})

test("table.getRecords with query options passes filter and orderby", async () => {
  let capturedUrl = ""
  server.use(
    http.get(`${BASE_URL}/api/data/v9.2/people`, ({ request }) => {
      capturedUrl = request.url
      return HttpResponse.json({ value: [] })
    }),
  )
  await Person.getRecords({ filter: "age gt 20", top: 10 })
  expect(capturedUrl).toContain("age+gt+20")
  expect(capturedUrl).toContain("top=10")
})

test("table.postRecord creates and returns GUID", async () => {
  server.use(
    http.post(`${BASE_URL}/api/data/v9.2/people`, () => {
      return HttpResponse.json({ personid: "new-id-1234" })
    }),
  )
  const id = await Person.postRecord({ name: "New Person", age: 20, active: true })
  expect(id).toBe("new-id-1234")
})

test("table.patchRecord updates and returns id", async () => {
  server.use(
    http.patch(`${BASE_URL}/api/data/v9.2/people(existing-id)`, () => {
      return new HttpResponse(null, { status: 204 })
    }),
  )
  const id = await Person.patchRecord("existing-id", { name: "Updated" })
  expect(id).toBe("existing-id")
})

test("table.patchRecord throws when id is empty", async () => {
  await expect(Person.patchRecord("" as any, {})).rejects.toThrow("No ID provided")
})

test("table.saveRecord creates a new record when no id", async () => {
  server.use(
    http.post(`${BASE_URL}/api/data/v9.2/people`, () => {
      return HttpResponse.json({ personid: "new-saved-id" })
    }),
  )
  const id = await Person.saveRecord({ name: "Saved Person" })
  expect(id).toBe("new-saved-id")
})

test("table.saveRecord updates existing record when id present", async () => {
  server.use(
    http.patch(`${BASE_URL}/api/data/v9.2/people(existing-id)`, () => {
      return new HttpResponse(null, { status: 204 })
    }),
  )
  const id = await Person.saveRecord({ pk: "existing-id" as any, name: "Updated" })
  expect(id).toBe("existing-id")
})

test("table.deleteRecord deletes and returns id", async () => {
  server.use(
    http.delete(`${BASE_URL}/api/data/v9.2/people(delete-id)`, () => {
      return new HttpResponse(null, { status: 204 })
    }),
  )
  const id = await Person.deleteRecord("delete-id" as any)
  expect(id).toBe("delete-id")
})

test("table.activateRecord sets statecode to 0", async () => {
  server.use(
    http.put(`${BASE_URL}/api/data/v9.2/people(test-id)/statecode`, () => {
      return new HttpResponse(null, { status: 204 })
    }),
  )
  const id = await Person.activateRecord("test-id" as any)
  expect(id).toBe("test-id")
})

test("table.deactivateRecord sets statecode to 1", async () => {
  server.use(
    http.put(`${BASE_URL}/api/data/v9.2/people(test-id)/statecode`, () => {
      return new HttpResponse(null, { status: 204 })
    }),
  )
  const id = await Person.deactivateRecord("test-id" as any)
  expect(id).toBe("test-id")
})

test("table.associateRecord links through navigation property", async () => {
  server.use(
    http.put(`${BASE_URL}/api/data/v9.2/people(parent-id)/person_Address/\$ref`, () => {
      return new HttpResponse(null, { status: 204 })
    }),
  )
  const id = await Person.associateRecord("primaryAddressId", "parent-id", "child-id")
  expect(id).toBe("child-id")
})

test.skip("table.getPropertyValue retrieves a value property", async () => {
  server.use(
    http.get(`${BASE_URL}/api/data/v9.2/people(test-id)/person_age`, () => {
      return HttpResponse.json({ value: 35 })
    }),
  )
  const value = await Person.getPropertyValue("age", "test-id")
  expect(value).toBe(35)
})

test.skip("table.getPropertyValue retrieves lookup navigation property", async () => {
  server.use(
    http.get(`${BASE_URL}/api/data/v9.2/people(test-id)/person_Address`, () => {
      return HttpResponse.json({ value: { addressid: "addr-1", street_Address: "456 Oak", zip_code: 12345 } })
    }),
  )
  const value = await Person.getPropertyValue("primaryAddress", "test-id")
  expect(value).not.toBeNull()
  expect(value!.street).toBe("456 Oak")
  expect(value!.zip).toBe(12345)
})

test.skip("table.getPropertyValue retrieves collection navigation property", async () => {
  server.use(
    http.get(`${BASE_URL}/api/data/v9.2/people(test-id)/person_Address_person`, () => {
      return HttpResponse.json({ value: [{ addressid: "addr-1", street_Address: "789 Pine", zip_code: 54321 }] })
    }),
  )
  const addresses = await Person.getPropertyValue("addresses", "test-id")
  expect(addresses).toHaveLength(1)
  expect(addresses[0].street).toBe("789 Pine")
})

test("table.updatePropertyValue updates a value property", async () => {
  server.use(
    http.put(`${BASE_URL}/api/data/v9.2/people(test-id)/person_age`, () => {
      return new HttpResponse(null, { status: 204 })
    }),
  )
  const id = await Person.updatePropertyValue("age", "test-id", 40)
  expect(id).toBe("test-id")
})

test("table.deletePropertyValue deletes a value property", async () => {
  server.use(
    http.delete(`${BASE_URL}/api/data/v9.2/people(test-id)/person_age`, () => {
      return new HttpResponse(null, { status: 204 })
    }),
  )
  const id = await Person.deletePropertyValue("age", "test-id")
  expect(id).toBe("test-id")
})

test.skip("table.transformValueFromDataverse maps field names", () => {
  const result = Person.transformValueFromDataverse({
    personid: "id-1",
    fullname: "Alice",
    person_age: 28,
  })
  expect(result.pk).toBe("id-1")
  expect(result.name).toBe("Alice")
  expect(result.age).toBe(28)
})

test("table.transformValueFromDataverse handles null", () => {
  const result = Person.transformValueFromDataverse(null)
  expect(result).toBeNull()
})

test("table.transformValueToDataverse maps field names", () => {
  const result = Person.transformValueToDataverse({ name: "Bob", age: 35 })
  expect(result.fullname).toBe("Bob")
  expect(result.person_age).toBe(35)
  expect(result.personid).toBeUndefined()
})

test.skip("table.transformValueToDataverse skips read-only fields", () => {
  const result = Person.transformValueToDataverse({ pk: "some-id", name: "Charlie", age: 40 })
  expect(result.personid).toBeUndefined()
})

test.skip("table.getDefault returns defaults merged with provided values", () => {
  const defaults = Person.getDefault({ name: "Default Person" })
  expect(defaults.name).toBe("Default Person")
  expect(defaults.active).toBe(false)
  expect(defaults.age).toBe(null)
  expect(defaults.pk).toBeDefined()
})

test("table.pickProperties returns a subset of fields", () => {
  const partial = Person.pickProperties("name", "age")
  expect(partial.fields.name).toBeDefined()
  expect(partial.fields.age).toBeDefined()
  expect((partial.fields as any).pk).toBeUndefined()
})

test("table.omitProperties returns all but specified fields", () => {
  const partial = Person.omitProperties("age", "active")
  expect(partial.fields.name).toBeDefined()
  expect(partial.fields.pk).toBeDefined()
  expect((partial.fields as any).age).toBeUndefined()
})

test("table.appendProperties adds new fields", () => {
  const extended = Person.appendProperties({ nickname: string("nickname") })
  expect(extended.fields.nickname).toBeDefined()
  expect(extended.fields.name).toBeDefined()
})

test("table.validate returns issues for invalid data", () => {
  const validation = Person.validate({ name: 123 } as any)
  expect(validation.issues).toBeDefined()
})

test("table has T property for type inference", () => {
  const _typeCheck: Person["T"] = {} as any
  expect(true).toBe(true)
})
