import {
  orderby,
  and,
  boolean,
  collection,
  collectionIds,
  date,
  equals,
  expand,
  image,
  Infer,
  keys,
  lessThanOrEqual,
  list,
  lookupId,
  minLength,
  number,
  primaryKey,
  required,
  string,
  table,
  lookup,
  Etag,
} from "./src";

const Address = table("address", {
  id: primaryKey("addressid"),
  street: string("street_Address").required(),
  zip: number("zip_code"),
});
type AddressType = Infer<typeof Address>;
//result in =>
type Address = {
  id: `${string}-${string}-${string}-${string}-${string}`;
  street: string | null;
  zip: number | null;
};

const Person = table("myPeopleTable", {
  primaryKey: primaryKey("myPeopleTableid"),
  name: string("fullname").check(required()),
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
  "a1b2c3d4-e5f6-7890-1234-567890abcdef"
);

//update properties and relationships in one action
Person.saveRecord({
  primaryKey: id,
  age: 28,
  primaryAddressId: "a1b2c3d4-e5f6-7890-1234-567890abcdef",
  addresses:[{
    id: "a1b2c3d4-e5f6-7890-1234-567890abcdef",
    street: "123 This Way",
    zip: 12345
  }],
});

Address.deleteRecord("a1b2c3d4-e5f6-7890-1234-567890abcdef")

// Populates the undefined properties with their defaults
const value = Person.getDefault({
  name: "John",
}); 


const result = Person.validate(value) // returns standard schema result
const validPerson = Person.parse(value) // returns valid record or throws


//add new properties or overide exsting ones
const PersonWithNickName = Person.appendProperties({
  nickname: string("nickname"),
  name: number("name_as_number")
})

const PersonWithoutAge = Person.omitProperties("age")
const PersonWithOnlyName = Person.pickProperties("age")

