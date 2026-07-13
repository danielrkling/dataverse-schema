import { expect, expectTypeOf, test } from "vitest";
import { DataverseClient } from "../src/client";
import {
  fetchOdata,
  eq,
  ne,
  gt,
  ge,
  lt,
  le,
  and,
  or,
  not,
  any,
  all,
  contains,
  startsWith,
  endsWith,
  isNull,
  isNotNull,
  sum,
  average,
  min,
  max,
  count,
  groupby,
  GenericProperties,
  Aggregation,
  CollectionProperty,
  FieldRef,
  GroupByExpr,
  LookupProperty,
} from "../src";
import {
  DataverseTable,
  primaryKey,
  string,
  number,
  boolean,
  datetime,
  lookup,
  lookupId,
  collection,
  Infer,
} from "../src";
import { Etag, getEtag } from "../src/util";
import { BASE_URL } from "./mocks/handlers";
import { server } from "./mocks/server";
import { http, HttpResponse } from "msw";

const client = new DataverseClient({ url: BASE_URL });

const Location = new DataverseTable({
  client,
  entitySetName: "locations",
  logicalName: "location",
  fields: {
    id: primaryKey("locationid"),
    name: string("location_name"),
  },
});

const Address = new DataverseTable({
  client,
  entitySetName: "addresses",
  logicalName: "address",
  fields: {
    id: primaryKey("addressid"),
    street: string("street_Address"),
    zip: number("zip_code"),
    locationId: lookupId("address_Location", () => Location),
    location: lookup("address_Location", () => Location),
  },
});

const Person = new DataverseTable({
  client,
  entitySetName: "people",
  logicalName: "person",
  fields: {
    pk: primaryKey("personid"),
    // name: string("fullname"),
    // age: number("person_age"),
    // active: boolean("active"),
    // primaryAddressId: lookupId("person_Address", () => Address),
    primaryAddress: lookup("person_Address", () => Address),
    // addresses: collection("person_Address_person", () => Address),
    // createdOn: datetime("createdon"),
  },
});

const q = fetchOdata(Person)
  .select()
  .expand("primaryAddress", (s) => s.select("zip"));

// Deeply nested expand types work correctly.
// r1.primaryAddress shows zip, location, and location.name
const q1 = fetchOdata(Person)
  .select()
  .expand("primaryAddress", (s) =>
    s.select("zip").expand("location", (v) => v.select("name")),
  )
const r1 = await q1.execute();

r1.at(0)?.primaryAddress?.location?.name;

// r1 type:
// const r1: {
//     pk: `${string}-${string}-${string}-${string}-${string}`;
//     primaryAddress: {
//         zip: number;
//         location: { name: string } | null;
//     } | null;
// }[]
