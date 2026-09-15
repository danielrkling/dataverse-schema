// @vitest-environment node
import { expect, test } from "vitest"
import { DataverseClient, DataverseHttpError, mapChoices } from "../src"

// --- Construction ---

test("constructor strips trailing slashes from url", () => {
  const client = new DataverseClient({ url: "https://org.crm.dynamics.com///" })
  expect(client.options.url).toBe("https://org.crm.dynamics.com")
})

test("constructor preserves other options", () => {
  const client = new DataverseClient({
    url: "https://org.crm.dynamics.com",
    token: "tok",
    impersonateByUserId: "guid",
    headers: { "x-custom": "1" },
  })
  expect(client.options.token).toBe("tok")
  expect(client.options.impersonateByUserId).toBe("guid")
  expect(client.options.headers).toEqual({ "x-custom": "1" })
})

test("constructor throws when no url is available outside a browser", () => {
  expect(() => new DataverseClient({})).toThrow("A Dataverse URL is required outside a browser")
})

// --- URL builders (pure string helpers) ---

test("getPropertyRawValueURL builds $value endpoint", () => {
  const client = new DataverseClient({ url: "https://org.crm.dynamics.com" })
  expect(client.getPropertyRawValueURL("accounts", "guid-1", "entityimage")).toBe(
    "https://org.crm.dynamics.com/api/data/v9.2/accounts(guid-1)/entityimage/$value",
  )
})

test("getImageFullSizeURL appends size=full", () => {
  const client = new DataverseClient({ url: "https://org.crm.dynamics.com" })
  expect(client.getImageFullSizeURL("accounts", "guid-1", "entityimage")).toBe(
    "https://org.crm.dynamics.com/api/data/v9.2/accounts(guid-1)/entityimage/$value?size=full",
  )
})

test("getImageDownloadURL builds legacy download endpoint", () => {
  const client = new DataverseClient({ url: "https://org.crm.dynamics.com" })
  expect(client.getImageDownloadURL("contacts", "guid-2", "entityimage")).toBe(
    "https://org.crm.dynamics.com/Image/download.aspx?Entity=contacts&Attribute=entityimage&Id=guid-2&Full=true",
  )
})

test("url builders accept Name objects", () => {
  const client = new DataverseClient({ url: "https://org" })
  expect(client.getPropertyRawValueURL({ name: "accounts" }, "g", { name: "photo" })).toBe(
    "https://org/api/data/v9.2/accounts(g)/photo/$value",
  )
})

// --- DataverseHttpError ---

test("DataverseHttpError carries status and body", () => {
  const err = new DataverseHttpError("404 Not Found", 404, "Not Found", { error: {} })
  expect(err).toBeInstanceOf(Error)
  expect(err.name).toBe("DataverseHttpError")
  expect(err.status).toBe(404)
  expect(err.statusText).toBe("Not Found")
  expect(err.body).toEqual({ error: {} })
  expect(err.message).toBe("404 Not Found")
})

// --- mapChoices (pure) ---

test("mapChoices maps raw option set metadata", () => {
  const data = {
    Options: [
      {
        Value: 1,
        Color: "#ff0000",
        Label: { UserLocalizedLabel: { Label: "Active" } },
        Description: { UserLocalizedLabel: { Label: "The active state" } },
      },
      {
        Value: "2",
        Color: null,
        Label: { UserLocalizedLabel: { Label: "Inactive" } },
        Description: { UserLocalizedLabel: { Label: "The inactive state" } },
      },
    ],
  }
  expect(mapChoices(data)).toEqual([
    { value: 1, color: "#ff0000", label: "Active", description: "The active state" },
    { value: 2, color: "null", label: "Inactive", description: "The inactive state" },
  ])
})

test("mapChoices returns empty array for no options", () => {
  expect(mapChoices({ Options: [] })).toEqual([])
})

// --- overriddencreatedon option ---

test("postRecord injects overriddencreatedon into the request body", async () => {
  const client = new DataverseClient({ url: "https://org.crm.dynamics.com/api/data/v9.2" })
  let body: any
  client.fetch = async (_url: any, init: any) => {
    body = JSON.parse(init.body as string)
    return "00000000-0000-0000-0000-000000000001"
  }
  await client.postRecord(
    "accounts",
    { name: "New Account" },
    { returnRepresentation: false, overriddenCreatedOn: new Date("2026-09-13T14:22:00Z") },
  )
  expect(body.overriddencreatedon).toBe("2026-09-13T14:22:00.000Z")
})

test("postRecord accepts an ISO string for overriddenCreatedOn", async () => {
  const client = new DataverseClient({ url: "https://org.crm.dynamics.com/api/data/v9.2" })
  let body: any
  client.fetch = async (_url: any, init: any) => {
    body = JSON.parse(init.body as string)
    return "00000000-0000-0000-0000-000000000001"
  }
  await client.postRecord(
    "accounts",
    { name: "New Account" },
    { returnRepresentation: false, overriddenCreatedOn: "2026-09-13T14:22:00+02:00" },
  )
  expect(body.overriddencreatedon).toBe("2026-09-13T12:22:00.000Z")
})
