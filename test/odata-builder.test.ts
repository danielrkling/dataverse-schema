import { expect, test } from "vitest"
import {
  DataverseTable, DataverseClient, primaryKey, string, number, choice, NumberField,
  lookup, collection, lookupId, fetchOdata, any, all, eq, ne, gt, and, FieldRef,
  groupby, sum, count, average, min, max, buildTableQueryAst, EqualUserId,
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
    revenue: number("revenue") as NumberField,
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

test("expand without subquery renders a bare navigation name (Dataverse rejects empty parens)", () => {
  const q = fetchOdata(Account).select("name").expand("primaryContact")
  expect(q.toString()).toBe("$select=name&$expand=primarycontactid")
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

test("apply results read back under the caller's alias even though the org names the group key by property", async () => {
  // Dataverse cannot rename a `$apply` group key, so `groupby(f.status)` comes back
  // as `statuscode` — the aggregate row must still surface under `byStatus`.
  ;(client as any).iteratePages = async function* () {
    yield [
      { statuscode: 1, n: 3, total: 30 },
      { statuscode: 2, n: 1, total: 5 },
    ]
  }
  const rows = await fetchOdata(Account)
    .apply((f) => ({ byStatus: groupby(f.status), n: count(), total: sum(f.revenue) }))
    .execute()

  expect(rows).toHaveLength(2)
  expect(rows[0].byStatus).toBe("Active")
  expect(rows[0].n).toBe(3)
  expect(rows[0].total).toBe(30)
  expect(rows[1].byStatus).toBe("Inactive")
  expect(rows[1].n).toBe(1)
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

// --- buildTableQueryAst (default table query) ---

test("default table query auto-expands navigation properties when requested", () => {
  const Leaf: DataverseTable<any> = new DataverseTable({
    client, entitySetName: "leaves", logicalName: "leaf",
    fields: { id: primaryKey("leafid"), name: string("name") },
  })
  const Child: DataverseTable<any> = new DataverseTable({
    client, entitySetName: "children", logicalName: "child",
    fields: {
      id: primaryKey("childid"),
      owner: lookup("child_owner", () => Leaf),
    },
  })
  const Parent: DataverseTable<any> = new DataverseTable({
    client, entitySetName: "parents", logicalName: "parent",
    fields: {
      id: primaryKey("parentid"),
      children: collection("parent_children", () => Child as any),
    },
  })

  const ast = buildTableQueryAst(Parent, undefined, true)
  expect(ast.select!.length).toBeGreaterThan(0)
  // Top-level navs are expanded, and nested lookups inside the collection
  // expand are expanded too.
  expect(ast.expands!.map(e => e.navigation)).toEqual(["parent_children"])
  expect(ast.expands![0].query!.expands!.map(e => e.navigation)).toEqual(["child_owner"])
  // …and the leaf table has nothing left to expand.
  expect(ast.expands![0].query!.expands![0].query!.expands ?? []).toHaveLength(0)

  // Without the flag the query stays flat (used for create/update representations).
  const flat = buildTableQueryAst(Parent)
  expect(flat.expands ?? []).toHaveLength(0)
})

test("buildTableQueryAst auto-expansion throws when a collection is nested inside an expand", () => {
  // One-to-many $expand is only legal at the top level — silently omitting it
  // would hand back records missing a navigation property the caller declared.
  const Mid: DataverseTable<any> = new DataverseTable({
    client, entitySetName: "mids", logicalName: "mid",
    fields: {
      id: primaryKey("midid"),
      name: string("name"),
      owner: lookup("mid_owner", () => Leaf),
      kids: collection("mid_kids", () => Mid as any),
    },
  })
  const Leaf: DataverseTable<any> = new DataverseTable({
    client, entitySetName: "leaves", logicalName: "leaf",
    fields: { id: primaryKey("leafid"), name: string("name") },
  })
  const Top: DataverseTable<any> = new DataverseTable({
    client, entitySetName: "tops", logicalName: "top",
    fields: {
      id: primaryKey("topid"),
      midLookup: lookup("top_mid", () => Mid as any),
    },
  })

  expect(() => buildTableQueryAst(Top, undefined, true)).toThrow(
    `Cannot auto-expand "mid.kids": the Dataverse Web API only supports one-to-many ` +
    `$expand at the top level of a query, not nested inside another $expand under "top.midLookup"`,
  )

  // Dropping the top-level nav that leads to it makes the same table usable again.
  const narrowed = buildTableQueryAst(Top.pickProperties("id") as any, undefined, true)
  expect(narrowed.expands ?? []).toHaveLength(0)
})

test("buildTableQueryAst auto-expansion throws when a relationship is reachable from two branches", () => {
  const Leaf: DataverseTable<any> = new DataverseTable({
    client, entitySetName: "leaves", logicalName: "leaf",
    fields: { id: primaryKey("leafid"), name: string("name") },
  })
  // Mid.owner is reachable from Top both directly (via the lookup) and through
  // the collection — a relationship can only be expanded once per query.
  const Mid: DataverseTable<any> = new DataverseTable({
    client, entitySetName: "mids", logicalName: "mid",
    fields: {
      id: primaryKey("midid"),
      name: string("name"),
      owner: lookup("mid_owner", () => Leaf),
    },
  })
  const Top: DataverseTable<any> = new DataverseTable({
    client, entitySetName: "tops", logicalName: "top",
    fields: {
      id: primaryKey("topid"),
      midLookup: lookup("top_mid", () => Mid as any),
      mids: collection("top_mids", () => Mid as any),
    },
  })

  expect(() => buildTableQueryAst(Top, undefined, true)).toThrow(
    `Cannot auto-expand "mid.owner" under "top.mids": this expands the same relationship as an expand already issued from "top.midLookup"`,
  )
  expect(() => buildTableQueryAst(Top, undefined, true)).toThrow("A relationship can only be expanded once per query")
})

test("buildTableQueryAst accepts FilterExpr and proxy callbacks in filter", () => {
  const astExpr = buildTableQueryAst(Account, { filter: f => eq(f.name, "Contoso") })
  expect(astExpr.filters).toHaveLength(1)
  expect(astExpr.filters![0]).toMatchObject({ type: "comparison", operator: "eq", value: "Contoso" })

  const astCallback = buildTableQueryAst(Account, { filter: f => and(eq(f.name, "Contoso"), eq(f.status, "Active")) })
  expect(astCallback.filters).toHaveLength(1)
  expect(astCallback.filters![0].type).toBe("and")

  const astFn = buildTableQueryAst(Account, { filter: f => EqualUserId(f.revenue) })
  expect(astFn.filters).toHaveLength(1)
  expect(astFn.filters![0]).toMatchObject({ type: "fn", fnName: "EqualUserId", values: [] })
})

test("buildTableQueryAst drops lookupId columns paired with expanded lookups", () => {
  const Child: DataverseTable<any> = new DataverseTable({
    client, entitySetName: "children", logicalName: "child",
    fields: { id: primaryKey("childid"), name: string("name") },
  })
  const Root: DataverseTable<any> = new DataverseTable({
    client, entitySetName: "roots", logicalName: "root",
    fields: {
      id: primaryKey("rootid"),
      childId: lookupId("child_link", () => Child as any),
      child: lookup("child_link", () => Child as any), // same relationship as childId
    },
  })

  const ast = buildTableQueryAst(Root, undefined, true)
  // childId's `_child_link_value` is excluded from $select; the nav is expanded once.
  expect(ast.select).not.toContain("_child_link_value")
  expect(ast.expands!.map(e => e.navigation)).toEqual(["child_link"])
  expect(ast.select).toContain("rootid")
})

test("buildTableQueryAst throws when both sides of a self-referencing relationship would expand", () => {
  // Mirrors the live-org evidence: N:1 and its inverse 1:N on the same entity set —
  // expanding both made Dataverse mix the expansions (nav returned null, the
  // related record showed up under the collection key instead). Since the schema
  // can't tell the two sides apart, auto-expansion refuses the whole query.
  const Self = new DataverseTable({
    client, entitySetName: "selftables", logicalName: "selftable",
    fields: { id: primaryKey("sid"), name: string("name") },
  })
  const T: DataverseTable<any> = new DataverseTable({
    client, entitySetName: "selftables", logicalName: "selftable",
    fields: {
      id: primaryKey("selfid"),
      name: string("name"),
      parentNav: lookup("self_lookup", () => Self),        // N:1 side of the self relationship
      parentId: lookupId("self_lookup", () => Self),       // paired `_value` selector (same relationship)
      kids: collection("selftables_kids", () => Self as any), // inverse 1:N side of the same self relationship
    },
  })

  expect(() => buildTableQueryAst(T, undefined, true)).toThrow(
    `Cannot auto-expand "selftable.kids" at the top level of the query: this expands the same relationship as an expand already issued from the top level.`,
  )
  expect(() => buildTableQueryAst(T, undefined, true)).toThrow(
    "Self-referencing relationships cannot be expanded from both sides of one request",
  )

  // Narrowing to one side works — the lookup side here.
  const lookupOnly = buildTableQueryAst(T.pickProperties("id", "name", "parentNav", "parentId") as any, undefined, true)
  expect(lookupOnly.expands!.map(e => e.navigation)).toEqual(["self_lookup"])
  // `_value` stays in $select — live probe P3 proved _value + same-nav expand is legal.
  expect(lookupOnly.select).toContain("_self_lookup_value")
  expect(lookupOnly.select).toContain("selfid")

  // …and so does the inverse collection side.
  const collectionOnly = buildTableQueryAst(T.pickProperties("id", "name", "kids") as any, undefined, true)
  expect(collectionOnly.expands!.map(e => e.navigation)).toEqual(["selftables_kids"])
  expect(collectionOnly.select).toContain("selfid")
})
