# Dataverse Web API TypeScript Library

A TypeScript library for working with the Dataverse Web API. This library provides a set of tools and type definitions to make it easier to interact with Dataverse data in a strongly-typed and organized way.

## Installation

```
npm i dataverse-schema
```

Copy the files from dist into your project

Note: Most of the JSDoc documentation was generate by AI and by not be accurate/ or up to date

## Core Concepts

### 1. Build Your Table Schema

```typescript
const Address = table("address", {
  id: primaryKey("addressid"),
  street: string("street_Address"),
  zip: number("zip_code"),
});
type AddressType = Infer<typeof Address>;
//result in =>
type Address = {
    id: `${string}-${string}-${string}-${string}-${string}`;
    street: string | null;
    zip: number | null;
}

const Person = table("myPeopleTable", {
  primaryKey: primaryKey("myPeopleTableid"),
  name: string("fullname"),
  age: number("person_age"),
  dob: date("person_dob"),
  active: boolean("active"),
  gender: list("status", ["M", "F"] as const),
  pic: image("profile"),
  primaryAddressId: lookupId("person_Address", () => Address), //many to one
  primaryAddress: lookup("person_Address", () => Address), //many to one
  addressIds: collectionIds("person_Address_person", () => Address), //many to many
  addresses: collection("person_Address_person", () => Address), //many to many
});

type PersonType = Infer<typeof Person>;
//result in =>
type Person = {
  primaryKey: `${string}-${string}-${string}-${string}-${string}`;
  name: string | null;
  age: number | null;
  dob: Date | null;
  active: boolean;
  gender: "M" | "F" | null;
  pic: string | null;
  primaryAddressId: `${string}-${string}-${string}-${string}-${string}` | null;
  primaryAddress: {
    id: `${string}-${string}-${string}-${string}-${string}`;
    street: string | null;
    zip: number | null;
  } | null;
  addressIds: `${string}-${string}-${string}-${string}-${string}`[];
  addresses: {
    id: `${string}-${string}-${string}-${string}-${string}`;
    street: string | null;
    zip: number | null;
  }[];
};
```

### 2. Query Data
```typescript
const allPeople = Person.getRecords();
const singlePerson = Person.getRecord("a1b2c3d4-e5f6-7890-1234-567890abcdef");

//using alternate key
const anotherPerson = Person.getRecord(
  keys({ [Person.properties.name.name]: "John Doe" })
);

const youngMen = Person.getRecords({
  filter: and(
    equals(Person.properties.gender.name, "M"),
    lessThanOrEqual(Person.properties.age.name, 21)
  ),
  orderby: {
    name: "asc",
  },
  top: 100,
});
```

### 3. Modify Data
```typescript
//crates new record since primary is undefined
const id = await Person.saveRecord({
  name: "Jane",
  age: 25,
});

//update property
Person.updatePropertyValue("age", id, 26);

//assocuate record
Person.associateRecord(
  "primaryAddressId",
  id,
  "a1b2c3d4-e5f6-7890-1234-567890abcdef" //existing adress
);

//update properties and relationships in one action
Person.saveRecord({
  primaryKey: id,
  age: 28,
  primaryAddressId: "a1b2c3d4-e5f6-7890-1234-567890abcdef",
  addresses:[{
    street: "123 This Way", //new address
    zip: 12345
  }],
});

Address.deleteRecord("a1b2c3d4-e5f6-7890-1234-567890abcdef")
```

### 4. Validate Data
```typescript
// Populates the undefined properties with their defaults
const value = Person.getDefault({
  name: "John",
}); 

const result = Person.validate(value) // returns standard schema result
const validPerson = Person.parse(value) // returns valid record or throws
```

### 5. Manipulate Tables
```typescript
//add new properties or overide exsting ones
const PersonWithNickName = Person.appendProperties({
  nickname: string("nickname"),
  name: number("name_as_number")
})

const PersonWithoutAge = Person.omitProperties("age")
const PersonWithOnlyName = Person.pickProperties("age")
```


### Utility Functions
- `tryFetch`: Wrapper around the `fetch` API for handling Dataverse Web API requests.
- Dataverse Operations
  - `activateRecord`
  - `associateRecord`
  - `associateRecordToList`
  - `deactivateRecord`
  - `deletePropertyValue`
  - `deleteRecord`
  - `dissociateRecord`
  - `getAssociatedRecord`
  - `getAssociatedRecords`
  - `getNextLink`
  - `getPropertyRawValue`
  - `getPropertyRawValueURL`
  - `getPropertyValue`
  - `getRecord`
  - `getRecords`
  - `patchRecord`
  - `postRecord`
  - `postRecordGetId`
  - `updatePropertyValue`
- Query Building Function
  - `query`
  - `keys`
  - `select`
  - `expand`
  - `orderby`
  - `groupby` & `aggregate`
    - `average`
    - `sum`
    - `min`
    - `max`
    - `count`
  - Filter Operations
    - `and`
    - `or`
    - `not`
    - `equals`
    - `notEquals`
    - `greaterThan`
    - `greaterThanOrEqual`
    - `lessThan`
    - `lessThanOrEqual`
    - Dataverse Query Functions
      - https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/queryfunctions?view=dataverse-latest
- Dataverse Functions and Actions
  - `RetrieveAadUserRoles`
  - `RetrieveTotalRecordCount`
  - `WhoAmI`
- Other funciton
  - `setConfig`: Sets global configuration options (base URL, headers).
  - `mapChoices`: Helper function for mapping Dataverse choice/picklist data.
  - `fetchXml` & `xml`: Helper function for creating XML strings.
  - `toBase64`, `base64ImageToURL`: Helper functions for working with base64 encoded images.
  - `getImageUrl`: Constructs a URL to retrieve an image from Dataverse.



## Contributions

Contributions are welcome! Please submit pull requests or create issues to suggest improvements or report bugs.
