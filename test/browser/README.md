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

## Filter dialect note

`fetchXml(...).filter(...)` accepts typed expressions (`eq`, `startsWith`, …) or **raw
FetchXML condition markup** (`<condition attribute="x" operator="eq" value="1" />`).
Raw *OData-style* text like `name eq 'x'` is not valid FetchXML and Dataverse silently
ignores it — prefer typed expressions.

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

## `@tanstack/db` adapter tests (`browser-db-test.js`)

A second bundle exercises the tanstack-db integration
(`dataverseCollectionOptions` + `DataverseSyncDB`) the same way the core harness
exercises the library. It reuses the same reporter/runner/fixtures and the same
`dvt*` data stem + sweep, so it is safe to run in the same org.

Build it with:

```bash
npm run build:browser-db-test   # → test/browser/dist/browser-db-test.js
```

Load it the same way as the core bundle (separate `<script>` tag):

```js
(function (d, s) {
  s = d.createElement("script");
  s.src = "https://raw.githubusercontent.com/<user>/<repo>/<branch>/test/browser/dist/browser-db-test.js?t=" + Date.now();
  d.body.appendChild(s);
})(document);
```

The adapter reads `navigator.onLine` live, so the **offline-queue** suite simulates
being offline by overriding `navigator.onLine` (and dispatching `offline`/`online`
events) for the duration of those tests, then restores it. No real network
disconnection is required.

### Suites

| Suite | Covers |
|---|---|
| Online collection | `dataverseCollectionOptions` builds a `Collection`; `forceSync()` pulls external changes; insert/update/delete through the collection round-trip to Dataverse; `utils.table` wiring |
| Offline queue | `DataverseSyncDB` + `createCollectionOptions`; online insert flushes immediately; offline insert is queued in IndexedDB and NOT sent; `online` event flushes the queue; `getQueueCount`/`getErroredMutations`; retry + discard of errored mutations |
| Cross-tab | Two collections on the same `DataverseSyncDB` observe each other via `BroadcastChannel` (`MUTATIONS_ADDED` / `ABORT_ACTIVE_FETCHES`) |
| Cross-tab (online) | Same propagation for the online `dataverseCollectionOptions` collection, which now also uses a `BroadcastChannel` keyed by the collection id |
| Durability | A queued offline mutation survives reopening the same DB name (IndexedDB persistence) and flushes on reconnect; the cache store is rebuilt after a fresh sync |

