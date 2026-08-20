import {
  DataverseClient,
  WhoAmI,
  DataverseTable,
  primaryKey,
  string,
  number,
  boolean,
  datetime,
  date,
  lookupId,
  file,
  image,
  fetchOdata,
  fetchXml,
} from "../src"

const output = document.createElement("pre")
output.style.cssText = "white-space:pre-wrap;font:14px monospace;padding:12px;background:#111;color:#eee;"
document.body.append(output)

function write(label: string, value?: unknown) {
  const detail = value === undefined
    ? ""
    : ` ${typeof value === "string" ? value : JSON.stringify(value, null, 2)}`
  output.textContent += `[${new Date().toISOString()}] ${label}${detail}\n`
}

function reportError(label: string, error: unknown) {
  write(label, error instanceof Error ? `${error.name}: ${error.message}\n${error.stack ?? ""}` : error)
}

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(`Assertion failed: ${msg}`)
}

// A valid 1x1 PNG so Dataverse can actually process the uploaded image bytes.
function pngBlob(): Blob {
  const b64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
  return new Blob([bytes], { type: "image/png" })
}

let passed = 0
let failed = 0
async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn()
    passed++
  } catch (e) {
    failed++
    reportError(`FAILED: ${name}`, e)
  }
}

const client = new DataverseClient()

// Parent table definition (no lookup) used as the target of the self-lookup.
const TestTable0 = new DataverseTable({
  logicalName: "nnsyc200_test_table",
  entitySetName: "nnsyc200_test_tables",
  client,
  fields: {
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
    statusCode: number("statuscode"),
    image: image("nnsyc200_image"),
    name: string("nnsyc200_name"),
  },
})

// Main table with a self-lookup (lookupId) back to TestTable0.
const TestTable = new DataverseTable({
  logicalName: "nnsyc200_test_table",
  entitySetName: "nnsyc200_test_tables",
  client,
  fields: {
    id: primaryKey("nnsyc200_test_tableid"),
    bool: boolean("nnsyc200_boolean"),
    modifiedOn: datetime("modifiedon"),
    testLookup: lookupId("nnsyc200_Test_Lookup", () => TestTable0),
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
    statusCode: number("statuscode"),
    image: image("nnsyc200_image"),
    name: string("nnsyc200_name"),
  },
})

async function run() {
  // IDs we create, so we can clean up at the end.
  const created: string[] = []
  let parentId: string | undefined
  let childId: string | undefined
  let child2Id: string | undefined

  try {
    await test("WhoAmI returns a userId", async () => {
      const r = await WhoAmI(client)
      assert(r && r.UserId, "UserId missing from WhoAmI response")
    })

    // --- Seed (assume the table starts empty) ---
    await test("seed parent record", async () => {
      parentId = await TestTable0.insertRecord({
        name: "smoke-parent",
        int: 100,
        bool: true,
        text: "parent",
      })
      assert(parentId, "parent id missing")
      created.push(parentId)
    })

    await test("seed child record (no file/image)", async () => {
      assert(parentId, "parent must exist first")
      childId = await TestTable.insertRecord({
        name: "smoke-child",
        int: 5,
        bool: false,
        text: "child",
        testLookup: parentId,
      })
      assert(childId, "child id missing")
      created.push(childId)
    })

    await test("insertRecord returned GUIDs", () => {
      assert(parentId && childId, "insert ids missing")
    })

    await test("getRecords filter/orderby/top (OData, transformed)", async () => {
      assert(childId, "child must exist")
      const rows = await TestTable.getRecords({
        filter: "nnsyc200_int gt 0",
        orderby: "nnsyc200_name asc",
        top: 10,
      })
      assert(Array.isArray(rows) && rows.length >= 1, "expected at least one row")
      const child = rows.find((r: any) => r.id === childId)
      assert(child, "seeded child not returned by query")
      assert(child.testLookup === parentId, "lookupId value not persisted")
    })

    await test("fetchOdata select + filter", async () => {
      const q = fetchOdata(TestTable)
        .select("name", "int")
        .filter("nnsyc200_int gt 0")
        .toString()
      const rows = await client.getRecords(TestTable.entitySetName, { query: q })
      assert(Array.isArray(rows) && rows.length >= 1, "expected odata rows")
    })

    await test("fetchXml select + filter + top", async () => {
      const fx = fetchXml(TestTable)
        .select((f) => ({ name: f.name, int: f.int }))
        .filter("nnsyc200_int gt 0")
        .top(10)
        .toString()
      const rows = await client.getRecords(TestTable.entitySetName, { query: fx })
      assert(Array.isArray(rows) && rows.length >= 1, "expected fetchxml rows")
    })

    await test("getPropertyValue (value column)", async () => {
      assert(childId, "child must exist")
      const v = await TestTable.getPropertyValue("text", childId)
      assert(v === "child", `expected 'child', got ${JSON.stringify(v)}`)
    })

    await test("updatePropertyValue + read back", async () => {
      assert(childId, "child must exist")
      await TestTable.updatePropertyValue("text", childId, "child-updated")
      const v = await TestTable.getPropertyValue("text", childId)
      assert(v === "child-updated", `expected updated text, got ${JSON.stringify(v)}`)
    })

    await test("deletePropertyValue clears value", async () => {
      assert(childId, "child must exist")
      await TestTable.deletePropertyValue("text", childId)
      const v = await TestTable.getPropertyValue("text", childId)
      assert(v === null || v === undefined, `expected null, got ${JSON.stringify(v)}`)
    })

    await test("updateRecord persists", async () => {
      assert(childId, "child must exist")
      await TestTable.updateRecord(childId, { int: 42 })
      const rows = await TestTable.getRecords({
        filter: `nnsyc200_test_tableid eq ${childId}`,
      })
      assert(rows[0] && rows[0].int === 42, "updateRecord int not persisted")
    })

    await test("upsertRecord (update path) persists", async () => {
      assert(childId, "child must exist")
      await TestTable.upsertRecord(childId, { text: "upserted" })
      const v = await TestTable.getPropertyValue("text", childId)
      assert(v === "upserted", `upsert text not persisted, got ${JSON.stringify(v)}`)
    })

    // --- afterSave upload paths (isolated so a failure can't abort the run) ---
    await test("file + image upload via afterSave (updateRecord)", async () => {
      assert(childId, "child must exist")
      await TestTable.updateRecord(childId, {
        file: { name: "smoke.txt", data: new Blob(["hello file"]) },
        image: { data: pngBlob() },
      })
    })

    await test("file + image upload via afterSave (insertRecord)", async () => {
      assert(parentId, "parent must exist first")
      child2Id = await TestTable.insertRecord({
        name: "smoke-child2",
        int: 7,
        text: "child2",
        testLookup: parentId,
        file: { name: "smoke2.txt", data: new Blob(["hello2"]) },
        image: { data: pngBlob() },
      })
      assert(child2Id, "child2 id missing")
      created.push(child2Id)
    })
  } catch (e) {
    reportError("unexpected error in run()", e)
  } finally {
    for (const id of created) {
      try { await TestTable.deleteRecord(id) } catch { /* best-effort cleanup */ }
      try { await TestTable0.deleteRecord(id) } catch { /* best-effort cleanup */ }
    }
    write(`smoke test complete: ${passed} passed, ${failed} failed`)
  }
}

window.addEventListener("error", (e) => reportError("window error", e.error ?? e.message))
window.addEventListener("unhandledrejection", (e) => reportError("unhandled rejection", e.reason))

if (document.body) {
  void run()
} else {
  window.addEventListener("DOMContentLoaded", () => void run(), { once: true })
}
