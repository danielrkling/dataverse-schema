import { expect, test } from "vitest"
import { DataverseClient } from "../src/client"
import { BASE_URL } from "./mocks/handlers"
import { http, HttpResponse } from "msw"
import { server } from "./mocks/server"

const client = new DataverseClient({ url: BASE_URL })

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

test("fetch handles 204 without OData-EntityId", async () => {
  server.use(
    http.delete(`${BASE_URL}/api/data/v9.2/accounts/:id`, () => {
      return new HttpResponse(null, { status: 204 })
    }),
  )
  const result = await client.fetch("accounts(test-id)", { method: "DELETE" })
  expect(result).toBeUndefined()
})
