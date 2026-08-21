# Browser integration tests

Live-org tests for `dataverse-schema`. These run **inside your Dataverse environment** so
they use ambient auth (`location.origin`) — no tokens or config needed.

## Running

1. Build + commit the bundle:

   ```bash
   npm run build:browser-test   # → test/browser/dist/browser-test.js
   ```

2. Open any page in your Dataverse org, open devtools, paste:

   ```js
   (function (d, s) {
     s = d.createElement("script");
     s.src = "https://raw.githubusercontent.com/<user>/<repo>/<branch>/test/browser/dist/browser-test.js?t=" + Date.now();
     d.body.appendChild(s);
   })(document);
   ```

   - The `?t=` parameter defeats the ~5-minute raw-githubusercontent CDN cache.
   - Replace `<user>/<repo>/<branch>` with your fork/branch.
   - The harness renders a dark panel at the bottom of the page.

## What it does to your data

- Every record is created with a name starting with the shared stem `dvt`
  plus a per-run prefix (e.g. `dvtk2x9p1-child`).
- Tracked records are deleted in a `finally` block after the run.
- **"Sweep orphaned test data"** deletes *any* record whose `nnsyc200_name`
  starts with `'dvt'` — use this if a run was interrupted mid-flight.
- A full run creates roughly 15–25 short-lived records.

## Suites

| Suite | Covers |
|---|---|
| General smoke | WhoAmI, CRUD basics, both query builders, transforms, expand/join/aggregate, property values |
| CRUD & concurrency | transforms on read, 304 conditional GET, readonly skip, upsert create, pickProperties, activate/deactivate, delete, alternate-key lookup |
| OData builder | choice-label filters, string fns, operator windows, and/or/not, orderby+top, real nextLink paging, any/all lambdas, collection expand, groupby aggregates |
| FetchXML builder | aliases, distinct, inner/outer joins, exists links, aggregates via execute(), typed FilterExpr |
| Navigation | children expand, associate/dissociate, lookup-nav afterSave create/clear, getPropertyValue variants, choice round-trip |
| Files & images | upload round-trip, FileRef/ImageRef shapes, raw `$value`, downloadImage blob, deleteFile/deleteImage |
| Functions & actions | WhoAmI shape, RetrieveTotalRecordCount, RetrieveVersion, RetrieveChoices* |
| Bulk operations | seeded bulk rows, updateMultiple, count aggregate, deleteMultiple |
| Error handling | missing→null, 404 DataverseHttpError, client-side invalid-choice throw, 412 precondition |

\* skips unless configured below.

## Configuration

Defaults target `nnsyc200_test_table`. Override before loading the script:

```js
window.__DV_TEST_CONFIG__ = {
  entitySetName: "nnsyc200_test_tables",
  logicalName: "nnsyc200_test_table",
  // 1:N relationship name of the Test_Lookup relationship:
  collectionNav: "nnsyc200_test_table_Test_Lookup_nnsyc200_test_table",
  // Logical column backing the nnsyc200_Alt_Key alternate key:
  altKeyAttribute: "nnsyc200_alt_key",
  // Global choice schema name for RetrieveChoices (enables that test):
  globalOptionSet: undefined,
};
```

URL params also work and win over the window config:
`?suites=errors,bulk&autorun=1&altkey=nnsyc200_text&optionset=nnsyc200_month`

## Results export

After a run: **Copy JSON results** / **Copy Markdown results** buttons put a structured
report (suite, test, status, durationMs, error) on the clipboard for issue reports or
future CI consumption.
