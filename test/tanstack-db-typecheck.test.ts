import { expectTypeOf, test } from "vitest"
import { DataverseClient, DataverseTable, primaryKey, string, number, nullableNumber, boolean, choice, type Infer, type GUID } from "../src"
import { dataverseCollectionOptions, DataverseSyncDB } from "../src/tanstack-db"
import { createCollection } from "@tanstack/db"

const client = new DataverseClient({ url: "https://x.crm.dynamics.com" })
const Account = new DataverseTable({
  client, entitySetName: "accounts", logicalName: "account",
  fields: {
    id: primaryKey("accountid"),
    name: string("name"),
    revenue: number("revenue"),
    score: nullableNumber("score"),
    active: boolean("active"),
    tier: choice("tier", { 1: "Gold", 2: "Silver" } as const),
  },
})

// All assertions are compile-time only (verified via `npm run test:types`);
// runtime values are never touched, so no browser APIs are required.
test("online collection rows infer Infer<fields>", () => {
  const collection = createCollection(dataverseCollectionOptions({ table: Account }))
  type ColRow = NonNullable<ReturnType<typeof collection.get>>
  expectTypeOf<ColRow["id"]>().toEqualTypeOf<GUID>()
  expectTypeOf<ColRow["name"]>().toEqualTypeOf<string>()
  expectTypeOf<ColRow["revenue"]>().toEqualTypeOf<number>()
  expectTypeOf<ColRow["score"]>().toEqualTypeOf<number | null>()
  expectTypeOf<ColRow["active"]>().toEqualTypeOf<boolean>()
  expectTypeOf<ColRow["tier"]>().toEqualTypeOf<"Gold" | "Silver">()
  // getKey is string | number
  expectTypeOf(collection.get).parameter(0).toEqualTypeOf<string | number>()
})

test("offline collection rows infer Infer<fields>", () => {
  // Never invoked: DataverseSyncDB needs BroadcastChannel (browser-only).
  const check = () => {
    const db = new DataverseSyncDB("probe-db", [Account], 1)
    const collection = createCollection(db.createCollectionOptions({ table: Account }))
    type ColRow = NonNullable<ReturnType<typeof collection.get>>
    expectTypeOf<ColRow["id"]>().toEqualTypeOf<GUID>()
    expectTypeOf<ColRow["revenue"]>().toEqualTypeOf<number>()
    expectTypeOf<ColRow["score"]>().toEqualTypeOf<number | null>()
    expectTypeOf<ColRow["tier"]>().toEqualTypeOf<"Gold" | "Silver">()
    expectTypeOf(collection.get).parameter(0).toEqualTypeOf<string | number>()
  }
  void check
})

test("collection accepts explicit id and query options", () => {
  const check = () => {
    // Two collections over the same entitySet with different filters
    const gold = createCollection(dataverseCollectionOptions({
      table: Account,
      id: "accounts-gold",
      query: { filter: "tier eq 1" },
    }))
    const silver = createCollection(dataverseCollectionOptions({
      table: Account,
      id: "accounts-silver",
      query: { filter: "tier eq 2", orderby: { name: "asc" } },
    }))

    // orderby keys are checked against the table's property names
    const bad = () => dataverseCollectionOptions({
      table: Account,
      id: "accounts-bad",
      // @ts-expect-error "notAField" is not a property of the table's fields
      query: { orderby: { notAField: "asc" } },
    })
    void bad

    type GoldRow = NonNullable<ReturnType<typeof gold.get>>
    expectTypeOf<GoldRow["tier"]>().toEqualTypeOf<"Gold" | "Silver">()
    type SilverRow = NonNullable<ReturnType<typeof silver.get>>
    expectTypeOf<SilverRow["id"]>().toEqualTypeOf<GUID>()
  }
  void check

  const offlineCheck = () => {
    const db = new DataverseSyncDB("probe-db-2", [Account], 1)
    const collection = createCollection(db.createCollectionOptions({
      table: Account,
      id: "accounts-active",
      query: { filter: "statecode eq 0" },
    }))
    type ColRow = NonNullable<ReturnType<typeof collection.get>>
    expectTypeOf<ColRow["name"]>().toEqualTypeOf<string>()
  }
  void offlineCheck
})
