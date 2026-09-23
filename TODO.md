# FetchXML
- [x] Aggregate query orderby should be using alias not attribute
      (`<order alias=...>` for group/aggregate aliases; `attribute` kept for the entityname overload)
- [x] Aggregate inferring number vs date from field type
      (`min`/`max` now carry the field's value type, e.g. `min(dateField)` → `Date`)
- [x] Duplicate logic consolidated (attribute/order/filter/link rendering, alias
      collection and row transformation now shared between the select and
      aggregate query builders)
- [x] Query types expose a `T` result-type property for `typeof` use
      (like `DataverseTable.T`; also added to `fetchXml()` initial/select/aggregate queries)
- [x] fetch xml needs logical name for lookupid. odata needs fromdataverse
      (dialect-aware `fieldPathName(path, "odata" | "fetchXml")`; filters,
      `$select`/`$orderby`/`$apply`, groupby/aggregate attributes all verified)

# Web API audit (2026-09-22)
- [x] `wrapString(Date)` → unquoted ISO-8601 (docs/community show unquoted datetime literals)
- [x] `$batch` requests no longer emit `Content-Type: undefined` for GET parts
- OData `$apply` restrictions to verify against a live org:
  `$orderby` after `$apply` (alias-based) and `$top` after `$apply` — depending on
  org version these may be rejected; consider FetchXML aggregates instead
- FetchXML queries sent as `fetchXml=` only return page 1 via `@odata.nextLink`
  without `page`/`count` attributes; implementing FetchXML paging (page, count,
  paging-cookie + `@Microsoft.Dynamics.CRM.fetchxmlpagingcookie`) would let
  `iteratePages` page past 5000 rows for fetchXml queries
- `client.fetch` sets `If-None-Match: null` on every request; harmless today but
  worth confirming no interplay with `Prefer: return=representation` on PATCH

# Fields
- Choice and Multichoice should have an option or a maybe different field that fetches its choices from the server
