import { expect, test } from "vitest"
import { DataverseClient } from "../src/client"
import { BASE_URL } from "./mocks/handlers"
import { http, HttpResponse } from "msw"
import { server } from "./mocks/server"

const client = new DataverseClient({ url: BASE_URL })
const API = `${BASE_URL}/api/data/v9.2`

test("constructor merges options with defaults", () => {
  const c = new DataverseClient({ url: BASE_URL, token: "test-token" })
  expect(c.options.url).toBe(BASE_URL)
  expect(c.options.token).toBe("test-token")
})

test("getRecord fetches a single record", async () => {
  const result = await client.getRecord("accounts", "a1b2c3d4-e5f6-7890-1234-567890abcdef")
  expect(result.accountid).toBe("a1b2c3d4-e5f6-7890-1234-567890abcdef")
  expect(result.name).toBe("Test Corp")
})

test("getRecord returns null when record not found", async () => {
  const result = await client.getRecord("accounts", "00000000-0000-0000-0000-000000000000")
  expect(result).toBeNull()
})

test("getRecords fetches all records", async () => {
  const results = await client.getRecords("accounts")
  expect(results).toHaveLength(2)
  expect(results[0].name).toBe("Test Corp")
  expect(results[1].name).toBe("Sample Inc")
})

test("getRecords passes query string", async () => {
  const results = await client.getRecords("accounts", "$filter=statecode eq 0")
  expect(results).toHaveLength(2)
})

test("getRecords follows @odata.nextLink", async () => {
  server.use(
    http.get(`${BASE_URL}/api/data/v9.2/accounts`, () => {
      return HttpResponse.json({
        value: [{ accountid: "first-id", name: "First" }],
        "@odata.nextLink": "https://nextlink-contoso.com/api/data/v9.2/accounts",
      })
    }),
  )
  const results = await client.getRecords("accounts")
  expect(results).toHaveLength(2)
  expect(results[0].name).toBe("First")
  expect(results[1].name).toBe("Paginated Record")
})

test.skip("postRecord creates a record and returns it with Prefer header", async () => {
  const result = await client.postRecord("accounts", { name: "New Corp" })
  expect(result.accountid).toBeDefined()
})

test("postRecordGetId creates a record and returns GUID", async () => {
  const id = await client.postRecordGetId("accounts", { name: "Another Corp" })
  expect(id).toMatch(/^[0-9a-f-]+$/i)
})

test("patchRecord updates a record", async () => {
  const result = await client.patchRecord("accounts", "a1b2c3d4-e5f6-7890-1234-567890abcdef", { name: "Updated Corp" })
  expect(result).toBeUndefined()
})

test("deleteRecord deletes a record", async () => {
  const id = await client.deleteRecord("accounts", "b2c3d4e5-f6a7-8901-2345-67890abcdef1")
  expect(id).toBe("b2c3d4e5-f6a7-8901-2345-67890abcdef1")
})

test("updatePropertyValue updates a single property", async () => {
  const id = await client.updatePropertyValue("accounts", "a1b2c3d4-e5f6-7890-1234-567890abcdef", "name", "New Name")
  expect(id).toBe("a1b2c3d4-e5f6-7890-1234-567890abcdef")
})

test("deletePropertyValue deletes a property value", async () => {
  const id = await client.deletePropertyValue("accounts", "a1b2c3d4-e5f6-7890-1234-567890abcdef", "name")
  expect(id).toBe("a1b2c3d4-e5f6-7890-1234-567890abcdef")
})

test("getPropertyValue retrieves a property value", async () => {
  const value = await client.getPropertyValue("accounts", "a1b2c3d4-e5f6-7890-1234-567890abcdef", "revenue")
  expect(value).toBe(1000000)
})

test.skip("getPropertyRawValue retrieves raw property value", async () => {
  const value = await client.getPropertyRawValue("accounts", "a1b2c3d4-e5f6-7890-1234-567890abcdef", "name")
  expect(value).toBe("Test Corp")
})

test("associateRecord links records via $ref", async () => {
  const childId = await client.associateRecord("accounts", "a1b2c3d4-e5f6-7890-1234-567890abcdef", "primarycontactid", "contacts", "child-id")
  expect(childId).toBe("child-id")
})

test("dissociateRecord unlinks records via $ref", async () => {
  const id = await client.dissociateRecord("accounts", "a1b2c3d4-e5f6-7890-1234-567890abcdef", "primarycontactid")
  expect(id).toBe("a1b2c3d4-e5f6-7890-1234-567890abcdef")
})

test.skip("getAssociatedRecords fetches navigation property records", async () => {
  server.use(
    http.get(`${BASE_URL}/api/data/v9.2/accounts/:id/contacts`, () => {
      return HttpResponse.json({ value: [{ contactid: "c1", name: "John Doe" }] })
    }),
  )
  const results = await client.getAssociatedRecords("accounts", "a1b2c3d4-e5f6-7890-1234-567890abcdef", "contacts")
  expect(results).toHaveLength(1)
  expect(results[0].name).toBe("John Doe")
})

test("fetch sets correct OData headers", async () => {
  let capturedHeaders: Record<string, string> = {}
  server.use(
    http.get(`${BASE_URL}/api/data/v9.2/accounts`, ({ request }) => {
      request.headers.forEach((value, key) => { capturedHeaders[key.toLowerCase()] = value })
      return HttpResponse.json({ value: [] })
    }),
  )
  await client.getRecords("accounts")
  expect(capturedHeaders["odata-maxversion"]).toBe("4.0")
  expect(capturedHeaders["odata-version"]).toBe("4.0")
  expect(capturedHeaders["accept"]).toBe("application/json")
  expect(capturedHeaders["content-type"]).toBe("application/json; charset=utf-8")
  expect(capturedHeaders["if-none-match"]).toBe("null")
})

test("fetch includes impersonation headers when set", async () => {
  let capturedHeaders: Record<string, string> = {}
  const impersonatingClient = new DataverseClient({
    url: BASE_URL,
    impersonateByUserId: "user-123",
    impersonateByAAId: "aad-456",
  })
  server.use(
    http.get(`${BASE_URL}/api/data/v9.2/accounts`, ({ request }) => {
      request.headers.forEach((value, key) => { capturedHeaders[key.toLowerCase()] = value })
      return HttpResponse.json({ value: [] })
    }),
  )
  await impersonatingClient.getRecords("accounts")
  expect(capturedHeaders["mscrmcallerid"]).toBe("user-123")
  expect(capturedHeaders["callerobjectid"]).toBe("aad-456")
})

test("fetch includes Bearer token when set", async () => {
  let capturedHeaders: Record<string, string> = {}
  const authedClient = new DataverseClient({ url: BASE_URL, token: "my-jwt-token" })
  server.use(
    http.get(`${BASE_URL}/api/data/v9.2/accounts`, ({ request }) => {
      request.headers.forEach((value, key) => { capturedHeaders[key.toLowerCase()] = value })
      return HttpResponse.json({ value: [] })
    }),
  )
  await authedClient.getRecords("accounts")
  expect(capturedHeaders["authorization"]).toBe("Bearer my-jwt-token")
})

test("fetch includes custom headers from options", async () => {
  let capturedHeaders: Record<string, string> = {}
  const customClient = new DataverseClient({ url: BASE_URL, headers: { "x-custom": "myvalue" } })
  server.use(
    http.get(`${BASE_URL}/api/data/v9.2/accounts`, ({ request }) => {
      request.headers.forEach((value, key) => { capturedHeaders[key.toLowerCase()] = value })
      return HttpResponse.json({ value: [] })
    }),
  )
  await customClient.getRecords("accounts")
  expect(capturedHeaders["x-custom"]).toBe("myvalue")
})

test("fetch throws on API error", async () => {
  server.use(
    http.get(`${BASE_URL}/api/data/v9.2/accounts`, () => {
      return HttpResponse.json({ error: { code: "0x80040217", message: "Generic error" } }, { status: 400 })
    }),
  )
  await expect(client.getRecords("accounts")).rejects.toThrow()
})

test("activateRecord sets statecode to 0", async () => {
  const id = await client.activateRecord("accounts", "a1b2c3d4-e5f6-7890-1234-567890abcdef")
  expect(id).toBe("a1b2c3d4-e5f6-7890-1234-567890abcdef")
})

test("deactivateRecord sets statecode to 1", async () => {
  const id = await client.deactivateRecord("accounts", "a1b2c3d4-e5f6-7890-1234-567890abcdef")
  expect(id).toBe("a1b2c3d4-e5f6-7890-1234-567890abcdef")
})

test.skip("batch executes multiple requests", async () => {
  const result = await client.batch(async () => {
    await client.getRecord("accounts", "a1b2c3d4-e5f6-7890-1234-567890abcdef")
    await client.getRecords("accounts")
  })
  expect(result).toBeDefined()
})

test("batch throws on nested batch", async () => {
  await expect(client.batch(() => client.batch(async () => {}))).rejects.toThrow("Cannot nest batches")
})

test.skip("changeset executes a transactional batch", async () => {
  const result = await client.changeset(async () => {
    await client.postRecordGetId("accounts", { name: "Changeset Record" })
  })
  expect(result).toBeDefined()
})

test("getPropertyRawValueURL constructs the correct URL", () => {
  const url = client.getPropertyRawValueURL("accounts", "a1b2c3d4-e5f6-7890-1234-567890abcdef", "name")
  expect(url).toBe(`${BASE_URL}/api/data/v9.2/accounts(a1b2c3d4-e5f6-7890-1234-567890abcdef)/name/\$value`)
})

test("getImageFullSizeURL constructs the correct URL", () => {
  const url = client.getImageFullSizeURL("accounts", "a1b2c3d4-e5f6-7890-1234-567890abcdef", "entityimage")
  expect(url).toBe(`${BASE_URL}/api/data/v9.2/accounts(a1b2c3d4-e5f6-7890-1234-567890abcdef)/entityimage/\$value?size=full`)
})

test("getImageDownloadURL constructs the correct URL", () => {
  const url = client.getImageDownloadURL("accounts", "a1b2c3d4-e5f6-7890-1234-567890abcdef", "entityimage")
  expect(url).toBe(`${BASE_URL}/Image/download.aspx?Entity=accounts&Attribute=entityimage&Id=a1b2c3d4-e5f6-7890-1234-567890abcdef&Full=true`)
})

test.skip("updateFileProperty sends octet-stream PATCH", async () => {
  let capturedHeaders: Record<string, string> = {}
  server.use(
    http.patch(`${BASE_URL}/api/data/v9.2/accounts/:id/photo`, ({ request }) => {
      request.headers.forEach((value, key) => { capturedHeaders[key.toLowerCase()] = value })
      return new HttpResponse(null, { status: 204 })
    }),
  )
  const id = await client.updateFileProperty("accounts", "a1b2c3d4-e5f6-7890-1234-567890abcdef", "photo", "pic.jpg", "binarydata")
  expect(capturedHeaders["content-type"]).toBe("application/octet-stream")
  expect(capturedHeaders["x-ms-file-name"]).toBe("pic.jpg")
  expect(id).toBeUndefined()
})

test.skip("associateRecordToList syncs association list", async () => {
  server.use(
    http.get(`${BASE_URL}/api/data/v9.2/accounts/:id/contacts`, () => {
      return HttpResponse.json({ value: [{ contactid: "existing-id" }] })
    }),
  )
  const ids = await client.associateRecordToList("accounts", "parent-id", "contacts", "contacts", "contactid", ["new-id"])
  expect(ids).toEqual(["new-id"])
})

//
// --- ACTIONS ---
//

test("executeAction calls an unbound action with POST", async () => {
  let capturedBody = null
  server.use(
    http.post(`${BASE_URL}/api/data/v9.2/WinOpportunity`, async ({ request }) => {
      capturedBody = await request.json()
      return HttpResponse.json({ Status: "won" })
    }),
  )
  const result = await client.executeAction("WinOpportunity", { OpportunityId: "opp-123" })
  expect(capturedBody).toEqual({ OpportunityId: "opp-123" })
  expect(result.Status).toBe("won")
})

test("executeBoundAction calls a bound action with POST", async () => {
  let capturedUrl = ""
  server.use(
    http.post(`${BASE_URL}/api/data/v9.2/:path/Microsoft.Dynamics.CRM.CalculateRollupField`, async ({ request }) => {
      capturedUrl = request.url
      return HttpResponse.json({ value: { RollupField: "estimatedvalue", RollupValue: 42 } })
    }),
  )
  const result = await client.executeBoundAction("accounts", "CalculateRollupField", { FieldName: "estimatedvalue" }, "a1b2c3d4-e5f6-7890-1234-567890abcdef")
  expect(capturedUrl).toContain("Microsoft.Dynamics.CRM.CalculateRollupField")
  expect(result.value.RollupValue).toBe(42)
})

test("executeBoundAction without id calls collection-bound action", async () => {
  let capturedUrl = ""
  server.use(
    http.post(`${BASE_URL}/api/data/v9.2/accounts/Microsoft.Dynamics.CRM.BulkDetectDuplicates`, async ({ request }) => {
      capturedUrl = request.url
      return HttpResponse.json({ JobId: "job-123" })
    }),
  )
  const result = await client.executeBoundAction("accounts", "BulkDetectDuplicates", { })
  expect(capturedUrl).toContain("accounts/Microsoft.Dynamics.CRM.BulkDetectDuplicates")
  expect(result.JobId).toBe("job-123")
})

//
// --- FUNCTIONS ---
//

test("executeFunction calls an unbound function with GET", async () => {
  let capturedUrl = ""
  server.use(
    http.get(`${BASE_URL}/api/data/v9.2/CalculateRollupField*`, ({ request }) => {
      capturedUrl = request.url
      return HttpResponse.json({ value: 42 })
    }),
  )
  const result = await client.executeFunction("CalculateRollupField", { FieldName: "estimatedvalue" })
  expect(capturedUrl).toContain("CalculateRollupField(FieldName='estimatedvalue')")
  expect(result.value).toBe(42)
})

test("executeBoundFunction calls a bound function with GET", async () => {
  let capturedUrl = ""
  server.use(
    http.get(`${BASE_URL}/api/data/v9.2/:path/:rest`, ({ request, params }) => {
      if ((params.rest as string).startsWith("Microsoft.Dynamics.CRM.CalculateRollupField")) {
        capturedUrl = request.url
        return HttpResponse.json({ value: 42 })
      }
    }),
  )
  const result = await client.executeBoundFunction("accounts", "a1b2c3d4-e5f6-7890-1234-567890abcdef", "CalculateRollupField", { FieldName: "estimatedvalue" })
  expect(capturedUrl).toContain("Microsoft.Dynamics.CRM.CalculateRollupField(FieldName='estimatedvalue')")
  expect(result.value).toBe(42)
})

test("executeFunction works with no params", async () => {
  let capturedUrl = ""
  server.use(
    http.get(`${BASE_URL}/api/data/v9.2/WhoAmI*`, ({ request }) => {
      capturedUrl = request.url
      return HttpResponse.json({ UserId: "u-1" })
    }),
  )
  const result = await client.executeFunction("WhoAmI")
  expect(capturedUrl).toContain("WhoAmI()")
  expect(result.UserId).toBe("u-1")
})

//
// --- BULK OPERATIONS ---
//

test("createMultiple sends POST with Targets array", async () => {
  let capturedBody: any = null
  server.use(
    http.post(`${BASE_URL}/api/data/v9.2/accounts/Microsoft.Dynamics.CRM.CreateMultiple`, async ({ request }) => {
      capturedBody = await request.json()
      return HttpResponse.json({ Targets: [{ id: "new-1" }, { id: "new-2" }] })
    }),
  )
  const result = await client.createMultiple("accounts", [{ name: "A" }, { name: "B" }])
  expect(capturedBody).toEqual({ Targets: [{ name: "A" }, { name: "B" }] })
  expect(result.Targets).toHaveLength(2)
})

test("updateMultiple sends POST with Targets array", async () => {
  let capturedBody: any = null
  server.use(
    http.post(`${BASE_URL}/api/data/v9.2/accounts/Microsoft.Dynamics.CRM.UpdateMultiple`, async ({ request }) => {
      capturedBody = await request.json()
      return HttpResponse.json({ Targets: [{ id: "upd-1" }] })
    }),
  )
  const result = await client.updateMultiple("accounts", [{ accountid: "id-1", name: "Updated" }])
  expect(capturedBody).toEqual({ Targets: [{ accountid: "id-1", name: "Updated" }] })
  expect(result.Targets).toHaveLength(1)
})

test("deleteMultiple sends POST with @odata.id targets", async () => {
  let capturedBody: any = null
  server.use(
    http.post(`${BASE_URL}/api/data/v9.2/accounts/Microsoft.Dynamics.CRM.DeleteMultiple`, async ({ request }) => {
      capturedBody = await request.json()
      return new HttpResponse(null, { status: 204 })
    }),
  )
  await client.deleteMultiple("accounts", ["id-1", "id-2"])
  expect(capturedBody.Targets).toHaveLength(2)
  expect(capturedBody.Targets[0]["@odata.id"]).toContain("accounts(id-1)")
  expect(capturedBody.Targets[1]["@odata.id"]).toContain("accounts(id-2)")
})

test("fetch handles 204 without OData-EntityId", async () => {
  server.use(
    http.delete(`${BASE_URL}/api/data/v9.2/accounts/:id`, () => {
      return new HttpResponse(null, { status: 204 })
    }),
  )
  const result = await client.fetch("accounts(test-id)", { method: "DELETE" })
  expect(result).toBeUndefined()
})

//
// --- ETag Conditional Operations ---
//

test("getRecord with etag sends If-None-Match header", async () => {
  let capturedIfNoneMatch = ""
  server.use(
    http.get(`${API}/:path`, ({ request, params }) => {
      if ((params.path as string).startsWith("accounts(")) {
        capturedIfNoneMatch = request.headers.get("If-None-Match") ?? ""
        return HttpResponse.json({ accountid: "a1b2c3d4-e5f6-7890-1234-567890abcdef", name: "Test Corp" })
      }
    }),
  )
  const result = await client.getRecord("accounts", "a1b2c3d4-e5f6-7890-1234-567890abcdef", "", '"12345"')
  expect(capturedIfNoneMatch).toBe('"12345"')
  expect(result.name).toBe("Test Corp")
})

test("getRecord with etag returns null on 304", async () => {
  server.use(
    http.get(`${API}/:path`, ({ request, params }) => {
      if ((params.path as string).startsWith("accounts(")) {
        return new HttpResponse(null, { status: 304 })
      }
    }),
  )
  const result = await client.getRecord("accounts", "a1b2c3d4-e5f6-7890-1234-567890abcdef", "", '"12345"')
  expect(result).toBeNull()
})

test("patchRecord with etag sends If-Match header", async () => {
  let capturedIfMatch = ""
  server.use(
    http.patch(`${API}/:path`, ({ request, params }) => {
      if ((params.path as string).startsWith("accounts(")) {
        capturedIfMatch = request.headers.get("If-Match") ?? ""
        return new HttpResponse(null, { status: 204 })
      }
    }),
  )
  await client.patchRecord("accounts", "a1b2c3d4-e5f6-7890-1234-567890abcdef", { name: "Updated" }, "", '"etag-value"')
  expect(capturedIfMatch).toBe('"etag-value"')
})

test("patchRecord without etag does not send If-Match", async () => {
  let capturedIfMatch = ""
  server.use(
    http.patch(`${API}/:path`, ({ request, params }) => {
      if ((params.path as string).startsWith("accounts(")) {
        capturedIfMatch = request.headers.get("If-Match") ?? ""
        return new HttpResponse(null, { status: 204 })
      }
    }),
  )
  await client.patchRecord("accounts", "a1b2c3d4-e5f6-7890-1234-567890abcdef", { name: "Updated" })
  expect(capturedIfMatch).toBe("")
})

test("deleteRecord with etag sends If-Match header", async () => {
  let capturedIfMatch = ""
  server.use(
    http.delete(`${API}/:path`, ({ request, params }) => {
      if ((params.path as string).startsWith("accounts(")) {
        capturedIfMatch = request.headers.get("If-Match") ?? ""
        return new HttpResponse(null, { status: 204 })
      }
    }),
  )
  await client.deleteRecord("accounts", "some-id", '"etag-value"')
  expect(capturedIfMatch).toBe('"etag-value"')
})

test("getEtag extracts symbol value from record", async () => {
  const { Etag, getEtag } = await import("../src/util")
  const record: any = { name: "test" }
  record[Etag] = '"w/\\"abc123\\""'
  expect(getEtag(record)).toBe('"w/\\"abc123\\""')
  expect(getEtag({})).toBeUndefined()
  expect(getEtag(null)).toBeUndefined()
})

test("updatePropertyValue with etag sends If-Match header", async () => {
  let capturedIfMatch = ""
  server.use(
    http.put(`${API}/:path/:property`, ({ request, params }) => {
      if ((params.path as string).startsWith("accounts(")) {
        capturedIfMatch = request.headers.get("If-Match") ?? ""
        return new HttpResponse(null, { status: 204 })
      }
    }),
  )
  await client.updatePropertyValue("accounts", "a1b2c3d4-e5f6-7890-1234-567890abcdef", "name", "New Name", '"etag-value"')
  expect(capturedIfMatch).toBe('"etag-value"')
})

//
// --- TYPED HEADER OPTIONS ---
//

test("prefer with string values resolves to comma-separated header", async () => {
  let capturedPrefer = ""
  const preferClient = new DataverseClient({
    url: BASE_URL,
    prefer: ["return=representation", "odata.track-changes"],
  })
  server.use(
    http.get(`${BASE_URL}/api/data/v9.2/accounts`, ({ request }) => {
      capturedPrefer = request.headers.get("Prefer") ?? ""
      return HttpResponse.json({ value: [] })
    }),
  )
  await preferClient.getRecords("accounts")
  expect(capturedPrefer).toBe("return=representation,odata.track-changes")
})

test("prefer with annotations object resolves correctly", async () => {
  let capturedPrefer = ""
  const preferClient = new DataverseClient({
    url: BASE_URL,
    prefer: [{ annotations: "*" }],
  })
  server.use(
    http.get(`${BASE_URL}/api/data/v9.2/accounts`, ({ request }) => {
      capturedPrefer = request.headers.get("Prefer") ?? ""
      return HttpResponse.json({ value: [] })
    }),
  )
  await preferClient.getRecords("accounts")
  expect(capturedPrefer).toBe('odata.include-annotations="*"')
})

test("prefer with annotations array resolves correctly", async () => {
  let capturedPrefer = ""
  const preferClient = new DataverseClient({
    url: BASE_URL,
    prefer: [{ annotations: ["OData.Community.Display.V1.FormattedValue", "Microsoft.PowerApps.CDS.HelpLink"] }],
  })
  server.use(
    http.get(`${BASE_URL}/api/data/v9.2/accounts`, ({ request }) => {
      capturedPrefer = request.headers.get("Prefer") ?? ""
      return HttpResponse.json({ value: [] })
    }),
  )
  await preferClient.getRecords("accounts")
  expect(capturedPrefer).toBe('odata.include-annotations="OData.Community.Display.V1.FormattedValue,Microsoft.PowerApps.CDS.HelpLink"')
})

test("prefer with maxPageSize object resolves correctly", async () => {
  let capturedPrefer = ""
  const preferClient = new DataverseClient({
    url: BASE_URL,
    prefer: [{ maxPageSize: 500 }],
  })
  server.use(
    http.get(`${BASE_URL}/api/data/v9.2/accounts`, ({ request }) => {
      capturedPrefer = request.headers.get("Prefer") ?? ""
      return HttpResponse.json({ value: [] })
    }),
  )
  await preferClient.getRecords("accounts")
  expect(capturedPrefer).toBe("odata.maxpagesize=500")
})

test("prefer with mixed string and object values", async () => {
  let capturedPrefer = ""
  const preferClient = new DataverseClient({
    url: BASE_URL,
    prefer: ["return=representation", { annotations: "*" }, { maxPageSize: 200 }],
  })
  server.use(
    http.get(`${BASE_URL}/api/data/v9.2/accounts`, ({ request }) => {
      capturedPrefer = request.headers.get("Prefer") ?? ""
      return HttpResponse.json({ value: [] })
    }),
  )
  await preferClient.getRecords("accounts")
  expect(capturedPrefer).toBe('return=representation,odata.include-annotations="*",odata.maxpagesize=200')
})

test("empty prefer array does not set Prefer header", async () => {
  let capturedPrefer = ""
  const preferClient = new DataverseClient({
    url: BASE_URL,
    prefer: [],
  })
  server.use(
    http.get(`${BASE_URL}/api/data/v9.2/accounts`, ({ request }) => {
      capturedPrefer = request.headers.get("Prefer") ?? ""
      return HttpResponse.json({ value: [] })
    }),
  )
  await preferClient.getRecords("accounts")
  expect(capturedPrefer).toBe("")
})

test("consistency header is set when specified", async () => {
  let capturedConsistency = ""
  const consistencyClient = new DataverseClient({
    url: BASE_URL,
    consistency: "Strong",
  })
  server.use(
    http.get(`${BASE_URL}/api/data/v9.2/accounts`, ({ request }) => {
      capturedConsistency = request.headers.get("Consistency") ?? ""
      return HttpResponse.json({ value: [] })
    }),
  )
  await consistencyClient.getRecords("accounts")
  expect(capturedConsistency).toBe("Strong")
})

test("solutionUniqueName header is set when specified", async () => {
  let capturedSolution = ""
  const solutionClient = new DataverseClient({
    url: BASE_URL,
    solutionUniqueName: "mySolution",
  })
  server.use(
    http.post(`${BASE_URL}/api/data/v9.2/accounts`, ({ request }) => {
      capturedSolution = request.headers.get("MSCRM.SolutionUniqueName") ?? ""
      return HttpResponse.json({ accountid: "new-id", name: "Test" })
    }),
  )
  await solutionClient.postRecordGetId("accounts", { name: "Test" })
  expect(capturedSolution).toBe("mySolution")
})

test("suppressDuplicateDetection true sends string true", async () => {
  let capturedHeader = ""
  const dupClient = new DataverseClient({
    url: BASE_URL,
    suppressDuplicateDetection: true,
  })
  server.use(
    http.post(`${BASE_URL}/api/data/v9.2/accounts`, ({ request }) => {
      capturedHeader = request.headers.get("MSCRM.SuppressDuplicateDetection") ?? ""
      return HttpResponse.json({ accountid: "new-id", name: "Test" })
    }),
  )
  await dupClient.postRecordGetId("accounts", { name: "Test" })
  expect(capturedHeader).toBe("true")
})

test("suppressDuplicateDetection false sends string false", async () => {
  let capturedHeader = ""
  const dupClient = new DataverseClient({
    url: BASE_URL,
    suppressDuplicateDetection: false,
  })
  server.use(
    http.post(`${BASE_URL}/api/data/v9.2/accounts`, ({ request }) => {
      capturedHeader = request.headers.get("MSCRM.SuppressDuplicateDetection") ?? ""
      return HttpResponse.json({ accountid: "new-id", name: "Test" })
    }),
  )
  await dupClient.postRecordGetId("accounts", { name: "Test" })
  expect(capturedHeader).toBe("false")
})

test("bypassCustomPluginExecution true sends string true", async () => {
  let capturedHeader = ""
  const pluginClient = new DataverseClient({
    url: BASE_URL,
    bypassCustomPluginExecution: true,
  })
  server.use(
    http.post(`${BASE_URL}/api/data/v9.2/accounts`, ({ request }) => {
      capturedHeader = request.headers.get("MSCRM.BypassCustomPluginExecution") ?? ""
      return HttpResponse.json({ accountid: "new-id", name: "Test" })
    }),
  )
  await pluginClient.postRecordGetId("accounts", { name: "Test" })
  expect(capturedHeader).toBe("true")
})

test("undefined typed options do not emit headers", async () => {
  let capturedHeaders: Record<string, string> = {}
  server.use(
    http.get(`${BASE_URL}/api/data/v9.2/accounts`, ({ request }) => {
      request.headers.forEach((value, key) => { capturedHeaders[key.toLowerCase()] = value })
      return HttpResponse.json({ value: [] })
    }),
  )
  await client.getRecords("accounts")
  expect(capturedHeaders["prefer"]).toBeUndefined()
  expect(capturedHeaders["consistency"]).toBeUndefined()
  expect(capturedHeaders["mscrm.solutionuniquename"]).toBeUndefined()
  expect(capturedHeaders["mscrm.suppressduplicatedetection"]).toBeUndefined()
  expect(capturedHeaders["mscrm.bypasscustompluginexecution"]).toBeUndefined()
})
