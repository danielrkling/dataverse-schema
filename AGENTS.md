# AGENTS.md

## Project Overview

`dataverse-schema` is a strongly-typed TypeScript library for working with the Microsoft Dataverse Web API. It provides schema definitions, type inference, query builders (OData + FetchXML), validation (via [valibot](https://valibot.dev/)), and CRUD operations. Ships as an ES module with a separate `@tanstack/db` integration entry point.

## Build, Lint, and Test Commands

```bash
# Build (tsdown → dist/index.mjs, dist/tanstack-db/index.mjs)
npm run build

# Dev server (vite)
npm run dev

# Build the browser smoke-test bundle (vite, mode=browser-test)
npm run build:browser-test

# Run all tests (vitest)
npm test

# Run tests in watch mode
npm run test:watch

# Run a single test file
npx vitest run test/fields.test.ts

# Run tests matching a name pattern
npx vitest run -t "table.getRecord"

# Typecheck (no emit)
npm run typecheck

# Verify expectTypeOf assertions with real tsc (type-level tests)
npm run test:types
```

There is no linter or formatter configured. Do not add linting unless the user explicitly asks.

## Test Infrastructure

- **Framework**: Vitest (no dedicated config file; uses defaults)
- **Environment**: Node by default. Files that need DOM APIs opt in with a `// @vitest-environment jsdom` docblock (e.g. `test/util.test.ts` for FileReader/location); files that must NOT see browser globals use `// @vitest-environment node` (e.g. `test/client.test.ts`)
- **No HTTP mocking**: unit tests never hit the network — they exercise pure logic only (field transforms, query builders, AST serialization, URL builders). The MSW setup that existed earlier has been removed
- **Test file naming**: `*.test.ts` in the `test/` directory (plus `test/browser-smoke.ts`)
- **Test structure**: Flat `test()` blocks (no `describe()` wrappers). Tests are organized by section using `// --- Section Name ---` comments
- **Type tests**: `expectTypeOf` assertions live in `*typecheck*.test.ts` files. They are compile-time only and are verified via `npm run test:types` (vitest `--typecheck` mode). Compile-error assertions use `// @ts-expect-error` wrapped in never-invoked closures so they don't execute at runtime
- **Some tests are skipped** with `test.skip` — do not un-skip them without understanding why they were skipped
- **Browser smoke test**: `test/browser-smoke.ts` is bundled by `npm run build:browser-test` into `test/dist/browser-test/browser-test.js` for manual real-environment checks

## Code Structure

```
src/
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
  tanstack-db/
    index.ts                   — Re-exports the @tanstack/db integration
    collection.ts              — dataverseCollectionOptions() + collection config/types
    offline-collection.ts      — DataverseSyncDB (IndexedDB via idb), MutationPersistenceError, offline collection config/types
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
  browser-smoke.ts             — Manual browser smoke-test entry (bundled by build:browser-test)
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
- **DataverseTable<TProperties>** is the central class. It is constructed with an options object: `{ client, entitySetName, logicalName, fields, schema?, primaryKey? }`. It provides `getSchema()`, `getDefault()`, CRUD methods (`getRecord`, `getRecords`, `createRecord`, `updateRecord`, `upsertRecord`, `deleteRecord`, `activateRecord`, `deactivateRecord`), query building (`getRecords` with options, or `fetchOdata`/`fetchXml`), navigation property handling, actions/functions, and bulk operations (`createMultiple`, `updateMultiple`, `deleteMultiple`). There is **no** `table()` factory function — always use `new DataverseTable({...})`.

- **Mutation options**: `createRecord`, `updateRecord`, `upsertRecord`, and `deleteRecord` accept a trailing `MutationOptions` object (`{ ifMatch?, ifNoneMatch?, signal? }`). `updateRecord` defaults `ifMatch` to `"*"` when omitted (updates only if the record exists). The client layer keeps HTTP-verb method names (`postRecord`, `patchRecord`, `deleteRecord`); `patchRecord` takes `ifMatch`/`ifNoneMatch` (so it can act as update, upsert, or idempotent create depending on the headers), while `deleteRecord`/`updatePropertyValue` take `ifMatch` only, and `getRecord` takes `ifNoneMatch` (conditional GET).
- **Field classes** extend `FieldBase<T>`. They override `getDefault()`, `transformValueFromDataverse()`, `transformValueToDataverse()`, and may define `afterSave()`.
- **Validation is valibot-based**: each field accepts a `schema` option that is a `v.BaseSchema`. `ValidationSchema<T> = v.BaseSchema<T, T, v.BaseIssue<unknown>>`. Tables may pass an optional `schema` for whole-record validation. Use `field.schema` / `table.getSchema()` to access the compiled schema.
- **Fluent/builder pattern**: Query builders (`ODataQuery`, `EntityQueryBuilder`) return `this` for chaining. `fetchOdata(table)` and `fetchXml(table)` return initial builders; call `.select()`/`.apply()` first, then `.filter()`, `.orderby()`, `.top()`, `.expand()`, `.execute()`.
- **Lazy initialization**: Navigation properties use `#getTable` thunk + lazy `#table` cache (see `LookupProperty`, `CollectionProperty`)
- **Proxy pattern**: OData and FetchXML builders use proxy objects (`ODataFieldProxy`, `FieldProxy`) for type-safe field references via `FieldRef`
- **Aggregation helpers** (`groupby`, `sum`, `min`, `max`, `average`, `count`) are re-exported from `query/odata/builder.ts` (and therefore from the package root) so they can be used inside `.apply()` callbacks

### Validation
- All fields carry a [valibot](https://valibot.dev/) schema (`ValidationSchema<T>`)
- Compose field validation by passing a `schema` option to the factory, e.g. `string("fullname", { schema: v.pipe(v.string(), v.minLength(2)) })`
- Table-level validation: pass a `schema` to the `DataverseTable` options
- Access compiled schemas with `field.schema` / `table.getSchema()`; parse/validate values with valibot (`v.parse`, `v.safeParse`)
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
- `idb` — IndexedDB wrapper used by the `@tanstack/db` offline sync store (runtime dependency)
- `vitest` — Test runner (dev)
- `vite` — Dev server and browser-test bundler (dev)
- `tsdown` — Library bundler that produces `dist/` (dev)
- `vite-plugin-dts` — Generates `.d.ts` files (used by the older vite build path; tsdown handles dts now)
- `msw` — Mock Service Worker (dev dependency, currently unused — kept installed)
- `jsdom` — Browser environment simulation for tests that need DOM APIs (dev)
- `@tanstack/db` — Optional peer dependency for the `tanstack-db` entry point

## Important Notes

- The `DataverseClient` constructor defaults `url` to `location.origin` — this works in browser but will fail in Node.js without jsdom
- `primaryKey` field defaults use `crypto.randomUUID()` — requires a runtime that supports this API
- The `name` argument to field factories is the **Dataverse logical name** (e.g., `"fullname"`), while the key in the `fields` object is the **TypeScript property name** (e.g., `"name"`)
- `fromDataverseName` and `toDataverseName` handle the mapping between TS property names and Dataverse API names
- Navigation properties (`lookup`, `collection`, `lookupId`, `collectionIds`) accept a **thunk** (`() => Table`) to handle circular references between tables
- Build output is produced by `tsdown` (config in `tsdown.config.ts`); the vite config is retained for the dev server and the browser-test bundle only
- The `@tanstack/db` integration is a separate entry point: `dataverse-schema/tanstack-db`
