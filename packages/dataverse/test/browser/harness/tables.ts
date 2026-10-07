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
  createdOn,
  modifiedOn,
  stateCode,
  versionNumber,
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
    modifiedOn: modifiedOn(),
    datetime: datetime("nnsyc200_datetime"),
    dateOnly: date("nnsyc200_dateonly"),
    stateCode: stateCode(),
    int: number("nnsyc200_int"),
    versionNumber: versionNumber(),
    file: file("nnsyc200_file"),
    formula: string("nnsyc200_formula"),
    date: datetime("nnsyc200_date"),
    createdOn: createdOn(),
    text: string("nnsyc200_text"),
    statusCode: choice("statuscode", { 1: "Active", 2: "Inactive" }, { required: true }),
    choice: choice("nnsyc200_choice", { 1: "A", 2: "B", 3: "C" }, { default: "B" }),
    multiChoice: multiChoice("nnsyc200_choice_month", { 1: "A", 2: "B", 3: "C" }),
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

  // --- Narrowed variants ---------------------------------------------------
  //
  // TestTable declares BOTH sides of the self-referencing relationship (the
  // N:1 `testLookupNav` and its inverse 1:N `children`), which auto-expansion
  // refuses (the Web API cross-wires the two — see TODO.md probe P13). Reads
  // that want auto-expansion therefore use the one-sided variants below, and
  // reads that just want data use `TestTableFlat`.

  // Related table with no navigation properties at all — expanding into it ends
  // the walk, so the one-sided variants below can auto-expand.
  const TestTablePlain: DataverseTable<any> = new DataverseTable({
    logicalName: cfg.logicalName,
    entitySetName: cfg.entitySetName,
    client,
    fields: { ...baseFields },
  })

  /** Value columns + the lookupId, no navigation properties — reads stay flat. */
  const TestTableFlat: DataverseTable<any> = new DataverseTable({
    logicalName: cfg.logicalName,
    entitySetName: cfg.entitySetName,
    client,
    fields: { ...baseFields, testLookup: lookupId("nnsyc200_Test_Lookup", () => TestTable0) },
  })

  /** Only the N:1 side of the self relationship — auto-expands the lookup. */
  const TestTableLookupSide: DataverseTable<any> = new DataverseTable({
    logicalName: cfg.logicalName,
    entitySetName: cfg.entitySetName,
    client,
    fields: {
      ...baseFields,
      testLookup: lookupId("nnsyc200_Test_Lookup", () => TestTablePlain),
      testLookupNav: lookup("nnsyc200_Test_Lookup", () => TestTablePlain),
    },
  })

  /** Only the inverse 1:N side of the self relationship — auto-expands the collection. */
  const TestTableCollectionSide: DataverseTable<any> = new DataverseTable({
    logicalName: cfg.logicalName,
    entitySetName: cfg.entitySetName,
    client,
    fields: { ...baseFields, children: collection(cfg.collectionNav, () => TestTablePlain) },
  })

  /**
   * Both sides of the self relationship (N:1 + inverse 1:N) pointing at a plain
   * related table — the ONLY shape that isolates the "self relationship expanded
   * from both sides" error. `TestTable` can't do it: its lookup target declares a
   * collection, so the nested-one-to-many error fires first.
   */
  const TestTableSelfBoth: DataverseTable<any> = new DataverseTable({
    logicalName: cfg.logicalName,
    entitySetName: cfg.entitySetName,
    client,
    fields: {
      ...baseFields,
      testLookup: lookupId("nnsyc200_Test_Lookup", () => TestTablePlain),
      testLookupNav: lookup("nnsyc200_Test_Lookup", () => TestTablePlain),
      children: collection(cfg.collectionNav, () => TestTablePlain),
    },
  })

  return {
    client,
    TestTable0,
    TestTable,
    TestTablePlain,
    TestTableFlat,
    TestTableLookupSide,
    TestTableCollectionSide,
    TestTableSelfBoth,
  }
}

export type Tables = ReturnType<typeof buildTables>

export type MainFields = ReturnType<typeof buildTables>["TestTable"]["fields"]
export type ParentFields = ReturnType<typeof buildTables>["TestTable0"]["fields"]
