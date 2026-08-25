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
