# Auto-expand navigation properties — status & handoff

Last updated: 2026-10-02 (after run build `2026-10-02T13:45:24.418Z`: **79 passed / 0 failed /
25 skipped — green**. Since then: relationship-walk simplification — owner-scoped rel keys fix a
false-positive throw; the `register` pre-pass is gone. Awaiting one more in-org run.)

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
Rel keys are `<ownerEntitySet>:<logicalName>` for normal relationships and `self:<entitySet>`
for self-referencing ones. **Owner-scoped, not target-scoped**: keying by the related table
made `customer.owner` and `invoice.owner` (both → systemuser) look like one relationship and
throw — a false positive on a very common shape. Fixed, with a regression test.

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

## Run results 2026-10-02T13:08 (build 13:08:51)

`query-odata` finally RAN (the list-build fix worked): **74 passed, 6 failed, 22 skipped.**
Its 6 failures, triaged:

| Failure | Verdict | Fix |
|---------|---------|-----|
| `and / or / not composition` expected `[5, 42]` | stale expectation — int 42 is seed c3 whose choice is "B", so `not(eq(choice,"B"))` correctly drops it | expect `[5]`, with a comment |
| `any/all lambdas` expected childless rows back from `all()` | org semantics: this org does NOT treat an empty collection as vacuously true (probe P23 added to confirm) | assert only the discriminating part (parent excluded); don't encode vacuous truth |
| `getRecords auto-expands the lookup side` — "child row returned" | test bug: the test called `ctx.fx.name("c2")` again and the fixture counter had already consumed `c2-1`, so it filtered for `…-c2-2` | seed objects now carry their generated `name`; tests filter by that |
| `getRecords throws when both sides …` | test bug: `TestTable`'s lookup target declares a collection, so the nested-collection guard fires before the self guard | added `TestTableSelfBoth` (both sides, plain related table) to isolate the self error; the test now asserts both guards separately |
| `apply groupby(choice) …` — "groups A/B/C", got 1 | **REAL LIBRARY BUG**: Dataverse cannot rename a `$apply` group key, so the group column comes back as `nnsyc200_choice`, not the caller's alias. `byChoice` was `undefined` on every row, collapsing the `Map` to one entry | `ODataApplyQuery._transformRow` now falls back to the grouped property's own name when the alias is absent (unit-tested); probe P21 added to confirm the org's naming |
| `apply groupby + $orderby on group alias` — org 400 | not a bug: the org rejects `$orderby` on a `$apply` group alias (it re-parses the alias as a group key). Not expressible in Dataverse | `skip()` with the reason instead of failing |

Probes added: **P21** (`$apply=groupby(...)` — what does the org name the group column?) and
**P23** (`all()` over an empty collection). Both answer questions this run surfaced; results
pending.

## Run results 2026-10-02T13:22 (build 13:22:56)

**78 passed, 1 failed, 3 skipped.** All five of last run's stale expectations are fixed and
verified live. The one remaining failure was again an expectation, not a bug:

- `apply groupby(choice) …` — "group A average, got 35" (expected 106/3 ≈ 35.33). Dataverse's
  `$apply average` preserves the source column's type, and `nnsyc200_int` is a Whole Number, so
  the org returns a **truncated integer**. The FetchXML aggregate suite already documents this
  ("Dataverse truncates int avg"); the OData test now asserts `Math.trunc(106 / 3)` with a
  comment. Both suites now agree.

**The `$apply` group-key alias fix is CONFIRMED live**: the test got past "groups A/B/C" and
resolved `byChoice.get("A")` with the right count/sum/min/max, which only works via the new
fallback to the grouped property name. Probe P21 is therefore redundant — safe to drop.

`diagnostics` was NOT selected for this run, so P21/P23 results are still pending. P21 is
answered by the groupby test above; **P23 (`all()` over an empty collection) is the only
genuinely open probe question** — run the diagnostics suite to settle whether this org's `all()`
is non-vacuous (the current test only asserts the parent is excluded, so it passes either way).

## Run results 2026-10-02T13:45 (build 13:45:24) — GREEN

**79 passed, 0 failed, 25 skipped.** Every remaining open question is now closed.

Probe results:

- **P21** (my `$apply` probe) 400'd: `'(' expected at position 35`. My hand-written probe used
  `aggregate=$count as n`, but this org's grammar after `groupby((prop),` expects `aggregate(` —
  i.e. the **library's** serialization is the correct one, and my probe query was wrong. The
  underlying question ("what does the org name the group column?") is answered by the passing
  groupby test: it returns `nnsyc200_choice`, hence the alias fallback. Probe deleted.
- **P23** answered: `all()` over an EMPTY collection is **false** in this org — the childless rows
  (probe-child, probe-detached) were excluded while the parent, whose single child (int 5) satisfies
  `< 40`, was returned. So this org's `all()` is **non-vacuous**, contrary to OData spec. The
  `any/all` test can now assert the exact result (`[]`) instead of a weak "parent is excluded",
  and the README documents the gotcha with the `not(any(...))` workaround.

## Walk simplification 2026-10-02 (post-review)

Reviewed the `expandNavigation` walk for over-specific/complicated checks. Net −7 lines, and one
real bug fixed.

1. **Bug: relationship identity was target-scoped** — `relKeyOf` used `<relatedEntitySet>:<name>`,
   so `customer.owner` and `invoice.owner` (both → systemuser) hashed to the same key and the query
   threw "already expanded as top level" on a totally valid schema. A relationship is identified by
   **(owner, logical name)**; the target is redundant. Now `${current.entitySetName}:${name}`, with
   `self:<entitySet>` still collapsing self-referencing relationships (unavoidable — the two sides
   carry different logical names). Regression test added.
2. **Removed the `register` pre-pass** (~10 lines + a second recursive walk to reason about). It
   existed only to know which `_value` columns to drop before selecting. `claimed` now serves both
   roles: the walk registers each relationship as it expands, and `pickKeys` runs AFTER the
   sub-walk (`walk(sub, …)` then `sub.select(…)`). Safe because the once-per-query rule throws on
   any duplicate, so "reachable" and "expanded" are the same set — and because keys are now
   owner-scoped, a table's own `_value` pairing can't be affected by deeper tables.
3. **Dropped the `where` helper** — the trail-qualified label (`customer.invoices → invoice.owner`)
   already carries the position, so both messages lost a redundant clause and got shorter.

Still kept deliberately (both are Web API facts, not guesswork):
- nested one-to-many expands throw — hard API limit.
- one expand per relationship — P13 proved the org cross-wires duplicates; the user chose loud
  failures over silent omissions.
- self-relationship `_value` retention in `$select` — P3 proved it's legal (the alternative,
  dropping it and relying on the pk-recovery path, would also work for self but isn't verified).

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
- All unit tests: 429 pass; typecheck/test:types clean. Browser-test bundle rebuilt
  (`test/browser/dist/browser-test.js`) — not yet re-run after the query-odata fixes.
- **$apply group keys can't be aliased in Dataverse** (no `$apply` syntax for renaming the
  group column). `apply()` therefore maps the group value onto the caller's alias at transform
  time. Corollary: `$orderby` on a group alias is NOT expressible — skip it, use FetchXML
  aggregates for ordered results.
- **`all()` is non-vacuous in Dataverse** (empty related collection → false, not true). Documented
  in the README; don't assume OData spec semantics when filtering with `all()`.
- `$apply` aggregate syntax this org requires is `groupby((prop),aggregate($count as n, prop with sum as total))`
  — note `aggregate(` **without** `=`. Hand-written probes must copy the library's serializer.
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
