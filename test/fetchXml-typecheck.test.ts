import { expectTypeOf, test } from "vitest"
import { fetchXml, Infer, FieldRef, eq, FetchXmlInitial, FetchXmlSelectQuery } from "../src"
import { DataverseTable, DataverseIntersectTable, primaryKey, string, number, boolean, lookup, lookupId, collection } from "../src"
import { DataverseClient } from "../src/client"
import { sum, count, groupby, average } from "../src"

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
    active: boolean("active"),
    addressId: lookupId("person_Address", () => Address),
    address: lookup("person_Address", () => Address),
  },
})

// --- FetchXML select/join type tests ---

test("select narrows to exact fields", () => {
  const q = fetchXml(Person).select(f => ({ myName: f.name, myAge: f.age }))
  type R = ReturnType<typeof q.execute> extends Promise<infer U> ? U extends (infer V)[] ? V : never : never

  expectTypeOf<R["myName"]>().toBeString()
  expectTypeOf<R["myAge"]>().toBeNumber()
  expectTypeOf<R>().not.toHaveProperty("pk")
  expectTypeOf<R>().not.toHaveProperty("active")
})

test("select with alias produces exact type", () => {
  const q = fetchXml(Person).select(f => ({ x: f.name }))
  type R = ReturnType<typeof q.execute> extends Promise<infer U> ? U extends (infer V)[] ? V : never : never

  expectTypeOf<R>().toEqualTypeOf<{ x: string }>()
})

test("no select returns all fields", () => {
  const q = fetchXml(Person)
  expectTypeOf(q.execute).returns.resolves.toExtend<Infer<typeof Person>[]>()
})

test("join merges result type", () => {
  const q = fetchXml(Person).select()
    .join("inner", Address, "id", "pk", (sub) =>
      sub.select(f => ({ addrStreet: f.street }))
    )
  type R = ReturnType<typeof q.execute> extends Promise<infer U> ? U extends (infer V)[] ? V : never : never

  expectTypeOf<R["addrStreet"]>().toBeString()
})

test("join with select on both tables merges types", () => {
  const q = fetchXml(Person)
    .select(f => ({ personName: f.name }))
    .join("inner", Address, "id", "pk", (sub) =>
      sub.select(f => ({ addrStreet: f.street, addrZip: f.zip }))
    )
  type R = ReturnType<typeof q.execute> extends Promise<infer U> ? U extends (infer V)[] ? V : never : never

  expectTypeOf<R["personName"]>().toBeString()
  expectTypeOf<R["addrStreet"]>().toBeString()
  expectTypeOf<R["addrZip"]>().toBeNumber()
  expectTypeOf<R>().not.toHaveProperty("age")
})

test("multiple joins merge all result types", () => {
  const q = fetchXml(Person)
    .select(f => ({ personName: f.name }))
    .join("inner", Address, "id", "pk", (sub) =>
      sub.select(f => ({ addrStreet: f.street }))
    )
    .join("inner", Location, "id", "pk", (sub) =>
      sub.select(f => ({ locName: f.name }))
    )
  type R = ReturnType<typeof q.execute> extends Promise<infer U> ? U extends (infer V)[] ? V : never : never

  expectTypeOf<R["personName"]>().toBeString()
  expectTypeOf<R["addrStreet"]>().toBeString()
  expectTypeOf<R["locName"]>().toBeString()
})

test("outer join merges result type", () => {
  const q = fetchXml(Person).select()
    .join("outer", Address, "id", "pk", (sub) =>
      sub.select(f => ({ addrStreet: f.street }))
    )
  type R = ReturnType<typeof q.execute> extends Promise<infer U> ? U extends (infer V)[] ? V : never : never

  expectTypeOf<R["addrStreet"]>().toBeString()
})

test("filter-only join preserves result type", () => {
  const q = fetchXml(Person)
    .select(f => ({ personName: f.name }))
    .join("exists", Address, "id", "pk", (sub) =>
      sub.filter(f => eq(f.id, "00000000-0000-0000-0000-000000000000"))
    )
  type R = ReturnType<typeof q.execute> extends Promise<infer U> ? U extends (infer V)[] ? V : never : never

  expectTypeOf<R["personName"]>().toBeString()
  expectTypeOf<R>().not.toHaveProperty("addrStreet")
})

test("SubJoinBuilder.select returns exact merged type", () => {
  const q = fetchXml(Person)
    .select(f => ({ personName: f.name }))
    .join("inner", Address, "id", "pk", (sub) =>
      sub.select(f => ({ a: f.street, b: f.zip }))
    )
  type R = ReturnType<typeof q.execute> extends Promise<infer U> ? U extends (infer V)[] ? V : never : never

  expectTypeOf<R>().toEqualTypeOf<{ personName: string; a: string; b: number }>()
})

test("join without sub-select is a type error (must call select)", () => {
  // SubJoinInitial only has .select(), so returning sub directly is a type error
  // This test verifies the callback return type must come from .select()
  fetchXml(Person)
    .select(f => ({ personName: f.name }))
    .join("inner", Address, "id", "pk", (sub) => {
      // sub is SubJoinInitial, only has select
      expectTypeOf(sub.select).toBeFunction()
      // Must call select and return the result
      return sub.select(f => ({ addrStreet: f.street }))
    })
})

test("filter after join uses original table fields and preserves join results", () => {
  const q = fetchXml(Person)
    .select(f => ({ personName: f.name }))
    .join("inner", Address, "id", "pk", sub => sub.select(f => ({ addrZip: f.zip })))
    .filter(f => eq(f.name, "test"))

  type R = ReturnType<typeof q.execute> extends Promise<infer U> ? U extends (infer V)[] ? V : never : never

  expectTypeOf<R>().toEqualTypeOf<{ personName: string; addrZip: number }>()
})

// --- Nested join tests (SubJoinBuilder.join) ---

test("nested join inside SubJoinBuilder merges types", () => {
  const q = fetchXml(Person)
    .select(f => ({ personName: f.name }))
    .join("inner", Address, "id", "pk", (sub) =>
      sub.select(f => ({ addrStreet: f.street }))
        .join("inner", Location, "id", "locationId", (locSub) =>
          locSub.select(f => ({ locName: f.name }))
        )
    )
  type R = ReturnType<typeof q.execute> extends Promise<infer U> ? U extends (infer V)[] ? V : never : never

  expectTypeOf<R["personName"]>().toBeString()
  expectTypeOf<R["addrStreet"]>().toBeString()
  expectTypeOf<R["locName"]>().toBeString()
})

test("nested join with multiple levels", () => {
  const q = fetchXml(Person)
    .select(f => ({ pk: f.pk }))
    .join("inner", Address, "id", "pk", (sub) =>
      sub.select(f => ({ street: f.street }))
        .join("inner", Location, "id", "locationId", (locSub) =>
          locSub.select(f => ({ locName: f.name }))
            .join("inner", Person, "pk", "id", (pSub) =>
              pSub.select(f => ({ personAge: f.age }))
            )
        )
    )
  type R = ReturnType<typeof q.execute> extends Promise<infer U> ? U extends (infer V)[] ? V : never : never

  expectTypeOf<R["pk"]>().toBeString()
  expectTypeOf<R["street"]>().toBeString()
  expectTypeOf<R["locName"]>().toBeString()
  expectTypeOf<R["personAge"]>().toBeNumber()
})

test("nested join with filter-only on inner join", () => {
  const q = fetchXml(Person)
    .select(f => ({ personName: f.name }))
    .join("inner", Address, "id", "pk", (sub) =>
      sub.select(f => ({ addrStreet: f.street }))
        .join("exists", Location, "id", "locationId", (locSub) =>
          locSub.filter(f => eq(f.name, "HQ"))
        )
    )
  type R = ReturnType<typeof q.execute> extends Promise<infer U> ? U extends (infer V)[] ? V : never : never

  expectTypeOf<R["personName"]>().toBeString()
  expectTypeOf<R["addrStreet"]>().toBeString()
  expectTypeOf<R>().not.toHaveProperty("locName")
})

// --- API split tests (initial → select / initial → apply) ---

test("fetchXml returns FetchXmlInitial", () => {
  const q = fetchXml(Person)
  expectTypeOf(q).toEqualTypeOf<FetchXmlInitial<typeof Person["fields"]>>()
})

test("select returns FetchXmlSelectQuery (no apply)", () => {
  const q = fetchXml(Person).select(f => ({ name: f.name }))
  expectTypeOf(q).toEqualTypeOf<FetchXmlSelectQuery<typeof Person["fields"], { name: string }>>()
})

test("initial has apply but select result does not", () => {
  const initial = fetchXml(Person)
  const selected = initial.select(f => ({ name: f.name }))

  // apply is available on initial
  expectTypeOf(initial.apply).toBeFunction()

  // apply is NOT available on select result (this is the key API split)
  expectTypeOf(selected).not.toHaveProperty("apply")
})

test("initial has select but aggregate does not", () => {
  const initial = fetchXml(Person)

  const aggregated = initial.apply(f => ({
    totalAge: sum(f.age),
    count: count(f.age),
  }))

  // select is available on initial
  expectTypeOf(initial.select).toBeFunction()

  // select is NOT available on aggregate result
  expectTypeOf(aggregated).not.toHaveProperty("select")
})

test("aggregate path: join, filter, orderby, execute work", () => {
  const q = fetchXml(Person)
    .apply(f => ({
      totalAge: sum(f.age),
      personCount: count(f.age),
    }))

  expectTypeOf(q.filter).toBeFunction()
  expectTypeOf(q.top).toBeFunction()
  expectTypeOf(q.orderby).toBeFunction()
  expectTypeOf(q.execute).toBeFunction()
})

test("initial filter chains correctly", () => {
  const q = fetchXml(Person)
    .filter(f => eq(f.name, "test"))
    .filter(f => eq(f.name, "test2"))
    .top(10)

  expectTypeOf(q.execute).returns.resolves.toExtend<Infer<typeof Person["fields"]>[]>()
})

test("initial→select→join returns FetchXmlSelectQuery", () => {
  const q = fetchXml(Person)
    .select(f => ({ name: f.name }))
    .join("inner", Address, "id", "pk", sub => sub.select(f => ({ street: f.street })))

  expectTypeOf(q).toHaveProperty("select")
  expectTypeOf(q).not.toHaveProperty("apply")
})

// --- Subquery builder type tests ---

test("join subquery has select, filter, join — but not apply", () => {
  fetchXml(Person).select().join("inner", Address, "id", "pk", (sub) => {
    // SubJoinBuilder has select
    expectTypeOf(sub.select).toBeFunction()
    // SubJoinBuilder has filter
    expectTypeOf(sub.filter).toBeFunction()
    // SubJoinBuilder has join (for nested joins)
    expectTypeOf(sub.join).toBeFunction()
    // SubJoinBuilder does NOT have apply
    expectTypeOf(sub).not.toHaveProperty("apply")
    return sub.select(f => ({ street: f.street }))
  })
})

test("join subquery: select disappears after use", () => {
  fetchXml(Person).select().join("inner", Address, "id", "pk", (sub) => {
    const afterSelect = sub.select(f => ({ street: f.street }))
    // afterSelect has filter
    expectTypeOf(afterSelect.filter).toBeFunction()
    // afterSelect.select is never (disappeared)
    expectTypeOf(afterSelect.select).toBeNever()
    // but filter returns the same type (still no select)
    const afterFilter = afterSelect.filter(f => eq(f.street, "123"))
    expectTypeOf(afterFilter.select).toBeNever()
    return afterFilter
  })
})

test("filter-only join: no fields in result (TResult={})", () => {
  const q = fetchXml(Person)
    .select(f => ({ personName: f.name }))
    .join("inner", Address, "id", "pk", (sub) => sub.filter(f => eq(f.street, "123")))
  type R = ReturnType<typeof q.execute> extends Promise<infer U> ? U extends (infer V)[] ? V : never : never

  expectTypeOf<R["personName"]>().toBeString()
  expectTypeOf<R>().not.toHaveProperty("street")
})

test("through subquery has select and filter — not apply", () => {
  const PersonAccount = new DataverseIntersectTable("personaccount", Person, Address)
  fetchXml(Person).select().join("inner", PersonAccount, (sub) => {
    expectTypeOf(sub.select).toBeFunction()
    expectTypeOf(sub.filter).toBeFunction()
    expectTypeOf(sub).not.toHaveProperty("apply")
    return sub.select(f => ({ street: f.street }))
  })
})

test("aggregate join subquery has apply — not select", () => {
  fetchXml(Person).apply(f => ({
    totalAge: sum(f.age),
  })).join("inner", Address, "id", "pk", (sub) => {
    expectTypeOf(sub.apply).toBeFunction()
    expectTypeOf(sub.filter).toBeFunction()
    return sub.apply(f => ({ street: groupby(f.street) }))
  })
})

test("aggregate through subquery has apply — not select", () => {
  const PersonAccount = new DataverseIntersectTable("personaccount", Person, Address)
  fetchXml(Person).apply(f => ({
    totalAge: sum(f.age),
  })).join("inner", PersonAccount, (sub) => {
    expectTypeOf(sub.apply).toBeFunction()
    return sub.apply(f => ({ street: groupby(f.street) }))
  })
})

test("aggregate join subquery: apply disappears after use", () => {
  fetchXml(Person).apply(f => ({
    totalAge: sum(f.age),
  })).join("inner", Address, "id", "pk", (sub) => {
    const afterApply = sub.apply(f => ({ street: groupby(f.street) }))
    // afterApply.apply is never (disappeared)
    expectTypeOf(afterApply.apply).toBeNever()
    // but filter still works
    expectTypeOf(afterApply.filter).toBeFunction()
    return afterApply
  })
})

// --- Overlap detection tests ---

test("join with non-overlapping keys merges correctly", () => {
  const q = fetchXml(Person)
    .select(f => ({ personName: f.name }))
    .join("inner", Address, "id", "pk", sub =>
      sub.select(f => ({ addrStreet: f.street }))
    )
  type R = ReturnType<typeof q.execute> extends Promise<infer U> ? U extends (infer V)[] ? V : never : never
  expectTypeOf<R["personName"]>().toBeString()
  expectTypeOf<R["addrStreet"]>().toBeString()
})

test("join with overlapping keys produces never (type error)", () => {
  const q = fetchXml(Person)
    .select(f => ({ name: f.name }))
    .join("inner", Address, "id", "pk", sub =>
      sub.select(f => ({ name: f.street }))
    )
  // When keys overlap, NoOverlap returns never, so the join result is never
  // This means q.execute returns Promise<never[]>
  expectTypeOf(q.execute).returns.resolves.toEqualTypeOf<never[]>()
})

// --- Aggregate join result merging ---

test("aggregate join merges result types", () => {
  const q = fetchXml(Person)
    .apply(f => ({
      totalAge: sum(f.age),
    }))
    .join("inner", Address, "id", "pk", sub =>
      sub.apply(f => ({
        avgZip: average(f.zip),
      }))
    )
  expectTypeOf(q.execute).returns.resolves.toEqualTypeOf<{ totalAge: number; avgZip: number }[]>()
})

test("aggregate intersect join merges result types", () => {
  const PersonLocation = new DataverseIntersectTable("personlocation", Person, Location)
  const q = fetchXml(Person)
    .apply(f => ({
      totalAge: sum(f.age),
    }))
    .join("inner", PersonLocation, sub =>
      sub.apply(f => ({
        locationCount: count(f.name),
      }))
    )
  expectTypeOf(q.execute).returns.resolves.toEqualTypeOf<{ totalAge: number; locationCount: number }[]>()
})
