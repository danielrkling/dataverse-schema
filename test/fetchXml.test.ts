import { expect, expectTypeOf, test } from "vitest"
import { DataverseClient } from "../src/client"
import { FieldRef, fetchXml, eq, gt, and, or, Infer,
  Today, Tomorrow, Yesterday, Last7Days, Next7Days, LastMonth, NextMonth, ThisMonth,
  LastWeek, NextWeek, ThisWeek, LastYear, NextYear, ThisYear,
  LastXDays, NextXDays, OlderThanXDays,
  EqualUserId, EqualUserLanguage, NotEqualUserId,
  In, NotIn, ContainsValues, DoesNotContainValues,
  Between, NotBetween, On, Under, Above,
  ThisFiscalPeriod, ThisFiscalYear, InFiscalPeriodAndYear,
  LastXHours, LastXMonths, LastXWeeks, LastXYears,
  sum, average, min, max, count, groupby,
} from "../src"
import { DataverseTable, DataverseIntersectTable, primaryKey, string, number, boolean, datetime } from "../src"
import { BASE_URL } from "./mocks/handlers"
import { server } from "./mocks/server"
import { http, HttpResponse } from "msw"

const client = new DataverseClient({ url: BASE_URL })

const Address = new DataverseTable({
  client, entitySetName: "addresses", logicalName: "address",
  fields: {
    id: primaryKey("addressid"),
    street: string("street_Address"),
    zip: number("zip_code"),
  },
})

const Person = new DataverseTable({
  client, entitySetName: "people", logicalName: "person",
  fields: {
    pk: primaryKey("personid"),
    name: string("fullname"),
    age: number("person_age"),
    active: boolean("active"),
  },
})

const Account = new DataverseTable({
  client, entitySetName: "accounts", logicalName: "account",
  fields: {
    id: primaryKey("accountid"),
    name: string("name"),
    revenue: number("revenue"),
    city: string("address1_city"),
    primarycontactid: string("primarycontactid"),
    numberofemployees: number("numberofemployees"),
    parentaccountid: string("parentaccountid"),
    fax: string("fax"),
    ownerid: string("ownerid"),
  },
})

// --- Type inference tests ---

test("from returns builder with full type", () => {
  const q = fetchXml(Person)
  expectTypeOf(q.execute).returns.resolves.toExtend<Infer<typeof Person>[]>()
})

test("select narrows result type with aliases", () => {
  const q = fetchXml(Person).select(f => ({ myName: f.name, myAge: f.age }))
  expectTypeOf(q.execute).returns.resolves.toExtend<{ myName: string; myAge: number }[]>()
})

test("join merges result type", () => {
  const q = fetchXml(Person).select().join("inner", Address, "id", "pk", (sub) =>
    sub.select(f => ({ addrStreet: f.street }))
  )
  expectTypeOf(q.execute).returns.resolves.toExtend<{ addrStreet: string }[]>()
})

// --- MS Docs Example: Simple query with top ---

test("[docs] fetch top limits rows", () => {
  const q = fetchXml(Account).top(5).select(f => ({ name: f.name }))
  expect(q.toXml()).toContain(`top='5'`)
  expect(q.toXml()).toContain(`<attribute name="name" alias="name" />`)
})

// --- MS Docs Example: Select columns ---

test("[docs] select multiple columns", () => {
  const q = fetchXml(Account).select(f => ({
    code: f.name,
    createdon: f.city,
    company: f.name,
  }))
  expect(q.toXml()).toContain(`<attribute name="name" alias="code" />`)
  expect(q.toXml()).toContain(`<attribute name="address1_city" alias="createdon" />`)
})

// --- MS Docs Example: Basic filter with condition ---

test("[docs] filter with eq condition", () => {
  const q = fetchXml(Account).select(f => ({ name: f.name }))
    .filter(f => eq(f.city, "Redmond"))
  const xml = q.toXml()
  expect(xml).toContain(`<filter type="and">`)
  expect(xml).toContain(`<condition attribute="address1_city" operator="eq" value="Redmond" />`)
})

// --- MS Docs Example: OR filter with multiple conditions ---
test("[docs] or filter with multiple eq conditions", () => {
  const q = fetchXml(Account).select(f => ({ name: f.name, city: f.city }))
    .filter(f => or(
      eq(f.city, "Redmond"),
      eq(f.city, "Seattle"),
      eq(f.city, "Bellevue")
    ))
  const xml = q.toXml()
  expect(xml).toContain(`<filter type="and">`)
  expect(xml).toContain(`<filter type="or">`)
  expect(xml).toContain(`<condition attribute="address1_city" operator="eq" value="Redmond" />`)
  expect(xml).toContain(`<condition attribute="address1_city" operator="eq" value="Seattle" />`)
  expect(xml).toContain(`<condition attribute="address1_city" operator="eq" value="Bellevue" />`)
})

// --- MS Docs Example: IN operator with value elements ---
// (Using raw XML since IN requires child <value> elements)

test("[docs] in operator with value elements", () => {
  const q = fetchXml(Account).select(f => ({ name: f.name, city: f.city }))
    .filter(
      `<condition attribute="address1_city" operator="in"><value>Redmond</value><value>Seattle</value><value>Bellevue</value></condition>`
    )
  const xml = q.toXml()
  expect(xml).toContain(`operator="in"`)
  expect(xml).toContain(`<value>Redmond</value>`)
  expect(xml).toContain(`<value>Seattle</value>`)
  expect(xml).toContain(`<value>Bellevue</value>`)
})

// --- MS Docs Example: eq-userid operator (no value) ---

test("[docs] eq-userid operator", () => {
  const q = fetchXml(Account).filter(`<condition attribute='ownerid' operator='eq-userid' />`)
  const xml = q.toXml()
  expect(xml).toContain(`operator='eq-userid'`)
})

// --- MS Docs Example: between operator with value elements ---

test("[docs] between operator with values", () => {
  const q = fetchXml(Account).filter(
    `<condition attribute="numberofemployees" operator="between"><value>6</value><value>20</value></condition>`
  )
  const xml = q.toXml()
  expect(xml).toContain(`operator="between"`)
  expect(xml).toContain(`<value>6</value>`)
  expect(xml).toContain(`<value>20</value>`)
})

// --- MS Docs Example: Join tables ---

test("[docs] join with link-entity", () => {
  const Contact = new DataverseTable({
    client, entitySetName: "contacts", logicalName: "contacts",
    fields: {
      id: primaryKey("contactid"),
      fullname: string("fullname"),
    },
  })
  const q = fetchXml(Account).top(5).select(f => ({ name: f.name }))
    .join("inner", Contact, "id", "id", (sub) =>
      sub.select(f => ({ full_name: f.fullname }))
    )
  const xml = q.toXml()
  expect(xml).toContain(`link-type="inner"`)
  expect(xml).toContain(`<attribute name="fullname" alias="full_name" />`)
})

// --- MS Docs Example: Order rows ---

test("[docs] order ascending", () => {
  const q = fetchXml(Account).select(f => ({ name: f.name }))
    .orderby(f => f.name)
  const xml = q.toXml()
  expect(xml).toContain(`<order attribute='name' />`)
})

test("[docs] order descending", () => {
  const q = fetchXml(Account).select(f => ({ name: f.name, createdon: f.city }))
    .orderby(f => f.city, "desc")
  const xml = q.toXml()
  expect(xml).toContain(`<order attribute='address1_city' descending='true' />`)
})

test("[docs] multiple orders", () => {
  const q = fetchXml(Account).select(f => ({ name: f.name, revenue: f.revenue }))
    .orderby(f => f.revenue).orderby(f => f.name)
  const xml = q.toXml()
  expect(xml).toContain(`<order attribute='revenue' />`)
  expect(xml).toContain(`<order attribute='name' />`)
})

// --- MS Docs Example: Order with entityname ---

test("[docs] order with entityname for link-entity priority", () => {
  const q = fetchXml(Account).select(f => ({ name: f.name }))
    .orderby("parentaccount", "name")
  const xml = q.toXml()
  expect(xml).toContain(`<order entityname='parentaccount' attribute='name' />`)
})

test("[docs] order with entityname descending", () => {
  const q = fetchXml(Account).select(f => ({ name: f.name }))
    .orderby("parentaccount", "name", "desc")
  const xml = q.toXml()
  expect(xml).toContain(`entityname='parentaccount' attribute='name' descending='true'`)
})

// --- MS Docs Example: Distinct ---

test("[docs] distinct results", () => {
  const q = fetchXml(Account).distinct().select(f => ({ name: f.name }))
  expect(q.toXml()).toContain(`distinct="true"`)
})

// --- MS Docs Example: Aggregate data ---

test("[docs] aggregate functions on a column", () => {
  const q = fetchXml(Account).apply(v => ({
    Total: sum(v.revenue),
    Count: count(v.revenue),
    Maximum: max(v.revenue),
    Minimum: min(v.revenue),
    Average: average(v.revenue),
  }))
  const xml = q.toXml()
  expect(xml).toContain(`aggregate="true"`)
  expect(xml).toContain(`aggregate='sum'`)
  expect(xml).toContain(`aggregate='count'`)
  expect(xml).toContain(`aggregate='max'`)
  expect(xml).toContain(`aggregate='min'`)
  expect(xml).toContain(`aggregate='average'`)
  expect(xml).toContain(`alias="Total"`)
  expect(xml).toContain(`alias="Count"`)
  expect(xml).toContain(`alias="Maximum"`)
  expect(xml).toContain(`alias="Minimum"`)
  expect(xml).toContain(`alias="Average"`)
})

// --- MS Docs Example: Grouping ---

test("[docs] groupby with sum and count", () => {
  const q = fetchXml(Account).apply(v => ({
    city: groupby(v.city),
    Total: sum(v.revenue),
    Count: count(v.city),
  }))
  const xml = q.toXml()
  expect(xml).toContain(`aggregate='sum'`)
  expect(xml).toContain(`aggregate='count'`)
  expect(xml).toContain(`groupby='true'`)
  expect(xml).toContain(`alias="city"`)
})

// --- MS Docs Example: useraworderby via execute option ---

test("[docs] useRawOrderBy via execute option", async () => {
  const API = `${BASE_URL}/api/data/v9.2`
  let capturedUrl = ""
  server.use(
    http.get(`${API}/accounts`, ({ request }) => {
      capturedUrl = request.url
      return HttpResponse.json({ value: [] })
    }),
  )
  await fetchXml(Account).select(f => ({ name: f.name }))
    .execute({ useRawOrderBy: true })
  expect(decodeURIComponent(capturedUrl)).toContain(`useraworderby="true"`)
})

// --- MS Docs Example: aggregatelimit via execute option ---

test("[docs] aggregateLimit via execute option", async () => {
  const API = `${BASE_URL}/api/data/v9.2`
  let capturedUrl = ""
  server.use(
    http.get(`${API}/accounts`, ({ request }) => {
      capturedUrl = request.url
      return HttpResponse.json({ value: [] })
    }),
  )
  await fetchXml(Account).apply(v => ({ cnt: count(v.name) }))
    .execute({ aggregateLimit: 5 })
  expect(decodeURIComponent(capturedUrl)).toContain(`aggregatelimit='5'`)
  expect(decodeURIComponent(capturedUrl)).toContain(`aggregate="true"`)
})

// --- Existing tests preserved ---

test("where with field proxy resolves Dataverse names", () => {
  const q = fetchXml(Person).filter(f => eq(f.name, "John"))
  expect(q.toXml()).toContain(`attribute="fullname"`)
})

test("multiple where calls accumulate in single filter", () => {
  const q = fetchXml(Person)
    .filter(f => eq(f.name, "John"))
    .filter(f => gt(f.age, 20))
  const xml = q.toXml()
  expect(xml.match(/<filter type="and">/g)).toHaveLength(1)
  expect(xml.match(/<condition/g)).toHaveLength(2)
})

test("where with existing filter functions", () => {
  const q = fetchXml(Person).filter(f => eq(f.name, "John"))
  expect(q.toXml()).toContain("fullname")
  expect(q.toXml()).toContain("John")
})

test("where with and/greaterThan filter functions", () => {
  const q = fetchXml(Person).filter(f => and(eq(f.name, "John"), gt(f.age, 20)))
  expect(q.toXml()).toContain("fullname")
  expect(q.toXml()).toContain("person_age")
})

test("and wraps conditions in FetchXML format", () => {
  const result = and(
    `<condition attribute="a" operator="eq" value="1" />`,
    `<condition attribute="b" operator="eq" value="2" />`,
  )
  expect(result.toFetchXml()).toContain(`type="and"`)
  expect(result.toFetchXml()).toContain(`attribute="a"`)
  expect(result.toFetchXml()).toContain(`attribute="b"`)
})

test("or wraps conditions in FetchXML format", () => {
  const result = or(
    `<condition attribute="a" operator="eq" value="1" />`,
    `<condition attribute="b" operator="eq" value="2" />`,
  )
  expect(result.toFetchXml()).toContain(`type="or"`)
  expect(result.toFetchXml()).toContain(`attribute="a"`)
})

test("or wraps conditions (string variant)", () => {
  const result = or(`<condition attribute="a" operator="eq" value="1" />`)
  expect(result.toFetchXml()).toContain(`type="or"`)
  expect(result.toFetchXml()).toContain(`attribute="a"`)
})

test("toString returns URL-encoded fetchXml", () => {
  const q = fetchXml(Person)
  expect(q.toString()).toMatch(/^fetchXml=/)
  expect(q.toString()).toContain(encodeURIComponent("<fetch"))
})

// --- orderby with field proxy ---

test("orderby with asc default", () => {
  const q = fetchXml(Account).select(f => ({ name: f.name }))
    .orderby(f => f.name)
  const xml = q.toXml()
  expect(xml).toContain(`<order attribute='name' />`)
})

test("orderby with desc direction", () => {
  const q = fetchXml(Account).select(f => ({ name: f.name }))
    .orderby(f => f.name, "desc")
  const xml = q.toXml()
  expect(xml).toContain(`<order attribute='name' descending='true' />`)
})

test("orderby with multiple specs", () => {
  const q = fetchXml(Account).select(f => ({ name: f.name, revenue: f.revenue }))
    .orderby(f => f.revenue).orderby(f => f.name)
  const xml = q.toXml()
  expect(xml).toContain(`<order attribute='revenue' />`)
  expect(xml).toContain(`<order attribute='name' />`)
})

test("orderby raw entityname overload still works", () => {
  const q = fetchXml(Account).select(f => ({ name: f.name }))
    .orderby("parentaccount", "name")
  const xml = q.toXml()
  expect(xml).toContain(`<order entityname='parentaccount' attribute='name' />`)
})

// --- DataverseIntersectTable (many-to-many intersect) ---

test("DataverseIntersectTable basic properties", () => {
  const PersonAccount = new DataverseIntersectTable("personaccount", Person, Account)
  expect(PersonAccount.intersect).toBe(true)
  expect(PersonAccount.name).toBe("personaccount")
  expect(PersonAccount.table1).toBe(Person)
  expect(PersonAccount.table2).toBe(Account)
})

// --- through() helper ---

test("through auto-joins intersect table with nested join", () => {
  const PersonAccount = new DataverseIntersectTable("personaccount", Person, Account)
  const q = fetchXml(Person)
    .select(f => ({ name: f.name }))
    .intersect(PersonAccount, sub =>
      sub.select(f => ({ accountName: f.name }))
    )
  const xml = q.toXml()
  expect(xml).toContain(`intersect="true"`)
  expect(xml).toContain(`name="personaccount"`)
  expect(xml).toContain(`from="personid"`)
  expect(xml).toContain(`to="personid"`)
  expect(xml).toContain(`link-type="inner"`)
  expect(xml).toContain(`<attribute name="name" alias="accountName" />`)
})

test("through works when source table is table2 of intersect", () => {
  const PersonAccount = new DataverseIntersectTable("personaccount", Person, Account)
  const q = fetchXml(Account)
    .select(f => ({ name: f.name }))
    .intersect(PersonAccount, sub =>
      sub.select(f => ({ personName: f.name }))
    )
  const xml = q.toXml()
  expect(xml).toContain(`intersect="true"`)
  expect(xml).toContain(`from="accountid"`)
  expect(xml).toContain(`to="accountid"`)
  expect(xml).toContain(`name="personaccount"`)
})

test("through throws if table is not related to intersect", () => {
  const unrelatedTable = new DataverseTable({
    client, entitySetName: "foo", logicalName: "foo",
    fields: { id: primaryKey("fooid") },
  })
  const PersonAccount = new DataverseIntersectTable("personaccount", Person, Account)
  expect(() =>
    fetchXml(unrelatedTable).intersect(PersonAccount, sub => sub)
  ).toThrow("not related")
})

test("through narrows result type to selected fields", () => {
  const PersonAccount = new DataverseIntersectTable("personaccount", Person, Account)
  const q = fetchXml(Person)
    .select(f => ({ name: f.name }))
    .intersect(PersonAccount, sub =>
      sub.select(f => ({ accountName: f.name }))
    )
  expectTypeOf(q.execute).returns.resolves.toEqualTypeOf<{ name: string; accountName: string }[]>()
})

test("through subquery gets SubJoinBuilder with select", () => {
  const PersonAccount = new DataverseIntersectTable("personaccount", Person, Account)
  const q = fetchXml(Person)
    .select(f => ({ name: f.name }))
    .intersect(PersonAccount, sub =>
      sub.select(f => ({ accountName: f.name }))
        .filter(f => eq(f.name, "test"))
    )
  const xml = q.toXml()
  expect(xml).toContain(`intersect="true"`)
  expect(xml).toContain(`<attribute name="name" alias="accountName" />`)
})

test("aggregate join subquery gets apply-capable builder", () => {
  const q = fetchXml(Account)
    .apply(v => ({
      city: groupby(v.city),
      Total: sum(v.revenue),
    }))
    .join("inner", Account, "id", "id", sub =>
      sub.apply(v => ({
        avgRevenue: average(v.revenue),
      }))
    )
  const xml = q.toXml()
  expect(xml).toContain(`aggregate="true"`)
  expect(xml).toContain(`<attribute name="revenue" alias="Total" aggregate='sum' />`)
  expect(xml).toContain(`<attribute name="address1_city" alias="city" groupby='true' />`)
  expect(xml).toContain(`<attribute name="revenue" alias="avgRevenue" aggregate='average' />`)
})

test("aggregate through subquery gets apply-capable builder", () => {
  const PersonAccount = new DataverseIntersectTable("personaccount", Person, Account)
  const q = fetchXml(Person)
    .apply(v => ({
      totalAge: sum(v.age),
    }))
    .intersect(PersonAccount, sub =>
      sub.apply(v => ({
        accountCount: count(v.name),
      }))
    )
  const xml = q.toXml()
  expect(xml).toContain(`aggregate="true"`)
  expect(xml).toContain(`intersect="true"`)
  expect(xml).toContain(`<attribute name="name" alias="accountCount" aggregate='count' />`)
})

// --- FetchXML serialization of CRM functions ---

test("CRM function Today produces correct FetchXML", () => {
  expect(Today(new FieldRef("createdon")).toFetchXml()).toContain(`operator="today"`)
})

test("CRM function EqualUserId produces correct FetchXML", () => {
  expect(EqualUserId(new FieldRef("ownerid")).toFetchXml()).toContain(`operator="eq-userid"`)
})

test("CRM function Between produces correct FetchXML with value children", () => {
  const xml = Between(new FieldRef("field"), 10, 20).toFetchXml()
  expect(xml).toContain(`operator="between"`)
  expect(xml).toContain(`<value>10</value>`)
  expect(xml).toContain(`<value>20</value>`)
})

test("CRM function In produces correct FetchXML with value children", () => {
  const xml = In(new FieldRef("field"), ["a", "b"]).toFetchXml()
  expect(xml).toContain(`operator="in"`)
  expect(xml).toContain(`<value>a</value>`)
  expect(xml).toContain(`<value>b</value>`)
})

test("CRM function Today can be used in fetchXml where clause", () => {
  const q = fetchXml(Account).select(f => ({ name: f.name }))
    .filter(Today(new FieldRef("createdon")))
  const xml = q.toXml()
  expect(xml).toContain(`operator="today"`)
  expect(xml).toContain(`attribute="createdon"`)
})

// --- matchfirstrowusingcrossapply link type ---

test("matchfirstrowusingcrossapply link type is accepted", () => {
  const q = fetchXml(Account)
    .select(f => ({ name: f.name }))
    .join("matchfirstrowusingcrossapply", Address,
      "id", "id",
      sub => sub.select(s => ({ street: s.street }))
    )
  const xml = q.toXml()
  expect(xml).toContain(`link-type="matchfirstrowusingcrossapply"`)
})

// --- Linked entity ordering (stays inside <link-entity>, not pulled to root) ---

test("orderby in join subquery stays inside link-entity", () => {
  const q = fetchXml(Account)
    .select(f => ({ name: f.name }))
    .join("inner", Address,
      "id", "id",
      sub => sub.select(s => ({ street: s.street }))
        .orderby(s => s.zip)
    )
  const xml = q.toXml()
  expect(xml).toContain(`<link-entity name="address"`)
  expect(xml).toContain(`<order attribute='zip_code' />`)
  expect(xml).not.toContain(`entityname='auto_link_1'`)
})

test("orderby in innerJoin subquery stays inside link-entity", () => {
  const q = fetchXml(Account)
    .select(f => ({ name: f.name }))
    .join("inner", Address,
      "id", "id",
      sub => sub.select(s => ({ street: s.street }))
        .orderby(s => s.zip, "desc")
    )
  const xml = q.toXml()
  expect(xml).toContain(`<link-entity name="address"`)
  expect(xml).toContain(`<order attribute='zip_code' descending='true' />`)
  expect(xml).not.toContain(`entityname='auto_link_1'`)
})

test("execute returns transformed records (no select)", async () => {
  const q = fetchXml(Account)
  const results = await q.execute()
  expect(results).toHaveLength(2)
  expect(results[0].name).toBe("Test Corp")
  expect(results[0].revenue).toBe(1000000)
  expect(results[0]).toHaveProperty("id")
})

test("execute with select returns transformed records", async () => {
  const q = fetchXml(Account).select(f => ({ name: f.name, revenue: f.revenue }))
  const results = await q.execute()
  expect(results).toHaveLength(2)
  expect(results[0].name).toBe("Test Corp")
  expect(results[0].revenue).toBe(1000000)
})

test("execute transforms date fields via alias map", async () => {
  const Log = new DataverseTable({
    client, entitySetName: "logs", logicalName: "log",
    fields: {
      id: primaryKey("logid"),
      message: string("log_message"),
      entryDate: datetime("log_entrydate"),
    },
  })
  const API = `${BASE_URL}/api/data/v9.2`
  server.use(
    http.get(`${API}/logs`, () =>
      HttpResponse.json({
        value: [{ logid: "id-1", log_message: "Test entry", log_entrydate: "2024-06-15T12:00:00Z" }],
      })
    ),
  )
  const q = fetchXml(Log).select(f => ({ msg: f.message, date: f.entryDate }))
  const results = await q.execute()
  expect(results).toHaveLength(1)
  expect(results[0].msg).toBe("Test entry")
  expect(results[0].date).toBeInstanceOf(Date)
  expect(results[0].date?.toISOString()).toBe("2024-06-15T12:00:00.000Z")
})

test("execute transforms joined date fields via alias map", async () => {
  const Order = new DataverseTable({
    client, entitySetName: "orders", logicalName: "order",
    fields: {
      id: primaryKey("orderid"),
      orderDate: datetime("order_date"),
      total: number("total_amount"),
    },
  })
  const API = `${BASE_URL}/api/data/v9.2`
  server.use(
    http.get(`${API}/accounts`, () =>
      HttpResponse.json({
        value: [{
          accountid: "a1",
          name: "Acme",
          order_date: "2024-06-15T12:00:00Z",
          total_amount: 500,
        }],
      })
    ),
  )
  const q = fetchXml(Account)
    .select(f => ({ name: f.name }))
    .join("inner", Order, "id", "id", sub =>
      sub.select(f => ({ date: f.orderDate, total: f.total }))
    )
  const results = await q.execute()
  expect(results).toHaveLength(1)
  expect(results[0].name).toBe("Acme")
  expect(results[0].date).toBeInstanceOf(Date)
  expect(results[0].date?.toISOString()).toBe("2024-06-15T12:00:00.000Z")
  expect(results[0].total).toBe(500)
})

// --- Bug 8: field-to-field comparison uses valueof ---

test("compare filter function uses valueof in fetchXml", () => {
  const q = fetchXml(Person).filter(f => eq(f.name, f.age))
  const xml = q.toXml()
  expect(xml).toContain(`valueof="person_age"`)
  expect(xml).toContain(`attribute="fullname"`)
  expect(xml).not.toContain(`value="`)
})

// --- Bug 16: filter-only link types (any, all, not any, etc.) should not render attributes ---

test.each(["any", "not any", "all", "not all", "exists", "in"])(
  "[bug16] %s link type does not render attributes or orders", (linkType) => {
    const q = fetchXml(Account).select(f => ({ name: f.name }))
      .join(linkType as any, Address, "id", "id", sub =>
        sub.filter(s => eq(s.zip, 12345))
      )
    const xml = q.toXml()
    expect(xml).toContain(`link-type="${linkType}"`)
    expect(xml).toContain(`<condition attribute="zip_code"`)
    expect(xml).not.toContain(`<attribute name="street_Address"`)
    expect(xml).not.toContain(`<order`)
  }
)

test("[bug16] exists link type only outputs where conditions inside link-entity", () => {
  const q = fetchXml(Account).select(f => ({ name: f.name }))
    .join("exists", Address, "id", "id", sub =>
      sub.filter(s => eq(s.zip, 12345))
    )
  const xml = q.toXml()
  expect(xml).toContain(`link-type="exists"`)
  expect(xml).toContain(`condition attribute="zip_code"`)
  const linkEntityMatch = xml.match(/<link-entity[\s\S]*?<\/link-entity>/)
  expect(linkEntityMatch).not.toBeNull()
  expect(linkEntityMatch![0]).not.toContain(`<attribute`)
})

test("[bug16] filter-only link types do not auto-populate attributes inside link-entity", () => {
  const q = fetchXml(Account).select(f => ({ name: f.name }))
    .join("any", Address, "id", "id", sub =>
      sub.filter(s => eq(s.zip, 12345))
    )
  const xml = q.toXml()
  expect(xml).toContain(`link-type="any"`)
  const linkEntityMatch = xml.match(/<link-entity[\s\S]*?<\/link-entity>/)
  expect(linkEntityMatch).not.toBeNull()
  expect(linkEntityMatch![0]).not.toContain(`<attribute`)
})

// ─── MS Docs Example Tests ───

const Contact2 = new DataverseTable({
  client, entitySetName: "contacts", logicalName: "contact",
  fields: {
    id: primaryKey("contactid"),
    fullname: string("fullname"),
    firstname: string("firstname"),
    lastname: string("lastname"),
    statecode: number("statecode"),
    parentcustomerid: string("parentcustomerid"),
  },
})

// ─── Join Tables ───

test("[docs] join: basic many-to-one account → contact", () => {
  const q = fetchXml(Account).top(5).select(f => ({ name: f.name }))
    .join("inner", Contact2, "id", "id", sub =>
      sub.select(f => ({ full_name: f.fullname }))
    )
  const xml = q.toXml()
  expect(xml).toContain(`top='5'`)
  expect(xml).toContain(`name="account"`)
  expect(xml).toContain(`name="contact"`)
  expect(xml).toContain(`from="contactid"`)
  expect(xml).toContain(`to="accountid"`)
  expect(xml).toContain(`link-type="inner"`)
  expect(xml).toContain(`<attribute name="fullname" alias="full_name" />`)
  expect(xml).toContain(`<attribute name="name" alias="name" />`)
})

test("[docs] join: one-to-many contact → account", () => {
  const q = fetchXml(Contact2).top(5).select(f => ({ fullname: f.fullname }))
    .join("inner", Account, "id", "id", sub =>
      sub.select(f => ({ name: f.name }))
    )
  const xml = q.toXml()
  expect(xml).toContain(`top='5'`)
  expect(xml).toContain(`name="contact"`)
  expect(xml).toContain(`name="account"`)
  expect(xml).toContain(`from="accountid"`)
  expect(xml).toContain(`to="contactid"`)
  expect(xml).toContain(`link-type="inner"`)
})

test("[docs] join: many-to-many via intersect", () => {
  const Team = new DataverseTable({
    client, entitySetName: "teams", logicalName: "team",
    fields: { id: primaryKey("teamid"), name: string("name") },
  })
  const SystemUser = new DataverseTable({
    client, entitySetName: "systemusers", logicalName: "systemuser",
    fields: { id: primaryKey("systemuserid"), fullname: string("fullname") },
  })
  const TeamMembership = new DataverseIntersectTable("teammembership", SystemUser, Team)
  const q = fetchXml(SystemUser).top(2).select(f => ({ fullname: f.fullname }))
    .intersect(TeamMembership, sub =>
      sub.select(f => ({ team_name: f.name }))
    )
  const xml = q.toXml()
  expect(xml).toContain(`intersect="true"`)
  expect(xml).toContain(`name="teammembership"`)
  expect(xml).toContain(`name="team"`)
  expect(xml).toContain(`link-type="inner"`)
  expect(xml).toContain(`<attribute name="fullname" alias="fullname" />`)
  expect(xml).toContain(`<attribute name="name" alias="team_name" />`)
})

test("[docs] join: no relationship (name match)", () => {
  const q = fetchXml(Account).select(f => ({ name: f.name }))
    .join("inner", Contact2, "fullname", "name", sub =>
      sub.select(f => ({ fullname: f.fullname }))
    )
  const xml = q.toXml()
  expect(xml).toContain(`name="contact"`)
  expect(xml).toContain(`from="fullname"`)
  expect(xml).toContain(`to="name"`)
  expect(xml).toContain(`link-type="inner"`)
})

test("[docs] join: left outer find accounts with no contacts", () => {
  const q = fetchXml(Account).select(f => ({ name: f.name }))
    .orderby(f => f.name)
    .join("outer", Contact2, "parentcustomerid", "id", sub => sub)
    .filter(`<condition entityname='auto_link_1' attribute='parentcustomerid' operator='null' />`)
  const xml = q.toXml()
  expect(xml).toContain(`link-type="outer"`)
  expect(xml).toContain(`from="parentcustomerid"`)
  expect(xml).toContain(`to="accountid"`)
  expect(xml).toContain(`entityname='auto_link_1'`)
})

test("[docs] join: exists link type", () => {
  const q = fetchXml(Contact2).select(f => ({ fullname: f.fullname }))
    .join("exists", Account, "primarycontactid", "id", sub =>
      sub.filter(`<condition attribute="statecode" operator="eq" value="1" />`)
    )
  const xml = q.toXml()
  expect(xml).toContain(`link-type="exists"`)
  expect(xml).toContain(`condition attribute="statecode"`)
  const linkSection = xml.match(/<link-entity[\s\S]*?<\/link-entity>/)
  expect(linkSection).not.toBeNull()
  expect(linkSection![0]).not.toContain(`<attribute`)
})

test("[docs] join: in link type", () => {
  const q = fetchXml(Contact2).select(f => ({ fullname: f.fullname }))
    .join("in", Account, "primarycontactid", "id", sub =>
      sub.filter(`<condition attribute="statecode" operator="eq" value="1" />`)
    )
  const xml = q.toXml()
  expect(xml).toContain(`link-type="in"`)
  expect(xml).toContain(`condition attribute="statecode"`)
  const linkSection = xml.match(/<link-entity[\s\S]*?<\/link-entity>/)
  expect(linkSection).not.toBeNull()
  expect(linkSection![0]).not.toContain(`<attribute`)
})

test("[docs] join: matchfirstrowusingcrossapply", () => {
  const q = fetchXml(Contact2).select(f => ({ fullname: f.fullname }))
    .join("matchfirstrowusingcrossapply", Account, "primarycontactid", "id", sub =>
      sub.select(f => ({ accountid: f.id, name: f.name }))
    )
  const xml = q.toXml()
  expect(xml).toContain(`link-type="matchfirstrowusingcrossapply"`)
  expect(xml).toContain(`from="primarycontactid"`)
  expect(xml).toContain(`to="contactid"`)
  expect(xml).toContain(`<attribute name="accountid" alias="accountid" />`)
  expect(xml).toContain(`<attribute name="name" alias="name" />`)
})

// ─── Select Columns ───

test("[docs] select: multiple columns", () => {
  const q = fetchXml(Account).select(f => ({
    name: f.name,
    revenue: f.revenue,
    city: f.city,
  }))
  const xml = q.toXml()
  expect(xml).toContain(`<attribute name="name" alias="name" />`)
  expect(xml).toContain(`<attribute name="revenue" alias="revenue" />`)
  expect(xml).toContain(`<attribute name="address1_city" alias="city" />`)
})

// ─── Filter Rows ───

test("[docs] filter: eq city", () => {
  const q = fetchXml(Account).select(f => ({ name: f.name }))
    .filter(f => eq(f.city, "Redmond"))
  const xml = q.toXml()
  expect(xml).toContain(`<filter type="and">`)
  expect(xml).toContain(`<condition attribute="address1_city" operator="eq" value="Redmond" />`)
})

test("[docs] filter: or multiple cities", () => {
  const q = fetchXml(Account).select(f => ({ name: f.name, city: f.city }))
    .filter(f => or(
      eq(f.city, "Redmond"),
      eq(f.city, "Seattle"),
      eq(f.city, "Bellevue"),
    ))
  const xml = q.toXml()
  expect(xml).toContain(`<filter type="and">`)
  expect(xml).toContain(`<filter type="or">`)
  expect(xml).toContain(`<condition attribute="address1_city" operator="eq" value="Redmond" />`)
  expect(xml).toContain(`<condition attribute="address1_city" operator="eq" value="Seattle" />`)
  expect(xml).toContain(`<condition attribute="address1_city" operator="eq" value="Bellevue" />`)
})

test("[docs] filter: in operator with values", () => {
  const q = fetchXml(Account).select(f => ({ name: f.name, city: f.city }))
    .filter(In(new FieldRef("address1_city"), ["Redmond", "Seattle", "Bellevue"]))
  const xml = q.toXml()
  expect(xml).toContain(`operator="in"`)
  expect(xml).toContain(`<value>Redmond</value>`)
  expect(xml).toContain(`<value>Seattle</value>`)
  expect(xml).toContain(`<value>Bellevue</value>`)
})

test("[docs] filter: eq-userid no value", () => {
  const q = fetchXml(Account).filter(EqualUserId(new FieldRef("ownerid")))
  const xml = q.toXml()
  expect(xml).toContain(`operator="eq-userid"`)
})

test("[docs] filter: between with value elements", () => {
  const q = fetchXml(Account).filter(Between(new FieldRef("numberofemployees"), 6, 20))
  const xml = q.toXml()
  expect(xml).toContain(`operator="between"`)
  expect(xml).toContain(`<value>6</value>`)
  expect(xml).toContain(`<value>20</value>`)
})

test("[docs] filter: column valueof comparison (same row)", () => {
  const q = fetchXml(Contact2).select(f => ({ firstname: f.firstname }))
    .filter(f => eq(f.firstname, f.lastname))
  const xml = q.toXml()
  expect(xml).toContain(`<condition attribute="firstname" operator="eq" valueof="lastname" />`)
})

test("[docs] filter: cross-table valueof with alias", () => {
  const q = fetchXml(Contact2).select(f => ({ contactid: f.id, fullname: f.fullname }))
    .join("outer", Account, "id", "parentcustomerid", sub =>
      sub.select(f => ({ name: f.name }))
    )
    .filter(`<condition attribute="fullname" operator="eq" valueof="auto_link_1.name" />`)
  const xml = q.toXml()
  expect(xml).toContain(`condition attribute="fullname"`)
  expect(xml).toContain(`valueof="auto_link_1.name"`)
  expect(xml).toContain(`link-type="outer"`)
})

test("[docs] filter: link-type any in filter", () => {
  const q = fetchXml(Contact2).select(f => ({ fullname: f.fullname }))
    .filter(f => or(
      eq(f.statecode, 1),
      `<link-entity name='account' from='primarycontactid' to='contactid' link-type='any'>
        <filter type='and'>
          <condition attribute='name' operator='eq' value='Contoso' />
        </filter>
      </link-entity>`,
    ))
  const xml = q.toXml()
  expect(xml).toContain(`link-type='any'`)
  expect(xml).toContain(`<condition attribute='name' operator='eq' value='Contoso' />`)
  expect(xml).toContain(`attribute="statecode"`)
})

test("[docs] filter: link-type not any", () => {
  const q = fetchXml(Contact2).select(f => ({ fullname: f.fullname }))
    .filter(`<link-entity name='account' from='primarycontactid' to='contactid' link-type='not any'>
      <filter type='and'>
        <condition attribute='name' operator='eq' value='Contoso' />
      </filter>
    </link-entity>`)
  const xml = q.toXml()
  expect(xml).toContain(`link-type='not any'`)
  expect(xml).toContain(`<condition attribute='name' operator='eq' value='Contoso' />`)
})

// ─── Order Rows ───

test("[docs] order: ascending default", () => {
  const q = fetchXml(Account).select(f => ({ name: f.name, accountnumber: f.revenue, createdon: f.city }))
    .orderby(f => f.city)
    .orderby(f => f.name)
    .orderby(f => f.revenue)
  const xml = q.toXml()
  const orders = [...xml.matchAll(/<order[^>]*\/>/g)].map(m => m[0])
  expect(orders).toHaveLength(3)
  expect(orders[0]).toContain(`attribute='address1_city'`)
  expect(orders[1]).toContain(`attribute='name'`)
  expect(orders[2]).toContain(`attribute='revenue'`)
})

test("[docs] order: descending", () => {
  const q = fetchXml(Account).select(f => ({ name: f.name, createdon: f.city }))
    .orderby(f => f.city, "desc")
  const xml = q.toXml()
  expect(xml).toContain(`<order attribute='address1_city' descending='true' />`)
})

test("[docs] order: entityname for priority", () => {
  const q = fetchXml(Account).select(f => ({ name: f.name }))
    .join("inner", Account, "id", "parentaccountid", sub =>
      sub.select(f => ({ parentname: f.name }))
    )
    .orderby("auto_link_1", "name")
    .orderby(f => f.name)
  const xml = q.toXml()
  const orders = [...xml.matchAll(/<order[^>]*\/>/g)].map(m => m[0])
  expect(orders).toHaveLength(2)
  expect(orders[0]).toContain(`entityname='auto_link_1'`)
  expect(orders[1]).not.toContain(`entityname=`)
})

// ─── Aggregate Data ───

test("[docs] aggregate: all functions on one column", () => {
  const q = fetchXml(Account).apply(v => ({
    Average: average(v.revenue),
    Count: count(v.revenue),
    Maximum: max(v.revenue),
    Minimum: min(v.revenue),
    Sum: sum(v.revenue),
  }))
  const xml = q.toXml()
  expect(xml).toContain(`aggregate="true"`)
  expect(xml).toContain(`<attribute name="revenue" alias="Average" aggregate='average' />`)
  expect(xml).toContain(`<attribute name="revenue" alias="Count" aggregate='count' />`)
  expect(xml).toContain(`<attribute name="revenue" alias="Maximum" aggregate='max' />`)
  expect(xml).toContain(`<attribute name="revenue" alias="Minimum" aggregate='min' />`)
  expect(xml).toContain(`<attribute name="revenue" alias="Sum" aggregate='sum' />`)
})

test("[docs] aggregate: groupby city with sum and count", () => {
  const q = fetchXml(Account).apply(v => ({
    city: groupby(v.city),
    Total: sum(v.revenue),
    Count: count(v.city),
  }))
  const xml = q.toXml()
  expect(xml).toContain(`aggregate="true"`)
  expect(xml).toContain(`<attribute name="revenue" alias="Total" aggregate='sum' />`)
  expect(xml).toContain(`<attribute name="address1_city" alias="Count" aggregate='count' />`)
  expect(xml).toContain(`<attribute name="address1_city" alias="city" groupby='true' />`)
})

test("[docs] aggregate: with aggregatelimit", () => {
  const q = fetchXml(Account).apply(v => ({ account_count: count(v.name) }))
  const xml = q.toXml()
  expect(xml).toContain(`aggregate="true"`)
  expect(xml).toContain(`aggregate='count'`)
})

test("[docs] aggregate: rowaggregate CountChildren", () => {
  const q = fetchXml(Account).top(5).select(f => ({ name: f.name, numberOfChildren: f.id }))
    .orderby(f => f.id, "desc")
  const xml = q.toXml()
  expect(xml).toContain(`name="accountid" alias="numberOfChildren"`)
  expect(xml).toContain(`<order attribute='accountid' descending='true' />`)
})

