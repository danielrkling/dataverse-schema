# AGENTS.md

## Project Overview

npm-workspaces monorepo. `dataverse-schema` is a strongly-typed TypeScript library for working with the Microsoft Dataverse Web API. It provides schema definitions, type inference, query builders (OData + FetchXML), validation (via [valibot](https://valibot.dev/)), and CRUD operations. Ships as an ES module. The root entry has no offline/TanStack API; those live behind the `dataverse-schema/sync` and `dataverse-schema/sync/tanstack` subpath entries of the same package.

- `packages/dataverse` — the library itself (npm package `dataverse-schema`). The offline engine (`src/sync/`) is bundled into the `/sync` entry; `@tanstack/db` stays an optional peer used only by `/sync/tanstack`.
- `packages/sharepoint` — `sharepoint-schema`: SharePoint list/library access over the **legacy `_api/web` REST API (OData v3, verbose JSON)**. Client (`SharePointClient`, Bearer/form-digest auth, `d.__next` pagination), `SharePointTable` (light field classes + `InferRecord`, MERGE/DELETE + `If-Match` over `__metadata.etag`), and a compile-time `SyncTable` satisfaction check so the generic offline engine works over lists. Structurally satisfies the sync engine via `entitySetName` = list title and `$etag` hoisted from `__metadata.etag`.Note: **no shared core** — keep the SharePoint package stand-alone (flat field/query surface).
- `packages/filesystem` — `filesystem-schema`: File System Access API as a local JSON database. `FileSystemDatabase.open`/`initialize` verify a root-folder `fsdb.json` manifest (`version` + `brandId`, throws on mismatch); `FileSystemTable` stores one `<id>.json` per record under a table folder; `FileSystemSingleFileTable` stores a record array in `<table>/data.json`. Same field-factory/phantom-`T`/Standard-Schema conventions; no query builder (reads return plain arrays that callers filter/sort). Also stand-alone (no shared core).

Deliberate design decision: **no shared core**. The SharePoint package is standalone with a flat field/query surface — duplicate, don't extract. Fields (`packages/sharepoint/src/fields.ts`) follow the Dataverse field-class conventions (camelCase factories `text`/`number`/`bool`/`json`/`date`/`datetime`/`choice`/`multiChoice`/`person`/`people`/`lookup`/`multiLookup`/`document`/`primaryKey`/`title`) but implement only what the SharePoint REST surface needs:
- `date`/`datetime` read/write real `Date` instances (wire is ISO; invalid wire reads as null)
- `json` (consumers): requires `@standard-schema/spec` + a Standard-Schema lib (valibot/Zod/ArkType) resolvable from the app — without them the schema option's type inference degrades and `T` silently falls back to `any`
- `json` parses serializable string columns (`multi-line` JSON); value type + runtime validation are inferred from a Standard Schema option (`json("Meta", { schema: v.object(...) })` → the valibot output type, validated synchronously on read; malformed JSON/schema violations throw with the column name; async schemas throw)
- `choice` reads a nullable display string (SharePoint stores choice values as strings, unlike Dataverse's numeric labels; the `choices` array is app-layer metadata only); `multiChoice` reads/writes `";#"`-joined wire strings as `string[]` (empty ⇔ `[]`)
- Reference fields (`person`, `people`, `lookup`, `multiLookup`): reads flatten `{ Id }` / plain number / expanded / `{ LookupId }` / legacy `"2;#Name"` wire shapes — person fields to `{ id, name?, email? }` (EMail only when expanded), lookup fields to `{ id, title? }` (SharePoint's display value; a lookup never carries an email — that's person territory, so the types stay deliberately separate); `person`/`lookup` single (`null` when unset, `0` sentinel → null), `people`/`multiLookup` collections (expanded `results` arrays ⇔ `[]`). Writes go under SharePoint's derived `<Name>Id` property (`field.writeName`) — single: plain numeric id (or `writeShape: "typed"` for `SP.FieldUserValue`/`SP.FieldLookupValue` objects), collection: `{ results: [...] }` (`people()` = person collections; `multiLookup()` = multi-lookup collections — same wire shapes/envelope, distinct semantics).
- Phantom `T` property on both levels (parity with the Dataverse package): `SomeField.T` is that field's value type, `Tasks.T` the inferred record — use `typeof table.T` / `InferTable<typeof Tasks>` for type-only inference without importing field maps.
- Etags: reads hoist `__metadata.etag` as `$etag`; write precedence — explicit `options.ifMatch` wins, then the record's `$etag`, then an unconditional `If-Match: *` (a header-less MERGE makes the legacy surface evaluate an implicit blank etag → 412; blank-string `$etag` counts as absent).
- Client conveniences: `getCurrentUser()` (`Web/CurrentUser` → `{ id, name, loginName, email }`), `ListItemAllFields` fallback resolution after `Files/Add` (`GetFileByServerRelativeUrl(...)/ListItemAllFields?$select=Id`) when the Add response omits it, and bare `client.fetch(path)` paths are `_api`-scoped automatically.
- Query builder (`table.query()`, src/query.ts): a small proxy-based, type-safe fluent builder replacing raw query strings — `.select((f) => ({ id: f.id, title: f.title }))` (object pick that FIXES the builder result type to the picked subset — value types per field kind — executed via `.execute()`; table `getRecords`/`getRecord` accept a built SPQuery or a raw string, and the table transform infers `InferRecord<TFields>` instead of leaking `any`); reference fields self-expand with standard carve-outs — person/people get Id/Title/EMail, lookups Id/Title — no separate `.expand()`; `.expand({...})` remains only as an override; `.where((f) => and(eq(f.status, "Draft"), startsWith(f.ko, "N")))` with free-function comparators (eq/ne/gt/ge/lt/le/contains/startsWith/endsWith take a ref + value; no ref methods) + and/or/not/isNull/isNotNull; `.expand()` calls append *additional* props on top of the standard carve-outs (union). `.orderBy((f) => f.modified, "desc")`, `.top/.skip`, then `.build()` (OData v3 string for getRecords/getRecord). `build()` never selects `__metadata` (the legacy `_api/web` surface rejects it as a selectable property); `__metadata`/etag arrive on responses as served, and with no `.select()` it defaults to the full declaration: every plain field, the file channel's `FileLeafRef` + `FileRef` (fixed wire names, independent of the field's TS key), and reference fields expanded with their standard carve-outs. The same projection is the default for the table's plain `getRecord`/`getRecords` (via exported `defaultQuery(table)`) — a bare `/Items` response only serves `[Field]Id` numbers for references, so unexpanded fetches would silently degrade every reference read to `{ id }`; explicit query strings pass through untouched (opting into exactly what they select). When a MERGE needs a guaranteed `$etag` after a narrow read, re-fetch the record (`getRecord`) or pass `ifMatch: "*"`. Value typing follows field kind (choices: display strings; references: numeric id or `{ id }`; dates: `datetime'…'` literals; OData v3 `contains` renders as `substringof(v, f) eq true`). Deliberately simpler than the Dataverse builder — no lambdas/aggregations/nav AST.
- Document libraries are lists, so all field types apply to their items — the file content itself is special: `document()` (a `FileField`) mirrors the Dataverse package's FileField explicit channel: `{ name, data: Blob | ArrayBuffer }` in the value never hits an item body; create → `Files/Add` (upload-first, then a metadata MERGE with `If-Match: *` on the resolved item id — the item was just created in this same call, so a preconditioned etag is meaningless; the legacy surface can evaluate a stale implicit etag after the upload churns the item's etag and fail the create), update → MERGE then `Files/Add(overwrite)` (the name must match the item's `FileLeafRef` to replace content — rename creates a new item; `overwrite` defaults `true` since passing `{ data }` is the explicit opt-in, `document({ overwrite: false })` fails on duplicate names instead); read `{ name: FileLeafRef, url: FileRef absolutized }` — non-null: a doc-lib item is always a file, and the absent-channel case (document() on a plain list / FileRef omitted by a narrow read) throws; delete via `deleteRecord` (file + item share one lifecycle); downloads via `getDocumentContent(id)`. No "clear content" operation exists on this surface; large-file resumable sessions are out of scope.
- Item comments are also a special column type: `comments()` (a `CommentsField`, value `Comment[]`) — the modern activity-feed comments live OUTSIDE the item object (`.../Items(id)/Comments`, `Microsoft.SharePoint.Comments.comment`), reachable by no `$select`. Same explicit-channel pattern as `document()`: never in the item body (`toSharePoint` → undefined; `fromSharePoint` throws), excluded from `defaultProjection`/`select()` (no wire name at all); `getRecord` populates the field via one follow-up Comments call, `getRecords` never does (N+1) and leaves the key absent. Writes are append-only and method-shaped: `addComment(id, text, mentions?)` (author is always the caller; mentions are emails mapping positionally to `@mention{N}` placeholders) and `deleteComment(id, commentId)` (POST + `X-HTTP-Method: DELETE`); there is NO comment update on the REST surface, so no `updateComment` exists and passing a comments value to `createRecord`/`updateRecord` throws. Provisioning skips it (platform feature, not a column); replies/likes are out of scope (`client.getComments` + `$expand=replies` for raw access).
- Provisioning (`src/provision.ts`): per-kind pure definer exports (`defineText`, `defineChoice`, `defineLookup`, …) emit CAML `<Field/>` schema XML for `fields/createfieldasxml`; runners `createList` (100/101 template auto-picked from a `document()` field), `applyListFields` (idempotent — skip matching existing columns by `InternalName`+`FieldTypeKind`, throw on drift), `provisionList` (whole-table; **idempotent end to end** — existing same-title list reused by default (`ifExists: "throw"` to opt out), returns `{ id, created, added, skipped }`), `resolveListId`, `deleteList`/`renameList`. Strictness: built-in `Id`/`Title` and `document()` skip (undefined); choice fields without `choices` and lookups without `listId` throw; internal names are validated for SharePoint legality too — a name the server would silently sanitize (`"Decision At"` → `Decision_x0020_At`, breaking every later `$select` with a 400) throws with the encoded form to use.
Don't add abstractions (filter trees, expand graphs, batch) to this package beyond what the flat query surface needs.

## Build, Lint, and Test Commands

Root scripts delegate into workspaces:

```bash
# Build all packages (independent)
npm run build

# Dev server / browser-test bundle (run inside packages/dataverse)
npm run dev
npm run build:browser-test   # → packages/dataverse/test/browser/dist/browser-test.js (see test/browser/README.md)

# Run all tests (vitest, all workspaces)
npm test

# Run a single test file
cd packages/dataverse && npx vitest run test/fields.test.ts

# Typecheck all packages
npm run typecheck

# Verify expectTypeOf assertions with real tsc (type-level tests)
npm run test:types
```

There is no second workspace package for sync. The engine and the TanStack adapters live in `packages/dataverse/src/sync/` and are tested through relative imports (`../src/sync`, `../src/sync/tanstack`); no package alias is needed.

There is no linter or formatter configured. Do not add linting unless the user explicitly asks.

## Test Infrastructure

- **Framework**: Vitest (no dedicated config file; uses defaults)
- **Environment**: Node by default. Files that need DOM APIs opt in with a `// @vitest-environment jsdom` docblock (e.g. `test/util.test.ts` for FileReader/location); files that must NOT see browser globals use `// @vitest-environment node` (e.g. `test/client.test.ts`)
- **No HTTP mocking**: unit tests never hit the network — they exercise pure logic only (field transforms, query builders, AST serialization, URL builders). The MSW setup that existed earlier has been removed
- **Test file naming**: `*.test.ts` in the `test/` directory
- **Test structure**: Flat `test()` blocks (no `describe()` wrappers). Tests are organized by section using `// --- Section Name ---` comments
- **Type tests**: `expectTypeOf` assertions live in `*typecheck*.test.ts` files. They are compile-time only and are verified via `npm run test:types` (vitest `--typecheck` mode). Compile-error assertions use `// @ts-expect-error` wrapped in never-invoked closures so they don't execute at runtime
- **Some tests are skipped** with `test.skip` — do not un-skip them without understanding why they were skipped
- **Browser integration tests**: live-org tests live in `test/browser/` and are bundled by `npm run build:browser-test` into `test/browser/dist/browser-test.js`, which is loaded inside a Dataverse page via a raw-GitHub `<script>` snippet. See `test/browser/README.md`. These are NOT vitest tests — they use a small custom runner with suites in `test/browser/suites/`

## Code Structure

```
packages/dataverse/src/
  index.ts                     — barrel re-exports the public API (client, table, fields, query builders, util, types, functions)
  client.ts                    — DataverseClient: HTTP client for Dataverse Web API (auth, CRUD, batch, functions/actions)
  table.ts                     — DataverseTable class (schema + CRUD + query methods) and DataverseIntersectTable
  fields.ts                    — Field classes (StringField, NumberField, ChoiceField, etc.), factory functions, navigation properties, valibot-based ValidationSchema
  functions.ts                 — Dataverse function wrappers (WhoAmI, RetrieveTotalRecordCount, RetrieveChoices, RetrieveAadUserRoles, mapChoices)
  types.ts                     — Core types (GUID, Infer, GenericProperties, DataverseKey, GetTable, etc.)
  util.ts                      — Helpers (ETAG, wrapString, select, orderby, expand, keys, xml tag, base64, dates, mergeRecords, getImageUrl)
  query/
    filter/
      expr.ts                  — FilterExpr tree + field comparison functions (eq, ne, gt, ge, lt, le, isNull, isNotNull, contains, startsWith, endsWith, and, or, not, isActive, isInactive) + CRM date/query functions (Today, Between, Above, Under, ...)
      ast.ts                   — FilterNode AST + node types
      input.ts                 — Input normalization for filters
      render-fetchxml.ts       — Renders FilterExpr to FetchXML `<condition>`/`<filter>`
      render-odata.ts          — Renders FilterExpr to OData `$filter` string
    odata/
      builder.ts               — fetchOdata() fluent builder (ODataQuery, InitialQuery, SelectQuery, ApplyQuery), lambda any()/all(), and re-exports aggregation helpers (groupby, sum, min, max, average, count)
      ast.ts                   — OData AST types + serializers (select, filter, aggregate, expand)
    fetchxml/
      builder.ts               — fetchXml() fluent builder (EntityQueryBuilder, FetchXmlInitial, FetchXmlSelectQuery, FetchXmlAggregateQuery, FilterCollector)
      ast.ts                   — FetchXML AST types + serializeFetchXml()
    shared/
      aggregation.ts           — Aggregation / GroupByExpr helpers (groupby, sum, min, max, average, count)
      field-ref.ts             — FieldRef type used by filter + aggregation expressions
      proxy.ts                 — Proxy helpers for type-safe field references in query builders
    path.ts                    — FieldPath / path resolution used across query builders
  sync/                        — offline engine + Dataverse adapter (the `dataverse-schema/sync` entry)
    index.ts                   — barrel: engine, Dataverse adapter, classifiers/error interpretation
    engine.ts                  — generic SyncEngine over a SyncTable interface (durable IndexedDB
                                 queue, cross-tab BroadcastChannel + Web Locks, retry/backoff,
                                 conflict diffing, errored store)
    idb.ts                     — zero-dep IndexedDB wrapper (inlined; no `idb` dependency)
    types.ts                   — QueuedMutation, MutationPersistenceError
    util.ts                    — plainClone, isMetaKey, isMetaOnly, valuesEqual
    errors.ts                  — generic serializeError / isConcurrencyError / isDeterministicFailure
    adapter.ts                 — dataverseSyncEngine(): injects getEtag ($etag) + the Dataverse
                                 deterministic-failure classifier into the generic SyncEngine
    classifiers.ts             — Dataverse serializeError, isConcurrencyError, isKeyViolation
    error-codes.ts             — DATVERSE_ERROR_CODES table, interpretError, isDeterministicFailure
    tanstack.ts                — TanStack DB collection adapters (the `dataverse-schema/sync/tanstack` entry)
test/
  util.test.ts                 — util helpers (etag, xml, dates, image URLs)
  filter-render.test.ts        — FilterExpr rendering to OData + FetchXML (incl. choice transforms)
  table.test.ts                — Pure DataverseTable methods, navigation properties, intersect tables
  odata-builder.test.ts        — OData fluent builder output, lambdas, error paths
  fetchxml-builder.test.ts     — FetchXML builder output: joins, aggregates, serialization
  client.test.ts               — Client construction + URL builders (no HTTP)
  fields.test.ts               — Field classes: defaults, transforms, validation
  query.test.ts                — FilterExpr + util query helpers
  query-ast.test.ts            — AST serializers
  types-typecheck.test.ts      — Type-level checks for Infer/types/table algebra
  odata-typecheck.test.ts      — Type-level checks for OData builder inference
  fetchXml-typecheck.test.ts   — Type-level checks for FetchXML builder
  browser/                     — Live-org integration harness (see test/browser/README.md)
    main.ts                    — Entry: config → tables → suites → reporter UI
    harness/                   — runner, reporter, assert, fixtures, tables, config
    suites/                    — general, crud, query-odata, query-fetchxml, navigation, files-images, functions-actions, bulk, errors
    dist/browser-test.js       — Committed bundle loaded via raw-GitHub <script> snippet

packages/filesystem/src/
  index.ts                     — barrel + SyncTable compile-time compatibility check
  database.ts                  — FileSystemDatabase (fsdb.json manifest verify/initialize), pickRoot, ensurePermission
  handles.ts                   — IndexedDB handle persistence (save/load/list/delete), resolveRootHandle/tryLoadRootHandle, openStoredDatabase/tryOpenStoredDatabase
  table.ts                     — FileSystemTable (one folder, one <id>.json per record) and FileSystemSingleFileTable (<table>/data.json); every table has <table>/.meta/table.json + .meta/trash + .meta/history; $rev/ifMatch, timestamps
  fields.ts                    — text/number/bool/date/datetime/json/choice/multiChoice/primaryKey, InferRecord, phantom T, Standard-Schema validation
  errors.ts                    — FileSystemStorageError + FileSystemConflictError, DOMException/Node error classification (permission/locked/read-only/quota/io/conflict/...)
  retry.ts                     — StorageRetryPolicy + bounded backoff/jitter (reads opt-in default-on, writes/deletes opt-in)
  storage.ts                   — File System Access handle helpers, safe segment/record file-name codec, manifest constant (fsdb.json), structured storage errors
  types.ts                     — FsDirectoryHandle/FsFileHandle structural types, manifest/options/trash/history/revision types
  watch.ts                     — Chromium FileSystemObserver wrapper + record watch event types
```

## Code Style Guidelines

### Formatting
- **Indentation**: 2 spaces
- **Semicolons**: Used at end of statements (but inconsistently — match surrounding code)
- **Quotes**: Double quotes for strings in source, double quotes for test imports
- **Trailing commas**: Used in multi-line structures (but inconsistently)
- **Line length**: No strict limit; some lines are long
- **Braces**: Opening brace on same line (K&R style)

### Imports
- ES module imports (`import`/`export`), never CommonJS
- Use relative paths with `./` prefix for local imports
- Barrel exports in `src/index.ts` — all public API flows through there
- When importing from the library in tests, use `"../src"` or `"../src/module-name"`
- `import type` is NOT used — plain imports include both values and types
- Import order: group by external deps, then local modules. No enforced sorting.

### TypeScript
- **Strict mode** enabled (`"strict": true` in tsconfig.json)
- **Target**: ESNext, Module: ESNext, ModuleResolution: bundler
- Heavy use of **generics** and **conditional types** (especially in `Infer<T>`, `DataverseTable<TProperties>`)
- **Private fields**: Use `#` prefix (native JS private fields), not TypeScript `private` keyword
- **`as const`**: Used on `kind` and `type` properties for literal type narrowing
- **Type assertions**: `as` is used freely, especially when crossing generic boundaries
- **`any`**: Used in internal/implementation code, avoided in public-facing types where possible
- **Template literal types**: Used for `GUID` and `AlternateKey` types
- **No explicit return types** on most functions — rely on inference
- **No `enum`** usage — use string literal unions or `as const` objects instead

### Naming Conventions
- **Classes**: PascalCase. Field classes end with `Field` (e.g., `StringField`, `NumberField`, `ChoiceField`). Navigation classes end with `Property` (e.g., `LookupProperty`, `CollectionProperty`)
- **Factory functions**: camelCase matching the field type (e.g., `string()`, `number()`, `primaryKey()`, `lookup()`, `choice()`, `json()`)
- **Public API functions**: Exported functions use PascalCase when they represent Dataverse actions/functions (e.g., `WhoAmI`, `RetrieveTotalRecordCount`) — follow existing Dataverse naming
- **Internal helper functions**: camelCase (e.g., `wrapString`, `buildTableQueryAst`, `renderFilterInput`)
- **Types/Interfaces**: PascalCase with descriptive names. Utility types: `Infer<T>`, `GenericProperties`, `DataverseKey`, `ValidationSchema<T>`
- **Constants/symbols**: `ETAG` is the string `"$etag"` — PascalCase for exported constants
- **Private methods**: camelCase with `_` prefix (e.g., `_toAggregateQuery`, `_buildProxy`)
- **Test names**: Descriptive strings starting with the entity/class being tested (e.g., `"table.getRecord fetches and transforms a record"`)

### Error Handling
- `throw new Error("message")` for runtime errors
- Error messages are short, descriptive strings — no error codes
- Client errors from Dataverse are thrown as-is from the API response (`throw data.error`)
- Validation uses [valibot](https://valibot.dev/); validation errors surface as valibot issues, not the Standard Schema V1 shape

### Classes and Patterns
- **DataverseTable<TProperties>** is the central class. It is constructed with an options object: `{ client, entitySetName, logicalName, fields, schema?, primaryKey? }`. It provides `schema`, `getDefault()`, CRUD methods (`getRecord`, `getRecords`, `createRecord`, `updateRecord`, `upsertRecord`, `deleteRecord`, `activateRecord`, `deactivateRecord`), query building (`getRecords` with options, or `fetchOdata`/`fetchXml`), navigation property handling, actions/functions, and bulk operations (`createMultiple`, `updateMultiple`, `deleteMultiple`). There is **no** `table()` factory function — always use `new DataverseTable({...})`.

- **Mutation options**: `createRecord`, `updateRecord`, `upsertRecord`, and `deleteRecord` accept a trailing `MutationOptions` object (`{ ifMatch?, ifNoneMatch?, signal? }`). `updateRecord` defaults `ifMatch` to `"*"` when omitted (updates only if the record exists). The client layer keeps HTTP-verb method names (`postRecord`, `patchRecord`, `deleteRecord`); `patchRecord` takes `ifMatch`/`ifNoneMatch` (so it can act as update, upsert, or idempotent create depending on the headers), while `deleteRecord`/`updatePropertyValue` take `ifMatch` only, and `getRecord` takes `ifNoneMatch` (conditional GET).
- **Field classes** extend `FieldBase<T>`. They override `getDefault()`, `transformValueFromDataverse()`, `transformValueToDataverse()`, and may define `afterSave()`. Nullability is a per-kind generic (`NumberField<Nullable>` etc.), not a wrapper: null policy is centralized in `FieldBase.nullToRead()` — nullable kinds resolve a wire `null` to `null`, non-nullable kinds fail fast.
- **Nullability model** (see `FieldValue<T, Nullable>` in `fields.ts`):
  - Nullable by default: `number()`, `datetime()`, `date()`, `choice()` (typed + dynamic), `lookupId()` → reads `T | null`.
  - Non-null by wire semantics: `string()` (null ≡ `""`), `boolean()` (null ≡ `false`), `multiChoice()` (null ≡ `[]`), `primaryKey()` (`GUID`).
  - `{ system: true }` = server-managed + always populated (e.g. `createdon`, `statecode`): implies `readonly`, read type is non-null, and a wire `null` throws. Sugar factories: `createdOn()`, `modifiedOn()`, `versionNumber()`, `stateCode()`, `createdBy()`.
  - `{ required: true }` is validation-only (applies `requiredOf` via `table.schema`) — it does not change read types or transforms.
  - FetchXML join results: outer-joined fields may be `undefined` (no matching linked row), inner-joined fields are never `undefined` (see `query/fetchxml/builder.ts`, `JoinResult`).
- **Validation is Standard Schema–based**: each field accepts a `schema` option (`ValidationSchema<T> = StandardSchemaV1<T, T>`; valibot, Zod, ArkType all work). Tables may pass a `schema` for whole-record validation. Use `field.schema` / `table.schema` / `standardParse` / `standardSafeParse` from `src/schema.ts`.
- **Fluent/builder pattern**: Query builders (`ODataQuery`, `EntityQueryBuilder`) return `this` for chaining. `fetchOdata(table)` and `fetchXml(table)` return initial builders; call `.select()`/`.apply()` first, then `.filter()`, `.orderby()`, `.top()`, `.expand()`, `.execute()`.
- **Lazy initialization**: Navigation properties use `#getTable` thunk + lazy `#table` cache (see `LookupProperty`, `CollectionProperty`)
- **Proxy pattern**: OData and FetchXML builders use proxy objects (`ODataFieldProxy`, `FieldProxy`) for type-safe field references via `FieldRef`
- **Aggregation helpers** (`groupby`, `sum`, `min`, `max`, `average`, `count`) are re-exported from `query/odata/builder.ts` (and therefore from the package root) so they can be used inside `.apply()` callbacks

### Validation
- All fields carry a [valibot](https://valibot.dev/) schema (`ValidationSchema<T>`)
- Compose field validation by passing a `schema` option to the factory, e.g. `string("fullname", { schema: v.pipe(v.string(), v.minLength(2)) })`
- Table-level validation: pass a `schema` to the `DataverseTable` options
- Access compiled schemas with `field.schema` / `table.schema`; parse/validate values with valibot (`v.parse`, `v.safeParse`)
- Built-in field factories already apply sensible defaults (e.g. `number()` → `v.number()`, `string()` → `v.string()`); override via the `schema` option

### Testing Patterns
- Import `test` and `expect` from `"vitest"` — not `describe`
- Tests are pure unit tests: assert on returned strings, AST objects, and transformed values; never hit the network
- Assertions: `expect(result).toBe(...)`, `.toEqual(...)`, `.toContain(...)`, `.toHaveLength(...)`, `.toBeNull()`, `.toBeUndefined()`, `.toBeInstanceOf(...)`
- Async tests use `async`/`await`
- Error testing: `expect(() => fn()).toThrow("message")` for sync builder errors, `await expect(promise).rejects.toThrow("message")` for async ones
- Type testing: `expectTypeOf(...)` in `*typecheck*.test.ts` files only (verified via `npm run test:types`); wrap compile-error assertions (`// @ts-expect-error`) in never-invoked closures so they don't run at runtime

## Key Dependencies

- `valibot` — Validation engine for fields and tables (runtime dependency)
- `vitest` — Test runner (dev)
- `vite` — Dev server and browser-test bundler (dev)
- `tsdown` — Library bundler that produces `dist/` (dev)
- `vite-plugin-dts` — Generates `.d.ts` files (used by the older vite build path; tsdown handles dts now)
- `msw` — Mock Service Worker (dev dependency, currently unused — kept installed)
- `jsdom` — Browser environment simulation for tests that need DOM APIs (dev)
- `@tanstack/db` — optional peer of `dataverse-schema`, used only by the `dataverse-schema/sync/tanstack` entry

## Important Notes

- The `DataverseClient` constructor defaults `url` to `location.origin` — this works in browser but will fail in Node.js without jsdom
- `primaryKey` field defaults use `crypto.randomUUID()` — requires a runtime that supports this API
- The `name` argument to field factories is the **Dataverse logical name** (e.g., `"fullname"`), while the key in the `fields` object is the **TypeScript property name** (e.g., `"name"`)
- `fromDataverseName` and `toDataverseName` handle the mapping between TS property names and Dataverse API names
- Navigation properties (`lookup`, `collection`, `lookupId`, `collectionIds`) accept a **thunk** (`() => Table`) to handle circular references between tables
- Build output is produced by `tsdown` (config in `tsdown.config.ts`); the vite config is retained for the dev server and the browser-test bundle only
- The TanStack DB integration lives entirely in the `dataverse-schema/sync/tanstack` subpath entry — the root entry has no TanStack API. The offline queue lives behind the `SyncEngine` class (exported from `dataverse-schema/sync`); `offlineCollectionOptions(engine, config)` / `syncCollectionOptions(config)` build TanStack collection options over any engine instance (rows are typed via the generic `TRow` parameter — pass `Infer<typeof Table>` at the call site).
