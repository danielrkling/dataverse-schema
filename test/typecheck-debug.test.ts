import { expectTypeOf, test } from "vitest"
import { fetchOdata } from "../src"
import { DataverseTable, primaryKey, string, number, lookup, lookupId, collection } from "../src"
import { DataverseClient } from "../src/client"

const client = new DataverseClient({ url: "http://localhost" })

const Location = new DataverseTable({
  client, entitySetName: "locations", logicalName: "location",
  fields: {
    id: primaryKey("locationid"),
    name: string("location_name"),
  },
})

const Address = new DataverseTable({
  client, entitySetName: "addresses", logicalName: "address",
  fields: {
    id: primaryKey("addressid"),
    street: string("street_Address"),
    zip: number("zip_code"),
    locationId: lookupId("address_Location", () => Location),
    location: lookup("address_Location", () => Location),
  },
})

const Person = new DataverseTable({
  client, entitySetName: "people", logicalName: "person",
  fields: {
    pk: primaryKey("personid"),
    name: string("fullname"),
    age: number("person_age"),
    primaryAddressId: lookupId("person_Address", () => Address),
    primaryAddress: lookup("person_Address", () => Address),
    addresses: collection("person_Address_person", () => Address),
  },
})

test("nested expand type", () => {
  const q = fetchOdata(Person).select().expand("primaryAddress", s =>
    s.select("zip").expand("location", v => v.select("name"))
  )
  type R = ReturnType<typeof q.execute> extends Promise<infer U> ? U extends (infer V)[] ? V : never : never

  // primaryAddress should be { zip: number; location: { name: string } | null } | null
  expectTypeOf<R["primaryAddress"]>().toEqualTypeOf<{ zip: number; location: { name: string } | null } | null>()

  // should have all the parent value fields too
  expectTypeOf<R["pk"]>().toBeString()
  expectTypeOf<R["name"]>().toBeString()
  expectTypeOf<R["age"]>().toBeNumber()
})

test("simple select type", () => {
  const q = fetchOdata(Person).select("name", "age")
  type R = ReturnType<typeof q.execute> extends Promise<infer U> ? U extends (infer V)[] ? V : never : never

  expectTypeOf<R["name"]>().toBeString()
  expectTypeOf<R["age"]>().toBeNumber()
  // pk should NOT be present since we only selected name and age
  expectTypeOf<R>().not.toHaveProperty("pk")
})

test("collection expand type", () => {
  const q = fetchOdata(Person).select().expand("addresses", s => s.select("zip"))
  type R = ReturnType<typeof q.execute> extends Promise<infer U> ? U extends (infer V)[] ? V : never : never

  expectTypeOf<R["addresses"]>().toEqualTypeOf<{ zip: number }[]>()
})

test("expand without sub-query type", () => {
  const q = fetchOdata(Person).select().expand("primaryAddress")
  type R = ReturnType<typeof q.execute> extends Promise<infer U> ? U extends (infer V)[] ? V : never : never

  // Without sub-query, all fields of Address are included
  expectTypeOf<R["primaryAddress"]>().toEqualTypeOf<{ id: string; street: string; zip: number; locationId: string; location: { id: string; name: string } | null } | null>()
})
