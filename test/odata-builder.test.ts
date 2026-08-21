import { expect, test } from "vitest"
import {
  DataverseTable, DataverseClient, primaryKey, string, number, choice,
  lookup, collection, fetchOdata, any, all, eq, ne, gt, and, FieldRef,
  groupby, sum, count, average, min, max,
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
    primaryContact: lookup("primarycontactid", () => Contact),
    contacts: collection("account_contacts", () => Contact),
  },
})

// --- select ---

test("select with keys emits $select", () => {
  expect(fetchOdata(Account).select("name", "revenue").toString()).toBe("$select=name,revenue")
})

test("select without keys selects all value fields by dataverse name", () => {
  expect(fetchOdata(Account).select().toString()).toBe("$select=accountid,name,revenue,statuscode")
})

// --- filter ---

test("filter accepts raw strings", () => {
  expect(fetchOdata(Account).select("name").filter("revenue gt 10").toString()).toBe("$select=name&$filter=revenue gt 10")
})

test("filter accepts a pre-built FilterExpr", () => {
  const expr = eq(new FieldRef("name"), "A")
  expect(fetchOdata(Account).select("name").filter(expr).toString()).toBe("$select=name&$filter=(name eq 'A')")
})

test("filter accepts a typed selector callback", () => {
  const q = fetchOdata(Account).select("name").filter(f => eq(f.name, "Acme"))
  expect(q.toString()).toBe("$select=name&$filter=(name eq 'Acme')")
})

test("multiple filters are joined with and", () => {
  const q = fetchOdata(Account)
    .select("name")
    .filter(f => eq(f.name, "A"))
    .filter(f => gt(f.revenue, 100))
  expect(q.toString()).toBe("$select=name&$filter=(name eq 'A') and (revenue gt 100)")
})

// --- orderby / top ---

test("orderby accepts field selector and direction", () => {
  const q = fetchOdata(Account).select("name").orderby(f => f.revenue, "desc")
  expect(q.toString()).toBe("$select=name&$orderby=revenue desc")
})

test("orderby defaults to ascending", () => {
  const q = fetchOdata(Account).select("name").orderby(f => f.name)
  expect(q.toString()).toBe("$select=name&$orderby=name asc")
})

test("orderby accepts dataverse alias strings", () => {
  const q = fetchOdata(Account).select("name").orderby("statuscode", "desc")
  expect(q.toString()).toBe("$select=name&$orderby=statuscode desc")
})

test("top sets $top", () => {
  expect(fetchOdata(Account).select("name").top(5).toString()).toBe("$select=name&$top=5")
})

test("clause order is select, filter, orderby, top", () => {
  const q = fetchOdata(Account)
    .select("name")
    .filter(f => ne(f.name, "X"))
    .orderby(f => f.name, "desc")
    .top(3)
  expect(q.toString()).toBe("$select=name&$filter=(name ne 'X')&$orderby=name desc&$top=3")
})

// --- expand ---

test("expand with sub-select renders nested query for lookups", () => {
  const q = fetchOdata(Account).select("name").expand("primaryContact", sub => sub.select("name"))
  expect(q.toString()).toBe("$select=name&$expand=primarycontactid($select=fullname)")
})

test("expand with sub-select renders nested query for collections", () => {
  const q = fetchOdata(Account).select("name").expand("contacts", sub => sub.select("name"))
  expect(q.toString()).toBe("$select=name&$expand=account_contacts($select=fullname)")
})

test("expand without subquery renders empty expand options", () => {
  const q = fetchOdata(Account).select("name").expand("primaryContact")
  expect(q.toString()).toBe("$select=name&$expand=primarycontactid()")
})

test("expand supports filters and orderby in the sub-query", () => {
  const q = fetchOdata(Account)
    .select("name")
    .expand("contacts", sub => sub.select("name").filter(f => eq(f.name, "A")).orderby(f => f.name).top(2))
  expect(q.toString()).toBe("$select=name&$expand=account_contacts($select=fullname;$filter=(fullname eq 'A');$orderby=fullname asc;$top=2)")
})

// --- apply / aggregation ---

test("apply with groupby and sum renders $apply", () => {
  const q = fetchOdata(Account).apply(f => ({ byStatus: groupby(f.status), total: sum(f.revenue) }))
  expect(q.toString()).toBe("$apply=groupby((statuscode),aggregate(revenue with sum as total))")
})

test("apply with count only renders $count aggregate", () => {
  const q = fetchOdata(Account).apply(f => ({ n: count() }))
  expect(q.toString()).toBe("$apply=aggregate($count as n)")
})

test("apply result can filter, orderby alias and top", () => {
  const q = fetchOdata(Account)
    .apply(f => ({ n: count(), total: sum(f.revenue) }))
    .filter("revenue gt 1")
    .orderby(a => a.n, "desc")
    .top(3)
  expect(q.toString()).toBe("$filter=revenue gt 1&$apply=aggregate($count as n,revenue with sum as total)&$orderby=n desc&$top=3")
})

test("apply exposes toAst with apply structure", () => {
  const q = fetchOdata(Account).apply(f => ({ byStatus: groupby(f.status) }))
  expect(q.toAst()).toEqual({
    kind: "aggregate",
    filters: [],
    apply: { kind: "groupby", fields: ["statuscode"] },
    orderby: [],
    top: undefined,
  })
})

test("aggregation helpers carry operation and field names", () => {
  const q = fetchOdata(Account).apply(f => ({
    total: sum(f.revenue),
    avg: average(f.revenue),
    lo: min(f.revenue),
    hi: max(f.revenue),
  }))
  expect(q.toString()).toBe(
    "$apply=aggregate(revenue with sum as total,revenue with average as avg,revenue with min as lo,revenue with max as hi)",
  )
})

// --- lambda helpers ---

test("any renders an any lambda over a collection", () => {
  const q = fetchOdata(Account).select("name").filter(f => any(f.contacts, x => eq(x.name, "X")))
  expect(q.toString()).toBe("$select=name&$filter=account_contacts/any(x: (x/fullname eq 'X'))")
})

test("all renders an all lambda over a collection", () => {
  const q = fetchOdata(Account).select("name").filter(f => all(f.contacts, x => ne(x.name, "Y")))
  expect(q.toString()).toBe("$select=name&$filter=account_contacts/all(x: (x/fullname ne 'Y'))")
})

test("lambda conditions compose with and", () => {
  const q = fetchOdata(Account)
    .select("name")
    .filter(f => and(any(f.contacts, x => eq(x.name, "X")), eq(f.name, "A")))
  expect(q.toString()).toBe(
    "$select=name&$filter=(account_contacts/any(x: (x/fullname eq 'X')) and (name eq 'A'))",
  )
})

// --- errors ---

test("any/all reject non-collection proxies", () => {
  const q = fetchOdata(Account).select("name")
  expect(() => q.filter(f => any(f.name as any, x => eq(x.name, "X")))).toThrow("any() requires a collection navigation proxy")
  expect(() => q.filter(f => all(f.id as any, x => eq(x.name, "X")))).toThrow("all() requires a collection navigation proxy")
})

test("orderby is rejected inside lookup expands", () => {
  expect(() =>
    fetchOdata(Account).select("name").expand("primaryContact", (sub: any) => sub.select("name").orderby("fullname")),
  ).toThrow("orderby() is not supported in lookup expands")
})

test("top is rejected inside lookup expands", () => {
  expect(() =>
    fetchOdata(Account).select("name").expand("primaryContact", (sub: any) => sub.select("name").top(3)),
  ).toThrow("top() is not supported in lookup expands")
})

test("collection expand inside a collection expand is rejected", () => {
  const Task = new DataverseTable({
    client, entitySetName: "tasks", logicalName: "task",
    fields: { id: primaryKey("taskid"), subject: string("subject") },
  })
  const Child = new DataverseTable({
    client, entitySetName: "children", logicalName: "child",
    fields: { id: primaryKey("childid"), tasks: collection("child_tasks", () => Task) },
  })
  const Parent = new DataverseTable({
    client, entitySetName: "parents", logicalName: "parent",
    fields: { id: primaryKey("parentid"), children: collection("parent_children", () => Child) },
  })
  expect(() =>
    fetchOdata(Parent).select().expand("children", sub => sub.select().expand("tasks", s2 => s2.select())),
  ).toThrow("expand() within a collection expand only supports lookup navigation properties")
})

test("unknown orderby field throws", () => {
  expect(() => fetchOdata(Account).select("name").orderby("bogus_field")).toThrow("Unknown query field: bogus_field")
})
