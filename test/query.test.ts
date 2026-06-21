import { expect, test } from "vitest"
import {
  select, orderby, expand, and, or, not, eq, ne, gt, ge, lt, le,
  contains, startsWith, endsWith, isNull, isNotNull, isActive, isInactive,
  asc, desc, keys, compare,
  wrapString, isNonEmptyString,
  Above, AboveOrEqual, Between, In, NotIn, Under, UnderOrEqual, NotUnder,
  On, OnOrAfter, OnOrBefore, NotBetween,
  Today, Tomorrow, Yesterday,
  Last7Days, LastMonth, LastWeek, LastYear, LastXDays, LastXHours, LastXMonths, LastXWeeks, LastXYears,
  Next7Days, NextMonth, NextWeek, NextYear, NextXDays, NextXHours, NextXMonths, NextXWeeks, NextXYears,
  ThisMonth, ThisWeek, ThisYear,
  OlderThanXDays, OlderThanXHours, OlderThanXMinutes, OlderThanXMonths, OlderThanXWeeks, OlderThanXYears,
  ContainsValues, DoesNotContainValues,
  LastFiscalPeriod, LastFiscalYear, LastXFiscalPeriods, LastXFiscalYears,
  NextFiscalPeriod, NextFiscalYear, NextXFiscalPeriods, NextXFiscalYears,
  ThisFiscalPeriod, ThisFiscalYear,
  InFiscalPeriod, InFiscalYear, InFiscalPeriodAndYear,
  InOrAfterFiscalPeriodAndYear, InOrBeforeFiscalPeriodAndYear,
  EqualBusinessId, NotEqualBusinessId,
  EqualUserId, NotEqualUserId,
  EqualUserLanguage,
  EqualUserOrUserHierarchy, EqualUserOrUserHierarchyAndTeams,
  EqualUserOrUserTeams,
} from "../src"

test("select joins field names", () => {
  expect(select("name", "address", "phone")).toBe("name,address,phone")
})

test("select filters empty strings", () => {
  expect(select("name", "", "phone")).toBe("name,phone")
})

test("select handles Name objects", () => {
  expect(select({ name: "fullname" }, { name: "email" })).toBe("fullname,email")
})

test("orderby formats key-value pairs", () => {
  expect(orderby({ name: "asc", age: "desc" })).toBe("name asc,age desc")
})

test("orderby filters empty values", () => {
  expect(orderby({ name: "asc", empty: "" as any })).toBe("name asc")
})

test("orderby accepts string array", () => {
  expect(orderby(["name asc", "age desc"])).toBe("name asc,age desc")
})

test("asc formats field name", () => {
  expect(`${asc("name")}`).toBe("name asc")
  expect(`${asc({ name: "fullname" })}`).toBe("fullname asc")
})

test("desc formats field name", () => {
  expect(`${desc("name")}`).toBe("name desc")
  expect(`${desc({ name: "fullname" })}`).toBe("fullname desc")
})

test("expand formats flat string", () => {
  expect(expand("primarycontactid")).toBe("primarycontactid")
})

test("expand formats nested object", () => {
  const result = expand({ ownerid: { select: ["name", "email"] } })
  expect(result).toBe("ownerid($select=name,email)")
})

test("expand formats deeply nested object", () => {
  const result = expand({
    ownerid: {
      select: ["name"],
      expand: { manager: { select: ["email"] } },
    },
  })
  expect(result).toContain("ownerid")
  expect(result).toContain("manager")
  expect(result).toContain("$expand")
  expect(result).toContain("$select")
})

test("expand formats with filter and orderby", () => {
  const result = expand({
    contacts: {
      select: ["fullname"],
      filter: "statecode eq 0",
      orderby: { fullname: "asc" },
    },
  })
  expect(result).toContain("$filter=statecode eq 0")
  expect(result).toContain("$orderby=fullname asc")
})

// --- FilterExpr tests ---

test("eq wraps field eq value", () => {
  expect(eq("name", "John").toOdata()).toBe("(name eq 'John')")
})

test("eq with number does not quote", () => {
  expect(eq("age", 25).toOdata()).toBe("(age eq 25)")
})

test("eq with boolean does not quote", () => {
  expect(eq("active", true).toOdata()).toBe("(active eq true)")
})

test("eq with null", () => {
  expect(eq("field", null).toOdata()).toBe("(field eq null)")
})

test("ne formats correctly", () => {
  expect(ne("name", "John").toOdata()).toBe("(name ne 'John')")
})

test("gt formats correctly", () => {
  expect(gt("age", 18).toOdata()).toBe("(age gt 18)")
})

test("ge formats correctly", () => {
  expect(ge("age", 18).toOdata()).toBe("(age ge 18)")
})

test("lt formats correctly", () => {
  expect(lt("age", 65).toOdata()).toBe("(age lt 65)")
})

test("le formats correctly", () => {
  expect(le("age", 65).toOdata()).toBe("(age le 65)")
})

test("and joins multiple conditions", () => {
  expect(and(gt("age", 20), eq("name", "John")).toOdata()).toBe("((age gt 20) and (name eq 'John'))")
})

test("and returns empty for no conditions", () => {
  expect(and().toOdata()).toBe("")
})

test("and handles single condition", () => {
  expect(and(gt("age", 20)).toOdata()).toBe("((age gt 20))")
})

test("or joins multiple conditions", () => {
  expect(or(lt("age", 10), gt("age", 20)).toOdata()).toBe("((age lt 10) or (age gt 20))")
})

test("or returns empty for no conditions", () => {
  expect(or().toOdata()).toBe("")
})

test("not wraps condition", () => {
  expect(not(eq("age", 20)).toOdata()).toBe("not((age eq 20))")
})

test("contains wraps field in OData contains", () => {
  expect(contains("name", "ohn").toOdata()).toBe("contains(name,'ohn')")
})

test("startsWith wraps field in OData startswith", () => {
  expect(startsWith("name", "Jo").toOdata()).toBe("startswith(name,'Jo')")
})

test("endsWith wraps field in OData endswith", () => {
  expect(endsWith("name", "hn").toOdata()).toBe("endswith(name,'hn')")
})

test("isNull formats correctly", () => {
  expect(isNull("email").toOdata()).toBe("email eq null")
})

test("isNotNull formats correctly", () => {
  expect(isNotNull("email").toOdata()).toBe("email ne null")
})

test("isActive returns statecode eq 0", () => {
  expect(isActive().toOdata()).toBe("(statecode eq 0)")
})

test("isInactive returns statecode eq 1", () => {
  expect(isInactive().toOdata()).toBe("(statecode eq 1)")
})

test("compare compares two fields", () => {
  expect(compare("modifiedon", "gt", "createdon").toOdata()).toBe("(modifiedon gt createdon)")
})

test("and filters empty conditions", () => {
  expect(and(eq("a", 1), "").toOdata()).toBe("((a eq 1))")
})

test("or filters empty conditions", () => {
  expect(or(eq("a", 1), "").toOdata()).toBe("((a eq 1))")
})

// --- OData value helpers ---

test("wrapString quotes strings except GUIDs and dates", () => {
  expect(wrapString("hello")).toBe("'hello'")
  expect(wrapString("a1b2c3d4-e5f6-7890-1234-567890abcdef")).toBe("a1b2c3d4-e5f6-7890-1234-567890abcdef")
  expect(wrapString("2024-01-15")).toBe("2024-01-15")
  expect(wrapString(42)).toBe("42")
  expect(wrapString(null)).toBe("null")
})

test("wrapString escapes single quotes", () => {
  expect(wrapString("O'Brien")).toBe("'O''Brien'")
})

test("keys formats key-value pairs", () => {
  expect(keys({ name: "John", age: 25 })).toBe("name='John',age=25")
})

test("keys encodes single quotes", () => {
  expect(keys({ name: "O'Brien" })).toBe("name='O''Brien'")
})

// --- Dataverse-specific filter operators ---

test("Above", () => {
  expect(Above("field", "value").toString()).toContain("Microsoft.Dynamics.CRM.Above")
})

test("AboveOrEqual", () => {
  expect(AboveOrEqual("field", "value").toString()).toContain("Microsoft.Dynamics.CRM.AboveOrEqual")
})

test("Between", () => {
  expect(Between("field", 10, 20).toString()).toContain("Microsoft.Dynamics.CRM.Between")
  expect(Between("field", 10, 20).toString()).toContain("PropertyValues=[10,20]")
})

test("NotBetween", () => {
  expect(NotBetween("field", 10, 20).toString()).toContain("Microsoft.Dynamics.CRM.NotBetween")
})

test("In", () => {
  expect(In("field", ["a", "b"]).toString()).toContain("Microsoft.Dynamics.CRM.In")
  expect(In("field", ["a", "b"]).toString()).toContain("PropertyValues=['a','b']")
})

test("NotIn", () => {
  expect(NotIn("field", ["a", "b"]).toString()).toContain("Microsoft.Dynamics.CRM.NotIn")
})

test("ContainsValues", () => {
  expect(ContainsValues("field", ["a", "b"]).toString()).toContain("Microsoft.Dynamics.CRM.ContainsValues")
})

test("DoesNotContainValues", () => {
  expect(DoesNotContainValues("field", ["a", "b"]).toString()).toContain("Microsoft.Dynamics.CRM.DoesNotContainValues")
})

test("Under", () => {
  expect(Under("field", "value").toString()).toContain("Microsoft.Dynamics.CRM.Under")
})

test("UnderOrEqual", () => {
  expect(UnderOrEqual("field", "value").toString()).toContain("Microsoft.Dynamics.CRM.UnderOrEqual")
})

test("NotUnder", () => {
  expect(NotUnder("field", "value").toString()).toContain("Microsoft.Dynamics.CRM.NotUnder")
})

test("On / OnOrAfter / OnOrBefore", () => {
  expect(On("field", "2024-01-01").toString()).toContain("Microsoft.Dynamics.CRM.On")
  expect(OnOrAfter("field", "2024-01-01").toString()).toContain("Microsoft.Dynamics.CRM.OnOrAfter")
  expect(OnOrBefore("field", "2024-01-01").toString()).toContain("Microsoft.Dynamics.CRM.OnOrBefore")
})

test("EqualUserId", () => {
  expect(EqualUserId("ownerid").toString()).toContain("Microsoft.Dynamics.CRM.EqualUserId")
})

test("EqualUserOrUserHierarchy", () => {
  expect(EqualUserOrUserHierarchy("ownerid").toString()).toContain("Microsoft.Dynamics.CRM.EqualUserOrUserHierarchy")
})

test("EqualUserOrUserHierarchyAndTeams", () => {
  expect(EqualUserOrUserHierarchyAndTeams("ownerid").toString()).toContain("EqualUserOrUserHierarchyAndTeams")
})

test("EqualUserOrUserTeams", () => {
  expect(EqualUserOrUserTeams("ownerid").toString()).toContain("EqualUserOrUserTeams")
})

test("EqualUserLanguage", () => {
  expect(EqualUserLanguage("language").toString()).toContain("EqualUserLanguage")
})

test("EqualBusinessId", () => {
  expect(EqualBusinessId("businessunitid").toString()).toContain("EqualBusinessId")
})

test("NotEqualBusinessId", () => {
  expect(NotEqualBusinessId("businessunitid").toString()).toContain("NotEqualBusinessId")
})

test("Today / Tomorrow / Yesterday", () => {
  expect(Today("createdon").toString()).toContain("Microsoft.Dynamics.CRM.Today")
  expect(Tomorrow("createdon").toString()).toContain("Microsoft.Dynamics.CRM.Tomorrow")
  expect(Yesterday("createdon").toString()).toContain("Microsoft.Dynamics.CRM.Yesterday")
})

test("Last7Days / Next7Days", () => {
  expect(Last7Days("createdon").toString()).toContain("Microsoft.Dynamics.CRM.Last7Days")
  expect(Next7Days("createdon").toString()).toContain("Microsoft.Dynamics.CRM.Next7Days")
})

test("LastMonth / NextMonth / ThisMonth", () => {
  expect(LastMonth("createdon").toString()).toContain("Microsoft.Dynamics.CRM.LastMonth")
  expect(NextMonth("createdon").toString()).toContain("Microsoft.Dynamics.CRM.NextMonth")
  expect(ThisMonth("createdon").toString()).toContain("Microsoft.Dynamics.CRM.ThisMonth")
})

test("LastWeek / NextWeek / ThisWeek", () => {
  expect(LastWeek("createdon").toString()).toContain("Microsoft.Dynamics.CRM.LastWeek")
  expect(NextWeek("createdon").toString()).toContain("Microsoft.Dynamics.CRM.NextWeek")
  expect(ThisWeek("createdon").toString()).toContain("Microsoft.Dynamics.CRM.ThisWeek")
})

test("LastYear / NextYear / ThisYear", () => {
  expect(LastYear("createdon").toString()).toContain("Microsoft.Dynamics.CRM.LastYear")
  expect(NextYear("createdon").toString()).toContain("Microsoft.Dynamics.CRM.NextYear")
  expect(ThisYear("createdon").toString()).toContain("Microsoft.Dynamics.CRM.ThisYear")
})

test("LastXDays / NextXDays / OlderThanXDays", () => {
  expect(LastXDays("createdon", 7).toString()).toContain("Microsoft.Dynamics.CRM.LastXDays")
  expect(NextXDays("createdon", 7).toString()).toContain("Microsoft.Dynamics.CRM.NextXDays")
  expect(OlderThanXDays("createdon", 30).toString()).toContain("Microsoft.Dynamics.CRM.OlderThanXDays")
})

test("OlderThanXHours / OlderThanXMinutes", () => {
  expect(OlderThanXHours("createdon", 2).toString()).toContain("OlderThanXHours")
  expect(OlderThanXMinutes("createdon", 30).toString()).toContain("OlderThanXMinutes")
})

test("Fiscal period filters", () => {
  expect(ThisFiscalPeriod("createdon").toString()).toContain("ThisFiscalPeriod")
  expect(ThisFiscalYear("createdon").toString()).toContain("ThisFiscalYear")
  expect(LastFiscalPeriod("createdon").toString()).toContain("LastFiscalPeriod")
  expect(LastFiscalYear("createdon").toString()).toContain("LastFiscalYear")
  expect(NextFiscalPeriod("createdon").toString()).toContain("NextFiscalPeriod")
  expect(NextFiscalYear("createdon").toString()).toContain("NextFiscalYear")
  expect(InFiscalPeriod("createdon", 1).toString()).toContain("InFiscalPeriod")
  expect(InFiscalYear("createdon", 2024).toString()).toContain("InFiscalYear")
  expect(InFiscalPeriodAndYear("createdon", 1, 2024).toString()).toContain("InFiscalPeriodAndYear")
  expect(InOrAfterFiscalPeriodAndYear("createdon", 1, 2024).toString()).toContain("InOrAfterFiscalPeriodAndYear")
  expect(InOrBeforeFiscalPeriodAndYear("createdon", 1, 2024).toString()).toContain("InOrBeforeFiscalPeriodAndYear")
})

test("LastX / NextX for various time periods", () => {
  expect(LastXHours("createdon", 4).toString()).toContain("LastXHours")
  expect(LastXMonths("createdon", 3).toString()).toContain("LastXMonths")
  expect(LastXWeeks("createdon", 2).toString()).toContain("LastXWeeks")
  expect(LastXYears("createdon", 5).toString()).toContain("LastXYears")
  expect(LastXFiscalPeriods("createdon", 2).toString()).toContain("LastXFiscalPeriods")
  expect(LastXFiscalYears("createdon", 3).toString()).toContain("LastXFiscalYears")
  expect(NextXHours("createdon", 4).toString()).toContain("NextXHours")
  expect(NextXMonths("createdon", 3).toString()).toContain("NextXMonths")
  expect(NextXWeeks("createdon", 2).toString()).toContain("NextXWeeks")
  expect(NextXYears("createdon", 5).toString()).toContain("NextXYears")
  expect(NextXFiscalPeriods("createdon", 2).toString()).toContain("NextXFiscalPeriods")
  expect(NextXFiscalYears("createdon", 3).toString()).toContain("NextXFiscalYears")
  expect(OlderThanXMonths("createdon", 6).toString()).toContain("OlderThanXMonths")
  expect(OlderThanXWeeks("createdon", 4).toString()).toContain("OlderThanXWeeks")
  expect(OlderThanXYears("createdon", 2).toString()).toContain("OlderThanXYears")
})
