import { test } from "vitest"
import { fetchOdata, fetchXml, eq } from "../src"
import { DataverseTable, primaryKey, string, number, lookup, lookupId } from "../src"
import { DataverseClient } from "../src/client"

const client = new DataverseClient({ url: "http://localhost" })

const Account = new DataverseTable({
  client, entitySetName: "log_accounts", logicalName: "log_account",
  fields: {
    id: primaryKey("log_id"),
    name: string("log_name"),
    revenue: number("log_revenue"),
    city: string("log_city"),
  },
})

const Contact = new DataverseTable({
  client, entitySetName: "log_contacts", logicalName: "log_contact",
  fields: {
    id: primaryKey("log_id"),
    name: string("log_name"),
    email: string("log_email"),
    accountId: lookupId("log_account", () => Account),
    account: lookup("log_account", () => Account),
  },
})

const Order = new DataverseTable({
  client, entitySetName: "log_orders", logicalName: "log_order",
  fields: {
    id: primaryKey("log_id"),
    total: number("log_total"),
    orderDate: string("log_orderdate"),
    contactId: lookupId("log_contact", () => Contact),
    contact: lookup("log_contact", () => Contact),
  },
})

// === ODATA QUERIES ===

test("OData 1: simple select", () => {
  const q = fetchOdata(Account).select("name", "revenue").toString()
  console.log("OData 1:", q)
})

test("OData 2: select all", () => {
  const q = fetchOdata(Account).select().toString()
  console.log("OData 2:", q)
})

test("OData 3: filter by field", () => {
  const q = fetchOdata(Account).select("name").filter(f => eq(f.city, "Seattle")).toString()
  console.log("OData 3:", q)
})

test("OData 4: top N", () => {
  const q = fetchOdata(Account).select("name", "revenue").top(5).toString()
  console.log("OData 4:", q)
})

test("OData 5: orderby descending", () => {
  const q = fetchOdata(Account).select("name").orderby(f => f.revenue, "desc").toString()
  console.log("OData 5:", q)
})

test("OData 6: expand lookup", () => {
  const q = fetchOdata(Contact)
    .select("name", "email")
    .expand("account", sub => sub.select("name", "city"))
    .toString()
  console.log("OData 6:", q)
})

test("OData 7: expand + main query filter + orderby", () => {
  const q = fetchOdata(Contact)
    .select("name", "email")
    .expand("account", sub => sub.select("name", "revenue", "city"))
    .filter(f => eq(f.email, "jane@example.com"))
    .orderby(f => f.name)
    .toString()
  console.log("OData 7:", q)
})

test("OData 8: filter + orderby + top", () => {
  const q = fetchOdata(Account)
    .select("name", "revenue")
    .filter(f => eq(f.city, "NYC"))
    .orderby(f => f.name)
    .top(10)
    .toString()
  console.log("OData 8:", q)
})

test("OData 9: nested expand (Order → Contact → Account)", () => {
  const q = fetchOdata(Order)
    .select("total", "orderDate")
    .expand("contact", sub =>
      sub.select("name", "email").expand("account", sub2 => sub2.select("name", "city"))
    )
    .toString()
  console.log("OData 9:", q)
})

test("OData 10: filter + expand on Contact", () => {
  const q = fetchOdata(Contact)
    .select("name", "email")
    .expand("account", sub => sub.select("name", "city"))
    .filter(f => eq(f.name, "Jane"))
    .toString()
  console.log("OData 10:", q)
})

// === FETCHXML QUERIES ===

test("FetchXML 1: simple select", () => {
  const q = fetchXml(Account).select(f => ({ accountName: f.name }))
  console.log("FetchXML 1:", q.toXml())
})

test("FetchXML 2: select all", () => {
  const q = fetchXml(Account).select()
  console.log("FetchXML 2:", q.toXml())
})

test("FetchXML 3: filter", () => {
  const q = fetchXml(Account)
    .select(f => ({ accountName: f.name }))
    .filter(f => eq(f.city, "Seattle"))
  console.log("FetchXML 3:", q.toXml())
})

test("FetchXML 4: top N", () => {
  const q = fetchXml(Account)
    .select(f => ({ accountName: f.name, revenue: f.revenue }))
    .top(5)
  console.log("FetchXML 4:", q.toXml())
})

test("FetchXML 5: orderby descending", () => {
  const q = fetchXml(Account)
    .select(f => ({ accountName: f.name }))
    .orderby(f => f.revenue, "desc")
  console.log("FetchXML 5:", q.toXml())
})

test("FetchXML 6: inner join (Account → Contact)", () => {
  const q = fetchXml(Account)
    .select(f => ({ name: f.name }))
    .join("inner", Contact, "accountId", "id", sub =>
      sub.select(f => ({ contactEmail: f.email }))
    )
  console.log("FetchXML 6:", q.toXml())
})

test("FetchXML 7: join with filter", () => {
  const q = fetchXml(Account)
    .select(f => ({ name: f.name }))
    .join("inner", Contact, "accountId", "id", sub =>
      sub.filter(f => eq(f.name, "Jane"))
    )
  console.log("FetchXML 7:", q.toXml())
})

test("FetchXML 8: distinct", () => {
  const q = fetchXml(Account)
    .select(f => ({ city: f.city }))
    .distinct()
  console.log("FetchXML 8:", q.toXml())
})

test("FetchXML 9: multiple joins (Contact → Account + Contact → Order)", () => {
  const q = fetchXml(Contact)
    .select(f => ({ contactName: f.name }))
    .join("inner", Account, "id", "accountId", sub =>
      sub.select(f => ({ accountName: f.name }))
    )
    .join("inner", Order, "contactId", "id", sub =>
      sub.select(f => ({ orderTotal: f.total }))
    )
  console.log("FetchXML 9:", q.toXml())
})

test("FetchXML 10: nested join (Account → Contact → Order)", () => {
  const q = fetchXml(Account)
    .select(f => ({ name: f.name }))
    .join("inner", Contact, "accountId", "id", sub =>
      sub.select(f => ({ contactName: f.name }))
        .join("inner", Order, "contactId", "id", sub2 =>
          sub2.select(f => ({ orderTotal: f.total }))
        )
    )
  console.log("FetchXML 10:", q.toXml())
})
