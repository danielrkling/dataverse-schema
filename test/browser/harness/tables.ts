import {
  DataverseClient,
  DataverseTable,
  CollectionProperty,
  LookupProperty,
  LookupIdProperty,
  boolean,
  choice,
  collection,
  datetime,
  date,
  file,
  image,
  multiChoice,
  lookup,
  lookupId,
  number,
  primaryKey,
  string,
} from "../../../src"
import { BrowserTestConfig } from "./config"

export function buildTables(client: DataverseClient, cfg: BrowserTestConfig) {
  const baseFields = {
    id: primaryKey("nnsyc200_test_tableid"),
    bool: boolean("nnsyc200_boolean"),
    modifiedOn: datetime("modifiedon"),
    datetime: datetime("nnsyc200_datetime"),
    dateOnly: date("nnsyc200_dateonly"),
    stateCode: number("statecode"),
    int: number("nnsyc200_int"),
    versionNumber: number("versionnumber"),
    file: file("nnsyc200_file"),
    formula: string("nnsyc200_formula"),
    date: datetime("nnsyc200_date"),
    createdOn: datetime("createdon"),
    text: string("nnsyc200_text"),
    statusCode: choice("statuscode", { 1: "Active", 2: "Inactive" }),
    choice: choice("nnsyc200_choice", { 1: "A", 2: "B", 3: "C" }, { default: "B" }),
    multiChoice: multiChoice("nnsyc200_choice_month", Array.from({ length: 12 }, (_, i) => i + 1)),
    image: image("nnsyc200_image"),
    altKey: string("nnsyc200_Alt_Key"),
    name: string("nnsyc200_name"),
  }

  type Loose = Record<string, any>
  type T0Fields = typeof baseFields & { children: CollectionProperty<Loose> }
  type MainFields = typeof baseFields & {
    testLookup: LookupIdProperty
    testLookupNav: LookupProperty<Loose>
    children: CollectionProperty<Loose>
  }

  const TestTable0: DataverseTable<T0Fields> = new DataverseTable({
    logicalName: cfg.logicalName,
    entitySetName: cfg.entitySetName,
    client,
    fields: {
      ...baseFields,
      // Thunk targets are cast to the loose shape so the two mutually
      // referenced tables don't create an inference cycle.
      children: collection(cfg.collectionNav, () => TestTable as DataverseTable<Loose>),
    },
  })

  const TestTable: DataverseTable<MainFields> = new DataverseTable({
    logicalName: cfg.logicalName,
    entitySetName: cfg.entitySetName,
    client,
    fields: {
      ...baseFields,
      testLookup: lookupId("nnsyc200_Test_Lookup", () => TestTable0),
      testLookupNav: lookup("nnsyc200_Test_Lookup", () => TestTable0 as DataverseTable<Loose>),
      children: collection(cfg.collectionNav, () => TestTable0 as DataverseTable<Loose>),
    },
  })

  return { client, TestTable0, TestTable }
}

export type Tables = ReturnType<typeof buildTables>

export type MainFields = ReturnType<typeof buildTables>["TestTable"]["fields"]
export type ParentFields = ReturnType<typeof buildTables>["TestTable0"]["fields"]
