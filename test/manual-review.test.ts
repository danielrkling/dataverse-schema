import { test, afterAll } from "vitest"
import { writeFileSync } from "fs"
import { fetchOdata, fetchXml, eq, ne, gt, lt, ge, le, and, or, not, contains, startsWith, isNotNull } from "../src"
import { groupby, sum, min, max, average, count, any, all } from "../src"
import { DataverseTable, primaryKey, string, number, lookup, lookupId, collection } from "../src"
import { DataverseClient } from "../src/client"

interface Entry { section: string; name: string; code: string; output: string; xml: boolean }
const entries: Entry[] = []
let _section = ""
let _cs = ""
let _name = ""
function log(code: string, output: string, xml = false) {
  console.log(`\n${code}\n→ ${output}`)
  entries.push({ section: _cs, name: _name, code, output, xml })
}
function t(name: string, fn: () => void) {
  const s = _section
  test(name, () => { _name = name; _cs = s; fn() })
}

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

const Customer = new DataverseTable({
  client, entitySetName: "log_customers", logicalName: "log_customer",
  fields: {
    id: primaryKey("log_id"),
    name: string("log_name"),
    region: string("log_region"),
    level: number("log_level"),
  },
})

const Ticket = new DataverseTable({
  client, entitySetName: "log_tickets", logicalName: "log_ticket",
  fields: {
    id: primaryKey("log_id"),
    title: string("log_title"),
    priority: number("log_priority"),
    customerId: lookupId("log_customer", () => Customer),
    customer: lookup("log_customer", () => Customer),
    tags: collection("log_tags", () => Tag),
  },
})

const Tag = new DataverseTable({
  client, entitySetName: "log_tags", logicalName: "log_tag",
  fields: {
    id: primaryKey("log_id"),
    label: string("log_label"),
  },
})

// ============================================================
// SECTION: OData SELECT
// ============================================================
_section = "OData SELECT"

t("OData select: single field", () => {
  const code = `fetchOdata(Account).select("name").toString()`
  const result = fetchOdata(Account).select("name").toString()
  log(code, result)
})

t("OData select: multiple fields", () => {
  const code = `fetchOdata(Account).select("name", "revenue").toString()`
  const result = fetchOdata(Account).select("name", "revenue").toString()
  log(code, result)
})

t("OData select: all fields", () => {
  const code = `fetchOdata(Account).select().toString()`
  const result = fetchOdata(Account).select().toString()
  log(code, result)
})

t("OData select: all fields on Contact (with lookups)", () => {
  const code = `fetchOdata(Contact).select().toString()`
  const result = fetchOdata(Contact).select().toString()
  log(code, result)
})

t("OData select: all fields on Order (with lookups)", () => {
  const code = `fetchOdata(Order).select().toString()`
  const result = fetchOdata(Order).select().toString()
  log(code, result)
})

t("OData select: reverse order", () => {
  const code = `fetchOdata(Account).select("revenue", "name").toString()`
  const result = fetchOdata(Account).select("revenue", "name").toString()
  log(code, result)
})

t("OData select: single lookup ID field", () => {
  const code = `fetchOdata(Contact).select("accountId").toString()`
  const result = fetchOdata(Contact).select("accountId").toString()
  log(code, result)
})

// ============================================================
// SECTION: OData SELECT + FILTER
// ============================================================
_section = "OData SELECT + FILTER"

t("OData select + filter: eq", () => {
  const code = `fetchOdata(Account).select("name").filter(f => eq(f.city, "Seattle")).toString()`
  const result = fetchOdata(Account).select("name").filter(f => eq(f.city, "Seattle")).toString()
  log(code, result)
})

t("OData select + filter: ne", () => {
  const code = `fetchOdata(Account).select("name").filter(f => ne(f.city, "NYC")).toString()`
  const result = fetchOdata(Account).select("name").filter(f => ne(f.city, "NYC")).toString()
  log(code, result)
})

t("OData select + filter: gt", () => {
  const code = `fetchOdata(Account).select("name", "revenue").filter(f => gt(f.revenue, 1000)).toString()`
  const result = fetchOdata(Account).select("name", "revenue").filter(f => gt(f.revenue, 1000)).toString()
  log(code, result)
})

t("OData select + filter: ge", () => {
  const code = `fetchOdata(Account).select("name").filter(f => ge(f.revenue, 500)).toString()`
  const result = fetchOdata(Account).select("name").filter(f => ge(f.revenue, 500)).toString()
  log(code, result)
})

t("OData select + filter: lt", () => {
  const code = `fetchOdata(Account).select("name").filter(f => lt(f.revenue, 2000)).toString()`
  const result = fetchOdata(Account).select("name").filter(f => lt(f.revenue, 2000)).toString()
  log(code, result)
})

t("OData select + filter: le", () => {
  const code = `fetchOdata(Account).select("name").filter(f => le(f.revenue, 1000)).toString()`
  const result = fetchOdata(Account).select("name").filter(f => le(f.revenue, 1000)).toString()
  log(code, result)
})

t("OData select + filter: contains", () => {
  const code = `fetchOdata(Account).select("name").filter(f => contains(f.name, "Corp")).toString()`
  const result = fetchOdata(Account).select("name").filter(f => contains(f.name, "Corp")).toString()
  log(code, result)
})

t("OData select + filter: startsWith", () => {
  const code = `fetchOdata(Account).select("name").filter(f => startsWith(f.name, "Acme")).toString()`
  const result = fetchOdata(Account).select("name").filter(f => startsWith(f.name, "Acme")).toString()
  log(code, result)
})

t("OData select + filter: and", () => {
  const code = `fetchOdata(Account).select("name").filter(f => and(eq(f.city, "Seattle"), gt(f.revenue, 500))).toString()`
  const result = fetchOdata(Account).select("name").filter(f => and(eq(f.city, "Seattle"), gt(f.revenue, 500))).toString()
  log(code, result)
})

t("OData select + filter: or", () => {
  const code = `fetchOdata(Account).select("name").filter(f => or(eq(f.city, "Seattle"), eq(f.city, "NYC"))).toString()`
  const result = fetchOdata(Account).select("name").filter(f => or(eq(f.city, "Seattle"), eq(f.city, "NYC"))).toString()
  log(code, result)
})

t("OData select + filter: and + or combined", () => {
  const code = `fetchOdata(Account).select("name").filter(f => and(or(eq(f.city, "Seattle"), eq(f.city, "NYC")), gt(f.revenue, 1000))).toString()`
  const result = fetchOdata(Account).select("name").filter(f => and(or(eq(f.city, "Seattle"), eq(f.city, "NYC")), gt(f.revenue, 1000))).toString()
  log(code, result)
})

t("OData select + filter: multiple chained filters", () => {
  const code = `fetchOdata(Account).select("name").filter(f => eq(f.city, "Seattle")).filter(f => gt(f.revenue, 500)).toString()`
  const result = fetchOdata(Account).select("name").filter(f => eq(f.city, "Seattle")).filter(f => gt(f.revenue, 500)).toString()
  log(code, result)
})

// ============================================================
// SECTION: OData SELECT + ORDERBY + TOP
// ============================================================
_section = "OData ORDERBY + TOP"

t("OData select + orderby asc", () => {
  const code = `fetchOdata(Account).select("name").orderby(f => f.name).toString()`
  const result = fetchOdata(Account).select("name").orderby(f => f.name).toString()
  log(code, result)
})

t("OData select + orderby desc", () => {
  const code = `fetchOdata(Account).select("name", "revenue").orderby(f => f.revenue, "desc").toString()`
  const result = fetchOdata(Account).select("name", "revenue").orderby(f => f.revenue, "desc").toString()
  log(code, result)
})

t("OData select + orderby multi", () => {
  const code = `fetchOdata(Account).select("name", "city").orderby(f => f.city).orderby(f => f.name, "desc").toString()`
  const result = fetchOdata(Account).select("name", "city").orderby(f => f.city).orderby(f => f.name, "desc").toString()
  log(code, result)
})

t("OData select + top", () => {
  const code = `fetchOdata(Account).select("name", "revenue").top(5).toString()`
  const result = fetchOdata(Account).select("name", "revenue").top(5).toString()
  log(code, result)
})

t("OData select + filter + orderby + top", () => {
  const code = `fetchOdata(Account).select("name", "revenue").filter(f => eq(f.city, "NYC")).orderby(f => f.name).top(10).toString()`
  const result = fetchOdata(Account).select("name", "revenue").filter(f => eq(f.city, "NYC")).orderby(f => f.name).top(10).toString()
  log(code, result)
})

// ============================================================
// SECTION: OData EXPAND (lookup — only select + expand)
// ============================================================
_section = "OData EXPAND (lookup)"

t("OData expand: bare lookup (no sub-select)", () => {
  const code = `fetchOdata(Contact).select("name").expand("account").toString()`
  const result = fetchOdata(Contact).select("name").expand("account").toString()
  log(code, result)
})

t("OData expand: lookup with select", () => {
  const code = `fetchOdata(Contact).select("name").expand("account", sub => sub.select("name", "city")).toString()`
  const result = fetchOdata(Contact).select("name").expand("account", sub => sub.select("name", "city")).toString()
  log(code, result)
})

t("OData expand: nested lookup → lookup (Order → Contact → Account)", () => {
  const code = `fetchOdata(Order).select("total").expand("contact", sub => sub.select("name").expand("account", sub2 => sub2.select("name", "city"))).toString()`
  const result = fetchOdata(Order)
    .select("total")
    .expand("contact", sub =>
      sub.select("name").expand("account", sub2 => sub2.select("name", "city"))
    )
    .toString()
  log(code, result)
})

t("OData expand: Contact → Account → (no collection on Account, use Contact expand)", () => {
  const code = `fetchOdata(Contact).select("name", "email").expand("account", sub => sub.select("name", "city")).toString()`
  const result = fetchOdata(Contact)
    .select("name", "email")
    .expand("account", sub => sub.select("name", "city"))
    .toString()
  log(code, result)
})

// ============================================================
// SECTION: OData EXPAND (collection — supports filter/orderby/top)
// ============================================================
_section = "OData EXPAND (collection)"

t("OData expand: bare collection (no sub-select)", () => {
  const code = `fetchOdata(Ticket).select("title").expand("tags").toString()`
  const result = fetchOdata(Ticket).select("title").expand("tags").toString()
  log(code, result)
})

t("OData expand: collection with select", () => {
  const code = `fetchOdata(Ticket).select("title").expand("tags", sub => sub.select("label")).toString()`
  const result = fetchOdata(Ticket).select("title").expand("tags", sub => sub.select("label")).toString()
  log(code, result)
})

t("OData expand: collection with select + filter", () => {
  const code = `fetchOdata(Ticket).select("title").expand("tags", sub => sub.select("label").filter(f => eq(f.label, "urgent"))).toString()`
  const result = fetchOdata(Ticket).select("title").expand("tags", sub =>
    sub.select("label").filter(f => eq(f.label, "urgent"))
  ).toString()
  log(code, result)
})

t("OData expand: collection with select + orderby", () => {
  const code = `fetchOdata(Ticket).select("title").expand("tags", sub => sub.select("label").orderby(f => f.label)).toString()`
  const result = fetchOdata(Ticket).select("title").expand("tags", sub =>
    sub.select("label").orderby(f => f.label)
  ).toString()
  log(code, result)
})

t("OData expand: collection with select + top", () => {
  const code = `fetchOdata(Ticket).select("title").expand("tags", sub => sub.select("label").top(5)).toString()`
  const result = fetchOdata(Ticket).select("title").expand("tags", sub =>
    sub.select("label").top(5)
  ).toString()
  log(code, result)
})

t("OData expand: collection with select + filter + orderby + top", () => {
  const code = `fetchOdata(Ticket).select("title").expand("tags", sub => sub.select("label").filter(f => contains(f.label, "bug")).orderby(f => f.label).top(10)).toString()`
  const result = fetchOdata(Ticket).select("title").expand("tags", sub =>
    sub.select("label")
      .filter(f => contains(f.label, "bug"))
      .orderby(f => f.label)
      .top(10)
  ).toString()
  log(code, result)
})

// ============================================================
// SECTION: OData NESTED EXPAND (collection → lookup and lookup → collection)
// ============================================================
_section = "OData NESTED EXPAND"

t("OData nested expand: collection → lookup (Ticket → Tags → ?)", () => {
  const code = `Ticket.expand("tags", sub => sub.select("label")).expand("customer", sub2 => sub2.select("name", "region"))`
  const result = fetchOdata(Ticket)
    .select("title")
    .expand("tags", sub => sub.select("label"))
    .expand("customer", sub => sub.select("name", "region"))
    .toString()
  log(code, result)
})

t("OData nested expand: lookup → collection (Ticket → Customer + Ticket → Tags)", () => {
  const code = `Ticket.select + expand customer (select) + expand tags (select + filter + orderby + top)`
  const result = fetchOdata(Ticket)
    .select("title", "priority")
    .expand("customer", sub =>
      sub.select("name", "region")
    )
    .expand("tags", sub =>
      sub.select("label")
        .filter(f => contains(f.label, "bug"))
        .orderby(f => f.label)
        .top(5)
    )
    .toString()
  log(code, result)
})

t("OData nested expand: lookup → collection with full sub-query", () => {
  const code = `Ticket → customer (select + expand if had collection) + tags (select + filter + orderby + top)`
  const result = fetchOdata(Ticket)
    .select("title")
    .expand("customer", sub =>
      sub.select("name", "region", "level")
    )
    .expand("tags", sub =>
      sub.select("label")
        .filter(f => contains(f.label, "feature"))
        .orderby(f => f.label)
        .top(3)
    )
    .toString()
  log(code, result)
})

t("OData nested expand: Contact → Account + Contact has no collection, but Order → Contact → Account works", () => {
  const code = `Order → contact (select + expand account (select))`
  const result = fetchOdata(Order)
    .select("total", "orderDate")
    .expand("contact", sub =>
      sub.select("name", "email")
        .expand("account", sub2 =>
          sub2.select("name", "city", "revenue")
        )
    )
    .toString()
  log(code, result)
})

t("OData nested expand: Contact → Account with select + expand Account's name in Contact", () => {
  const code = `Contact.select("name").expand("account", sub => sub.select("name", "city"))`
  const result = fetchOdata(Contact)
    .select("name")
    .expand("account", sub => sub.select("name", "city"))
    .toString()
  log(code, result)
})

t("OData nested expand: Order → Contact → Account, all with selects + filter at root", () => {
  const code = `Order.filter(gt(total,100)).select("total").expand("contact", sub => sub.select("name").expand("account", sub2 => sub2.select("name", "city")))`
  const result = fetchOdata(Order)
    .select("total", "orderDate")
    .filter(f => gt(f.total, 100))
    .expand("contact", sub =>
      sub.select("name", "email")
        .expand("account", sub2 => sub2.select("name", "city"))
    )
    .toString()
  log(code, result)
})

t("OData expand: full complex (Contact + select + filter + orderby + top + expand account (select + expand + filter + orderby + top))", () => {
  const code = `Contact → account → tags, all with nested sub-queries`
  const result = fetchOdata(Contact)
    .select("name", "email")
    .filter(f => contains(f.email, "example"))
    .orderby(f => f.name)
    .top(20)
    .expand("account", sub =>
      sub.select("name", "city", "revenue")
    )
    .toString()
  log(code, result)
})

// ============================================================
// SECTION: OData APPLY (aggregate only, no groupby)
// ============================================================
_section = "OData APPLY (aggregate)"

t("OData apply: count only", () => {
  const code = `fetchOdata(Account).apply(f => ({ total: count() })).toString()`
  const result = fetchOdata(Account).apply(f => ({ total: count() })).toString()
  log(code, result)
})

t("OData apply: count on specific field", () => {
  const code = `fetchOdata(Account).apply(f => ({ cityCount: count(f.city) })).toString()`
  const result = fetchOdata(Account).apply(f => ({ cityCount: count(f.city) })).toString()
  log(code, result)
})

t("OData apply: sum", () => {
  const code = `fetchOdata(Account).apply(f => ({ totalRevenue: sum(f.revenue) })).toString()`
  const result = fetchOdata(Account).apply(f => ({ totalRevenue: sum(f.revenue) })).toString()
  log(code, result)
})

t("OData apply: min", () => {
  const code = `fetchOdata(Account).apply(f => ({ minRevenue: min(f.revenue) })).toString()`
  const result = fetchOdata(Account).apply(f => ({ minRevenue: min(f.revenue) })).toString()
  log(code, result)
})

t("OData apply: max", () => {
  const code = `fetchOdata(Account).apply(f => ({ maxRevenue: max(f.revenue) })).toString()`
  const result = fetchOdata(Account).apply(f => ({ maxRevenue: max(f.revenue) })).toString()
  log(code, result)
})

t("OData apply: average", () => {
  const code = `fetchOdata(Account).apply(f => ({ avgRevenue: average(f.revenue) })).toString()`
  const result = fetchOdata(Account).apply(f => ({ avgRevenue: average(f.revenue) })).toString()
  log(code, result)
})

t("OData apply: multiple aggregations", () => {
  const code = `fetchOdata(Account).apply(f => ({ total: sum(f.revenue), min: min(f.revenue), max: max(f.revenue), avg: average(f.revenue), cnt: count() })).toString()`
  const result = fetchOdata(Account).apply(f => ({
    total: sum(f.revenue),
    min: min(f.revenue),
    max: max(f.revenue),
    avg: average(f.revenue),
    cnt: count()
  })).toString()
  log(code, result)
})

// ============================================================
// SECTION: OData APPLY + GROUPBY
// ============================================================
_section = "OData APPLY + GROUPBY"

t("OData apply: groupby single field", () => {
  const code = `fetchOdata(Account).apply(f => ({ city: groupby(f.city) })).toString()`
  const result = fetchOdata(Account).apply(f => ({ city: groupby(f.city) })).toString()
  log(code, result)
})

t("OData apply: groupby + count", () => {
  const code = `fetchOdata(Account).apply(f => ({ city: groupby(f.city), count: count() })).toString()`
  const result = fetchOdata(Account).apply(f => ({
    city: groupby(f.city),
    count: count()
  })).toString()
  log(code, result)
})

t("OData apply: groupby + sum", () => {
  const code = `fetchOdata(Account).apply(f => ({ city: groupby(f.city), totalRevenue: sum(f.revenue) })).toString()`
  const result = fetchOdata(Account).apply(f => ({
    city: groupby(f.city),
    totalRevenue: sum(f.revenue)
  })).toString()
  log(code, result)
})

t("OData apply: groupby + all aggs", () => {
  const code = `fetchOdata(Account).apply(f => ({ city: groupby(f.city), total: sum(f.revenue), min: min(f.revenue), max: max(f.revenue), avg: average(f.revenue), cnt: count() })).toString()`
  const result = fetchOdata(Account).apply(f => ({
    city: groupby(f.city),
    total: sum(f.revenue),
    min: min(f.revenue),
    max: max(f.revenue),
    avg: average(f.revenue),
    cnt: count()
  })).toString()
  log(code, result)
})

t("OData apply: groupby multi-field", () => {
  const code = `fetchOdata(Account).apply(f => ({ city: groupby(f.city), name: groupby(f.name) })).toString()`
  const result = fetchOdata(Account).apply(f => ({
    city: groupby(f.city),
    name: groupby(f.name)
  })).toString()
  log(code, result)
})

t("OData apply: groupby multi-field + count", () => {
  const code = `fetchOdata(Account).apply(f => ({ city: groupby(f.city), name: groupby(f.name), count: count() })).toString()`
  const result = fetchOdata(Account).apply(f => ({
    city: groupby(f.city),
    name: groupby(f.name),
    count: count()
  })).toString()
  log(code, result)
})

// ============================================================
// SECTION: OData APPLY + GROUPBY + filter + orderby + top
// ============================================================
_section = "OData APPLY + filter/orderby/top"

t("OData apply: groupby + post-apply filter (string)", () => {
  const code = `fetchOdata(Account).apply(f => ({ city: groupby(f.city), total: sum(f.revenue) })).filter("total gt 5000").toString()`
  const result = fetchOdata(Account)
    .apply(f => ({
      city: groupby(f.city),
      total: sum(f.revenue)
    }))
    .filter("total gt 5000")
    .toString()
  log(code, result)
})

t("OData apply: groupby + orderby by string alias", () => {
  const code = `fetchOdata(Account).apply(f => ({ city: groupby(f.city), total: sum(f.revenue) })).orderby("total", "desc").toString()`
  const result = fetchOdata(Account)
    .apply(f => ({
      city: groupby(f.city),
      total: sum(f.revenue)
    }))
    .orderby("total", "desc")
    .toString()
  log(code, result)
})

t("OData apply: groupby + orderby via alias proxy fn", () => {
  const code = `fetchOdata(Account).apply(f => ({ city: groupby(f.city), total: sum(f.revenue) })).orderby(aliases => aliases.total, "desc").toString()`
  const result = fetchOdata(Account)
    .apply(f => ({
      city: groupby(f.city),
      total: sum(f.revenue)
    }))
    .orderby(aliases => aliases.total, "desc")
    .toString()
  log(code, result)
})

t("OData apply: groupby + top", () => {
  const code = `fetchOdata(Account).apply(f => ({ city: groupby(f.city), total: sum(f.revenue) })).top(10).toString()`
  const result = fetchOdata(Account)
    .apply(f => ({
      city: groupby(f.city),
      total: sum(f.revenue)
    }))
    .top(10)
    .toString()
  log(code, result)
})

t("OData apply: groupby + filter + orderby + top", () => {
  const code = `fetchOdata(Account).apply(...).filter(...).orderby(...).top(...)`
  const result = fetchOdata(Account)
    .apply(f => ({
      city: groupby(f.city),
      total: sum(f.revenue),
      avg: average(f.revenue)
    }))
    .filter("total gt 5000")
    .orderby("total", "desc")
    .top(5)
    .toString()
  log(code, result)
})

// ============================================================
// SECTION: OData APPLY on Contact + Order
// ============================================================
_section = "OData APPLY on Contact + Order"

t("OData apply: count on Contact", () => {
  const code = `fetchOdata(Contact).apply(f => ({ total: count() })).toString()`
  const result = fetchOdata(Contact).apply(f => ({ total: count() })).toString()
  log(code, result)
})

t("OData apply: groupby name on Contact", () => {
  const code = `fetchOdata(Contact).apply(f => ({ name: groupby(f.name), cnt: count() })).toString()`
  const result = fetchOdata(Contact).apply(f => ({
    name: groupby(f.name),
    cnt: count()
  })).toString()
  log(code, result)
})

t("OData apply: count on Order", () => {
  const code = `fetchOdata(Order).apply(f => ({ total: count() })).toString()`
  const result = fetchOdata(Order).apply(f => ({ total: count() })).toString()
  log(code, result)
})

t("OData apply: groupby orderDate + sum total on Order", () => {
  const code = `fetchOdata(Order).apply(f => ({ orderDate: groupby(f.orderDate), totalSales: sum(f.total) })).toString()`
  const result = fetchOdata(Order).apply(f => ({
    orderDate: groupby(f.orderDate),
    totalSales: sum(f.total)
  })).toString()
  log(code, result)
})

t("OData apply: all aggs on Order total", () => {
  const code = `fetchOdata(Order).apply(f => ({ total: sum(f.total), min: min(f.total), max: max(f.total), avg: average(f.total), cnt: count() })).toString()`
  const result = fetchOdata(Order).apply(f => ({
    total: sum(f.total),
    min: min(f.total),
    max: max(f.total),
    avg: average(f.total),
    cnt: count()
  })).toString()
  log(code, result)
})

t("OData apply: groupby + filter + orderby + top on Order", () => {
  const code = `fetchOdata(Order).apply(...).filter(...).orderby(...).top(...)`
  const result = fetchOdata(Order)
    .apply(f => ({
      orderDate: groupby(f.orderDate),
      totalSales: sum(f.total),
      avgSale: average(f.total)
    }))
    .filter("totalSales gt 1000")
    .orderby("totalSales", "desc")
    .top(10)
    .toString()
  log(code, result)
})

// ============================================================
// SECTION: OData APPLY on Ticket
// ============================================================
_section = "OData APPLY on Ticket"

t("OData apply: count on Ticket", () => {
  const code = `fetchOdata(Ticket).apply(f => ({ total: count() })).toString()`
  const result = fetchOdata(Ticket).apply(f => ({ total: count() })).toString()
  log(code, result)
})

t("OData apply: groupby priority + count on Ticket", () => {
  const code = `fetchOdata(Ticket).apply(f => ({ priority: groupby(f.priority), count: count() })).toString()`
  const result = fetchOdata(Ticket).apply(f => ({
    priority: groupby(f.priority),
    count: count()
  })).toString()
  log(code, result)
})

t("OData apply: groupby title + sum priority on Ticket", () => {
  const code = `fetchOdata(Ticket).apply(f => ({ title: groupby(f.title), totalPriority: sum(f.priority) })).toString()`
  const result = fetchOdata(Ticket).apply(f => ({
    title: groupby(f.title),
    totalPriority: sum(f.priority)
  })).toString()
  log(code, result)
})

t("OData apply: all aggs on Ticket + groupby + filter + orderby + top", () => {
  const code = `fetchOdata(Ticket).apply(...).filter(...).orderby(...).top(...)`
  const result = fetchOdata(Ticket)
    .apply(f => ({
      priority: groupby(f.priority),
      total: sum(f.priority),
      min: min(f.priority),
      max: max(f.priority),
      avg: average(f.priority),
      cnt: count()
    }))
    .filter("total gt 5")
    .orderby("total", "desc")
    .top(5)
    .toString()
  log(code, result)
})

// ============================================================
// SECTION: OData LAMBDA (any/all)
// ============================================================
_section = "OData LAMBDA (any/all)"

t("OData filter: any on collection", () => {
  const code = `fetchOdata(Ticket).select("title").filter(f => any(f.tags, x => eq(x.label, "urgent"))).toString()`
  const result = fetchOdata(Ticket).select("title").filter(f => any(f.tags, x => eq(x.label, "urgent"))).toString()
  log(code, result)
})

t("OData filter: all on collection", () => {
  const code = `fetchOdata(Ticket).select("title").filter(f => all(f.tags, x => startsWith(x.label, "bug"))).toString()`
  const result = fetchOdata(Ticket).select("title").filter(f => all(f.tags, x => startsWith(x.label, "bug"))).toString()
  log(code, result)
})

t("OData filter: any + other filters combined", () => {
  const code = `fetchOdata(Ticket).select("title").filter(f => and(gt(f.priority, 2), any(f.tags, x => eq(x.label, "urgent")))).toString()`
  const result = fetchOdata(Ticket).select("title").filter(f => and(gt(f.priority, 2), any(f.tags, x => eq(x.label, "urgent")))).toString()
  log(code, result)
})

t("OData filter: any + all combined", () => {
  const code = `fetchOdata(Ticket).select("title").filter(f => and(any(f.tags, x => eq(x.label, "urgent")), all(f.tags, x => startsWith(x.label, "b")))).toString()`
  const result = fetchOdata(Ticket).select("title").filter(f => and(
    any(f.tags, x => eq(x.label, "urgent")),
    all(f.tags, x => startsWith(x.label, "b"))
  )).toString()
  log(code, result)
})

t("OData filter: any nested in select + expand", () => {
  const code = `Ticket.select("title").expand("customer", sub => sub.select("name")).filter(f => any(f.tags, x => eq(x.label, "critical")))`
  const result = fetchOdata(Ticket)
    .select("title")
    .expand("customer", sub => sub.select("name"))
    .filter(f => any(f.tags, x => eq(x.label, "critical")))
    .toString()
  log(code, result)
})

// ============================================================
// SECTION: FETCHXML SELECT
// ============================================================
_section = "FetchXML SELECT"

t("FetchXML select: single field", () => {
  const code = `fetchXml(Account).select(f => ({ accountName: f.name })).toXml()`
  const result = fetchXml(Account).select(f => ({ accountName: f.name })).toXml()
  log(code, result)
})

t("FetchXML select: multiple fields", () => {
  const code = `fetchXml(Account).select(f => ({ accountName: f.name, revenue: f.revenue })).toXml()`
  const result = fetchXml(Account).select(f => ({ accountName: f.name, revenue: f.revenue })).toXml()
  log(code, result)
})

t("FetchXML select: all fields", () => {
  const code = `fetchXml(Account).select().toXml()`
  const result = fetchXml(Account).select().toXml()
  log(code, result)
})

t("FetchXML select: all fields on Contact", () => {
  const code = `fetchXml(Contact).select().toXml()`
  const result = fetchXml(Contact).select().toXml()
  log(code, result)
})

t("FetchXML select: all fields on Order", () => {
  const code = `fetchXml(Order).select().toXml()`
  const result = fetchXml(Order).select().toXml()
  log(code, result)
})

// ============================================================
// SECTION: FETCHXML SELECT + FILTER
// ============================================================
_section = "FetchXML SELECT + FILTER"

t("FetchXML select + filter: eq", () => {
  const code = `fetchXml(Account).select(f => ({ name: f.name })).filter(f => eq(f.city, "Seattle")).toXml()`
  const result = fetchXml(Account)
    .select(f => ({ name: f.name }))
    .filter(f => eq(f.city, "Seattle"))
    .toXml()
  log(code, result)
})

t("FetchXML select + filter: ne", () => {
  const code = `fetchXml(Account).select(f => ({ name: f.name })).filter(f => ne(f.city, "NYC")).toXml()`
  const result = fetchXml(Account)
    .select(f => ({ name: f.name }))
    .filter(f => ne(f.city, "NYC"))
    .toXml()
  log(code, result)
})

t("FetchXML select + filter: gt", () => {
  const code = `fetchXml(Account).select(f => ({ name: f.name })).filter(f => gt(f.revenue, 1000)).toXml()`
  const result = fetchXml(Account)
    .select(f => ({ name: f.name }))
    .filter(f => gt(f.revenue, 1000))
    .toXml()
  log(code, result)
})

t("FetchXML select + filter: ge + lt + le", () => {
  const code = `fetchXml(Account).select(f => ({ name: f.name })).filter(f => and(ge(f.revenue, 500), lt(f.revenue, 5000))).toXml()`
  const result = fetchXml(Account)
    .select(f => ({ name: f.name }))
    .filter(f => and(ge(f.revenue, 500), lt(f.revenue, 5000)))
    .toXml()
  log(code, result)
})

t("FetchXML select + filter: contains", () => {
  const code = `fetchXml(Account).select(f => ({ name: f.name })).filter(f => contains(f.name, "Corp")).toXml()`
  const result = fetchXml(Account)
    .select(f => ({ name: f.name }))
    .filter(f => contains(f.name, "Corp"))
    .toXml()
  log(code, result)
})

t("FetchXML select + filter: startsWith", () => {
  const code = `fetchXml(Account).select(f => ({ name: f.name })).filter(f => startsWith(f.name, "Acme")).toXml()`
  const result = fetchXml(Account)
    .select(f => ({ name: f.name }))
    .filter(f => startsWith(f.name, "Acme"))
    .toXml()
  log(code, result)
})

t("FetchXML select + filter: and", () => {
  const code = `fetchXml(Account).select(f => ({ name: f.name })).filter(f => and(eq(f.city, "Seattle"), gt(f.revenue, 500))).toXml()`
  const result = fetchXml(Account)
    .select(f => ({ name: f.name }))
    .filter(f => and(eq(f.city, "Seattle"), gt(f.revenue, 500)))
    .toXml()
  log(code, result)
})

t("FetchXML select + filter: or", () => {
  const code = `fetchXml(Account).select(f => ({ name: f.name })).filter(f => or(eq(f.city, "Seattle"), eq(f.city, "NYC"))).toXml()`
  const result = fetchXml(Account)
    .select(f => ({ name: f.name }))
    .filter(f => or(eq(f.city, "Seattle"), eq(f.city, "NYC")))
    .toXml()
  log(code, result)
})

t("FetchXML select + filter: not", () => {
  const code = `fetchXml(Account).select(f => ({ name: f.name })).filter(f => not(eq(f.city, "NYC"))).toXml()`
  const result = fetchXml(Account)
    .select(f => ({ name: f.name }))
    .filter(f => not(eq(f.city, "NYC")))
    .toXml()
  log(code, result)
})

t("FetchXML select + filter: isNotNull", () => {
  const code = `fetchXml(Account).select(f => ({ name: f.name })).filter(f => isNotNull(f.city)).toXml()`
  const result = fetchXml(Account)
    .select(f => ({ name: f.name }))
    .filter(f => isNotNull(f.city))
    .toXml()
  log(code, result)
})

t("FetchXML select + filter: and + or combined", () => {
  const code = `fetchXml(Account).select(f => ({ name: f.name })).filter(f => and(or(eq(f.city, "Seattle"), eq(f.city, "NYC")), gt(f.revenue, 1000))).toXml()`
  const result = fetchXml(Account)
    .select(f => ({ name: f.name }))
    .filter(f => and(or(eq(f.city, "Seattle"), eq(f.city, "NYC")), gt(f.revenue, 1000)))
    .toXml()
  log(code, result)
})

t("FetchXML select + filter: multiple chained", () => {
  const code = `fetchXml(Account).select(f => ({ name: f.name })).filter(f => eq(f.city, "Seattle")).filter(f => gt(f.revenue, 500)).toXml()`
  const result = fetchXml(Account)
    .select(f => ({ name: f.name }))
    .filter(f => eq(f.city, "Seattle"))
    .filter(f => gt(f.revenue, 500))
    .toXml()
  log(code, result)
})

// ============================================================
// SECTION: FETCHXML SELECT + ORDERBY + TOP + DISTINCT
// ============================================================
_section = "FetchXML ORDERBY + TOP + DISTINCT"

t("FetchXML select + orderby asc", () => {
  const code = `fetchXml(Account).select(f => ({ name: f.name })).orderby(f => f.name).toXml()`
  const result = fetchXml(Account)
    .select(f => ({ name: f.name }))
    .orderby(f => f.name)
    .toXml()
  log(code, result)
})

t("FetchXML select + orderby desc", () => {
  const code = `fetchXml(Account).select(f => ({ name: f.name })).orderby(f => f.revenue, "desc").toXml()`
  const result = fetchXml(Account)
    .select(f => ({ name: f.name }))
    .orderby(f => f.revenue, "desc")
    .toXml()
  log(code, result)
})

t("FetchXML select + top", () => {
  const code = `fetchXml(Account).select(f => ({ name: f.name })).top(5).toXml()`
  const result = fetchXml(Account)
    .select(f => ({ name: f.name }))
    .top(5)
    .toXml()
  log(code, result)
})

t("FetchXML select + distinct", () => {
  const code = `fetchXml(Account).select(f => ({ city: f.city })).distinct().toXml()`
  const result = fetchXml(Account)
    .select(f => ({ city: f.city }))
    .distinct()
    .toXml()
  log(code, result)
})

t("FetchXML select + filter + orderby + top + distinct", () => {
  const code = `fetchXml(Account).select(...).filter(...).orderby(...).top(10).distinct()`
  const result = fetchXml(Account)
    .select(f => ({ name: f.name, city: f.city }))
    .filter(f => gt(f.revenue, 100))
    .orderby(f => f.name)
    .top(10)
    .distinct()
    .toXml()
  log(code, result)
})

// ============================================================
// SECTION: FETCHXML JOIN (1-level)
// ============================================================
_section = "FetchXML JOIN (1-level)"

t("FetchXML join: inner (Account → Contact), filter-only", () => {
  const code = `fetchXml(Account).select(f => ({ name: f.name })).join("inner", Contact, "id", "accountId", sub => sub.filter(f => eq(f.name, "Jane")))`
  const result = fetchXml(Account)
    .select(f => ({ name: f.name }))
    .join("inner", Contact, "accountId", "id", sub =>
      sub.filter(f => eq(f.name, "Jane"))
    )
  log(code, result.toXml(), true)
})

t("FetchXML join: inner with select", () => {
  const code = `fetchXml(Account).select(f => ({ name: f.name })).join("inner", Contact, "accountId", "id", sub => sub.select(f => ({ contactEmail: f.email })))`
  const result = fetchXml(Account)
    .select(f => ({ name: f.name }))
    .join("inner", Contact, "accountId", "id", sub =>
      sub.select(f => ({ contactEmail: f.email }))
    )
  log(code, result.toXml(), true)
})

t("FetchXML join: inner + filter on joined", () => {
  const code = `fetchXml(Account).select(f => ({ name: f.name })).join("inner", Contact, "accountId", "id", sub => sub.select(f => ({ email: f.email })).filter(f => contains(f.email, "example")))`
  const result = fetchXml(Account)
    .select(f => ({ name: f.name }))
    .join("inner", Contact, "accountId", "id", sub =>
      sub.select(f => ({ email: f.email }))
        .filter(f => contains(f.email, "example"))
    )
  log(code, result.toXml(), true)
})

t("FetchXML join: outer", () => {
  const code = `fetchXml(Account).select(f => ({ name: f.name })).join("outer", Contact, "accountId", "id", sub => sub.select(f => ({ contactName: f.name })))`
  const result = fetchXml(Account)
    .select(f => ({ name: f.name }))
    .join("outer", Contact, "accountId", "id", sub =>
      sub.select(f => ({ contactName: f.name }))
    )
  log(code, result.toXml(), true)
})

t("FetchXML join: any", () => {
  const code = `fetchXml(Account).select(f => ({ name: f.name })).join("any", Contact, "accountId", "id", sub => sub.filter(f => eq(f.name, "Jane")))`
  const result = fetchXml(Account)
    .select(f => ({ name: f.name }))
    .join("any", Contact, "accountId", "id", sub =>
      sub.filter(f => eq(f.name, "Jane"))
    )
  log(code, result.toXml(), true)
})

t("FetchXML join: not any", () => {
  const code = `fetchXml(Account).select(f => ({ name: f.name })).join("not any", Contact, "accountId", "id", sub => sub.filter(f => eq(f.name, "Jane")))`
  const result = fetchXml(Account)
    .select(f => ({ name: f.name }))
    .join("not any", Contact, "accountId", "id", sub =>
      sub.filter(f => eq(f.name, "Jane"))
    )
  log(code, result.toXml(), true)
})

t("FetchXML join: all", () => {
  const code = `fetchXml(Account).select(f => ({ name: f.name })).join("all", Contact, "accountId", "id", sub => sub.filter(f => contains(f.name, "Smith")))`
  const result = fetchXml(Account)
    .select(f => ({ name: f.name }))
    .join("all", Contact, "accountId", "id", sub =>
      sub.filter(f => contains(f.name, "Smith"))
    )
  log(code, result.toXml(), true)
})

t("FetchXML join: inner with select + filter + orderby on joined", () => {
  const code = `fetchXml(Account).select(f => ({ name: f.name })).join("inner", Contact, "accountId", "id", sub => sub.select(f => ({ contactName: f.name, email: f.email })).filter(f => contains(f.email, "example")).orderby(f => f.name))`
  const result = fetchXml(Account)
    .select(f => ({ name: f.name }))
    .join("inner", Contact, "accountId", "id", sub =>
      sub.select(f => ({ contactName: f.name, email: f.email }))
        .filter(f => contains(f.email, "example"))
        .orderby(f => f.name)
    )
  log(code, result.toXml(), true)
})

// ============================================================
// SECTION: FETCHXML JOIN (2-level nested)
// ============================================================
_section = "FetchXML JOIN (nested)"

t("FetchXML nested join: Account → Contact → Order", () => {
  const code = `fetchXml(Account).select(f => ({ name: f.name })).join("inner", Contact, "id", "accountId", sub => sub.select(f => ({ contactName: f.name })).join("inner", Order, "contactId", "id", sub2 => sub2.select(f => ({ orderTotal: f.total }))))`
  const result = fetchXml(Account)
    .select(f => ({ name: f.name }))
    .join("inner", Contact, "accountId", "id", sub =>
      sub.select(f => ({ contactName: f.name }))
        .join("inner", Order, "contactId", "id", sub2 =>
          sub2.select(f => ({ orderTotal: f.total }))
        )
    )
  log(code, result.toXml(), true)
})

t("FetchXML nested join: filters everywhere", () => {
  const code = `Account.filter + join Contact (select + filter) + join Order (select + filter)`
  const result = fetchXml(Account)
    .select(f => ({ name: f.name }))
    .join("inner", Contact, "accountId", "id", sub =>
      sub.select(f => ({ contactName: f.name, email: f.email }))
        .filter(f => contains(f.email, "example"))
        .join("inner", Order, "contactId", "id", sub2 =>
          sub2.select(f => ({ orderTotal: f.total }))
            .filter(f => gt(f.total, 100))
        )
    )
  log(code, result.toXml(), true)
})

t("FetchXML nested join: orderby at multiple levels + top", () => {
  const code = `Account.orderby + join Contact (orderby) + join Order (orderby) + top(50)`
  const result = fetchXml(Account)
    .select(f => ({ name: f.name }))
    .orderby(f => f.name)
    .join("inner", Contact, "accountId", "id", sub =>
      sub.select(f => ({ contactName: f.name }))
        .orderby(f => f.name)
        .join("inner", Order, "contactId", "id", sub2 =>
          sub2.select(f => ({ orderTotal: f.total, orderDate: f.orderDate }))
            .orderby(f => f.total, "desc")
        )
    )
    .top(50)
  log(code, result.toXml(), true)
})

t("FetchXML: Contact → Account + Contact → Order (multiple joins same level)", () => {
  const code = `fetchXml(Contact).select(f => ({ contactName: f.name })).join("inner", Account, "id", "accountId", sub => sub.select(f => ({ accountName: f.name }))).join("inner", Order, "contactId", "id", sub => sub.select(f => ({ orderTotal: f.total })))`
  const q = fetchXml(Contact)
    .select(f => ({ contactName: f.name }))
    .join("inner", Account, "id", "accountId", sub =>
      sub.select(f => ({ accountName: f.name }))
    ) as any
  const result = q.join("inner", Order, "contactId", "id", sub =>
    sub.select(f => ({ orderTotal: f.total }))
  )
  log(code, result.toXml(), true)
})

t("FetchXML: Contact → Account + Contact → Order with filters", () => {
  const code = `Contact.select + join Account (select + filter) + join Order (select + filter + orderby)`
  const q = fetchXml(Contact)
    .select(f => ({ contactName: f.name, email: f.email }))
    .filter(f => contains(f.email, "example"))
    .join("inner", Account, "id", "accountId", sub =>
      sub.select(f => ({ accountName: f.name, city: f.city }))
        .filter(f => eq(f.city, "Seattle"))
    ) as any
  const result = q
    .join("inner", Order, "contactId", "id", sub =>
      sub.select(f => ({ orderTotal: f.total, orderDate: f.orderDate }))
        .filter(f => gt(f.total, 50))
        .orderby(f => f.total, "desc")
    )
  log(code, result.toXml(), true)
})

t("FetchXML triple nested: Account → Contact → Order all sub-selects", () => {
  const code = `Account.all fields + join Contact (all fields + filter) + join Order (select + filter + orderby)`
  const result = fetchXml(Account)
    .select()
    .join("inner", Contact, "accountId", "id", sub =>
      sub.select(f => ({ name: f.name, email: f.email }))
        .filter(f => contains(f.name, "Smith"))
        .join("inner", Order, "contactId", "id", sub2 =>
          sub2.select(f => ({ total: f.total, date: f.orderDate }))
            .filter(f => gt(f.total, 100))
            .orderby(f => f.total, "desc")
        )
    )
  log(code, result.toXml(), true)
})

// ============================================================
// SECTION: FETCHXML APPLY (aggregate only)
// ============================================================
_section = "FetchXML APPLY (aggregate)"

t("FetchXML apply: count", () => {
  const code = `fetchXml(Account).apply(f => ({ total: count() })).toXml()`
  const result = fetchXml(Account).apply(f => ({ total: count() })).toXml()
  log(code, result)
})

t("FetchXML apply: sum", () => {
  const code = `fetchXml(Account).apply(f => ({ totalRevenue: sum(f.revenue) })).toXml()`
  const result = fetchXml(Account).apply(f => ({ totalRevenue: sum(f.revenue) })).toXml()
  log(code, result)
})

t("FetchXML apply: min", () => {
  const code = `fetchXml(Account).apply(f => ({ minRevenue: min(f.revenue) })).toXml()`
  const result = fetchXml(Account).apply(f => ({ minRevenue: min(f.revenue) })).toXml()
  log(code, result)
})

t("FetchXML apply: max", () => {
  const code = `fetchXml(Account).apply(f => ({ maxRevenue: max(f.revenue) })).toXml()`
  const result = fetchXml(Account).apply(f => ({ maxRevenue: max(f.revenue) })).toXml()
  log(code, result)
})

t("FetchXML apply: average", () => {
  const code = `fetchXml(Account).apply(f => ({ avgRevenue: average(f.revenue) })).toXml()`
  const result = fetchXml(Account).apply(f => ({ avgRevenue: average(f.revenue) })).toXml()
  log(code, result)
})

t("FetchXML apply: multiple aggs", () => {
  const code = `fetchXml(Account).apply(f => ({ total: sum(f.revenue), min: min(f.revenue), max: max(f.revenue), avg: average(f.revenue), cnt: count() })).toXml()`
  const result = fetchXml(Account).apply(f => ({
    total: sum(f.revenue),
    min: min(f.revenue),
    max: max(f.revenue),
    avg: average(f.revenue),
    cnt: count()
  })).toXml()
  log(code, result)
})

// ============================================================
// SECTION: FETCHXML APPLY + GROUPBY
// ============================================================
_section = "FetchXML APPLY + GROUPBY"

t("FetchXML apply: groupby + count", () => {
  const code = `fetchXml(Account).apply(f => ({ city: groupby(f.city), count: count() })).toXml()`
  const result = fetchXml(Account).apply(f => ({
    city: groupby(f.city),
    count: count()
  })).toXml()
  log(code, result)
})

t("FetchXML apply: groupby + sum", () => {
  const code = `fetchXml(Account).apply(f => ({ city: groupby(f.city), totalRevenue: sum(f.revenue) })).toXml()`
  const result = fetchXml(Account).apply(f => ({
    city: groupby(f.city),
    totalRevenue: sum(f.revenue)
  })).toXml()
  log(code, result)
})

t("FetchXML apply: groupby + all aggs", () => {
  const code = `fetchXml(Account).apply(f => ({ city: groupby(f.city), total: sum(f.revenue), min: min(f.revenue), max: max(f.revenue), avg: average(f.revenue), cnt: count() })).toXml()`
  const result = fetchXml(Account).apply(f => ({
    city: groupby(f.city),
    total: sum(f.revenue),
    min: min(f.revenue),
    max: max(f.revenue),
    avg: average(f.revenue),
    cnt: count()
  })).toXml()
  log(code, result)
})

t("FetchXML apply: groupby multi-field + count", () => {
  const code = `fetchXml(Account).apply(f => ({ city: groupby(f.city), name: groupby(f.name), count: count() })).toXml()`
  const result = fetchXml(Account).apply(f => ({
    city: groupby(f.city),
    name: groupby(f.name),
    count: count()
  })).toXml()
  log(code, result)
})

t("FetchXML apply: groupby on name + sum", () => {
  const code = `fetchXml(Account).apply(f => ({ name: groupby(f.name), totalRevenue: sum(f.revenue) })).toXml()`
  const result = fetchXml(Account).apply(f => ({
    name: groupby(f.name),
    totalRevenue: sum(f.revenue)
  })).toXml()
  log(code, result)
})

// ============================================================
// SECTION: FETCHXML APPLY + GROUPBY + filter + orderby + top
// ============================================================
_section = "FetchXML APPLY + filter/orderby/top"

t("FetchXML apply: groupby + pre-filter", () => {
  const code = `fetchXml(Account).filter(f => eq(f.city, "Seattle")).apply(f => ({ city: groupby(f.city), total: sum(f.revenue) })).toXml()`
  const result = fetchXml(Account)
    .filter(f => eq(f.city, "Seattle"))
    .apply(f => ({
      city: groupby(f.city),
      total: sum(f.revenue)
    }))
    .toXml()
  log(code, result)
})

t("FetchXML apply: groupby + orderby", () => {
  const code = `fetchXml(Account).apply(f => ({ city: groupby(f.city), total: sum(f.revenue) })).orderby("total", "desc").toXml()`
  const result = fetchXml(Account)
    .apply(f => ({
      city: groupby(f.city),
      total: sum(f.revenue)
    }))
    .orderby("total", "desc")
    .toXml()
  log(code, result)
})

t("FetchXML apply: groupby + top", () => {
  const code = `fetchXml(Account).apply(f => ({ city: groupby(f.city), total: sum(f.revenue) })).top(10).toXml()`
  const result = fetchXml(Account)
    .apply(f => ({
      city: groupby(f.city),
      total: sum(f.revenue)
    }))
    .top(10)
    .toXml()
  log(code, result)
})

t("FetchXML apply: groupby + pre-filter + orderby + top", () => {
  const code = `fetchXml(Account).filter(...).apply(...).orderby(...).top(5)`
  const result = fetchXml(Account)
    .filter(f => gt(f.revenue, 100))
    .apply(f => ({
      city: groupby(f.city),
      total: sum(f.revenue),
      avg: average(f.revenue)
    }))
    .orderby("total", "desc")
    .top(5)
    .toXml()
  log(code, result)
})

t("FetchXML apply: groupby on Contact", () => {
  const code = `fetchXml(Contact).apply(f => ({ name: groupby(f.name), count: count() })).toXml()`
  const result = fetchXml(Contact).apply(f => ({
    name: groupby(f.name),
    count: count()
  })).toXml()
  log(code, result)
})

t("FetchXML apply: groupby on Order", () => {
  const code = `fetchXml(Order).apply(f => ({ orderDate: groupby(f.orderDate), totalSales: sum(f.total), avgSale: average(f.total) })).toXml()`
  const result = fetchXml(Order).apply(f => ({
    orderDate: groupby(f.orderDate),
    totalSales: sum(f.total),
    avgSale: average(f.total)
  })).toXml()
  log(code, result)
})

t("FetchXML apply: groupby + pre-filter + orderby + top on Order", () => {
  const code = `fetchXml(Order).filter(...).apply(...).orderby(...).top(10)`
  const result = fetchXml(Order)
    .filter(f => gt(f.total, 50))
    .apply(f => ({
      orderDate: groupby(f.orderDate),
      totalSales: sum(f.total),
      avgSale: average(f.total)
    }))
    .orderby("totalSales", "desc")
    .top(10)
    .toXml()
  log(code, result)
})

t("FetchXML apply: groupby on Ticket", () => {
  const code = `fetchXml(Ticket).apply(f => ({ priority: groupby(f.priority), count: count() })).toXml()`
  const result = fetchXml(Ticket).apply(f => ({
    priority: groupby(f.priority),
    count: count()
  })).toXml()
  log(code, result)
})

t("FetchXML apply: groupby + all aggs + pre-filter + orderby + top on Ticket", () => {
  const code = `fetchXml(Ticket).filter(...).apply(...).orderby(...).top(10)`
  const result = fetchXml(Ticket)
    .filter(f => gt(f.priority, 0))
    .apply(f => ({
      priority: groupby(f.priority),
      total: sum(f.priority),
      min: min(f.priority),
      max: max(f.priority),
      avg: average(f.priority),
      cnt: count()
    }))
    .orderby("total", "desc")
    .top(10)
    .toXml()
  log(code, result)
})

// ============================================================
// SECTION: FETCHXML APPLY with JOIN
// ============================================================
_section = "FetchXML APPLY + JOIN"

t("FetchXML apply + join: groupby across join", () => {
  const code = `fetchXml(Account).join("inner", Contact, "id", "accountId", sub => sub.filter(...)).apply(f => ({ city: groupby(f.city), count: count() }))`
  const result = fetchXml(Account)
    .join("inner", Contact, "accountId", "id", sub =>
      sub.filter(f => eq(f.name, "Jane"))
    )
    .apply(f => ({
      city: groupby(f.city),
      count: count()
    }))
  log(code, result.toXml(), true)
})

t("FetchXML apply + join with pre-filter + orderby + top", () => {
  const code = `Account.filter + join Contact + apply groupby + orderby + top`
  const result = fetchXml(Account)
    .filter(f => gt(f.revenue, 100))
    .join("inner", Contact, "accountId", "id", sub =>
      sub.filter(f => contains(f.name, "Smith"))
    )
    .apply(f => ({
      city: groupby(f.city),
      total: sum(f.revenue)
    }))
    .orderby("total", "desc")
    .top(10)
  log(code, result.toXml(), true)
})

t("FetchXML apply + join with select + filter on join + groupby + all aggs", () => {
  const code = `Account + join Contact (select + filter) + apply groupby + all aggs + orderby + top`
  const result = fetchXml(Account)
    .join("inner", Contact, "accountId", "id", sub =>
      sub.select(f => ({ email: f.email }))
        .filter(f => contains(f.email, "example"))
    )
    .apply(f => ({
      city: groupby(f.city),
      total: sum(f.revenue),
      min: min(f.revenue),
      max: max(f.revenue),
      avg: average(f.revenue),
      cnt: count()
    }))
    .orderby("total", "desc")
    .top(25)
  log(code, result.toXml(), true)
})

// ============================================================
// SECTION: FETCHXML MISC COMBOS
// ============================================================
_section = "FetchXML MISC COMBOS"

t("FetchXML: select all + filter + orderby + top", () => {
  const code = `fetchXml(Account).select().filter(f => eq(f.city, "Seattle")).orderby(f => f.name).top(10).toXml()`
  const result = fetchXml(Account)
    .select()
    .filter(f => eq(f.city, "Seattle"))
    .orderby(f => f.name)
    .top(10)
    .toXml()
  log(code, result)
})

t("FetchXML: distinct + filter", () => {
  const code = `fetchXml(Account).select(f => ({ city: f.city })).filter(f => isNotNull(f.city)).distinct().toXml()`
  const result = fetchXml(Account)
    .select(f => ({ city: f.city }))
    .filter(f => isNotNull(f.city))
    .distinct()
    .toXml()
  log(code, result)
})

t("FetchXML: join + select + filter + distinct + top", () => {
  const code = `Account.select + join Contact.select.filter + distinct + top`
  const result = fetchXml(Account)
    .select(f => ({ name: f.name, city: f.city }))
    .join("inner", Contact, "accountId", "id", sub =>
      sub.select(f => ({ contactName: f.name }))
        .filter(f => contains(f.name, "Smith"))
    )
    .distinct()
    .top(25)
    .toXml()
  log(code, result)
})

afterAll(() => {
  let md = "# Manual Review Output\n\n"
  md += `Generated from \`test/manual-review.test.ts\` — ${entries.length} tests.\n\n---\n\n`

  const sections = new Map<string, Entry[]>()
  for (const e of entries) {
    const arr = sections.get(e.section) || []
    arr.push(e)
    sections.set(e.section, arr)
  }

  for (const [section, items] of sections) {
    md += `## ${section}\n\n`
    for (const item of items) {
      md += `### ${item.name}\n\n`
      md += "```typescript\n" + item.code + "\n```\n\n"
      md += (item.xml ? "```xml\n" : "```\n") + item.output + "\n```\n\n"
    }
  }

  writeFileSync("test/manual-review-output.md", md)
  console.log(`\n✓ Wrote ${entries.length} tests to test/manual-review-output.md`)
})
