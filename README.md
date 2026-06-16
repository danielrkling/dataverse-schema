# Dataverse Web API TypeScript Library

A strongly-typed TypeScript library for working with the Microsoft Dataverse Web API. Provides schema definitions, type inference, query builders (OData + FetchXML), validation, and CRUD operations.

## Installation

```bash
npm i dataverse-schema
```

## Quick Start

```typescript
import { DataverseClient, table, primaryKey, string, number, boolean, date, list, lookup, lookupId, collection, collectionIds, Infer } from "dataverse-schema";

// 1. Create a client
const client = new DataverseClient({ url: "https://org.crm.dynamics.com" });

// 2. Define your table schema
const Address = table(client, "addresses", {
  id: primaryKey("addressid"),
  street: string("street_Address"),
  zip: number("zip_code"),
});
type AddressType = Infer<typeof Address>;
// { id: GUID; street: string | null; zip: number | null }

const Person = table(client, "people", {
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
});
type PersonType = Infer<typeof Person>;
// {
//   pk: GUID;
//   name: string | null;
//   age: number | null;
//   active: boolean;
//   dob: Date | null;
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
  impersonateByAAId: "aad-object-id", // Optional: Azure AD impersonation
  impersonateByUserId: "user-guid",   // Optional: Dataverse user impersonation
  headers: { "My-Custom-Header": "value" },
});
```

### Client Methods

| Method | Description |
|--------|-------------|
| `getRecord(entitySet, id, query?)` | GET a single record |
| `getRecords(entitySet, query?)` | GET multiple records (auto-paginates via `@odata.nextLink`) |
| `postRecord(entitySet, value, query?)` | POST create record |
| `patchRecord(entitySet, id, value, query?)` | PATCH update record |
| `deleteRecord(entitySet, id)` | DELETE record |
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
| `getAssociatedRecords(entitySet, id, navProp, query?)` | GET associated records |
| `updateFileProperty(entitySet, id, propName, filename, body)` | Upload file |
| `batch(fn)` | Group multiple requests into a `$batch` call |
| `changeset(fn)` | Group requests into a transactional changeset within a batch |
| `getImageFullSizeURL(entitySet, id, propName)` | Full-size image URL |
| `getImageDownloadURL(entitySet, id, propName)` | Download image URL |

## CRUD Operations

```typescript
// Insert
const newId = await Person.insertRecord({ name: "Jane", age: 30 });

// Read (single)
const person = await Person.getRecord(newId);

// Read (all with filters)
const results = await Person.getRecords({ filter: "age gt 20", top: 10 });

// Update
await Person.updateRecord(newId, { name: "Jane Updated" });

// Upsert (creates or updates based on primary key presence)
await Person.upsertRecord({ name: "New Person" });           // INSERT
await Person.upsertRecord({ pk: newId, name: "Updated" });   // UPDATE

// Delete
await Person.deleteRecord(newId);

// Property-level operations
await Person.updatePropertyValue("age", newId, 25);
const age = await Person.getPropertyValue("age", newId);
await Person.deletePropertyValue("age", newId);

// Activation
await Person.activateRecord(newId);
await Person.deactivateRecord(newId);

// Navigation
await Person.associateRecord("primaryAddressId", newId, addressId);
await Person.dissociateRecord("primaryAddressId", newId);
```

## Query Building

### Option 1: OData Query String Helpers

```typescript
import { and, or, not, equals, greaterThan, lessThanOrEqual, contains, orderby, select, expand, keys } from "dataverse-schema";

const results = await Person.getRecords({
  filter: and(
    equals(Person.fields.gender.fromDataverseName, "M"),
    greaterThan(Person.fields.age.fromDataverseName, 21)
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
`equals`, `notEquals`, `greaterThan`, `greaterThanOrEqual`, `lessThan`, `lessThanOrEqual`, `contains`, `startsWith`, `endsWith`, `isNull`, `isNotNull`, `compare`, `isActive`, `isInactive`

Logical: `and`, `or`, `not`

Aggregation: `groupby`, `aggregate`, `average`, `sum`, `min`, `max`, `count`

Lambda: `any`, `all`

CRM Query Functions: `Above`, `Below`, `Between`, `In`, `Today`, `Yesterday`, `Tomorrow`, `Last7Days`, `Next7Days`, `ThisMonth`, `LastMonth`, `NextMonth`, `ThisWeek`, `LastWeek`, `NextWeek`, `ThisYear`, `LastYear`, `NextYear`, `On`, `OnOrAfter`, `OnOrBefore`, `LastXDays`, `NextXDays`, `LastXHours`, `OlderThanXDays`, `OlderThanXHours`, `OlderThanXMinutes`, `OlderThanXMonths`, `OlderThanXWeeks`, `OlderThanXYears`, and many more.

### Option 2: Fluent ODataQuery Builder (type-safe)

```typescript
import { from } from "dataverse-schema";

const results = await from(Person)
  .select("name", "age", "dob")
  .where((f) => and(
    equals(f.gender, "M"),
    greaterThan(f.age, 21)
  ))
  .orderby((f) => desc(f.name))
  .top(100)
  .includeCount()
  .execute();
```

### Option 3: FetchXML Builder

```typescript
import { fetchXml } from "dataverse-schema";

const results = await fetchXml((q) =>
  q.from(Person)
    .select((f) => ({ full_name: f.name, person_age: f.age }))
    .where((f) => `age gt 21`)
    .innerJoin(Address, (f) => f.primaryAddressId, (f) => f.id, (q) =>
      q.where((f) => contains(f.street, "Main"))
    )
    .orderby((f) => desc(f.name))
    .top(50)
).execute();
```

## Validation

All fields and tables implement the [Standard Schema V1](https://github.com/standard-schema/standard-schema) specification.

```typescript
import { required, pattern, email, numeric, integer, minValue, maxValue, minLength, maxLength } from "dataverse-schema";

const nameField = string("fullname")
  .check(required())
  .check(minLength(2))
  .check(maxLength(100));

// Get issues array
const issues = nameField.getIssues(null);
// [{ message: "Required", path: [] }]

// Validate (Standard Schema V1 compliant)
const result = nameField.validate("");
// { issues: [{ message: "Required", path: [] }] }
// or { value: "Alice" }

// Parse (throws on invalid)
const value = nameField.parse("Alice");

// Field-level validation
const validation = Person.validate({ name: 123 });
// { issues: [{ message: "Not of type string", path: ["name"] }] }
```

### Built-in Validators

| Validator | Description |
|-----------|-------------|
| `required()` | Value must not be null or undefined |
| `pattern(regex, msg?)` | Must match regex |
| `email()` | Must be valid email format |
| `numeric()` | Must be a number |
| `integer()` | Must be an integer |
| `minValue(n)` | Must be >= n |
| `maxValue(n)` | Must be <= n |
| `minLength(n)` | Length must be >= n |
| `maxLength(n)` | Length must be <= n |
| `isType(type)` | Must be of given typeof |
| `isTypeOrNull(type)` | Must be of given type or null |

## Batching

```typescript
await client.batch(async () => {
  await Person.upsertRecord({ name: "Alice", age: 30 });
  await Person.upsertRecord({ name: "Bob", age: 25 });
});

// Transactional changeset
await client.changeset(async () => {
  await Person.insertRecord({ name: "Charlie" });
  await Address.insertRecord({ street: "123 Main" });
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
| `primaryKey(name)` | `GUID` | `crypto.randomUUID()` | Auto-generated UUID |
| `date(name)` | `Date \| null` | `null` | Date-only (no time) |
| `datetime(name)` | `Date` | `new Date()` | Date/time |
| `nullableDate(name)` | `Date \| null` | `null` | Nullable date-only |
| `nullableDateTime(name)` | `Date \| null` | `null` | Nullable date/time |
| `list(name, values)` | `T \| null` | `null` | Choice/picklist |
| `image(name)` | `string \| null` | `null` | Base64 image |
| `file(name)` | `string` | `""` | File name (read-only) |
| `formatted(name)` | `string \| null` | `null` | Formatted value (read-only) |
| `lookupId(name, getTable)` | `GUID \| null` | `null` | Lookup reference only |
| `lookup(name, getTable)` | `T \| null` | `null` | Lookup with expanded data |
| `collectionIds(name, getTable)` | `GUID[]` | `[]` | Collection of references |
| `collection(name, getTable)` | `T[]` | `[]` | Collection with expanded data |

## Dataverse Functions

```typescript
import { WhoAmI, RetrieveTotalRecordCount, RetrieveAadUserRoles, RetrieveChoices } from "dataverse-schema";

const whoami = await WhoAmI(client);
// { BusinessUnitId: GUID, UserId: GUID, OrganizationId: GUID }

const count = await RetrieveTotalRecordCount(client, "account");

const roles = await RetrieveAadUserRoles(client, "aad-user-id");

const choices = await RetrieveChoices(client, "gender");
// [{ value: 1, color: null, label: { UserLocalizedLabel: { Label: "Male" } }, description: ... }]
```

## Utilities

```typescript
import { xml, toBase64, base64ImageToURL, getImageUrl, mapChoices, Etag, mergeRecords, parseDateOnly, toDateOnly } from "dataverse-schema";

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
