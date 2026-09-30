import { fetchOdata, fetchXml, eq, gt, lt, and, count, sum, number, primaryKey, string, bool, boolean, datetime, lookup, lookupId, collection, DataverseTable, sum, count, groupby, average, min, max } from "./src"
const client = new DataverseClient({ url: "http://localhost" });
const Address = new DataverseTable({ client, entitySetName: "addresses", logicalName: "address", fields: { id: primaryKey("addressid"), street: string("street_Address"), zip: number("zip_code") } });
const Person = new DataverseTable({ client, entitySetName: "people", logicalName: "person", fields: { pk: primaryKey("personid"), name: string("fullname"), age: number("person_age"), active: boolean("active") } });
const Main = new DataverseTable({ client, entitySetName: "m", logicalName: "m", fields: { id: primaryKey("id"), int: number("int"), name: string("name"), createdOn: datetime("createdon", { required: true }) } });
type P<T> = T extends Promise<infer U> ? U : never;
declare const f1: Parameters<Parameters<ReturnType<typeof fetchOdata<typeof Main["fields"]>>["select"]>[1]>[0];
declare const f2: ReturnType<typeof f1.int>;
type T1 = typeof f2;
declare const anyProxy: any;
const q = fetchOdata(Main).apply((f) => ({ m: max(f.int) }));
type ApplyRow = P<ReturnType<typeof q.execute>>[number];
type Q = ReturnType<typeof q["T"]["first"] extends never ? never : never>;
type X = { a: typeof f2 };
type Row = P<ReturnType<typeof fetchOdata(Main).select("int").execute>>[number];
type FxRow = P<ReturnType<typeof fetchXml(Person).select((fp) => ({ myAge: fp.age })).execute>>[number];
type FxRow2 = P<ReturnType<typeof fetchXml(Person).apply((fp) => ({ totalAge: sum(fp.age), c: count() })).execute>>[number];
type Audit = { createdOn: P<...> };
type MinT = ...
