import { expect, test } from "vitest"
import {
  DataverseTable, DataverseIntersectTable, DataverseClient,
  primaryKey, string, number, choice, fetchXml, eq, gt, and, FieldRef,
  groupby, sum, count, average,
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
  },
})

// --- select ---

test("select maps aliases to logical attribute names", () => {
  const xml = fetchXml(Account).select(f => ({ label: f.name, amount: f.revenue })).toXml()
  expect(xml).toContain(`<attribute name="name" alias="label" />`)
  expect(xml).toContain(`<attribute name="revenue" alias="amount" />`)
})

test("select without selector includes all value fields", () => {
  const xml = fetchXml(Contact).select().toXml()
  expect(xml).toContain(`<attribute name="contactid" alias="id" />`)
  expect(xml).toContain(`<attribute name="fullname" alias="name" />`)
})

test("select uses the table logical name as entity", () => {
  const xml = fetchXml(Account).select(f => ({ n: f.name })).toXml()
  expect(xml).toContain(`<entity name="account">`)
})

// --- filter ---

test("filter renders conditions from typed selectors", () => {
  const xml = fetchXml(Account)
    .select(f => ({ n: f.name }))
    .filter(f => eq(f.status, "Active"))
    .toXml()
  expect(xml).toContain(`<filter type="and">`)
  expect(xml).toContain(`<condition attribute="statuscode" operator="eq" value="1" />`)
})

test("filter accepts raw strings and pre-built expressions", () => {
  const xml = fetchXml(Account)
    .select(f => ({ n: f.name }))
    .filter("revenue gt 5")
    .filter(eq(new FieldRef("revenue"), 10))
    .toXml()
  expect(xml).toContain(`revenue gt 5`)
  expect(xml).toContain(`<condition attribute="revenue" operator="eq" value="10" />`)
})

// --- modifiers ---

test("distinct and top render fetch attributes", () => {
  const xml = fetchXml(Account).select(f => ({ n: f.name })).distinct().top(7).toXml()
  expect(xml).toContain(`distinct="true"`)
  expect(xml).toContain(`top='7'`)
})

test("orderby via selector renders order element", () => {
  const xml = fetchXml(Account).select(f => ({ n: f.name })).orderby(f => f.name, "desc").toXml()
  expect(xml).toContain(`<order attribute='name' descending='true' />`)
})

test("orderby with entityname overload renders entityname attribute", () => {
  const xml = fetchXml(Account).select(f => ({ n: f.name })).orderby("auto_link_1", "fullname", "asc").toXml()
  expect(xml).toContain(`<order entityname='auto_link_1' attribute='fullname' />`)
})

// --- joins ---

test("join renders link-entity with nested attributes", () => {
  const xml = fetchXml(Account)
    .select(f => ({ n: f.name }))
    .join("outer", Contact, "id", "id", sub => sub.select(f => ({ cn: f.name })))
    .toXml()
  expect(xml).toContain(
    `<link-entity name="contact" from="contactid" to="accountid" alias="auto_link_1" link-type="outer">`,
  )
  expect(xml).toContain(`<attribute name="fullname" alias="cn" />`)
})

test("filter-only join renders filters without attributes", () => {
  const xml = fetchXml(Account)
    .select(f => ({ n: f.name }))
    .join("exists", Contact, "id", "id", sub => sub.filter(f => eq(f.name, "Neo")))
    .toXml()
  const linkStart = xml.indexOf("<link-entity")
  const linkBlock = xml.slice(linkStart)
  expect(linkBlock).toContain(`link-type="exists"`)
  expect(linkBlock).toContain(`<condition attribute="fullname" operator="eq" value="Neo" />`)
  expect(linkBlock).not.toContain("<attribute")
})

test("nested joins render recursively", () => {
  const xml = fetchXml(Account)
    .select(f => ({ n: f.name }))
    .join("inner", Contact, "id", "id", sub =>
      sub.select(f => ({ cn: f.name })).join("inner", Account, "id", "id", inner =>
        inner.select(f => ({ an: f.name })),
      ))
    .toXml()
  expect(xml).toContain(`link-type="inner"`)
  expect(xml).toContain(`<attribute name="name" alias="an" />`)
})

// --- intersect joins ---

test("intersect join expands into two nested link-entities", () => {
  const AccountContact = new DataverseIntersectTable("accountcontact", Account, Contact)
  const xml = fetchXml(Account)
    .select(f => ({ n: f.name }))
    .join("inner", AccountContact, sub => sub.select(f => ({ cn: f.name })))
    .toXml()
  expect(xml).toContain(`<link-entity name="accountcontact" from="accountid" to="accountid" alias="auto_link_2" link-type="inner" intersect="true">`)
  expect(xml).toContain(`<link-entity name="contact" from="contactid" to="contactid" alias="auto_link_1" link-type="inner">`)
  expect(xml).toContain(`<attribute name="fullname" alias="cn" />`)
})

test("intersect join throws for unrelated tables", () => {
  const Other = new DataverseTable({
    client, entitySetName: "others", logicalName: "other",
    fields: { id: primaryKey("otherid") },
  })
  const Orphan = new DataverseIntersectTable("orphan", Contact, Other)
  expect(() =>
    fetchXml(Account)
      .select(f => ({ n: f.name }))
      .join("inner", Orphan as any, (sub: any) => sub),
  ).toThrow(`Table "accounts" is not related to intersect table "orphan"`)
})

// --- aggregates ---

test("apply renders groupby and aggregate attributes", () => {
  const q = fetchXml(Account).apply(f => ({
    byStatus: groupby(f.status),
    total: sum(f.revenue),
    n: count(),
  }))
  const xml = q.toXml()
  expect(xml).toContain(`aggregate="true"`)
  expect(xml).toContain(`<attribute name="statuscode" alias="byStatus" groupby='true' />`)
  expect(xml).toContain(`<attribute name="revenue" alias="total" aggregate='sum' />`)
  expect(xml).toContain(`<attribute name="accountid" alias="n" aggregate='count' />`)
})

test("aggregate query supports filter, top and orderby on aliases", () => {
  const q = fetchXml(Account)
    .apply(f => ({ byStatus: groupby(f.status), total: sum(f.revenue) }))
    .filter(f => eq(f.status, "Active"))
    .top(4)
    .orderby(a => a.total, "desc")
  const xml = q.toXml()
  expect(xml).toContain(`top='4'`)
  expect(xml).toContain(`<condition attribute="statuscode" operator="eq" value="1" />`)
  expect(xml).toContain(`<order attribute='total' descending='true' />`)
})

test("aggregate query orderby supports entityname overload", () => {
  const q = fetchXml(Account)
    .apply(f => ({ total: sum(f.revenue) }))
    .join("inner", Contact, "id", "id", (sub: any) => sub.apply((f: any) => ({ cnt: count() })))
    .orderby("auto_link_1", "cnt", "desc")
  expect(q.toXml()).toContain(`<order entityname='auto_link_1' attribute='cnt' descending='true' />`)
})

test("aggregate toAst exposes attributes and links", () => {
  const q = fetchXml(Account)
    .apply(f => ({ byStatus: groupby(f.status), avg: average(f.revenue) }))
    .filter("revenue gt 1")
  const ast = q.toAst()
  expect(ast.kind).toBe("xml-aggregate")
  expect(ast.attributes).toEqual([
    { name: "statuscode", alias: "byStatus", groupby: true },
    { name: "revenue", alias: "avg", aggregate: "avg" },
  ])
  expect(ast.filters).toEqual(["revenue gt 1"])
})

// --- serialization ---

test("toString encodes the xml as a fetchXml query parameter", () => {
  const q = fetchXml(Account).select(f => ({ n: f.name }))
  expect(q.toString()).toBe(`fetchXml=${encodeURIComponent(q.toXml())}`)
})

test("average aggregates serialize as FetchXML avg", () => {
  const q = fetchXml(Account)
    .apply(f => ({ mean: average(f.revenue), byStatus: groupby(f.status) }))
  expect(q.toXml()).toContain(`<attribute name="revenue" alias="mean" aggregate='avg' />`)
})

test("chained filters render as siblings inside one filter element", () => {
  const xml = fetchXml(Account)
    .select(f => ({ n: f.name }))
    .filter("revenue gt 5")
    .filter(f => eq(f.status, "Active"))
    .toXml()
  expect(xml).toContain("<filter type=\"and\">")
  expect(xml).toContain("revenue gt 5")
  expect(xml).toContain(`<condition attribute="statuscode" operator="eq" value="1" />`)
})

test("composite and() filters nest as a filter group", () => {
  const xml = fetchXml(Account)
    .select(f => ({ n: f.name }))
    .filter(f => and(eq(f.name, "A"), gt(f.revenue, 1)))
    .toXml()
  expect(xml).toContain(
    `<filter type="and"><condition attribute="name" operator="eq" value="A" /><condition attribute="revenue" operator="gt" value="1" /></filter>`,
  )
})
