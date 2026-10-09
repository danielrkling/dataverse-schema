# SharePoint REST TypeScript Library

A strongly-typed TypeScript library for working with the SharePoint **legacy `_api/web` REST API** (OData v3, verbose JSON). Provides schema definitions for lists and document libraries, field classes with wire transforms and validation, type inference with zero runtime cost, a typed fluent query builder, and CRUD operations with optimistic concurrency.

Structurally mirrors the [dataverse-schema](../dataverse) package's API conventions — field factories, phantom `T` inference properties, query builders — but deliberately standalone: flat field/query surface, no shared core.

## Installation

```bash
npm i sharepoint-schema
```

> **Type inference note:** the `json()` field validates and infers via [Standard Schema](https://github.com/standard-schema/standard-schema). To use it, `@standard-schema/spec` and a Standard-Schema library ([valibot](https://valibot.dev/), Zod, or ArkType) must be resolvable from your app — without them, schema-based type inference silently degrades to `any`:
>
> ```bash
> npm i @standard-schema/spec valibot
> ```

## Quick Start

```typescript
import { SharePointClient, SharePointTable, primaryKey, title, text, number, bool, choice, person, lookup, InferTable } from "sharepoint-schema";

// 1. Create a client (Bearer token or a form-digest callback)
const client = new SharePointClient({ url: "https://contoso.sharepoint.com/sites/dev", token: "eyJ..." });

// 2. Define your table schema — the key is your TS property name,
//    the factory argument is the SharePoint internal column name.
const Tasks = new SharePointTable({
  client,
  listTitle: "Tasks",
  listItemEntityTypeFullName: "SP.Data.TasksListItem",
  fields: {
    id: primaryKey(),
    title: title(),
    description: text("Description"),
    percent: number("PercentComplete"),
    done: bool("IsDone"),
    status: choice("Status", { choices: ["Not Started", "In Progress", "Done"] as const }),
    owner: person("OwnerId"),
    project: lookup("ProjectId"),
  },
});
type Task = InferTable<typeof Tasks>;
// {
//   id: number
//   title: string
//   description: string
//   percent: number | null
//   done: boolean
//   status: "Not Started" | "In Progress" | "Done" | null
//   owner: { id; name?; email? } | null
//   project: { id; title? } | null
// }

// 3. CRUD
const task = await Tasks.getRecord(12);
await Tasks.createRecord({ title: "Ship it", status: "Not Started" });
await Tasks.updateRecord(12, { status: "Done", done: true }, { ifMatch: task ?.$etag });
await Tasks.deleteRecord(12, { ifMatch: task?.$etag ?? "*" });
```

## Client

`SharePointClient` talks to the legacy REST surface (`_api/web`) with verbose JSON:

```typescript
const client = new SharePointClient({
  url: "https://contoso.sharepoint.com/sites/dev",
  // Auth: EITHER a Bearer token (ADAL/MSAL/SPFx aadToken)...
  token: "eyJ...",
  // ...OR a form-digest callback for SPFx / cookie-based setups:
  // requestDigest: () => context.pageContext.web.getFormDigestToken(),
  headers: { Accept: "application/json;odata=verbose" }, // defaults included already
});
```

- `token` sends `Authorization: Bearer …` (form digest is skipped when present)
- otherwise `requestDigest` supplies `X-RequestDigest` for writes, cached ~5 min early
- built-in conveniences: `getCurrentUser()`, `addFile()`, `getFileContent()`, `getRootFolder()`
- `client.fetch(path)` paths are `_api`-scoped automatically

## Fields

Factories are camelCase; the argument is the SharePoint internal column name.

| Factory | Wire | Reads as |
|---|---|---|
| `text(name)` | string column (null ≡ `""`) | `string` |
| `title()` | `Title` sugar for `text` | `string` |
| `number(name)` | float/number | `number \| null` |
| `bool(name)` | boolean (null ≡ `false`) | `boolean` |
| `date(name)` / `datetime(name)` | ISO strings | real `Date` (invalid wire → `null`) |
| `choice(name, { choices })` | string value | the choice literal \| `null` |
| `multiChoice(name, { choices })` | `";#"`-joined string | `string[]` (empty ⇔ `[]`) |
| `json(name, { schema })` | string column containing JSON | parsed + validated via the schema |
| `person(name)` / `people(name)` | `SP.FieldUserValue` | `{ id; name?; email? }` / array |
| `lookup(name)` / `multiLookup(name)` | `SP.FieldLookupValue` | `{ id; title? }` / array |
| `primaryKey()` | `Id` | `number` |
| `document(name)` | file channel (see below) | `{ name, url }` |

Reference details:

- **person** reads flatten every wire shape (`{ Id, Title, EMail }` expanded, plain number, legacy `"2;#Name"`) to `{ id, name?, email? }`; **email only appears when the field was expanded** with `EMail`
- **lookup** reads give `{ id, title? }` — the target's display value. A lookup never carries an email (that's `SP.FieldUser` territory), so `Lookup` and `Person` are deliberately separate types
- **writes** go under SharePoint's derived `<Name>Id` property: single references send a plain numeric id (or `{ id }` / `{ results: [...] }` shapes are accepted), collections send `{ results: [...] }`. Pass `writeShape: "typed"` to send `SP.FieldUserValue`/`SP.FieldLookupValue` objects instead

Phantom `T` properties (parity with the Dataverse package) give type-only inference without importing field maps:

```typescript
const Status = Tasks.fields.status.T;   // "Not Started" | "In Progress" | "Done" | null
type TaskRow = typeof Tasks.T;          // the full inferred record
```

### json fields

`json()` parses a serializable string column and validates it synchronously on read through a Standard Schema (`v.object`, etc.). The value type is inferred from the schema — malformed JSON or schema violations throw with the column name; schema supplied *without* the packages above falls back to `any`:

```typescript
import * as v from "valibot";
import { json } from "sharepoint-schema";

meta: json("Meta", { schema: v.object({ priority: v.number() }) }),
// record.meta: { priority: number } | null
```

## Query builder

`table.query()` is a small proxy-based, type-safe fluent builder that replaces raw query strings:

```typescript
const draft = await Tasks.query()
  .select((f) => ({ id: f.id, title: f.title, owner: f.owner }))
  .where((f) => and(eq(f.status, "Not Started"), startsWith(f.title, "Ship")))
  .orderBy((f) => f.title)
  .top(50)
  .skip(0)
  .execute();
```

- `.select()` takes an **object pick** — the built query's result type is fixed to exactly the picked fields (per field kind)
- **reference fields self-expand** with standard carve-outs — person/people get `Id,Title,EMail`, lookups get `Id,Title` — no separate `.expand()` needed. `.expand({...})` only adds/overrides properties
- free-function comparators: `eq/ne/gt/ge/lt/le/contains/startsWith/endsWith` (take a field ref + value; no ref methods), plus `and/or/not/isNull/isNotNull`
- `.build()` renders the OData v3 string; `getRecords`/`getRecord` also accept that string directly

### Default projections

A bare `/Items` response only serves `[Field]Id` numbers for reference columns. So the library **always explicitly selects and expands** by default:

- with no `.select()`, the builder defaults to the full declaration: every plain field, the file field's `FileRef` mirror, and references expanded with their carve-outs
- the table's plain `getRecord(id)` / `getRecords()` use the same projection via `defaultQuery(table)` — the documented `{ id, title? }` / `{ id, name?, email? }` reference shapes hold everywhere without N+1 fallback fetches
- an explicit query string or narrow `.select()` passes through untouched, opting into exactly what it selects (reference reads degrade to `{ id }` if you don't expand)

`$select` never includes `__metadata` (the legacy surface rejects it as selectable); the etag rides along on responses and is hoisted to `$etag` by the table transform.

## Document libraries

Document libraries are lists, so all field types apply to their items — the file content itself goes through the dedicated `document()` field:

```typescript
const Docs = new SharePointTable({
  client, listTitle: "Shared Documents",
  fields: { id: primaryKey(), title: title(), file: document() },
});

// create: upload-first (Files/Add), then metadata MERGE with If-Match: *
await Docs.createRecord({ title: "Report", file: { name: "report.pdf", data: blob } });

// read: { name, url } — always non-null: every doc-lib item is a file.
//     If the item has no file channel (document() wrongly declared on a
//     plain list), the read throws instead of returning null.
const doc = await Docs.getRecord(4);
const bytes = await Docs.getDocumentContent(4); // Blob

// update content: the name must match FileLeafRef (rename creates a new item)
await Docs.updateRecord(4, { file: { name: "report.pdf", data: newBlob } });

// delete: file + item share one lifecycle
await Docs.deleteRecord(4);
```

Notes:

- `{ name, data }` values never touch the item body — an explicit content upload
- `overwrite` defaults `true` when passing `{ data }` (that's the explicit opt-in); `document({ overwrite: false })` fails on duplicate names instead
- there is no "clear content" operation; large-file resumable sessions are out of scope

## Etags and concurrency

- reads hoist `__metadata.etag` to the `$etag` property
- **write precedence**: explicit `options.ifMatch` → the record's `$etag` → no precondition (fire when intentionally force-merging with `"*"`)

## Tables and the sync engine

`SharePointTable` structurally satisfies the generic offline sync engine's `SyncTable` contract (`@dataverse-schema/sync`), so the offline mutation queue works over lists unchanged — see that package's docs.

## Provisioning lists and columns

The schema doubles as deployment metadata: per-kind pure definers emit CAML `<Field/>` XML for the legacy `fields/createfieldasxml` endpoint, and thin runners apply them. Definers are independent exports — importing only what you use tree-shakes cleanly.

```typescript
import { defineField, createList, applyListFields, defineText, defineNumber }; // ← import only the definers you need

// Whole-table provisioning (creates the list — 100, or 101 when the table
// declares a document() field — then applies every column idempotently):
import { provisionList, resolveListId } from "sharepoint-schema";
await provisionList(client, Tasks, {
  lookupListIds: { project: await resolveListId(client, "Projects") },
});

// Or apply definitions to an existing list (idempotent: skips existing
// matching columns, throws on type drift):
await createList(client, { title: "Tasks" });
await applyListFields(client, "Tasks", [
  defineField(Tasks.fields.description),
  defineText(Tasks.fields.description),   // ← or pick per-kind definers
]);

// Lifecycle helpers: deleteList(client, "Tasks"), renameList(client, "Tasks", "Tasks v2")
```

Strictness: anything the legacy surface can't express throws — `document()` columns (the file *is* the item), the built-in `Id`/`Title` columns (skipped, not created), choice/multiChoice fields lacking `choices`, and lookup fields without `targetListId`. A same-name existing column with a different stored type throws (schema drift) rather than silently re-narrowing.

## Development

```bash
# from the repository root
npm test          # all workspaces
npm run typecheck # both packages

cd packages/sharepoint
npx vitest run    # this package's tests only
```

Tests are pure unit tests (no HTTP) — they exercise field transforms, query rendering, and URL/payload building only.
