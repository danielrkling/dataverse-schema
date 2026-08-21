import { expectTypeOf, test } from "vitest"
import {
  Infer, GUID, DataverseTable, DataverseClient,
  primaryKey, string, number, choice, datetime, lookup, collection,
  fetchOdata, eq, ne, gt, any, all, groupby, sum, count, FieldRef, FilterExpr,
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
    age: number("age"),
    location: lookup("location_id", () => Location),
  },
})

const Account = new DataverseTable({
  client, entitySetName: "accounts", logicalName: "account",
  fields: {
    id: primaryKey("accountid"),
    name: string("name"),
    revenue: number("revenue"),
    status: choice("statuscode", { 1: "Active", 2: "Inactive" } as const),
    createdOn: datetime("createdon"),
    primaryContact: lookup("primarycontactid", () => Contact),
    contacts: collection("account_contacts", () => Contact),
  },
})

// --- select inference ---

test("select narrows the execute result to chosen fields", () => {
  const q = fetchOdata(Account).select("name", "revenue")
  expectTypeOf(q.execute).returns.resolves.toEqualTypeOf<{ name: string; revenue: number }[]>()
})

test("select with no keys resolves to the full record type", () => {
  const q = fetchOdata(Account).select()
  expectTypeOf(q.execute).returns.resolves.toEqualTypeOf<Infer<typeof Account>[]>()
})

test("select rejects unknown keys", () => {
  const q = fetchOdata(Account)
  void (() => {
    // @ts-expect-error "bogus" is not a field of Account
    q.select("bogus")
  })
})

// --- expand inference ---

test("plain expand merges the related record type (lookup → nullable)", () => {
  const q = fetchOdata(Account).select("name").expand("primaryContact")
  type Row = Awaited<ReturnType<typeof q.execute>>[number]
  expectTypeOf<Row["primaryContact"]>().toEqualTypeOf<{ id: GUID; name: string; age: number; location: { id: GUID; name: string } | null } | null>()
})

test("plain expand merges the related records type (collection → array)", () => {
  const q = fetchOdata(Account).select("name").expand("contacts")
  type Row = Awaited<ReturnType<typeof q.execute>>[number]
  expectTypeOf<Row["contacts"]>().toEqualTypeOf<{ id: GUID; name: string; age: number; location: { id: GUID; name: string } | null }[]>()
})

test("collection expand with sub-select narrows element type", () => {
  const q = fetchOdata(Account).select("name").expand("contacts", sub => sub.select("name"))
  type Row = Awaited<ReturnType<typeof q.execute>>[number]
  expectTypeOf<Row["contacts"]>().toEqualTypeOf<{ name: string }[]>()
})

test("lookup expand with sub-select produces nullable merged type", () => {
  const q = fetchOdata(Account).select("id").expand("primaryContact", sub => sub.select("name"))
  type Row = Awaited<ReturnType<typeof q.execute>>[number]
  expectTypeOf<Row>().toEqualTypeOf<{ id: GUID; primaryContact: { name: string } | null }>()
})

test("nested expands merge recursively", () => {
  const q = fetchOdata(Account)
    .select("name")
    .expand("primaryContact", sub =>
      sub.select("name").expand("location", inner => inner.select("name")))
  type Row = Awaited<ReturnType<typeof q.execute>>[number]
  expectTypeOf<Row["primaryContact"]>().toEqualTypeOf<{ name: string; location: { name: string } | null } | null>()
})

test("multiple expands accumulate into the row type", () => {
  const q = fetchOdata(Account)
    .select("name")
    .expand("primaryContact", sub => sub.select("name"))
    .expand("contacts", sub => sub.select("age"))
  type Row = Awaited<ReturnType<typeof q.execute>>[number]
  expectTypeOf<Row>().toEqualTypeOf<{
    name: string
    primaryContact: { name: string } | null
    contacts: { age: number }[]
  }>()
})

// --- filter inference ---

test("filter callbacks receive typed field references", () => {
  const q = fetchOdata(Account).select("name").filter(f => {
    expectTypeOf(eq(f.name, "Acme")).toEqualTypeOf<FilterExpr>()
    expectTypeOf(eq(f.revenue, 10)).toEqualTypeOf<FilterExpr>()
    expectTypeOf(gt(f.createdOn, new Date())).toEqualTypeOf<FilterExpr>()
    expectTypeOf(any(f.contacts, c => eq(c.name, "x"))).toEqualTypeOf<FilterExpr>()
    expectTypeOf(all(f.contacts, c => eq(c.id, "00000000-0000-0000-0000-000000000000"))).toEqualTypeOf<FilterExpr>()
    return eq(f.name, "Acme")
  })
  expectTypeOf(q).not.toHaveProperty("apply")
})

test("filter value types are checked against field types", () => {
  const q = fetchOdata(Account).select("name")
  void (() => {
    // @ts-expect-error revenue is a number field
    q.filter(f => eq(f.revenue, "oops"))
    // @ts-expect-error createdOn expects a Date comparison value
    q.filter(f => gt(f.createdOn, "2024-01-01"))
    // @ts-expect-error bogus is not a field on the proxy
    q.filter(f => eq(f.bogus, 1))
  })
})

// --- orderby / top inference ---

test("orderby selectors are typed per field", () => {
  const q = fetchOdata(Account).select("name").orderby(f => f.revenue, "desc").top(5)
  expectTypeOf(q.toString()).toBeString()
  void (() => {
    const ordered = fetchOdata(Account).select("name").orderby(f => f.name)
    expectTypeOf(ordered.top).toBeFunction()
    // @ts-expect-error bogus is not a field on the proxy
    fetchOdata(Account).select("name").orderby(f => f.bogus)
  })
})

// --- apply / aggregation inference ---

test("apply infers aggregate result types", () => {
  const q = fetchOdata(Account).apply(f => ({
    byStatus: groupby(f.status),
    total: sum(f.revenue),
    n: count(),
  }))
  expectTypeOf(q.execute).returns.resolves.toEqualTypeOf<{
    byStatus: "Active" | "Inactive"
    total: number
    n: number
  }[]>()
})

test("ApplyQuery exposes filter/orderby/top but not select", () => {
  const q = fetchOdata(Account).apply(f => ({ total: sum(f.revenue) }))
  expectTypeOf(q.filter).toBeFunction()
  expectTypeOf(q.orderby).toBeFunction()
  expectTypeOf(q.top).toBeFunction()
  expectTypeOf(q.execute).toBeFunction()
  expectTypeOf(q).not.toHaveProperty("select")
})

test("apply alias proxy types orderby aliases", () => {
  const q = fetchOdata(Account).apply(f => ({ total: sum(f.revenue), n: count() }))
  const ordered = q.orderby(a => {
    expectTypeOf(a.total).toExtend<FieldRef<number>>()
    return a.n
  }, "desc")
  expectTypeOf(ordered.top).toBeFunction()
})

// --- Builder state machine ---

test("InitialQuery forces select or apply first", () => {
  const initial = fetchOdata(Account)
  expectTypeOf(initial.select).toBeFunction()
  expectTypeOf(initial.apply).toBeFunction()
  expectTypeOf(initial).not.toHaveProperty("filter")
  expectTypeOf(initial).not.toHaveProperty("orderby")
  expectTypeOf(initial).not.toHaveProperty("top")
  expectTypeOf(initial).not.toHaveProperty("execute")
})

test("SelectQuery does not expose apply", () => {
  const selected = fetchOdata(Account).select("name")
  expectTypeOf(selected).not.toHaveProperty("apply")
  expectTypeOf(selected.filter).toBeFunction()
  expectTypeOf(selected.expand).toBeFunction()
  expectTypeOf(selected.toAst).toBeFunction()
})

// --- Iteration inference ---

test("iterate and iteratePages yield narrowed rows", async () => {
  const q = fetchOdata(Account).select("name")
  async function check() {
    for await (const row of q.iterate()) {
      expectTypeOf(row).toEqualTypeOf<{ name: string }>()
    }
    for await (const page of q.iteratePages()) {
      expectTypeOf(page).toEqualTypeOf<{ name: string }[]>()
    }
  }
  expectTypeOf(check).returns.resolves.toBeVoid()
})
