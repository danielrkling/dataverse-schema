# AGENTS.md

## Project Overview

`dataverse-schema` is a TypeScript library for working with the Microsoft Dataverse Web API. It provides schema definitions, type inference, query builders (OData + FetchXML), validation, and CRUD operations. Ships as an ES module.

## Build, Lint, and Test Commands

```bash
# Build (vite build → dist/)
npm run build

# Dev server
npm run dev

# Run all tests (vitest)
npx vitest run

# Run tests in watch mode
npx vitest

# Run a single test file
npx vitest run test/fields.test.ts

# Run tests matching a name pattern
npx vitest run -t "table.getRecord"

# Typecheck (no emit)
npx tsc --noEmit
```

There is no linter or formatter configured. Do not add linting unless the user explicitly asks.

## Test Infrastructure

- **Framework**: Vitest (configured in `vite.config.js`)
- **Environment**: jsdom
- **Setup file**: `test/setup.ts` — starts MSW server before tests, resets handlers after each, shuts down after all
- **Mocking**: MSW (Mock Service Worker) intercepts HTTP requests. Default handlers in `test/mocks/handlers.ts`, server in `test/mocks/server.ts`
- **Test file naming**: `*.test.ts` in the `test/` directory
- **Test structure**: Flat `test()` blocks (no `describe()` wrappers). Tests are organized by section using `// --- Section Name ---` comments
- **Many tests use `server.use()`** to override default handlers per-test with custom MSW handlers
- **Some tests are skipped** with `test.skip` — do not un-skip them without understanding why they were skipped

## Code Structure

```
src/
  index.ts          — barrel re-exports everything
  client.ts         — DataverseClient: HTTP client for Dataverse Web API
  table.ts          — DataverseTable class: schema + CRUD + query methods
  fields.ts         — Field classes (StringField, NumberField, etc.) and factory functions
  schema.ts         — Schema<T> base class: validation, transform, StandardSchemaV1
  types.ts          — Core types (GUID, Infer, GenericProperties, etc.)
  filter.ts         — FilterExpr tree, field comparison functions (eq, gt, and, or, etc.)
  odata.ts          — ODataQuery builder (fluent API), aggregation, lambda expressions
  fetchXml.ts       — FetchXML builder (EntityQueryBuilder, aggregate queries)
  validators.ts     — Validator factory functions (required, pattern, email, etc.)
  functions.ts      — Dataverse function wrappers (WhoAmI, RetrieveTotalRecordCount, etc.)
  util.ts           — Helpers (wrapString, select, orderby, expand, xml tag, Etag, dates)
test/
  mocks/            — MSW mock server and handlers
  *.test.ts         — Test files
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
- Heavy use of **generics** and **conditional types** (especially in `Infer<T>`, `DataverseTable<T>`)
- **Private fields**: Use `#` prefix (native JS private fields), not TypeScript `private` keyword
- **`as const`**: Used on `kind` and `type` properties for literal type narrowing
- **Type assertions**: `as` is used freely, especially when crossing generic boundaries
- **`any`**: Used in internal/implementation code, avoided in public-facing types where possible
- **Template literal types**: Used for `GUID` and `AlternateKey` types
- **No explicit return types** on most functions — rely on inference
- **No `enum`** usage — use string literal unions or `as const` objects instead

### Naming Conventions
- **Classes**: PascalCase. Field classes end with `Field` (e.g., `StringField`, `NumberField`). Navigation classes end with `Property` (e.g., `LookupProperty`, `CollectionProperty`)
- **Factory functions**: camelCase matching the field type (e.g., `string()`, `number()`, `primaryKey()`, `lookup()`)
- **Public API functions**: Exported functions use PascalCase when they represent Dataverse actions/functions (e.g., `WhoAmI`, `RetrieveTotalRecordCount`) — follow existing Dataverse naming
- **Internal helper functions**: camelCase (e.g., `wrapString`, `buildQuery`, `buildProxyForTable`)
- **Types/Interfaces**: PascalCase with descriptive names. Utility types: `Infer<T>`, `GenericProperties`, `DataverseKey`
- **Constants/symbols**: `Etag` is a `Symbol("etag")` — PascalCase for exported symbols
- **Private methods**: camelCase with `_` prefix (e.g., `_getNextLink`, `_buildProxy`)
- **Test names**: Descriptive strings starting with the entity/class being tested (e.g., `"table.getRecord fetches and transforms a record"`)

### Error Handling
- `throw new Error("message")` for runtime errors
- Error messages are short, descriptive strings — no error codes
- Validation errors use the Standard Schema V1 pattern: `{ issues: [{ message, path }] }`
- Validators return `undefined` for valid, `string` message for invalid
- Client errors from Dataverse are thrown as-is from the API response (`throw data.error`)

### Classes and Patterns
- **Schema<T>** is the base class for all fields and tables. It provides `validate()`, `parse()`, `getIssues()`, `check()`, `setDefault()`, `setReadOnly()`, and transform hooks
- **Field subclasses** override `getDefault()`, `transformValueFromDataverse()`, `transformValueToDataverse()`
- **DataverseTable** extends `Schema` and adds CRUD methods, query building, navigation property handling
- **Fluent/builder pattern**: Query builders (ODataQuery, EntityQueryBuilder) return `this` for chaining
- **Lazy initialization**: Navigation properties use `#getTable` thunk + lazy `#table` cache (see `LookupProperty`, `CollectionProperty`)
- **Proxy pattern**: OData and FetchXML builders use proxy objects for type-safe field references via `FieldRef`

### Validation
- All fields implement Standard Schema V1 (`@standard-schema/spec`)
- Validators are composable: `field.check(fn1).check(fn2)`
- Built-in validators: `required()`, `pattern()`, `email()`, `numeric()`, `integer()`, `minValue()`, `maxValue()`, `minLength()`, `maxLength()`, `isType()`, `isTypeOrNull()`
- Tables validate all non-read-only fields recursively

### Testing Patterns
- Import `test` and `expect` from `"vitest"` — not `describe`
- Use `server.use(http.get(...))` or `server.use(http.post(...))` for per-test handler overrides
- Capture request details via `let capturedUrl = ""` or `let capturedBody: any = null` pattern
- Assertions: `expect(result).toBe(...)`, `.toEqual(...)`, `.toContain(...)`, `.toHaveLength(...)`, `.toBeNull()`, `.toBeUndefined()`, `.toBeInstanceOf(...)`
- Async tests use `async`/`await`
- Error testing: `await expect(promise).rejects.toThrow("message")`
- Type testing: `expectTypeOf(...)` from vitest (used sparingly)

## Key Dependencies

- `@standard-schema/spec` — Standard Schema V1 validation interface (runtime dependency)
- `vitest` — Test runner (dev)
- `vite` — Build tool and dev server (dev)
- `vite-plugin-dts` — Generates `.d.ts` files during build (dev)
- `msw` — Mock Service Worker for test HTTP mocking (dev)
- `jsdom` — Browser environment simulation for tests (dev)

## Important Notes

- The `DataverseClient` constructor defaults `url` to `location.origin` — this works in browser but will fail in Node.js without jsdom
- `primaryKey` field defaults use `crypto.randomUUID()` — requires a runtime that supports this API
- The `name` property on fields is the **Dataverse logical name** (e.g., `"fullname"`), while the key in the fields object is the **TypeScript property name** (e.g., `"name"`)
- `fromDataverseName` and `toDataverseName` handle the mapping between TS property names and Dataverse API names
- Navigation properties (`lookup`, `collection`, etc.) accept a **thunk** (`() => Table`) to handle circular references between tables
