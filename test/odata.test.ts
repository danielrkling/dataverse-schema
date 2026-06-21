import { expect, expectTypeOf, test } from "vitest"
import { DataverseClient } from "../src/client"
import { fetchOdata, ODataQuery, eq, ne, gt, ge, lt, le, and, or, not, any, all, compare, contains, startsWith, endsWith, sum, avg, min, max, count } from "../src"
import { DataverseTable, primaryKey, string, number, boolean, datetime, lookup, lookupId, collection, Infer } from "../src"
import { BASE_URL } from "./mocks/handlers"

const client = new DataverseClient({ url: BASE_URL })

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
    active: boolean("active"),
    primaryAddressId: lookupId("person_Address", () => Address),
    primaryAddress: lookup("person_Address", () => Address),
    addresses: collection("person_Address_person", () => Address),
    createdOn: datetime("createdon"),
  },
})

// --- TripPin-inspired schema (https://www.odata.org/blog/trippin-new-odata-v4-sample-service/) ---

const TrippinTrip = new DataverseTable({
  client, entitySetName: "trippin_trips", logicalName: "trippin_trip",
  fields: {
    tripId: primaryKey("tripid"),
    name: string("trip_name"),
    budget: number("budget"),
  },
})

const TrippinPerson = new DataverseTable({
  client, entitySetName: "trippin_people", logicalName: "trippin_person",
  fields: {
    userName: primaryKey("username"),
    firstName: string("firstname"),
    lastName: string("lastname"),
    age: number("person_age"),
    gender: string("gendercode"),
    trips: collection("trips_nav", () => TrippinTrip),
  },
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
  const q = fetchOdata(Person).where(f => eq(f.name, "John"))
  expectTypeOf(q.execute).returns.resolves.toExtend<Infer<typeof Person>[]>()
})

test("orderby preserves result type", () => {
  const q = fetchOdata(Person).orderby(f => f.name)
  expectTypeOf(q.execute).returns.resolves.toExtend<Infer<typeof Person>[]>()
})

test("groupby merges grouped fields and aggregate types", () => {
  const q = fetchOdata(Person)
    .groupby(f => [f.age], f => ({ total: sum(f.age), average: avg(f.age) }))
  expectTypeOf(q.execute).returns.resolves.items.toMatchTypeOf<{ age: number; total: number; average: number }>()
})

test("groupby typed max aggregate with grouped field", () => {
  const q = fetchOdata(Person)
    .groupby(f => [f.name], f => ({ latest: max(f.age) }))
  expectTypeOf(q.execute).returns.resolves.items.toMatchTypeOf<{ name: string; latest: number }>()
})

test("groupby without aggregate returns grouped fields only", () => {
  const q = fetchOdata(Person)
    .groupby(f => [f.age])
  expectTypeOf(q.execute).returns.resolves.items.toMatchTypeOf<{ age: number }>()
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

test("multi-expand on lookup and collection nav properties", () => {
  const q = fetchOdata(Person)
    .expand("primaryAddress", sub => sub.select("street"))
    .expand("addresses", sub => sub.select("zip"))
    .toString()
  expect(q).toContain("$expand=person_Address($select=street_Address),person_Address_person($select=zip_code)")
})

test("expand with filter on collection nav property", () => {
  const q = fetchOdata(Person)
    .expand("addresses", sub => sub.where(f => eq(f.street, "Main")))
    .toString()
  expect(q).toContain("person_Address_person(")
  expect(q).toContain("$filter=(street_Address eq 'Main')")
})

test("expand with select, filter, and orderby on collection nav", () => {
  const q = fetchOdata(Person)
    .expand("addresses", sub => sub
      .select("street", "zip")
      .where(f => `${f.zip} gt 10000`)
      .orderby(f => f.street)
    )
    .toString()
  expect(q).toContain("$select=street_Address,zip_code")
  expect(q).toContain("$filter=zip_code gt 10000")
  expect(q).toContain("$orderby=street_Address asc")
})

test("orderby resolves field names with new API", () => {
  const q = fetchOdata(Person)
    .orderby(f => f.name)
    .orderby(f => f.age, "desc")
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
    .orderby(f => f.name)
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

test("default select includes all value columns", () => {
  const q = fetchOdata(Person).toString()
  expect(q).toContain("$select=")
  expect(q).toContain("personid")
  expect(q).toContain("fullname")
  expect(q).toContain("person_age")
})

test("existing filter functions work with field proxy", () => {
  const q = fetchOdata(Person)
    .where(f => and(eq(f.name, "John"), gt(f.age, 20)))
    .toString()
  expect(q).toContain("fullname eq 'John'")
  expect(q).toContain("person_age gt 20")
})

test("startsWith via field proxy", () => {
  const q = fetchOdata(Person)
    .where(f => startsWith(f.name, "A"))
    .toString()
  expect(q).toContain("startswith(fullname,'A')")
})

test("endsWith via field proxy", () => {
  const q = fetchOdata(Person)
    .where(f => endsWith(f.name, "Inc."))
    .toString()
  expect(q).toContain("endswith(fullname,'Inc.')")
})

test("not via field proxy", () => {
  const q = fetchOdata(Person)
    .where(f => not(contains(f.name, "sample")))
    .toString()
  expect(q).toContain("not(contains(fullname,'sample'))")
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
    .where(f => eq(f.name, "John"))
    .where(f => gt(f.age, 20))
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

test("grouping operators use parentheses for precedence", () => {
  const q = fetchOdata(Person)
    .where(f => and(
      or(contains(f.name, "sample"), contains(f.name, "test")),
      eq(f.active, true),
    ))
    .toString()
  expect(q).toContain("$filter=((contains(fullname,'sample') or contains(fullname,'test')) and (active eq true))")
})

// --- orderby new API ---

test("orderby with direction defaults to asc", () => {
  const q = fetchOdata(Person).orderby(f => f.name).toString()
  expect(q).toContain("$orderby=fullname asc")
})

test("orderby with desc direction", () => {
  const q = fetchOdata(Person).orderby(f => f.name, "desc").toString()
  expect(q).toContain("$orderby=fullname desc")
})

test("orderby with nav property path", () => {
  const q = fetchOdata(Person)
    .orderby(f => f.primaryAddress.street, "desc")
    .toString()
  expect(q).toContain("$orderby=person_Address/street_Address desc")
})

test("multiple orderby calls accumulate", () => {
  const q = fetchOdata(Person)
    .orderby(f => f.name)
    .orderby(f => f.age, "desc")
    .toString()
  expect(q).toContain("fullname asc")
  expect(q).toContain("person_age desc")
})

// --- groupby ---

test("groupby single field with sum aggregate", () => {
  const q = fetchOdata(Person)
    .groupby(f => [f.age], f => ({ total: sum(f.age) }))
    .toString()
  expect(q).toContain("$apply=groupby((person_age),aggregate(person_age with sum as total))")
})

test("groupby single field with avg aggregate", () => {
  const q = fetchOdata(Person)
    .groupby(f => [f.age], f => ({ average: avg(f.age) }))
    .toString()
  expect(q).toContain("$apply=groupby((person_age),aggregate(person_age with average as average))")
})

test("groupby single field with min aggregate", () => {
  const q = fetchOdata(Person)
    .groupby(f => [f.age], f => ({ minimum: min(f.age) }))
    .toString()
  expect(q).toContain("$apply=groupby((person_age),aggregate(person_age with min as minimum))")
})

test("groupby single field with max aggregate", () => {
  const q = fetchOdata(Person)
    .groupby(f => [f.age], f => ({ maximum: max(f.age) }))
    .toString()
  expect(q).toContain("$apply=groupby((person_age),aggregate(person_age with max as maximum))")
})

test("groupby with count aggregate", () => {
  const q = fetchOdata(Person)
    .groupby(f => [f.age], f => ({ cnt: count() }))
    .toString()
  expect(q).toContain("$apply=groupby((person_age),aggregate($count as cnt))")
})

test("groupby multiple fields with sum aggregate", () => {
  const q = fetchOdata(Person)
    .groupby(f => [f.age, f.name], f => ({ total: sum(f.age) }))
    .toString()
  expect(q).toContain("$apply=groupby((person_age,fullname),aggregate(person_age with sum as total))")
})

test("groupby multiple fields with multiple aggregates", () => {
  const q = fetchOdata(Person)
    .groupby(f => [f.name], f => ({ total: sum(f.age), average: avg(f.age) }))
    .toString()
  expect(q).toContain("$apply=groupby((fullname),aggregate(person_age with sum as total,person_age with average as average))")
})

test("groupby empty callback aggregates without grouping", () => {
  const q = fetchOdata(Person)
    .groupby(() => [], f => ({ total: sum(f.age) }))
    .toString()
  expect(q).toContain("$apply=aggregate(person_age with sum as total)")
  expect(q).not.toContain("groupby")
})

test("groupby without aggregate callback", () => {
  const q = fetchOdata(Person)
    .groupby(f => [f.age])
    .toString()
  expect(q).toContain("$apply=groupby((person_age))")
})

test("aggregate min and max on date field (last/first created)", () => {
  const q = fetchOdata(Person)
    .groupby(() => [], f => ({ lastCreate: max(f.createdOn), firstCreate: min(f.createdOn) }))
    .toString()
  expect(q).toContain("$apply=aggregate(createdon with max as lastCreate,createdon with min as firstCreate)")
})

test("groupby with nav property path and includeAnnotations", () => {
  const Contact = new DataverseTable({
    client, entitySetName: "contacts", logicalName: "contact",
    fields: {
      id: primaryKey("contactid"),
      fullname: string("fullname"),
    },
  })

  const Account = new DataverseTable({
    client, entitySetName: "accounts", logicalName: "account",
    fields: {
      id: primaryKey("accountid"),
      name: string("name"),
      revenue: number("revenue"),
      primaryContactId: lookupId("primarycontactid", () => Contact),
      primaryContact: lookup("primarycontactid", () => Contact),
    },
  })

  const q = fetchOdata(Account)
    .groupby(f => [f.primaryContact.fullname], f => ({ total: sum(f.revenue) }))
    .toString()
  expect(q).toContain("$apply=groupby((primarycontactid/fullname),aggregate(revenue with sum as total))")
})

// --- Filter helpers ---

test("any lambda filter", () => {
  const q = fetchOdata(Person)
    .where(f => any(f.addresses, a => contains(a.street, "Seattle")))
    .toString()
  expect(q).toContain("person_Address_person/any(x: contains(x/street_Address,'Seattle'))")
})

test("all lambda filter", () => {
  const q = fetchOdata(Person)
    .where(f => all(f.addresses, a => gt(a.zip, 0)))
    .toString()
  expect(q).toContain("person_Address_person/all(x: (x/zip_code gt 0))")
})

test("any used in where clause with raw string", () => {
  const q = fetchOdata(Person)
    .where(f => any(f.addresses, a => `contains(x/street_Address, 'Seattle')`))
    .toString()
  expect(q).toContain("person_Address_person/any(x: contains(x/street_Address, 'Seattle'))")
})

test("column comparison", () => {
  const q = fetchOdata(Person)
    .where(f => compare(f.name, "eq", f.age))
    .toString()
  expect(q).toContain("(fullname eq person_age)")
})

test("any with equals inside callback", () => {
  const q = fetchOdata(Person)
    .where(f => any(f.addresses, a => eq(a.street, "Main")))
    .toString()
  expect(q).toContain("person_Address_person/any(x: (x/street_Address eq 'Main'))")
})

test("any with contains inside callback", () => {
  const q = fetchOdata(Person)
    .where(f => any(f.addresses, a => contains(a.street, "Main")))
    .toString()
  expect(q).toContain("person_Address_person/any(x: contains(x/street_Address,'Main'))")
})

test("all with raw string callback", () => {
  const q = fetchOdata(Person)
    .where(f => all(f.addresses, a => `${a.zip} gt 0`))
    .toString()
  expect(q).toContain("person_Address_person/all(x: x/zip_code gt 0)")
})

test("multiple any calls compose via and", () => {
  const q = fetchOdata(Person)
    .where(f => and(
      any(f.addresses, a => contains(a.street, "Main")),
      any(f.addresses, b => eq(b.zip, "98101")),
    ))
    .toString()
  expect(q).toContain("any(x: contains(x/street_Address,'Main'))")
  expect(q).toContain("any(x: (x/zip_code eq '98101'))")
})

test("any and other where conditions combine", () => {
  const q = fetchOdata(Person)
    .where(f => and(
      eq(f.name, "John"),
      any(f.addresses, a => contains(a.street, "Main")),
    ))
    .toString()
  expect(q).toContain("((fullname eq 'John') and person_Address_person/any(x: contains(x/street_Address,'Main')))")
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
    .where(f => eq(f.primaryAddress.zip, "98101"))
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
    .where(f => any(f.addresses, a => contains(a.street, "Main")))
    .toString()
  expect(q).toContain("person_Address_person/any(x: contains(x/street_Address,'Main'))")
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

// --- TripPin-inspired tests (real-world OData v4 patterns) ---

test("TripPin: select basic fields (FirstName, LastName, Age)", () => {
  const q = fetchOdata(TrippinPerson)
    .select("firstName", "lastName", "age")
    .toString()
  expect(q).toBe("$select=firstname,lastname,person_age")
})

test("TripPin: filter by gender enum value", () => {
  const q = fetchOdata(TrippinPerson)
    .where(f => eq(f.gender, "Male"))
    .toString()
  expect(q).toContain("gendercode eq 'Male'")
})

test("TripPin: filter not null (Age ne null)", () => {
  const q = fetchOdata(TrippinPerson)
    .where(f => ne(f.age, null))
    .toString()
  expect(q).toContain("(person_age ne null)")
})

test("TripPin: filter with age range using ge and le", () => {
  const q = fetchOdata(TrippinPerson)
    .where(f => or(
      ge(f.age, "18"),
      le(f.age, "65"),
    ))
    .toString()
  expect(q).toContain("(person_age ge '18')")
  expect(q).toContain("(person_age le '65')")
})

test("TripPin: filter with raw age range expression", () => {
  const q = fetchOdata(TrippinPerson)
    .where(f => `(person_age ge 18 and person_age le 65)`)
    .toString()
  expect(q).toContain("person_age ge 18")
  expect(q).toContain("person_age le 65")
})

test("TripPin: expand trips navigation property", () => {
  const q = fetchOdata(TrippinPerson)
    .expand("trips", sub => sub.select("name", "budget"))
    .toString()
  expect(q).toContain("$expand=trips_nav($select=trip_name,budget)")
})

test("TripPin: multiple orderby with different directions", () => {
  const q = fetchOdata(TrippinPerson)
    .orderby(f => f.lastName)
    .orderby(f => f.firstName, "desc")
    .toString()
  expect(q).toContain("lastname asc")
  expect(q).toContain("firstname desc")
})

test("TripPin: contains on string field (find by first name)", () => {
  const q = fetchOdata(TrippinPerson)
    .where(f => contains(f.firstName, "Russell"))
    .toString()
  expect(q).toContain("contains(firstname,'Russell')")
})

test("TripPin: combined real-world query (select, filter, orderby, top)", () => {
  const q = fetchOdata(TrippinPerson)
    .select("firstName", "lastName", "age")
    .where(f => `person_age gt 20`)
    .orderby(f => f.lastName)
    .top(10)
    .toString()
  expect(q).toContain("$select=firstname,lastname,person_age")
  expect(q).toContain("$filter=person_age gt 20")
  expect(q).toContain("$orderby=lastname asc")
  expect(q).toContain("$top=10")
})

test("TripPin: filter by first name AND last name", () => {
  const q = fetchOdata(TrippinPerson)
    .where(f => and(eq(f.firstName, "Russell"), eq(f.lastName, "Whyte")))
    .toString()
  expect(q).toContain("firstname eq 'Russell'")
  expect(q).toContain("lastname eq 'Whyte'")
})

test("TripPin: compare age with column comparison", () => {
  const q = fetchOdata(TrippinPerson)
    .where(f => compare(f.age, "gt", f.firstName))
    .toString()
  expect(q).toContain("(person_age gt firstname)")
})

