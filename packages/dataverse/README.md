# Dataverse Web API TypeScript Library

A strongly-typed TypeScript library for working with the Microsoft Dataverse Web API. Provides schema definitions, type inference, query builders (OData + FetchXML), validation (via [valibot](https://valibot.dev/)), and CRUD operations.

The offline engine and the TanStack DB adapters ship as optional subpath entries — `dataverse-schema/sync` and `dataverse-schema/sync/tanstack` — so the root entry stays free of IndexedDB and `@tanstack/db` code.

## Installation

```bash
npm i dataverse-schema

# Only if you use the TanStack DB collection adapters:
npm i @tanstack/db
```

| Entry point | What it provides |
| --- | --- |
| `dataverse-schema` | Client, tables, fields, query builders, validation |
| `dataverse-schema/provision` | Additive table/column/lookup provisioning from the same table definitions |
| `dataverse-schema/sync` | Offline `SyncEngine`, Dataverse adapter, conflict/error helpers |
| `dataverse-schema/sync/tanstack` | TanStack DB collection factories |

`@tanstack/db` is an optional peer of this package; importing the root or
`dataverse-schema/sync` never requires it.

## Quick Start

```typescript
import {
  DataverseClient,
  DataverseTable,
  primaryKey,
  string,
  number,
  boolean,
  date,
  list,
  lookup,
  lookupId,
  collection,
  collectionIds,
  Infer,
} from "dataverse-schema";

// 1. Create a client
const client = new DataverseClient({ url: "https://org.crm.dynamics.com" });

// 2. Define your table schema
const Address = new DataverseTable({
  client,
  entitySetName: "addresses",
  logicalName: "address",
  fields: {
    id: primaryKey("addressid"),
    street: string("street_Address"),
    zip: number("zip_code"),
  },
});
type AddressType = Infer<typeof Address>;
// { id: GUID; street: string; zip: number }

const Person = new DataverseTable({
  client,
  entitySetName: "people",
  logicalName: "person",
  fields: {
    pk: primaryKey("personid"),
    name: string("fullname"),
    age: number("person_age"),
    active: boolean("active"),
    dob: date("person_dob"),
    gender: list("gender", ["M", "F"] as const),
    primaryAddressId: lookupId("person_Address", () => Address),
    primaryAddress: lookup("person_Address", () => Address),
    addressIds: collectionIds("person_Address_person", () => Address),
    addresses: collection("person_Address_person", () => Address),
  },
});
type PersonType = Infer<typeof Person>;
// {
//   pk: GUID;
//   name: string;
//   age: number;
//   active: boolean;
//   dob: Date;
//   gender: "M" | "F" | null;
//   primaryAddressId: GUID | null;
//   primaryAddress: AddressType | null;
//   addressIds: GUID[];
//   addresses: AddressType[];
// }
```

## DataverseClient

The `DataverseClient` handles authentication, URL construction, and HTTP headers for all API calls.

```typescript
import { DataverseClient } from "dataverse-schema";

const client = new DataverseClient({
  url: "https://org.crm.dynamics.com",
  token: "Bearer ...",               // Optional: bearer token
  impersonateByAAId: "aad-object-id", // Optional: Azure AD impersonation (CallerObjectId)
  impersonateByUserId: "user-guid",   // Optional: Dataverse user impersonation (MSCRMCallerID)
  prefer: ["return=representation"],  // Optional: OData Prefer header(s)
  headers: { "My-Custom-Header": "value" },
});
```

### Client Methods

| Method | Description |
|--------|-------------|
| `fetch(resource, options?)` | Raw request escape hatch (`raw: true` returns the `Response`) |
| `getRecord(entitySet, id, options?)` | GET a single record |
| `getRecords(entitySet, options?)` | GET multiple records (auto-paginates via `@odata.nextLink`) |
| `iterateRecords(entitySet, options?)` | Async generator yielding one record at a time |
| `iteratePages(entitySet, options?)` | Async generator yielding pages of records |
| `postRecord(entitySet, value, options?)` | POST create record |
| `patchRecord(entitySet, id, value, options?)` | PATCH update/upsert (honors `ifMatch`/`ifNoneMatch`) |
| `deleteRecord(entitySet, id, options?)` | DELETE record (optional `ifMatch`) |
| `updatePropertyValue(entitySet, id, propertyName, value)` | PUT a single property |
| `deletePropertyValue(entitySet, id, propertyName)` | DELETE a property |
| `getPropertyValue(entitySet, id, propertyName)` | GET a property value |
| `getPropertyRawValue(entitySet, id, propertyName)` | GET raw binary/text value |
| `getPropertyRawValueURL(entitySet, id, propertyName)` | URL for `/$value` endpoint |
| `activateRecord(entitySet, id)` | Set statecode=0 |
| `deactivateRecord(entitySet, id)` | Set statecode=1 |
| `associateRecord(entitySet, parentId, propName, childSet, childId)` | Associate via `/$ref` |
| `dissociateRecord(entitySet, parentId, propName, childId?)` | Dissociate via `/$ref` |
| `associateRecordToList(entitySet, parentId, propName, childSet, childPK, childIds)` | Sync collection associations |
| `getAssociatedRecords(entitySet, id, navProp, options?)` | GET associated records |
| `getAssociatedRecord(entitySet, id, navProp, options?)` | GET a single associated record |
| `updateFileProperty(entitySet, id, propName, filename, body)` | Upload file content |
| `createMultiple(entitySet, records)` | `CreateMultiple` action |
| `updateMultiple(entitySet, records)` | `UpdateMultiple` action |
| `deleteMultiple(entitySet, ids)` | `DeleteMultiple` action |
| `executeAction(actionName, params?)` | Unbound action |
| `executeBoundAction(entitySet, actionName, params?, id?)` | Bound action |
| `executeFunction(functionName, params?)` | Unbound function |
| `executeBoundFunction(entitySet, id, functionName, params?)` | Bound function |
| `batch(fn)` | Group multiple requests into a `$batch` call |
| `changeset(fn)` | Group requests into a transactional changeset within a batch |
| `getImageFullSizeURL(entitySet, id, propName)` | Full-size image URL |
| `getImageDownloadURL(entitySet, id, propName)` | Download image URL |

## CRUD Operations

```typescript
// Insert (returns the new record GUID)
const newId = await Person.createRecord({ name: "Jane", age: 30 });

// Read (single) — returns null when the record does not exist
const person = await Person.getRecord(newId);

// Read (all with filters)
const results = await Person.getRecords({ filter: "age gt 20", top: 10 });

// Update
await Person.updateRecord(newId, { name: "Jane Updated" });

// Upsert (creates or updates based on primary key presence)
await Person.upsertRecord(undefined, { name: "New Person" });      // INSERT
await Person.upsertRecord(newId, { name: "Updated" });             // UPDATE

// Delete
await Person.deleteRecord(newId);

// Optimistic concurrency & signals (updateRecord defaults ifMatch to "*")
await Person.updateRecord(newId, { name: "Jane Updated" }, { ifMatch: 'W/"123456"' });
await Person.deleteRecord(newId, { ifMatch: 'W/"123456"', signal: controller.signal });

// Property-level operations
await Person.updatePropertyValue("age", newId, 25);
const age = await Person.getPropertyValue("age", newId);
await Person.deletePropertyValue("age", newId); // throws for fields marked readonly

// Activation
await Person.activateRecord(newId);
await Person.deactivateRecord(newId);

// Navigation
await Person.associateRecord("primaryAddressId", newId, addressId);
await Person.dissociateRecord("primaryAddressId", newId);
```

### Navigation Properties on Reads

`getRecord`, `getRecords`, `iterateRecords` and `iteratePages` auto-expand every navigation
property declared on the table, each with a sub-select listing all of the related table's value
and lookup-ID columns. Lookups nest recursively; the lookup-ID column of an expanded lookup is
dropped from `$select` and recovered from the expanded record. Writes (`createRecord`,
`updateRecord`, `upsertRecord`) return flat representations.

Two Web API limits mean some shapes cannot be expanded. Rather than silently dropping data, the
query builder **throws**:

| Shape | Why | Fix |
|-------|-----|-----|
| A collection expand nested inside another expand | One-to-many `$expand` is only legal at the top level | Narrow the table to drop one of the two navigation properties |
| The same relationship reachable from two branches | A relationship may be expanded only once per query | `pickProperties` to keep one branch |
| Both sides of a self-referencing relationship (e.g. `parentaccountid` and its inverse `contacts`) | The Web API cross-wires the two expansions — the lookup comes back `null` and the related record lands under the collection key | Declare/narrow to one side |

A relationship is identified by its **owner table + logical name**, so two different tables that each
have an `owner` lookup expand fine in the same query. The only ambiguous case is self-referencing
relationships, whose two sides carry different logical names and can't be told apart from the schema
alone — those are always rejected together.

```typescript
// ✅ value-only read — no navigation properties, nothing to expand
const people = await Person.getRecords({ filter: "age gt 20" });

// ✅ plain lookups: expand and nest freely
const orders = await Customer.getRecords();     // expands each lookup on Customer

// ❌ throws: both sides of the Account self relationship (parentaccountid + contacts)
await Account.getRecord(id);

// ✅ read one side: narrow the tables on BOTH ends of the relationship
const AccountLeaf = Account.omitProperties("contacts");            // related side: stops the walk
const Accounts = Account.appendProperties({
  parent: lookup("parentaccountid", () => AccountLeaf),            // drop `contacts`, keep `parent`
});
const a = await Accounts.getRecord(id);                            // expands parentaccountid only
```

### Iterating Large Result Sets

Both iterators lazily follow `@odata.nextLink`; a `break` stops further requests.

```typescript
// One record at a time — records within a page are yielded synchronously
for await (const person of Person.iterateRecords({ filter: "age gt 20" }, { pageSize: 100 })) {
  console.log(person.name);
}

// Or page by page
for await (const page of Person.iteratePages({ filter: "age gt 20" }, { pageSize: 100 })) {
  console.log(page.length); // sync array work per page
}
```

### Bulk Operations

```typescript
// CreateMultiple / UpdateMultiple / DeleteMultiple (single API call each)
await Account.createMultiple([{ name: "Acme" }, { name: "Beta" }]);
await Account.updateMultiple([
  { id: guid1, name: "Acme Updated" },
  { id: guid2, name: "Beta Updated" },
]);
await Account.deleteMultiple([guid1, guid2]);
```

## Query Building

### Option 1: OData Query String Helpers

```typescript
import { and, or, not, eq, gt, contains, orderby, select, expand, keys } from "dataverse-schema";

const results = await Person.getRecords({
  filter: and(
    eq(Person.fields.gender.fromDataverseName, "M"),
    gt(Person.fields.age.fromDataverseName, 21)
  ),
  orderby: { name: "asc" },
  top: 100,
});

// Alternate key lookup
const person = await Person.getRecord(
  keys({ [Person.fields.name.fromDataverseName]: "John Doe" })
);

// Query string building
const query = select("fullname", "age") + "&" + orderby({ fullname: "asc" });
const records = await Person.getRecords({ filter: "age gt 20", top: 10 });
```

All filter operators:
`eq`, `ne`, `gt`, `ge`, `lt`, `le`, `contains`, `startsWith`, `endsWith`, `isNull`, `isNotNull`, `compare`, `isActive`, `isInactive`

Logical: `and`, `or`, `not`

Aggregation: `groupby`, `average`, `sum`, `min`, `max`, `count`

Lambda: `any`, `all`

> **`all()` is not vacuously true in Dataverse.** Over an empty related collection it evaluates to
> false, so parent rows with no related rows are *excluded* rather than matched (this differs from
> OData spec, where `all()` over an empty collection is true). If you want "no related rows" to
> match, filter with `not(any(...))` instead.

CRM Query Functions: `Above`, `Below`, `Between`, `In`, `Today`, `Yesterday`, `Tomorrow`, `Last7Days`, `Next7Days`, `ThisMonth`, `LastMonth`, `NextMonth`, `ThisWeek`, `LastWeek`, `NextWeek`, `ThisYear`, `LastYear`, `NextYear`, `On`, `OnOrAfter`, `OnOrBefore`, `LastXDays`, `NextXDays`, `LastXHours`, `OlderThanXDays`, `OlderThanXHours`, `OlderThanXMinutes`, `OlderThanXMonths`, `OlderThanXWeeks`, `OlderThanXYears`, and many more.

### Option 2: Fluent ODataQuery Builder (type-safe)

```typescript
import { fetchOdata, and, eq, gt } from "dataverse-schema";

const results = await fetchOdata(Person)
  .select("name", "age", "dob")
  .filter((f) => and(
    eq(f.gender, "M"),
    gt(f.age, 21)
  ))
  .orderby((f) => f.name)
  .top(100)
  .execute();
```

#### OData Aggregation with `apply()`

```typescript
import { fetchOdata, groupby, sum, average, count } from "dataverse-schema";

const results = await fetchOdata(Person)
  .apply((v) => ({
    city: groupby(v.city),
    totalAge: sum(v.age),
    avgAge: average(v.age),
  }))
  .filter((f) => gt(f.age, 18))
  .orderby((r) => r.totalAge, "desc")
  .top(10)
  .execute();
// results: Array<{ city: string | null; totalAge: number; avgAge: number }>
```

### Option 3: FetchXML Builder

```typescript
import { fetchXml, and, or, eq, gt, compare } from "dataverse-schema";

// Basic query with typed filter functions
const results = await fetchXml(Person)
  .select((f) => ({ full_name: f.name, person_age: f.age }))
  .filter((f) => gt(f.age, 21))
  .orderby((f) => f.name, "desc")
  .top(50)
  .execute();

// FetchXML aggregation with apply()
const aggResults = await fetchXml(Person)
  .apply((v) => ({
    city: groupby(v.city),
    totalAge: sum(v.age),
  }))
  .filter((f) => gt(f.age, 0))
  .orderby((f) => f.city)
  .execute();

// With execute options
const results2 = await fetchXml(Person)
  .select((f) => ({ name: f.name }))
  .execute({ useRawOrderBy: true, aggregateLimit: 50000 });
```

Joins are supported through `.join(linkType, tableOrIntersect, subquery)` where `linkType` is one of `"inner"`, `"outer"`, `"any"`, `"not any"`, `"all"`, `"not all"`, `"exists"`, `"in"`, or `"matchfirstrowusingcrossapply"`.

**Result types for joins:** fields selected through a join are merged into the result type. `inner` joins produce required fields (a matching row always exists); `outer` joins make the joined fields optional (`T | undefined`) — when the join matches no row, the alias columns are absent. Filter-only link types (`any`, `exists`, …) contribute no result fields — the callback has `.filter()` only.

### FetchXML Conditions

```typescript
// Typed filter functions (recommended) — type-safe, work for OData and FetchXML
eq(field, value)         // equality
ne(field, value)         // not equal
gt(field, value)         // greater than
ge(field, value)         // greater than or equal
lt(field, value)         // less than
le(field, value)         // less than or equal
isNull(field)            // null check
isNotNull(field)         // not null check
contains(field, value)   // string contains
startsWith(field, value) // string starts with
endsWith(field, value)   // string ends with

// Field-to-field comparison
compare(field, operator, otherField)

// All produce FilterExpr objects that serialize to FetchXML via the builder:
// eq(f.statuscode, 1) → '<condition attribute="statuscode" operator="eq" value="1" />'
// compare(f.field1, "eq", f.field2) → '<condition attribute="field1" operator="eq" valueof="field2" />'

// Logical combinations (accept FilterExpr or raw strings)
and(eq(statuscode, 0), eq(statuscode, 1))
or(eq(statuscode, 0), eq(statuscode, 1))
```

### FetchXML Raw Strings

For operators not covered by the typed functions (e.g. `between`, `in`, `eq-userid`), or for cross-entity alias references, raw XML strings can be passed to `.filter()`:

```typescript
.filter(`<condition attribute="numberofemployees" operator="between"><value>6</value><value>20</value></condition>`)

.filter(`<link-entity name='account' from='primarycontactid' to='contactid' link-type='any'>
  <filter type='and'>
    <condition attribute='name' operator='eq' value='Contoso' />
  </filter>
</link-entity>`)
```

### FetchXML Execute Options

| Option | Type | Description |
|--------|------|-------------|
| `datasource` | `string` | Sets the `datasource` attribute on `<fetch>` |
| `lateMaterialize` | `boolean` | Sets `latematerialize="true"` |
| `aggregateLimit` | `number` | Sets `aggregatelimit` attribute |
| `useRawOrderBy` | `boolean` | Sets `useraworderby="true"` |
| `options` | `string` | Sets `options` attribute |

### FetchXML Auto-Selection

When `select()` is not called, the builder automatically includes every value-kind field (`string`, `number`, `boolean`, date/datetime, choice/list/multiChoice, json, primary key, file, image) plus lookup ID fields; navigation properties are never expanded automatically. Each result row includes an `ETAG` property (the string key `"$etag"`) for optimistic concurrency:

```typescript
import { ETAG } from "dataverse-schema";
const etag = record[ETAG];
```

### Filter-Only Link Types

Link types `any`, `not any`, `all`, `not all`, `exists`, and `in` only render filters inside `<link-entity>` — they skip `<attribute>` and `<order>` elements:

```typescript
fetchXml(Contact).filter((f) => or(
  eq(f.statecode, "1"),
  `<link-entity name='account' from='primarycontactid' to='contactid' link-type='any'>
    <filter type='and'>
      <condition attribute='name' operator='eq' value='Contoso' />
    </filter>
  </link-entity>`,
))
```

## Validation

All fields and tables carry a Standard Schema V1 (`ValidationSchema<T> = StandardSchemaV1<T, T>`) — any compliant library works, including [valibot](https://valibot.dev/), Zod, and ArkType. Field factories apply a sensible built-in schema (e.g. `number()` checks `typeof value === "number"`, `string()` checks `typeof value === "string"`, nullable fields allow `null`) that you can override with the `schema` option.

```typescript
import * as v from "valibot";
import { string, DataverseTable, standardSafeParse, ValidationSchema } from "dataverse-schema";

const nameField = string("fullname", {
  schema: v.pipe(v.nullable(v.string()), v.maxLength(100)),
});

// Access the compiled schema
const schema: ValidationSchema<string | null> = nameField.schema;

// Validate with the built-in Standard Schema helpers (works with any provider)
const result = await standardSafeParse(nameField.schema, "");

// Table-level validation
const Person = new DataverseTable({
  client,
  entitySetName: "people",
  logicalName: "person",
  fields: { /* ... */ },
  schema: v.object({ name: v.string(), age: v.number() }),
});

// Access the compiled table schema
const tableSchema = Person.getSchema();
```

Use `standardParse` / `standardSafeParse` (from `dataverse-schema`) against `field.schema` or `table.getSchema()` to validate values. Validation errors surface as Standard Schema issues. `{ required: true }` composes in a `required` check that rejects `null`/`undefined`/empty strings.

The enum-like factories validate membership out of the box: `list()` rejects values outside its array, `choice()` rejects labels outside their option map, and `multiChoice()` rejects arrays containing values outside its `choices`.

## Batching

```typescript
await client.batch(async () => {
  await Person.upsertRecord(undefined, { name: "Alice", age: 30 });
  await Person.upsertRecord(undefined, { name: "Bob", age: 25 });
});

// Transactional changeset
await client.changeset(async () => {
  await Person.createRecord({ name: "Charlie" });
  await Address.createRecord({ street: "123 Main" });
});
```

## Table Composition

```typescript
// Add or override properties
const PersonWithNickname = Person.appendProperties({
  nickname: string("nickname"),
});

// Remove properties
const PersonWithoutAge = Person.omitProperties("age");

// Select subset
const PersonNameOnly = Person.pickProperties("name");
```

## Field Types

| Factory | TypeScript Type (read) | New-record default | Description |
|---------|----------------|---------|-------------|
| `string(name)` | `string` | `""` | Text field. Non-null by design: Dataverse coerces empty strings to `null`, so a missing value reads as `""` |
| `number(name)` | `number \| null` | `null` | Numeric field. Nullable by default; wire `null` reads as `null` |
| `boolean(name)` | `boolean` | `false` | Boolean field. Non-null by design: Dataverse never sends `null` |
| `primaryKey(name)` | `GUID` | `crypto.randomUUID()` | Auto-generated UUID |
| `date(name)` | `Date \| null` | `null` | Date-only (no time). Nullable by default |
| `datetime(name)` | `Date \| null` | `null` | Date/time. Nullable by default |
| `list(name, values)` | `T \| null` | `null` | Choice/picklist (array of allowed values) |
| `choice(name, choices)` | `T[keyof T] \| null` | `null` | Choice/picklist (number→label map) |
| `multiChoice(name, choices)` | `("A" \| "B")[]` | `[]` | Multi-select picklist; reads CSV as label arrays, writes CSV, `null`/nothing-selected reads as `[]` |
| `json(name, { schema })` | `T` | per schema | JSON column validated by a required schema |
| `formatted(name)` | `string \| null` | `null` | Formatted display value (always read-only) |
| `image(name)` | `ImageRef \| null` | `null` | Image column (`url`, `fullSizeUrl`, `data`); upload/clear via the `data` channel |
| `file(name)` | `FileRef \| null` | `null` | File column (`name`, `url`, `data`); upload/clear via the `data` channel |
| `lookupId(name, getTable)` | `GUID \| null` | `null` | Lookup reference only |
| `lookup(name, getTable)` | `T \| null` | `null` | Lookup with expanded data |
| `collectionIds(name, getTable)` | `GUID[]` | `[]` | Collection of references |
| `collection(name, getTable)` | `T[]` | `[]` | Collection with expanded data |

Calling `choice(name)` **without a choices map** is just a numeric column: it returns a `number`-typed field (nullable `number | null`), exactly like `number()` — use it for option sets not known at compile time.

All factories accept an optional trailing `options` object (`{ default?, required?, readonly?, schema?, system?, displayName?, description? }`) — including the navigation factories (`lookup`, `lookupId`, `collection`, `collectionIds`).

Kind-specific options are accepted where they make sense: `string({ maxLength, format, autoNumberFormat })`, `number({ columnType, minValue, maxValue, precision })`, `boolean({ trueLabel, falseLabel })`, `json({ maxLength })`, `file({ maxSizeInKB })` (default 32768, API maximum 10485760) and `image({ maxSizeInKB, canStoreFullImage, primary })` (default 10240, API maximum 30720). The same values drive `dataverse-schema/provision`.

Allowed values are exposed at runtime as frozen arrays: `list().list`, `choice().choices`, and `multiChoice().choices`.

**Null & empty reads:** the nullability model is explicit per field kind:
- *Nullable fields* (`number`, `datetime`, `date`, `choice`, `lookupId`) read `T | null` — a wire `null` stays `null`; the new-record default is `null`. A `{ default: X }` option only affects locally-created records.
- *Non-null by wire semantics*: `string()` (empty string ≡ `null` on the wire → reads `""`), `boolean()` (Dataverse never sends `null` → reads `false`), `multiChoice()` (`null` ≡ "nothing selected" → reads `[]`), `primaryKey()`.
- *System fields* (`{ system: true }`): server-managed columns Dataverse always populates (`createdon`, `statecode`, …). They imply `readonly`, read non-null (`Date`, not `Date | null`), and a wire `null` **fails fast** with an error. Sugar factories exist for the fixed-name ones: `createdOn()`, `modifiedOn()`, `versionNumber()`, `stateCode()`, `createdBy()`.
- `{ required: true }` is validation-only: it rejects `null`/`undefined`/empty strings through `table.schema`, but does not change read types or transforms.

Values that are present but malformed (e.g. an unparseable datetime string) always throw.

**Circular table references:** `lookupId`/`collectionIds` thunks are intentionally untyped (`() => any`) so two tables can reference each other without creating TypeScript inference cycles. If two tables reference each other through `lookup`/`collection` on **both** ends, TypeScript cannot infer the mutually recursive types (TS7022) — break the cycle by using `lookupId`/`collectionIds` for one direction, or annotate one table explicitly.

`ImageRef` and `FileRef` shapes:

```typescript
type ImageRef = { readonly url?: string; readonly fullSizeUrl?: string; data?: Blob | null };
type FileRef = { name?: string; url?: string; data?: Blob | null };
```

### Read-only & Server-Managed Fields

Fields created with `{ readonly: true }` are never written: they are excluded from create/update request bodies, and calling `updatePropertyValue` or `deletePropertyValue` on them throws (`Cannot update readonly property` / `Cannot delete readonly property`). `formatted()` fields are always read-only because their value is computed by Dataverse.

File and image columns are *server-managed* rather than read-only: their column value is never included in a request body. Instead, content flows through an explicit `data` channel — include `data` in the record value during `createRecord`, `updateRecord`, `upsertRecord`, or `updatePropertyValue`:

```typescript
// Upload on create/update
const id = await Person.createRecord({ name: "Jane", doc: { name: "report.pdf", data: pdfBlob } });
await Person.updateRecord(id, { pic: { data: imageBlob } });

// Upload through the property-level API
await Person.updatePropertyValue("doc", id, { name: "final.pdf", data: pdfBlob });

// Clear explicitly with data: null
await Person.updateRecord(id, { pic: { data: null } });

// Dedicated helpers are also available
await Person.deleteFile(id, "doc");
await Person.deleteImage(id, "pic");
```

Values without an explicit `data` property (e.g. a stale `FileRef`/`ImageRef` read earlier in the session) are ignored — no accidental uploads or deletions.

## Dataverse Functions

```typescript
import { WhoAmI, RetrieveTotalRecordCount, RetrieveAadUserRoles, RetrieveChoices, mapChoices } from "dataverse-schema";

const whoami = await WhoAmI(client);
// { BusinessUnitId: GUID, UserId: GUID, OrganizationId: GUID }

const count = await RetrieveTotalRecordCount(client, "account");

const roles = await RetrieveAadUserRoles(client, "aad-user-id");

const choices = await RetrieveChoices(client, "gender");
// [{ value: number; color: string; label: string; description: string }]
```

## Provisioning tables and columns

`dataverse-schema/provision` creates the tables, columns and lookups described by your
existing `DataverseTable` definitions. There is no second schema document — the runtime
definitions are the source of truth. Provisioning is **additive only**: it creates what is
missing and never updates or deletes an existing component.

```typescript
import { DataverseClient, DataverseTable, choice, lookup, number, primaryKey, string } from "dataverse-schema";
import { formatProvisionPlan, planProvision, provision } from "dataverse-schema/provision";

const client = new DataverseClient({ url: "https://org.crm.dynamics.com", token });

const Account = new DataverseTable({
  client,
  entitySetName: "accounts",
  logicalName: "account",
  fields: { id: primaryKey("accountid"), name: string("name") },
});

const Project = new DataverseTable({
  client,
  entitySetName: "nnsyc200_projects",   // must match what Dataverse creates
  logicalName: "nnsyc200_project",
  schemaName: "nnsyc200_Project",       // optional; derived from the logical name
  displayName: "Project",
  displayCollectionName: "Projects",
  description: "Delivery projects",
  primaryName: "name",                  // required to create the table
  fields: {
    id: primaryKey("nnsyc200_projectid"),
    name: string("nnsyc200_name", { displayName: "Project name", maxLength: 300 }),
    status: choice("nnsyc200_status", { 100000000: "Active", 100000001: "Closed" }),
    budget: number("nnsyc200_budget", { columnType: "money", precision: 2 }),
    account: lookup("nnsyc200_accountid", () => Account),
    created: createdOn(),
  },
});

// 1. Preview. Never writes.
const plan = await planProvision(client, [Project, Account]);
console.log(formatProvisionPlan(plan));

// 2. Apply. Plans first, then creates tables → columns → lookups and publishes once.
const { plan: applied, result } = await provision(client, [Project, Account], {
  solution: "MySolution", // optional MSCRM.SolutionUniqueName
});
```

Display labels default to the humanized logical name minus the publisher prefix
(`nnsyc200_due_date` → "Due Date"). Everything the definitions can express is used
directly: option values/labels, lookup targets, date-only vs date-and-time, required
levels (`required: true` → `ApplicationRequired`), auto-number formats, numeric kinds,
and file/image columns with their `maxSizeInKB` (plus `canStoreFullImage` and `primary`).

The plan classifies every component as `+` create, `=` skip or `!` conflict. Conflicts
block `provision()` entirely. Typical conflicts:

- an existing column has a different `AttributeTypeName`;
- the existing entity set or primary key differs from the definition (every request would
  target the wrong URL);
- a declared primary name column is missing from an existing table (Dataverse cannot add
  one after creation);
- a table would have to be created without `primaryName`, or with a logical name that has
  no customization prefix.

Skipped silently: `primaryKey`, `system` fields (including `createdOn()` etc.) and
`formatted`. Reported as warnings: `collection`/`collectionIds` (N:N is out of scope),
`list()` (app-level only) and dynamic `multiChoice()` (global option sets are not
provisioned).

File and image columns are created as `FileAttributeMetadata` / `ImageAttributeMetadata`.
`image(..., { primary: true })` is promoted with a follow-up metadata update on the column
the run just created, because Dataverse rejects `IsPrimaryImage` at create time; existing
image columns are never patched, and a conflicting primary image in the org is reported as
a conflict.

`buildProvisionPlan(tables, reader)` and `applyProvisionPlan(writer, tables, plan)` are
exported separately if you want to plug in your own metadata transport; `provision()` is
the batteries-included path over `DataverseClient`. If a run creates metadata but its
single publish step fails, `publishTables(client, [...logicalNames])` retries just the
publish — re-running the definitions would find nothing left to create.

Provisioning is safe to run against a real org:

- pass `signal` to cancel the in-flight request and stop the plan/apply loops;
- `timeoutMs` (default 60s) and `publishTimeoutMs` (default 180s) bound every request;
- metadata **reads** retry 429/5xx/network failures (`readRetries`, default 3, honoring
  `Retry-After`), while **writes are never retried** — a timed-out POST may already have
  been applied;
- definitions are checked for collisions before any request: duplicate logical names,
  schema names, entity set names and primary-name/column clashes throw instead of failing
  halfway through a run.

## Offline Sync + `@tanstack/db` Integration

The offline engine and the TanStack DB adapters ship as subpath entries of this
package — the root `dataverse-schema` entry has no offline or TanStack API.

### The offline engine

```typescript
import { SyncEngine } from "dataverse-schema/sync";
import { Person } from "./tables"; // a DataverseTable satisfies the SyncTable contract

const engine = new SyncEngine({
  name: "my-app",   // unique IDB database / BroadcastChannel / web-lock name
  version: 1,       // bump when the set of tables changes
  tables: [Person],
  // maxAttempts: 3, retryBaseDelay: 1_000, retryMaxDelay: 60_000,
  // overrideCreatedOn: true, flushOnOnline: true,
});
```

`dataverseSyncEngine({ ...sameOptions })` is a thin Dataverse preset that
injects the `$etag` reader and the Dataverse error-classifier. A plain
`SyncEngine` already defaults the etag reader to `$etag`; use the preset when
you also want the Dataverse-specific deterministic-failure rules.

Mutations are normally enqueued by the TanStack adapter. For manual control:

| Call | Purpose |
| --- | --- |
| `queueMutations(mutations)` | Durably append `QueuedMutation`s and apply optimistic rows |
| `flushQueue()` | Send the queue (serialized across tabs with Web Locks) |
| `getQueueCount()` | Pending mutation count |
| `getErroredMutations()` | Mutations awaiting resolution |
| `getConflictDetails(mutation)` | `{ server, fields, conflictingFields }` for a resolution UI |
| `retryErroredMutation(id, options?)` | `{}` retry · `{ force: true }` local wins · `{ useFreshEtag: true }` rebase on the server |
| `discardErroredMutation(id)` | Drop the local edit |
| `onMutationsChanged(listener)` | Redraw queue/errored state; returns an unsubscribe function |
| `close()` | Tear down timers, listeners, channel and IDB connection |

Retries run automatically: transient failures are re-attempted with exponential
backoff up to `maxAttempts`, while deterministic failures (concurrency
conflicts, duplicate keys, validation) move straight to the errored store.
`overrideCreatedOn` replays queued inserts with the offline transaction time as
`overriddenCreatedOn` (Dataverse requires the `prvOverrideCreatedOnCreatedBy`
privilege).

### TanStack DB collections

```typescript
import { createCollection } from "@tanstack/db";
import {
  offlineCollectionOptions,
  syncCollectionOptions,
  readonlyStorageCollectionOptions,
} from "dataverse-schema/sync/tanstack";

// Offline-first: hydrates from IndexedDB, pulls remote, queues writes.
const tasks = createCollection(
  offlineCollectionOptions<typeof Task.T>(engine, {
    table: Task,
    id: "open-tasks",       // defaults to entitySetName; must be unique per collection
    query: { top: 500 },    // passed through to getRecords/iterateRecords
    syncInterval: 30_000,
    requireVisible: true,   // skip remote work while the document is hidden
    readOnlyWhenOffline: false,
  }),
);

// Online-only polling collection (writes go straight to the server).
const contacts = createCollection(syncCollectionOptions<typeof Contact.T>({ table: Contact }));

// Read-only cached snapshot (reference data).
const currencies = createCollection(
  readonlyStorageCollectionOptions(engine, {
    id: "currencies",
    load: ({ signal }) => fetchCurrencies(signal),
    getKey: (row) => row.code,
  }),
);
```

For the read/write factories (`offlineCollectionOptions` and
`syncCollectionOptions`), `collection.utils.forceSync()` pulls a fresh snapshot
immediately. Cross-tab coordination uses `BroadcastChannel` + Web Locks: the
offline adapter broadcasts on the engine's channel (`name`), the online-only
factory on a channel keyed by the collection id, and flushes are serialized by
a Web Lock keyed by the engine name — keep those IDs unique if you run
multiple engines or collections.

### Migrating from `dataverse-schema-sync`

2.0.0 declared a dependency on the never-published `dataverse-schema-sync`
package, which made `npm install dataverse-schema` fail. From 2.0.1 onward the
engine lives inside `dataverse-schema`:

```diff
- import { SyncEngine } from "dataverse-schema";
- import { offlineCollectionOptions } from "dataverse-schema-sync/adapters/tanstack";
+ import { SyncEngine } from "dataverse-schema/sync";
+ import { offlineCollectionOptions } from "dataverse-schema/sync/tanstack";
```

## Utilities

```typescript
import { xml, toBase64, base64ImageToURL, getImageUrl, mapChoices, ETAG, mergeRecords, parseDateOnly, toDateOnly } from "dataverse-schema";

// XML template tag
const xmlString = xml`<fetch><entity name="account" /></fetch>`;

// Base64 image helpers
const b64 = await toBase64(fileInput.files[0]);
const url = base64ImageToURL(b64);
const imgUrl = getImageUrl("contact", "contactid", "some-guid");

// Date utilities
const date = parseDateOnly("2024-01-15");
const str = toDateOnly(new Date()); // "2024-01-15"

// ETag merging (for optimistic concurrency)
const merged = mergeRecords(oldRecords, newRecords);

// Option set mapping
const mapped = mapChoices(rawData);
```

## Contributions

Contributions are welcome! Please submit pull requests or create issues to suggest improvements or report bugs.
