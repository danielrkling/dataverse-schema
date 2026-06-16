import { expect, expectTypeOf, test } from "vitest"
import { DataverseClient } from "../src/client"
import { fetchOdata, ODataQuery, equals, greaterThan, and, any, all, compare, contains, asc, desc } from "../src"
import { table, primaryKey, string, number, boolean, lookup, lookupId, collection, Infer } from "../src"
import { BASE_URL } from "./mocks/handlers"

const client = new DataverseClient({ url: BASE_URL })

const Location = table(client, "locations", {
  id: primaryKey("locationid"),
  name: string("location_name"),
})

const Address = table(client, "addresses", {
  id: primaryKey("addressid"),
  street: string("street_Address"),
  zip: number("zip_code"),
  locationId: lookupId("address_Location", () => Location),
  location: lookup("address_Location", () => Location),
})

const Person = table(client, "people", {
  pk: primaryKey("personid"),
  name: string("fullname"),
  age: number("person_age"),
  active: boolean("active"),
  primaryAddressId: lookupId("person_Address", () => Address),
  primaryAddress: lookup("person_Address", () => Address),
  addresses: collection("person_Address_person", () => Address),
})


// --- Type inference tests (compile-time, no mock needed) ---

test("from returns full type by default", () => {
  const q = fetchOdata(Person)
  expectTypeOf(q.execute).returns.resolves.toExtend<Infer<typeof Person>[]>()
})

test("select narrows result type", () => {
  const q = fetchOdata(Person).select("name", "age")
  expectTypeOf(q.execute).returns.resolves.toExtend<{ name: string; age: number }[]>()
})

test("expand narrows nav property type", () => {
  const q = fetchOdata(Person).expand("primaryAddress", sub => sub.select("street"))
  expectTypeOf(q.execute).returns.resolves.toExtend<{ primaryAddress: { street: string } | null }[]>()
})

test("select + expand combined", () => {
  const q = fetchOdata(Person).select("name").expand("addresses", sub => sub.select("zip"))
  expectTypeOf(q.execute).returns.resolves.toExtend<{ name: string; addresses: { zip: number }[] }[]>()
})

test("where preserves result type", () => {
  const q = fetchOdata(Person).where(f => equals(f.name, "John"))
  expectTypeOf(q.execute).returns.resolves.toExtend<Infer<typeof Person>[]>()
})

test("orderby preserves result type", () => {
  const q = fetchOdata(Person).orderby({ name: "asc" })
  expectTypeOf(q.execute).returns.resolves.toExtend<Infer<typeof Person>[]>()
})

test("top preserves result type", () => {
  const q = fetchOdata(Person).top(10)
  expectTypeOf(q.execute).returns.resolves.toExtend<Infer<typeof Person>[]>()
})

// --- Runtime tests (verify query string output) ---

test("select resolves field names", () => {
  const q = fetchOdata(Person).select("name", "age").toString()
  expect(q).toBe("$select=fullname,person_age")
})

test("where receives field proxy with Dataverse names", () => {
  const q = fetchOdata(Person)
    .where(f => `(${f.name} eq 'John' and ${f.age} gt 20)`)
    .toString()
  expect(q).toContain("fullname eq 'John'")
  expect(q).toContain("person_age gt 20")
})

test("expand creates subquery with navigation name", () => {
  const q = fetchOdata(Person)
    .expand("primaryAddress", sub => sub.select("street", "zip"))
    .toString()
  expect(q).toContain("$expand=")
  expect(q).toContain("person_Address")
  expect(q).toContain("$select=street_Address,zip_code")
})

test("expand with where inside subquery", () => {
  const q = fetchOdata(Person)
    .expand("addresses", sub => sub.where(f => `${f.zip} eq 12345`))
    .toString()
  expect(q).toContain("person_Address_person")
  expect(q).toContain("zip_code eq 12345")
})

test("orderby resolves field names", () => {
  const q = fetchOdata(Person)
    .orderby({ name: "asc", age: "desc" })
    .toString()
  expect(q).toContain("fullname asc")
  expect(q).toContain("person_age desc")
})

test("top sets $top", () => {
  const q = fetchOdata(Person).top(10).toString()
  expect(q).toContain("$top=10")
})

test("full query combines all clauses", () => {
  const q = fetchOdata(Person)
    .select("name", "age")
    .where(f => `${f.active} eq true`)
    .orderby({ name: "asc" })
    .top(5)
    .expand("primaryAddress", sub => sub.select("street").where(f => `${f.zip} gt 0`))
    .toString()
  expect(q).toContain("$select=fullname,person_age")
  expect(q).toContain("$filter=active eq true")
  expect(q).toContain("$orderby=fullname asc")
  expect(q).toContain("$top=5")
  expect(q).toContain("$expand=person_Address")
  expect(q).toContain("$select=street_Address")
  expect(q).toContain("$filter=zip_code gt 0")
})

test("empty query returns empty string", () => {
  const q = fetchOdata(Person).toString()
  expect(q).toBe("")
})

test("existing filter functions work with field proxy", () => {
  const q = fetchOdata(Person)
    .where(f => and(equals(f.name, "John"), greaterThan(f.age, 20)))
    .toString()
  expect(q).toContain("fullname eq 'John'")
  expect(q).toContain("person_age gt 20")
})

// --- where raw string overload ---

test("where accepts raw string directly", () => {
  const q = fetchOdata(Person)
    .where("fullname eq 'John'")
    .toString()
  expect(q).toContain("$filter=fullname eq 'John'")
})

test("where raw string works with other clauses", () => {
  const q = fetchOdata(Person)
    .select("name")
    .where("person_age gt 21")
    .top(5)
    .toString()
  expect(q).toContain("$select=fullname")
  expect(q).toContain("$filter=person_age gt 21")
  expect(q).toContain("$top=5")
})

test("multiple where calls stack additively", () => {
  const q = fetchOdata(Person)
    .where(f => equals(f.name, "John"))
    .where(f => greaterThan(f.age, 20))
    .toString()
  expect(q).toContain("$filter=(fullname eq 'John') and (person_age gt 20)")
})

test("multiple where with raw strings stacks additively", () => {
  const q = fetchOdata(Person)
    .where("fullname eq 'John'")
    .where("person_age gt 20")
    .toString()
  expect(q).toContain("$filter=fullname eq 'John' and person_age gt 20")
})

// --- orderby function overload ---

test("orderby with function using top-level field", () => {
  const q = fetchOdata(Person)
    .orderby(f => ({ [f.name]: "asc" }))
    .toString()
  expect(q).toContain("$orderby=fullname asc")
})

test("orderby with function using nav property path", () => {
  const q = fetchOdata(Person)
    .orderby(f => ({ [f.primaryAddress.street]: "desc" }))
    .toString()
  expect(q).toContain("$orderby=person_Address/street_Address desc")
})

test("orderby object overload still works", () => {
  const q = fetchOdata(Person)
    .orderby({ name: "asc", age: "desc" })
    .toString()
  expect(q).toContain("fullname asc")
  expect(q).toContain("person_age desc")
})

// --- New builder methods ---

test("includeCount adds $count=true", () => {
  const q = fetchOdata(Person).includeCount().toString()
  expect(q).toBe("$count=true")
})

test("apply adds $apply expression", () => {
  const q = fetchOdata(Person).apply("groupby((person_age),aggregate(person_age with sum as total))").toString()
  expect(q).toContain("$apply=groupby((person_age),aggregate(person_age with sum as total))")
})

test("expandRef generates $ref expand", () => {
  const q = fetchOdata(Person).expandRef("primaryAddress").toString()
  expect(q).toContain("person_Address/$ref")
})

test("expandRef type removes nav property from result", () => {
  const q = fetchOdata(Person).expandRef("primaryAddress")
  expectTypeOf(q.execute).returns.resolves.toExtend<{ name: string; age: number }[]>()
})

test("aaCombine apply with select and filter", () => {
  const q = fetchOdata(Person)
    .select("name")
    .where(f => equals(f.age, "30"))
    .apply("aggregate(person_age with sum as total)")
    .toString()
  expect(q).toContain("$select=fullname")
  expect(q).toContain("$filter=(person_age eq '30')")
  expect(q).toContain("$apply=aggregate(person_age with sum as total)")
})

// --- Filter helpers ---

test("any lambda filter", () => {
  const filter = any("person_Address_person", "a", "contains(a/city, 'Seattle')")
  expect(filter).toBe("person_Address_person/any(a: contains(a/city, 'Seattle'))")
})

test("all lambda filter", () => {
  const filter = all("person_Address_person", "a", "a/zip_code gt 0")
  expect(filter).toBe("person_Address_person/all(a: a/zip_code gt 0)")
})

test("any used in where clause", () => {
  const q = fetchOdata(Person)
    .where(f => any(f.addresses, "a", `contains(a/city, 'Seattle')`))
    .toString()
  // f.addresses resolves to "person_Address_person" which is the nav property name
  expect(q).toContain("person_Address_person/any(a: contains(a/city, 'Seattle'))")
})

test("column comparison", () => {
  const q = fetchOdata(Person)
    .where(f => compare(f.name, "eq", f.age))
    .toString()
  expect(q).toContain("(fullname eq person_age)")
})

// --- Lambda callback API (any/all methods on nav proxy) ---

test("any method on nav proxy with explicit alias", () => {
  const q = fetchOdata(Person)
    .where(f => f.addresses.any("a", a => `contains(a/street_Address, 'Main')`))
    .toString()
  expect(q).toContain("person_Address_person/any(a: contains(a/street_Address, 'Main'))")
})

test("any method on nav proxy with auto alias", () => {
  const q = fetchOdata(Person)
    .where(f => f.addresses.any(a => `contains(a/street_Address, 'Main')`))
    .toString()
  expect(q).toContain("person_Address_person/any(a: contains(a/street_Address, 'Main'))")
})

test("all method on nav proxy with auto alias", () => {
  const q = fetchOdata(Person)
    .where(f => f.addresses.all(a => `${a.zip} gt 0`))
    .toString()
  expect(q).toContain("person_Address_person/all(a: a/zip_code gt 0)")
})

test("auto alias increments across multiple any calls", () => {
  const q = fetchOdata(Person)
    .where(f => and(
      f.addresses.any(a => contains(a.street, "Main")),
      f.addresses.any(b => equals(b.zip, "98101")),
    ))
    .toString()
  expect(q).toContain("any(a: contains(a/street_Address,'Main'))")
  expect(q).toContain("any(b: (b/zip_code eq '98101'))")
})

test("any with equals inside callback (auto alias)", () => {
  const q = fetchOdata(Person)
    .where(f => f.addresses.any(a => equals(a.street, "Main")))
    .toString()
  expect(q).toContain("person_Address_person/any(a: (a/street_Address eq 'Main'))")
})

test("any with contains inside callback (auto alias)", () => {
  const q = fetchOdata(Person)
    .where(f => f.addresses.any(a => contains(a.street, "Main")))
    .toString()
  expect(q).toContain("person_Address_person/any(a: contains(a/street_Address,'Main'))")
})

test("any and other where conditions combine (auto alias)", () => {
  const q = fetchOdata(Person)
    .where(f => and(
      equals(f.name, "John"),
      f.addresses.any(a => contains(a.street, "Main")),
    ))
    .toString()
  expect(q).toContain("((fullname eq 'John') and person_Address_person/any(a: contains(a/street_Address,'Main')))")
})

// --- Nested expand ---

// --- Filter on related data via nav property sub-proxy ---

test("filter on lookup nav property sub-field generates slash path", () => {
  const q = fetchOdata(Person)
    .where(f => `${f.primaryAddress.street} eq '123 Main'`)
    .toString()
  expect(q).toContain("person_Address/street_Address eq '123 Main'")
})

test("filter on lookup nav property sub-field with equals", () => {
  const q = fetchOdata(Person)
    .where(f => equals(f.primaryAddress.zip, "98101"))
    .toString()
  expect(q).toContain("(person_Address/zip_code eq '98101')")
})

test("nested nav property sub-field (two hops)", () => {
  const q = fetchOdata(Person)
    .where(f => `${f.primaryAddress.location.name} eq 'HQ'`)
    .toString()
  expect(q).toContain("person_Address/address_Location/location_name eq 'HQ'")
})

test("nested nav property with filter function", () => {
  const q = fetchOdata(Person)
    .where(f => contains(f.primaryAddress.location.name, "HQ"))
    .toString()
  expect(q).toContain("contains(person_Address/address_Location/location_name,'HQ')")
})

test("nav proxy toString works in template literal", () => {
  const q = fetchOdata(Person)
    .where(f => `${f.primaryAddress} eq something`)
    .toString()
  expect(q).toContain("person_Address eq something")
})

test("nav proxy works with any lambda", () => {
  const q = fetchOdata(Person)
    .where(f => any(f.addresses, "a", `contains(a/street_Address, 'Main')`))
    .toString()
  expect(q).toContain("person_Address_person/any(a: contains(a/street_Address, 'Main'))")
})

test("nested expand generates nested query string", () => {
  const q = fetchOdata(Person)
    .expand("primaryAddress", sub =>
      sub.expand("location", sub2 => sub2.select("name"))
    )
    .toString()
  expect(q).toContain("person_Address")
  expect(q).toContain("address_Location")
  expect(q).toContain("$select=location_name")
})

test("nested expand type inference", () => {
  const q = fetchOdata(Person).expand("primaryAddress", sub =>
    sub.expand("location", sub2 => sub2.select("name"))
  )
  expectTypeOf(q.execute).returns.resolves.toExtend<{
    primaryAddress: { location: { name: string } | null } | null
  }[]>()
})

// --- orderby with asc/desc helpers ---

test("orderby with asc helper", () => {
  const q = fetchOdata(Person)
    .orderby(f => asc(f.name))
    .toString()
  expect(q).toContain("$orderby=fullname asc")
})

test("orderby with desc helper", () => {
  const q = fetchOdata(Person)
    .orderby(f => desc(f.age))
    .toString()
  expect(q).toContain("$orderby=person_age desc")
})

test("orderby with mixed asc and desc", () => {
  const q = fetchOdata(Person)
    .orderby(f => [asc(f.name), desc(f.age)])
    .toString()
  expect(q).toContain("$orderby=fullname asc,person_age desc")
})

test("orderby with multi-field asc", () => {
  const q = fetchOdata(Person)
    .orderby(f => asc(f.name, f.age))
    .toString()
  expect(q).toContain("$orderby=fullname asc,person_age asc")
})

test("orderby asc with nav property path", () => {
  const q = fetchOdata(Person)
    .orderby(f => asc(f.primaryAddress.street))
    .toString()
  expect(q).toContain("$orderby=person_Address/street_Address asc")
})

test("orderby old function style still works", () => {
  const q = fetchOdata(Person)
    .orderby(f => ({ [f.name]: "asc", [f.age]: "desc" }))
    .toString()
  expect(q).toContain("fullname asc")
  expect(q).toContain("person_age desc")
})

test("orderby old object style still works", () => {
  const q = fetchOdata(Person)
    .orderby({ name: "asc", age: "desc" })
    .toString()
  expect(q).toContain("fullname asc")
  expect(q).toContain("person_age desc")
})
