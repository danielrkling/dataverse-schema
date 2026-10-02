# Auto-expand navigation properties — status & handoff

Last updated: 2026-10-02 (after run build `2026-10-02T12:56:54.237Z`, window 13:01:09 → 13:01:38: 63 passed / 0 failed / 22 skipped — all suites green).

## Goal

`table.getRecord/getRecords/iterateRecords/iteratePages` auto-expand navigation properties
("all fields on the table"; users exclude via `pickProperties`, which drops navs).
Implemented via a new `expandNavigation` flag on `buildTableQueryAst` (read paths only;
create/update/upsert returned representations stay flat).

## Current implementation (src/query/odata/builder.ts)

- `buildTableQueryAst(table, options?, expandNavigation = false)` — two-phase walk:
  1. **register pre-pass**: collects every relationship that will be expanded (remote from the query),
  2. **walk**: mutates the query, expanding each nav with a sub-`select()` listing every
     value/lookupId column of the related table.
- Skip/silent-omission rules currently in place — **all three now THROW** (user directive
  2026-10-02, see "Throw policy" below):
  - Collections expand **at the top level only** (`inExpansion` blocks nested collections).
  - A relationship expands **at most once per query** (`claimed` map of relKeys; DFS order).
  - **Self-referencing relationships** (related entity set == current entity set) share ONE
    relKey `self:<entitySetName>` — the schema can't tell the N:1 and its inverse 1:N apart
    (different logical names), so expanding both sides is an error rather than a coin flip.
  - The paired `_value` column of an expanded lookup nav is dropped from `$select`
    **for non-self relationships only**; `table.transformValueFromDataverse` has a
    recovery step that backfills a `null` lookupId from the sibling expanded lookup
    record's pk. For self relationships `_value` STAYS in `$select` (probe P3 proved
    `_value` + same-nav expand coexists — see evidence).

## Throw policy (shipped 2026-10-02)

`buildTableQueryAst(table, options, expandNavigation = true)` now throws instead of silently
omitting an expand:

1. collection nested inside another expand →
   `Cannot auto-expand "mid.kids": the Dataverse Web API only supports one-to-many $expand at the top level of a query, not nested inside another $expand under "top.midLookup". Narrow the query with pickProperties("kids") to leave it out.`
2. relationship reachable from two branches →
   `Cannot auto-expand "mid.owner" under "top.mids": this expands the same relationship as an expand already issued from "top.midLookup". A relationship can only be expanded once per query. …`
3. both sides of a self relationship →
   `… Self-referencing relationships cannot be expanded from both sides of one request — the Web API cross-wires the lookup and its inverse collection. …`

Error messages name the field (`logicalName.field`) and the expand trail (`a.b → c.d`).
Rel keys are `<relatedEntitySet>:<logicalName>` for normal relationships and
`self:<entitySet>` for self-referencing ones, so same-named lookups on *different* related
tables no longer false-collide (the old key was the bare logical name).

### Consequence to be aware of

Because a relationship can only be expanded once per query, a table that declares a lookup
back to a parent whose own table has collections (the classic `contact.parentaccountid` →
`account.contacts` shape) throws on every read until BOTH ends are narrowed. The fix is to
narrow the *related* table too, not just the queried one — see the README section
"Navigation Properties on Reads".

### Harness tables added for this (test/browser/harness/tables.ts)

`TestTable` still declares both sides (used for the new throw test + FetchXML/navigation
suites). New variants:
- `TestTablePlain` — related table with no navs at all (walk terminates there)
- `TestTableFlat` — values + `testLookup` lookupId, no navs (general/bulk/crud/navigation reads)
- `TestTableLookupSide` — N:1 side only, targets `TestTablePlain`
- `TestTableCollectionSide` — inverse 1:N side only, targets `TestTablePlain`

Suites updated to use them; `query-odata` now has three auto-expansion tests (lookup side,
collection side, both-sides-throws). Diagnostics probes P11/P13/P14–P18 repointed to the
narrowed variants (P11/P13/P14/P15/P16/P17 → lookup side, P18 → collection side).
- `ODataQuery.expand(key)` without a sub-query now renders `$expand=nav` (bare, no parens).

## Field-layer fixes shipped (src/fields.ts)

- `LookupIdProperty.transformValueFromDataverse` now resolves null/absent through
  `nullToRead()` (nullable → `null`; `{ system: true }` → throws). Previously it inherited
  the base pass-through and leaked `undefined` for absent columns — that was the cause of
  "lookup navigation null clears the lookup → expected null, actual undefined".
- All 424 unit tests, type tests, and typecheck pass as of the last build.

## Probe evidence (test/browser/suites/diagnostics.ts — "Live-org probes", all-skipped)

Run build 19:53 (run window 19:54:12 → 19:54:17). Accepted/verified shapes:

- **P1** ✓ `$select` incl. `_nnsyc200_test_lookup_value`, no expand — id returned.
- **P2** ✓ expand lookup WITHOUT `_value` in $select → nav object returned, `_value` NOT
  returned anyway. (Recovery pathway is real; Dataverse omits unselected columns.)
- **P3** ✓ `_value` in $select **AND** expanding the SAME nav → both returned, NO error.
  (My earlier "same key" conclusion about this shape was WRONG.)
- **P4** ✓ bare lookup expand (no options, no parens) → returned the full related record.
  (Note: `$expand=nav()` with EMPTY parens is REJECTED: "Missing expand option…" — that's
  why `expand()` without a sub-query must render bare nav; fixed.)
- **P5/P6** ✓ collection (1:N) expand with `$select`, plus `$orderby`/`$top` at top level —
  ACCEPTED. The earlier org error "$select, $filter, $orderby … only at top level … nested
  one to many" did NOT reproduce with these shapes.
- **P7** ✓ bare collection expand (no options) → full related records.
- **P8** ✓ N:1 nested inside N:1, both with `$select` → accepted.
- **P9** ✓ 1:N nested inside 1:N with `$select` → accepted.
- **P10** ⚠️ lookup + collection of the SAME self relationship, top level → request OK but
  response is GARBAGE: the expanded lookup came back as a stub (`__DisplayName__`,
  `IsReferencedQueryCall: true`, `nnsyc200_name: null`).
- **P11** ✓ the exact `table.getRecords` auto-expanded query (no options) → accepted;
  first-row keys include both the lookup nav and the collection keys.
- **P13** ← THE SMOKING GUN (raw child-row captured): with BOTH sides of the same
  self-referencing relationship expanded (lookup nav + inverse collection),
  the org returned the child row with `"nnsyc200_Test_Lookup": null` and the
  **parent record under the COLLECTION key** — i.e. the org CROSS-WIRED the two
  expansions of the same self relationship. This is the source of the reported
  "lookupId value persisted → undefined" failures (and probably the earlier
  "An item with the same key has already been added" errors on updateRecord/bulk).
- **P12** ✓ detached child (no lookup): `_value: null` explicit on the wire.
- Probes P14–P20 (auto-expanded query + only filter/top/orderby, lookup-only,
  collection-only, bare getRecord shape) were added in the CURRENT build but their
  results have NOT been collected yet (unknown).

Probe protocol: ignored pitfalls — `suite.tests(ctx)` runs BEFORE `setup()`; always read
`ctx.state` inside the test fn (values captured at list-build time are `undefined`).
Probes end with `skip(<detail>)` so raw payload + transformed view appear in the skipped
test's detail; "Copy Markdown results" exports them.

## OPEN QUESTIONS — verify via the diagnostics suite (next run)

1. **P13's mixing (both sides of a self relationship)** — RESOLVED by throwing (see above);
   the next run just needs to confirm `TestTableLookupSide` / `TestTableCollectionSide`
   reads come back sane (P17/P18 are pointed at them).
2. ~~Where the "An item with the same key has already been added" error comes from~~
   RESOLVED (2026-10-02): it was the both-sides-of-self auto-expanded query (P13 shape).
   All three tests that previously reported it pass now that reads use narrowed tables.
   Not the PATCH/`return=representation`/`UpdateMultiple` path, which was already flat.
3. ~~Whether the ORIGINAL "$select/$filter/$orderby … top level while doing $expand on
   nested one to many relationships" error is reproducible~~ — still unreproduced across
   P5/P6/P9/P13/P14–P19 (every variant accepted). Treat as a phantom org error for now;
   auto-expansion doesn't emit those shapes anyway (collections only expand at top level,
   and nesting now throws).
4. File/image columns inside expand sub-selects (`nnsyc200_file_name`, `nnsyc200_image`)
   — the org ACCEPTS them (P17 payload) but reading a file/image on an *expanded* row is
   still unverified end-to-end. The `files-images` suite now reads via `TestTableFlat`; add
   an expanded-row case (e.g. seed the parent with a file, read it through
   `TestTableLookupSide.getRecord(child)`) to check FileField/ImageField transforms.

## PENDING WORK IN FLIGHT (was mid-edit when session ended)

RESOLVED 2026-10-02 — see "Throw policy" above. User chose: throw globally on any omitted
expand, including the cross-branch dedupe. Implemented, unit tests updated (425 pass),
typecheck clean, browser-test bundle rebuilt. Still needs one in-org run to confirm the
narrowed-table variants behave (the harness changes have NOT been exercised live).

## Run results 2026-10-02T12:49 (build 12:49:51)

59 passed, 5 failed, 21 skipped. All 5 failures were harness gaps, not library bugs:

- `files-images` ×3 (`getRecord`) and `errors` ×1 (`getRecord`) still used the un-narrowed
  `ctx.tables.TestTable` → the new throw fired. Fixed: they now use `TestTableFlat`
  (missed on the first pass because the earlier grep only covered `getRecords`/`iterateRecords`).
- `bulk / deleteMultiple` threw `new Error("skip: …")`, which the reporter counts as FAILED —
  only `skip()` from `harness/assert` (a `SkipError`) marks a test skipped. Fixed. (Pre-existing.)

Notable results:

- **"An item with the same key has already been added" is GONE.** `updateRecord persists changes`,
  `seeded bulk rows are all present` and `updateMultiple applies to every row` all passed once the
  reads stopped issuing the both-sides-of-self query. Strongest evidence yet that open question #2
  was caused by that query shape (P13), not by PATCH/`return=representation`/`UpdateMultiple`.
- **P10 re-confirmed the cross-wiring**: with both sides expanded the lookup came back as a stub
  (`__DisplayName__`, `IsReferencedQueryCall: true`, `nnsyc200_name: null`) while the real parent
  appeared under the collection key. Throwing is the right call.
- **P17 (lookup side) and P18 (collection side) both behave sanely**, and the auto-expanded
  lookup-side query works with `$filter`/`$orderby`/`$top` (P13) and with `$filter`/`$top`/
  `$orderby` alone (P14–P16). The earlier "$select/$filter/$orderby only at top level" org error
  did not reproduce in any variant.
- **File/image columns inside expand sub-selects are accepted**: P17's expand sub-select lists
  `nnsyc200_file_name` and `nnsyc200_image` and the org returned them without complaint. The
  end-to-end read-back of a file/image on an *expanded* row is still unverified (open question #4).
- `query-odata` did not appear in the report at all → the three new auto-expansion tests (lookup
  side, collection side, both-sides-throw) have NOT been run live yet. Highest-priority next run.
- Probe hygiene fixed: probes now narrow the table to the columns the org actually returned before
  transforming (raw probes select a few columns, so transforming with the full table tripped
  `modifiedon`-is-non-nullable — noise, not a bug), and P20's malformed `&$filter=…` (400) is fixed.

## Run results 2026-10-02T12:56 (build 12:56:54)

**63 passed, 0 failed, 22 skipped — everything green.** Both prior failure classes were
harness bugs and are fixed (files-images/errors now read via `TestTableFlat`; bulk's
"skip: DeleteMultiple not enabled" now uses `skip()` so it reports as skipped, not failed).

BUT the report was missing a whole suite: **`query-odata` never ran** — and it silently had
not been running for a while. Root cause found and fixed:

- `odataSuite.tests()` computed `const allIds = [ctx.state.parent, ...ctx.state.seeds.map(…)]`
  at list-build time. `suite.tests(ctx)` runs BEFORE `setup()`, so `ctx.state` is `{}` →
  `TypeError: Cannot read properties of undefined (reading 'map')`.
- `Runner.run` caught that, substituted `cases = []`, and the suite emitted **zero results** —
  so it did not appear in the markdown/JSON export at all. Not a failure, not a skip: absent.
- Fixes: `allIds()` is now computed inside the test fns (matching the documented protocol),
  AND `Runner.run` now emits an explicit `suite test list failed to build` skip entry so this
  can never be silent again. Added `test/browser-suites.test.ts` (428 tests total) which builds
  every suite's case list against an empty `ctx.state` and fails if any suite throws or yields
  zero tests — it caught this bug and covers all 10 suites.

Consequence: the three new auto-expansion tests (lookup side, collection side, both-sides-throw)
have STILL never executed live. `query-odata` now builds 17 tests; next run is their first
real execution.

## Test-suite state

- test/odata-builder.test.ts — bare expand (no parens), nested auto-expansion matrix (now a
  throw + a narrowed positive case), lookupId-pair `_value` drop, and the two new throw cases
  (nested collection, cross-branch repeat, self both-sides → throw, plus pickProperties
  narrowing for each self side).
- test/browser/suites/query-fetchxml.ts — updated for new null-choice semantics
  (null group tolerated in distinct/groupby tests; `apply over outer join` expectation
  corrected 147 → 54 = 5+7+42 per current seeds).
- createRecord reverted to NOT fill field defaults (user's explicit choice: don't include
  absent values when sending).
- All unit tests: 428 pass; typecheck/test:types clean. Browser-test bundle rebuilt
  (`test/browser/dist/browser-test.js`) — not yet re-run after the query-odata fix.
- **Harness pitfall, now enforced**: `suite.tests(ctx)` runs BEFORE `setup()`; never read
  `ctx.state` while building the case list. A throw there silently removed the whole suite
  from the report (this bit `query-odata`). Guarded by `test/browser-suites.test.ts` + an
  explicit skip entry from the Runner.

## Org/harness refs

Org: https://nnsy-c200-dev.crm.appsplatform.us (Dataverse v9.2)
Harness: test/browser/README.md; config via `?entity=&logical=&nav=` params;
`nnsyc200_Test_Lookup` (N:1 self-relationship), `_nnsyc200_test_lookup_value` (lookupId),
`nnsyc200_test_table_Test_Lookup_nnsyc200_test_table` (inverse 1:N / collection).

Build command: `npm run build:browser-test` → test/browser/dist/browser-test.js
(+ browser-db-test.js). Run in-org via the raw-GitHub `<script>` snippet
(test/browser/README.md). Deltas land in TODO.md (this file) per run.
