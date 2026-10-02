# Auto-expand navigation properties — status & handoff

Last updated: 2026-10-01 (evening, after the P-probe run build `2026-10-01T19:53:24.922Z`, run window 19:54:12 → 19:54:17).

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
- Skip/silent-omission rules currently in place:
  - Collections expand **at the top level only** (`inExpansion` blocks nested collections).
  - A relationship expands **at most once per query** (`perLevel` set of relKeys; DFS order
    = first reference wins; later branches referencing the same related table get nothing).
  - **Self-referencing relationships** (related entity set == current entity set) dedupe as
    a single key `self:<entitySetName>` → only ONE side expands (lookup nav wins by
    declaration order); the inverse collection is silently skipped.
  - The paired `_value` column of an expanded lookup nav is dropped from `$select`
    **for non-self relationships only**; `table.transformValueFromDataverse` has a
    recovery step that backfills a `null` lookupId from the sibling expanded lookup
    record's pk. For self relationships `_value` STAYS in `$select` (probe P3 proved
    `_value` + same-nav expand coexists — see evidence).
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

1. **P13's mixing (both sides of a self relationship)** — CONCLUSION: same-self-pair in one
   request is UNSAFE. Current build already collapses to one side (lookup wins). Verify P17
   (lookup-only) & P18 (collection-only) both behave sanely.
2. Where the "An item with the same key has already been added" error comes from — user
   reported it on `updateRecord persists changes`, bulk "seeded bulk rows are all
   present", and updateMultiple — needs reproduction; P3 disproved the _value+expand
   theory. Candidates: PATCH/POST (`return=representation`)?? `UpdateMultiple` Targets?
   The both-sides-self query? See P14–P16 & P17–P20 history in the probe suite.
3. Whether the ORIGINAL "$select/$filter/$orderby … top level while doing $expand on
   nested one to many relationships" error is reproducible — P5/P6/P9 did not reproduce it
   (all accepted). Possibly only via a sub-select including specific system columns, or via
   a nested expand with different query option combinations (untested variants: orderby/top
   INSIDE the collection sub-expand).
4. File/image columns inside expand sub-selects (`nnsyc200_file_name`, `nnsyc200_image`)
   — not yet live-verified end-to-end (they sit in the auto sub-select lists; watch the
   transform of expanded rows for file/image fields: FileField/ImageField transforms may
   need special handling for expanded payloads or should be excluded from expand
   sub-selects).

## PENDING WORK IN FLIGHT (was mid-edit when session ended)

User directive: for cases that don't work, THROW instead of silently omitting. Candidates
to convert into throws in the expandNavigation walk:

- collection expand nested inside an expansion,
- the skipped second side of a self-referencing relationship,
- (maybe) the cross-branch "already expanded" dedupe (silent no-op today).

CAREFUL: the harness's self-shape (lookup + paired lookupId + inverse collection on the
same entity set, see test/browser/harness/tables.ts) is exercised by general/crud/bulk
suites with full-table getRecords — if both-sides-of-self throws, all those suites fail
unless tests narrow via pickProperties or the throw is limited to… decide with the user
whether the throw is global or only when BOTH sides appear in the field set. One viable
compromise: throw only when BOTH sides are declared AND auto-expansion asks for both;
testLookup+testLookupNav pairs are declared by the table author, so this is at author-time
discoverable.

## Test-suite state

- test/odata-builder.test.ts — has updated unit tests: bare expand (no parens), nested
  auto-expansion matrix, lookupId-pair `_value` drop, self-relationship one-side rule
  (incl. `_value` kept for self-rels).
- test/browser/suites/query-fetchxml.ts — updated for new null-choice semantics
  (null group tolerated in distinct/groupby tests; `apply over outer join` expectation
  corrected 147 → 54 = 5+7+42 per current seeds).
- createRecord reverted to NOT fill field defaults (user's explicit choice: don't include
  absent values when sending).
- All unit tests: 424 pass; typecheck/test:types clean.

## Org/harness refs

Org: https://nnsy-c200-dev.crm.appsplatform.us (Dataverse v9.2)
Harness: test/browser/README.md; config via `?entity=&logical=&nav=` params;
`nnsyc200_Test_Lookup` (N:1 self-relationship), `_nnsyc200_test_lookup_value` (lookupId),
`nnsyc200_test_table_Test_Lookup_nnsyc200_test_table` (inverse 1:N / collection).

Build command: `npm run build:browser-test` → test/browser/dist/browser-test.js
(+ browser-db-test.js). Run in-org via the raw-GitHub `<script>` snippet
(test/browser/README.md). Deltas land in TODO.md (this file) per run.
