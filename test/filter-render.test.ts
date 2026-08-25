import { expect, test } from "vitest"
import {
  eq, ne, gt, and, or, not, contains, startsWith, endsWith, isNull, isNotNull,
  Between, In, ContainsValues, EqualUserId, LastXDays, Today, FieldRef,
  choice, nullableChoice, string, number, datetime,
} from "../src"

const ref = (name: string) => new FieldRef(name)

// --- Choice label transformation ---

test("raw field instances are accepted and treated as root-level", () => {
  const name = string("fullname")
  expect(eq(name, "John").toOdata()).toBe("(fullname eq 'John')")
  expect(eq(name, "John").toFetchXml()).toBe(`<condition attribute="fullname" operator="eq" value="John" />`)

  const revenue = number("revenue")
  expect(gt(revenue, 100).toOdata()).toBe("(revenue gt 100)")

  const status = choice("statuscode", { 1: "Active", 2: "Inactive" } as const)
  expect(eq(status, "Active").toOdata()).toBe("(statuscode eq 1)")
  expect(EqualUserId(revenue).toOdata()).toBe("Microsoft.Dynamics.CRM.EqualUserId(PropertyName='revenue')")
  expect(EqualUserId(revenue).toFetchXml()).toBe(`<condition attribute="revenue" operator="eq-userid" />`)

  // field-to-field comparison with raw instances
  const createdOn = datetime("createdon")
  expect(and(eq(name, revenue), gt(createdOn, createdOn)).toOdata())
    .toBe("((fullname eq revenue) and (createdon gt createdon))")
})

test("choice labels are transformed to option values in comparisons", () => {
  const status = FieldRef.fromPath(choice("statuscode", { 1: "Active", 2: "Inactive" }), "statuscode")
  expect(eq(status, "Active").toOdata()).toBe("(statuscode eq 1)")
  expect(ne(status, "Inactive").toOdata()).toBe("(statuscode ne 2)")
  expect(eq(status, "Active").toFetchXml()).toBe(`<condition attribute="statuscode" operator="eq" value="1" />`)
})

test("nullable choice labels transform with null passthrough", () => {
  const prio = FieldRef.fromPath(nullableChoice("prioritycode", { 1: "Low", 2: "High" }), "prioritycode")
  expect(eq(prio, "High").toOdata()).toBe("(prioritycode eq 2)")
  expect(eq(prio, null).toOdata()).toBe("(prioritycode eq null)")
})

test("raw numeric choice values pass through unchanged", () => {
  const status = FieldRef.fromPath(choice("statuscode", { 1: "Active", 2: "Inactive" }), "statuscode")
  expect(eq(status, 1).toOdata()).toBe("(statuscode eq 1)")
})

test("unknown choice labels throw at expression time", () => {
  const status = FieldRef.fromPath(choice("statuscode", { 1: "Active", 2: "Inactive" }), "statuscode")
  expect(() => eq(status, "Bogus")).toThrow("Unknown choice label: Bogus")
})

test("choice labels transform inside CRM function values", () => {
  const status = new FieldRef<"Active" | "Inactive">(
    choice("statuscode", { 1: "Active", 2: "Inactive" } as const),
    "statuscode",
  )
  expect(In(status, ["Active", "Inactive"]).toString()).toContain("PropertyValues=[1,2]")
  expect(ContainsValues(status, ["Active", "Inactive"]).toFetchXml()).toContain("<value>1</value><value>2</value>")
})

// --- Basic conditions ---

test("toFetchXml renders comparison with value", () => {
  expect(eq(ref("fullname"), "John").toFetchXml()).toBe(`<condition attribute="fullname" operator="eq" value="John" />`)
})

test("toFetchXml renders numeric comparison", () => {
  expect(gt(ref("revenue"), 100).toFetchXml()).toBe(`<condition attribute="revenue" operator="gt" value="100" />`)
})

test("toFetchXml renders null operators", () => {
  expect(isNull(ref("email")).toFetchXml()).toBe(`<condition attribute="email" operator="null" />`)
  expect(isNotNull(ref("email")).toFetchXml()).toBe(`<condition attribute="email" operator="not-null" />`)
})

test("toFetchXml maps contains to like with wildcards", () => {
  expect(contains(ref("name"), "ohn").toFetchXml()).toBe(`<condition attribute="name" operator="like" value="%ohn%" />`)
})

test("toFetchXml maps startsWith/endsWith", () => {
  expect(startsWith(ref("name"), "Jo").toFetchXml()).toBe(`<condition attribute="name" operator="begins-with" value="Jo" />`)
  expect(endsWith(ref("name"), "hn").toFetchXml()).toBe(`<condition attribute="name" operator="ends-with" value="hn" />`)
})

test("toFetchXml renders field-to-field compare with valueof", () => {
  expect(eq(ref("modifiedon"), ref("createdon")).toFetchXml()).toBe(`<condition attribute="modifiedon" operator="eq" valueof="createdon" />`)
  expect(ne(ref("a"), ref("b")).toFetchXml()).toBe(`<condition attribute="a" operator="ne" valueof="b" />`)
})

test("toFetchXml omits value for null comparisons", () => {
  expect(eq(ref("field"), null).toFetchXml()).toBe(`<condition attribute="field" operator="eq" value="" />`)
})

// --- CRM functions ---

test("toFetchXml renders function with no values", () => {
  expect(EqualUserId(ref("ownerid")).toFetchXml()).toBe(`<condition attribute="ownerid" operator="eq-userid" />`)
  expect(Today(ref("createdon")).toFetchXml()).toBe(`<condition attribute="createdon" operator="today" />`)
})

test("toFetchXml renders function with single value", () => {
  expect(LastXDays(ref("createdon"), 7).toFetchXml()).toBe(`<condition attribute="createdon" operator="last-x-days" value="7" />`)
})

test("toFetchXml renders multiple values as value children", () => {
  expect(Between(ref("revenue"), 10, 20).toFetchXml()).toBe(
    `<condition attribute="revenue" operator="between"><value>10</value><value>20</value></condition>`,
  )
  expect(In(ref("status"), [1, 2, 3]).toFetchXml()).toBe(
    `<condition attribute="status" operator="in"><value>1</value><value>2</value><value>3</value></condition>`,
  )
})

// --- Boolean composition ---

test("toFetchXml nests and conditions", () => {
  const expr = and(gt(ref("age"), 20), eq(ref("name"), "John"))
  expect(expr.toFetchXml()).toBe(
    `<filter type="and"><condition attribute="age" operator="gt" value="20" /><condition attribute="name" operator="eq" value="John" /></filter>`,
  )
})

test("toFetchXml nests or conditions", () => {
  const expr = or(eq(ref("a"), 1), eq(ref("b"), 2))
  expect(expr.toFetchXml()).toBe(
    `<filter type="or"><condition attribute="a" operator="eq" value="1" /><condition attribute="b" operator="eq" value="2" /></filter>`,
  )
})

test("toFetchXml renders not as nested or inside and", () => {
  const expr = not(eq(ref("age"), 20))
  expect(expr.toFetchXml()).toBe(
    `<filter type="and"><filter type="or"><condition attribute="age" operator="eq" value="20" /></filter></filter>`,
  )
})

test("toFetchXml returns empty string for empty and/or", () => {
  expect(and().toFetchXml()).toBe("")
  expect(or().toFetchXml()).toBe("")
})

test("toFetchXml passes raw strings through unwrapped", () => {
  expect(and(eq(ref("a"), 1), "raw cond").toFetchXml()).toBe(
    `<filter type="and"><condition attribute="a" operator="eq" value="1" />raw cond</filter>`,
  )
})

// --- XML escaping ---

test("toFetchXml escapes special characters in values", () => {
  const expr = eq(ref("name"), `O'Brien <b>&"quoted"</b>`)
  expect(expr.toFetchXml()).toBe(
    `<condition attribute="name" operator="eq" value="O&apos;Brien &lt;b&gt;&amp;&quot;quoted&quot;&lt;/b&gt;" />`,
  )
})

test("toFetchXml escapes special characters in attribute names", () => {
  const expr = eq(new FieldRef('weird<"x">&name'), "v")
  expect(expr.toFetchXml()).toContain(`attribute="weird&lt;&quot;x&quot;&gt;&amp;name"`)
})
