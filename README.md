# Dataverse Web API TypeScript Library

A strongly-typed TypeScript library for working with the Microsoft Dataverse Web API. Provides schema definitions, type inference, query builders (OData + FetchXML), validation (via [valibot](https://valibot.dev/)), and CRUD operations.

## Installation

```bash
npm i dataverse-schema
```

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
// results: Array<{ city: string; totalAge: number; avgAge: number }>
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

All fields and tables carry a [valibot](https://valibot.dev/) schema. Field factories apply a sensible default schema (e.g. `number()` → `v.number()`, `string()` → `v.string()`) that you can override with the `schema` option.

```typescript
import * as v from "valibot";
import { string, DataverseTable, ValidationSchema } from "dataverse-schema";

const nameField = string("fullname", {
  schema: v.pipe(v.string(), v.minLength(2), v.maxLength(100)),
});

// Access the compiled schema
const schema: ValidationSchema<string> = nameField.schema;

// Validate a value with valibot
import { safeParse } from "valibot";
const result = safeParse(nameField.schema, "");
// result.issues[0].message describes the failure when unsuccessful

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

Use `v.parse` / `v.safeParse` (from `valibot`) against `field.schema` or `table.getSchema()` to validate values. Validation errors surface as valibot issues.

The enum-like factories validate membership out of the box: `list()` rejects values outside its array, `choice()`/`nullableChoice()` reject labels outside their option map, and `multiChoice()` rejects arrays containing values outside its `choices`.

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

| Factory | TypeScript Type | Default | Description |
|---------|----------------|---------|-------------|
| `string(name)` | `string` | `""` | Text field |
| `nullableString(name)` | `string \| null` | `null` | Nullable text |
| `number(name)` | `number` | `0` | Numeric field |
| `nullableNumber(name)` | `number \| null` | `null` | Nullable number |
| `boolean(name)` | `boolean` | `false` | Boolean field |
| `nullableBoolean(name)` | `boolean \| null` | `null` | Nullable boolean |
| `primaryKey(name)` | `GUID` | `crypto.randomUUID()` | Auto-generated UUID |
| `date(name)` | `Date` | today (fresh per call) | Date-only (no time) |
| `datetime(name)` | `Date` | `new Date()` | Date/time |
| `nullableDate(name)` | `Date \| null` | `null` | Nullable date-only |
| `nullableDateTime(name)` | `Date \| null` | `null` | Nullable date/time |
| `list(name, values)` | `T \| null` | `null` | Choice/picklist (array of allowed values) |
| `choice(name, choices)` | `T[keyof T]` (label) | first option | Choice/picklist (number→label map) |
| `nullableChoice(name, choices)` | `T[keyof T] \| null` | `null` | Nullable choice |
| `multiChoice(name, choices)` | `number[]` | `[]` | Multi-select picklist; reads CSV as `number[]`, writes CSV, empty selection writes `null`. Values are validated against `choices` |
| `json(name, { schema })` | `T` | per schema | JSON column validated by a required valibot schema |
| `formatted(name)` | `string \| null` | `null` | Formatted display value (always read-only) |
| `image(name)` | `ImageRef \| null` | `null` | Image column (`url`, `fullSizeUrl`, `data`); upload/clear via the `data` channel |
| `file(name)` | `FileRef \| null` | `null` | File column (`name`, `url`, `data`); upload/clear via the `data` channel |
| `lookupId(name, getTable)` | `GUID \| null` | `null` | Lookup reference only |
| `lookup(name, getTable)` | `T \| null` | `null` | Lookup with expanded data |
| `collectionIds(name, getTable)` | `GUID[]` | `[]` | Collection of references |
| `collection(name, getTable)` | `T[]` | `[]` | Collection with expanded data |

All factories accept an optional trailing `options` object (`{ default?, readonly?, schema? }`) — including the navigation factories (`lookup`, `lookupId`, `collection`, `collectionIds`).

Allowed values are exposed at runtime as frozen arrays: `list().list`, `choice().choices`, `nullableChoice().choices`, and `multiChoice().choices`.

**Null & empty reads:** Dataverse represents empty columns as explicit `null` or omits them entirely. Non-nullable fields fold both into their default (e.g. `datetime()` → now, `string()` → `""`). Use the `nullable*` factories to preserve empties as `null`. Values that are present but malformed (e.g. an unparseable datetime string) always throw.

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

## @tanstack/db Integration

A separate entry point provides `@tanstack/db` collection options and an offline sync store.

```typescript
import { dataverseCollectionOptions, DataverseSyncDB, MutationPersistenceError } from "dataverse-schema/tanstack-db";

// Live collection backed by Dataverse
const collection = new Collection({
  ...dataverseCollectionOptions(Person),
  // ... @tanstack/db config
});

// Offline-first collection with an IndexedDB mutation queue
const syncDb = new DataverseSyncDB({ databaseName: "offline" });
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

## `@tanstack/db` integration

This library also ships a `@tanstack/db` adapter (`dataverse-schema/tanstack-db`) with
online (polling) and offline-capable (IndexedDB-queued, cross-tab) collection builders.
See [`src/tanstack-db/README.md`](./src/tanstack-db/README.md) for full usage, options,
and durability/retry behavior.

## Contributions

Contributions are welcome! Please submit pull requests or create issues to suggest improvements or report bugs.
