# Browser test results

Build: `2026-09-30T12:36:13.787Z`
Org: https://nnsy-c200-dev.crm.appsplatform.us
Run window: 2026-09-30T12:42:29.882Z → 2026-09-30T12:42:33.883Z

## FetchXML builder end-to-end

- ✅ **select with aliases + execute applies transforms** (68ms)
- ❌ **distinct collapses duplicate values** (69ms)
  > Assertion failed: no duplicates returned
  >   expected: 4
  >   actual:   3
  >   expected: 4
  >   actual:   3
  >     at assertEquals (eval at <anonymous> (https://nnsy-c200-dev.crm.appsplatform.us/WebResources/Dataverse_Terminal/run.html:4:28), <anonymous>:3689:13)
  network:
{
  "@odata.context": "https://nnsy-c200-dev.crm.appsplatform.us/api/data/v9.2/$metadata#nnsyc200_test_tables(nnsyc200_choice)",
  "value": [
    {},
    {
      "c": 1
    },
    {
      "c": 2
    },
    {
      "c": 3
    }
  ]
}
- ✅ **inner join to parent exposes aliased columns** (68ms)
- ✅ **outer join keeps parents without children; inner drops them** (141ms)
- ❌ **apply over outer join keeps childless parent with no borrowed aggregate** (73ms)
  > Assertion failed: matched parent sums its children (5+42+100)
  >   expected: 147
  >   actual:   54
  >   expected: 147
  >   actual:   54
  >     at assertEquals (eval at <anonymous> (https://nnsy-c200-dev.crm.appsplatform.us/WebResources/Dataverse_Terminal/run.html:4:28), <anonymous>:3689:13)
{
  "@odata.context": "https://nnsy-c200-dev.crm.appsplatform.us/api/data/v9.2/$metadata#nnsyc200_test_tables",
  "value": [
    {
      "kidSum": 0,
      "parentLabel": "dvtmuo3haob-r3-query-fetchxml-c1"
    },
    {
      "kidSum": 0,
      "parentLabel": "dvtmuo3haob-r3-query-fetchxml-c2"
    },
    {
      "kidSum": 0,
      "parentLabel": "dvtmuo3haob-r3-query-fetchxml-c3"
    },
    {
      "kidSum": 0,
      "parentLabel": "dvtmuo3haob-r3-query-fetchxml-lonely-1"
    },
    {
      "kidSum": 54,
      "parentLabel": "dvtmuo3haob-r3-query-fetchxml-parent-1"
    }
  ]
}
- ✅ **filter-only exists join** (74ms)
- ✅ **aggregate groupby(choice) + sum + count via execute()** (72ms)
- ✅ **aggregate min/max/average aliases** (66ms)
- ✅ **orderby desc + top on aliased select** (62ms)
- ✅ **typed FilterExpr composites narrow rows** (69ms)
- ❌ **aggregate orderby uses the group alias** (70ms)
  > Assertion failed: three groups
  >   expected: 3
  >   actual:   4
  >   expected: 3
  >   actual:   4
  >     at assertEquals (eval at <anonymous> (https://nnsy-c200-dev.crm.appsplatform.us/WebResources/Dataverse_Terminal/run.html:4:28), <anonymous>:3689:13)
network:
  {
  "@odata.context": "https://nnsy-c200-dev.crm.appsplatform.us/api/data/v9.2/$metadata#nnsyc200_test_tables",
  "value": [
    {
      "n": 1
    },
    {
      "n": 2,
      "byChoice": 1
    },
    {
      "n": 1,
      "byChoice": 2
    },
    {
      "n": 1,
      "byChoice": 3
    }
  ]
}
- ✅ **aggregate entityname orderby + top** (66ms)
- ⏭️ **fetchXml paging reaches rows beyond the first page** (0ms)
  > FetchXML paging (page/count/paging-cookie) not implemented yet

**9 passed, 3 failed, 1 skipped**


I think **distinct collapses duplicate values** is because of assigned a default choice because the network returns an empty {} as one of the rows


Also the logic for expanding messed up many tests. mostly from the non-null fields being null, this was also after i added q=>q.select() because the expands were blank inside

```ts
export function buildTableQueryAst<T extends GenericProperties>(
  table: DataverseTable<T>,
  options?: ODataTableQueryOptions<T>,
): ODataSelectAst {
  const query = new ODataQuery(table)
  query.select()
  // Auto-expand navigation properties so transformed records include their
  // related data (users narrow via pickProperties to keep expands out).
  for (const [key, prop] of Object.entries(table.fields) as [string, any][]) {
    if (prop.kind === "navigation" && (prop.type === "lookup" || prop.type === "collection")) {
      // query.expand(key as any,q=>q.select())
    }
  }
  //...
}
```


