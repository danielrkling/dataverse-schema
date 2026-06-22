import { expect, expectTypeOf, test } from "vitest"
import { DataverseClient } from "../src/client"
import { fetchXml, condition, filterAnd, filterOr, eq, gt, and, Infer,
  Today, Tomorrow, Yesterday, Last7Days, Next7Days, LastMonth, NextMonth, ThisMonth,
  LastWeek, NextWeek, ThisWeek, LastYear, NextYear, ThisYear,
  LastXDays, NextXDays, OlderThanXDays,
  EqualUserId, EqualUserLanguage, NotEqualUserId,
  In, NotIn, ContainsValues, DoesNotContainValues,
  Between, NotBetween, On, Under, Above,
  ThisFiscalPeriod, ThisFiscalYear, InFiscalPeriodAndYear,
  LastXHours, LastXMonths, LastXWeeks, LastXYears,
  sum, avg, min, max, count,
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
  const q = fetchXml(Person).innerJoin(Address, "id", "pk", (sub) =>
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
    .where(condition("address1_city", "eq", "Redmond"))
  const xml = q.toXml()
  expect(xml).toContain(`<filter type="and">`)
  expect(xml).toContain(`<condition attribute="address1_city" operator="eq" value="Redmond" />`)
})

// --- MS Docs Example: OR filter with multiple conditions ---
// (Use filterOr helper inside where, since orWhere was removed)

test("[docs] or filter with multiple eq conditions", () => {
  const q = fetchXml(Account).select(f => ({ name: f.name, city: f.city }))
    .where(filterOr(
      condition("address1_city", "eq", "Redmond"),
      condition("address1_city", "eq", "Seattle"),
      condition("address1_city", "eq", "Bellevue")
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
    .where(
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
  const q = fetchXml(Account).where(`<condition attribute='ownerid' operator='eq-userid' />`)
  const xml = q.toXml()
  expect(xml).toContain(`operator='eq-userid'`)
})

// --- MS Docs Example: between operator with value elements ---

test("[docs] between operator with values", () => {
  const q = fetchXml(Account).where(
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
    .innerJoin(Contact, "id", "id", (sub) =>
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

// --- MS Docs Example: Paging ---

test("[docs] simple paging with page and count", () => {
  const q = fetchXml(Account).page(1).pageSize(3).select(f => ({ name: f.name }))
    .orderby(f => f.name)
  const xml = q.toXml()
  expect(xml).toContain(`page='1'`)
  expect(xml).toContain(`count='3'`)
})

test("[docs] page 2 with count", () => {
  const q = fetchXml(Account).page(2).pageSize(3).select(f => ({ name: f.name }))
    .orderby(f => f.name)
  const xml = q.toXml()
  expect(xml).toContain(`page='2'`)
  expect(xml).toContain(`count='3'`)
})

// --- MS Docs Example: Distinct ---

test("[docs] distinct results", () => {
  const q = fetchXml(Account).distinct().select(f => ({ name: f.name }))
  expect(q.toXml()).toContain(`distinct="true"`)
})

// --- MS Docs Example: Aggregate data ---

test("[docs] aggregate functions on a column", () => {
  const q = fetchXml(Account).groupby(
    () => [],
    f => ({
      Total: sum(f.revenue),
      Count: count(f.revenue),
      Maximum: max(f.revenue),
      Minimum: min(f.revenue),
      Average: avg(f.revenue),
    })
  )
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
  const q = fetchXml(Account).groupby(
    f => [f.city],
    f => ({ Total: sum(f.revenue), Count: count(f.city) })
  ).orderby(f => f.city)
  const xml = q.toXml()
  expect(xml).toContain(`aggregate='sum'`)
  expect(xml).toContain(`aggregate='count'`)
  expect(xml).toContain(`groupby='true'`)
  expect(xml).toContain(`alias="city"`)
})

// --- MS Docs Example: returntotalrecordcount ---

test("[docs] returnTotalRecordCount", () => {
  const q = fetchXml(Account).select(f => ({ name: f.name }))
    .returnTotalRecordCount()
  expect(q.toXml()).toContain(`returntotalrecordcount="true"`)
})

// --- MS Docs Example: useraworderby ---

test("[docs] useRawOrderBy", () => {
  const q = fetchXml(Account).select(f => ({ name: f.name }))
    .useRawOrderBy()
  expect(q.toXml()).toContain(`useraworderby="true"`)
})

// --- MS Docs Example: aggregatelimit ---

test("[docs] aggregateLimit", () => {
  const q = fetchXml(Account).groupby(
    () => [],
    f => ({ cnt: count(f.name) })
  ).aggregateLimit(5)
  const xml = q.toXml()
  expect(xml).toContain(`aggregatelimit='5'`)
  expect(xml).toContain(`aggregate="true"`)
})

// --- MS Docs Example: paging-cookie ---

test("[docs] paging-cookie", () => {
  const q = fetchXml(Account).page(2).pageSize(3)
    .pagingCookie(`<cookie page="1"><fullname last="Susanna" first="Yvonne" /></cookie>`)
    .select(f => ({ name: f.name }))
    .orderby(f => f.name, "desc")
  const xml = q.toXml()
  expect(xml).toContain(`paging-cookie='<cookie page="1"><fullname last="Susanna" first="Yvonne" /></cookie>'`)
})

// --- Existing tests preserved ---

test("where with field proxy resolves Dataverse names", () => {
  const q = fetchXml(Person).where(f => condition(f.name, "eq", "John"))
  expect(q.toXml()).toContain(`attribute="fullname"`)
})

test("multiple where calls accumulate in single filter", () => {
  const q = fetchXml(Person)
    .where(condition("fullname", "eq", "John"))
    .where(condition("person_age", "gt", 20))
  const xml = q.toXml()
  expect(xml.match(/<filter type="and">/g)).toHaveLength(1)
  expect(xml.match(/<condition/g)).toHaveLength(2)
})

test("where with existing filter functions", () => {
  const q = fetchXml(Person).where(f => eq(f.name, "John"))
  expect(q.toXml()).toContain("fullname")
  expect(q.toXml()).toContain("John")
})

test("where with and/greaterThan filter functions", () => {
  const q = fetchXml(Person).where(f => and(eq(f.name, "John"), gt(f.age, 20)))
  expect(q.toXml()).toContain("fullname")
  expect(q.toXml()).toContain("person_age")
})

test("condition helper builds condition XML", () => {
  expect(condition("fullname", "eq", "John")).toBe(
    `<condition attribute="fullname" operator="eq" value="John" />`
  )
})

test("filterAnd wraps conditions", () => {
  const result = filterAnd(
    condition("a", "eq", "1"),
    condition("b", "eq", "2")
  )
  expect(result).toContain(`type="and"`)
  expect(result).toContain(`attribute="a"`)
  expect(result).toContain(`attribute="b"`)
})

test("filterOr wraps conditions", () => {
  const result = filterOr(condition("a", "eq", "1"))
  expect(result).toContain(`type="or"`)
  expect(result).toContain(`attribute="a"`)
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
    .through(PersonAccount, sub =>
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
    .through(PersonAccount, sub =>
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
    fetchXml(unrelatedTable).through(PersonAccount, sub => sub)
  ).toThrow("not related")
})

test("through narrows result type to selected fields", () => {
  const PersonAccount = new DataverseIntersectTable("personaccount", Person, Account)
  const q = fetchXml(Person)
    .select(f => ({ name: f.name }))
    .through(PersonAccount, sub =>
      sub.select(f => ({ accountName: f.name }))
    )
  expectTypeOf(q.execute).returns.resolves.toEqualTypeOf<{ name: string; accountName: string }[]>()
})

// --- FetchXML serialization of CRM functions ---

test("CRM function Today produces correct FetchXML", () => {
  expect(Today("createdon").toFetchXml()).toContain(`operator="today"`)
})

test("CRM function EqualUserId produces correct FetchXML", () => {
  expect(EqualUserId("ownerid").toFetchXml()).toContain(`operator="eq-userid"`)
})

test("CRM function Between produces correct FetchXML with value children", () => {
  const xml = Between("field", 10, 20).toFetchXml()
  expect(xml).toContain(`operator="between"`)
  expect(xml).toContain(`<value>10</value>`)
  expect(xml).toContain(`<value>20</value>`)
})

test("CRM function In produces correct FetchXML with value children", () => {
  const xml = In("field", ["a", "b"]).toFetchXml()
  expect(xml).toContain(`operator="in"`)
  expect(xml).toContain(`<value>a</value>`)
  expect(xml).toContain(`<value>b</value>`)
})

test("CRM function Today can be used in fetchXml where clause", () => {
  const q = fetchXml(Account).select(f => ({ name: f.name }))
    .where(Today("createdon"))
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
        value: [{ logid: "id-1", msg: "Test entry", date: "2024-06-15T12:00:00Z" }],
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
          date: "2024-06-15T12:00:00Z",
          total: 500,
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

fetchXml(Account).