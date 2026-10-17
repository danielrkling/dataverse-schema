// @vitest-environment jsdom
import { expect, test } from "vitest"
import {
  attachETag, getEtag, mergeRecords, xml, parseDateOnly, toDateOnly,
  getName, base64ImageToURL, getImageUrl, toBase64, asc, desc, OrderSpec,
  isNonEmptyString, ETAG, select, keys,
} from "../src"

// --- ETag helpers ---

test("attachETag copies @odata.etag to $etag key", () => {
  const record: Record<string, unknown> = { name: "A", "@odata.etag": "W/\"123\"" }
  const result = attachETag(record)
  expect(result[ETAG]).toBe("W/\"123\"")
  expect(result).toBe(record)
})

test("attachETag handles missing etag", () => {
  const record: Record<string, unknown> = { name: "A" }
  attachETag(record)
  expect(record[ETAG]).toBeUndefined()
})

test("attachETag ignores non-objects", () => {
  expect(attachETag("str")).toBe("str")
  expect(attachETag(null)).toBeNull()
  expect(attachETag(undefined)).toBeUndefined()
})

test("getEtag reads the $etag key", () => {
  expect(getEtag({ [ETAG]: "W/\"1\"" })).toBe("W/\"1\"")
  expect(getEtag({})).toBeUndefined()
  expect(getEtag(null)).toBeUndefined()
  expect(getEtag(undefined)).toBeUndefined()
})

test("mergeRecords retains previous references when etag unchanged", () => {
  const prev = { [ETAG]: "1", name: "Old" }
  const next = { [ETAG]: "1", name: "New" }
  const result = mergeRecords([prev], [next])
  expect(result[0]).toBe(prev)
})

test("mergeRecords uses new record when etag changed or unseen", () => {
  const prev = { [ETAG]: "1", name: "Old" }
  const changed = { [ETAG]: "2", name: "New" }
  const added = { [ETAG]: "3", name: "Added" }
  const result = mergeRecords([prev], [changed, added])
  expect(result[0]).toBe(changed)
  expect(result[1]).toBe(added)
})

test("mergeRecords returns empty array for empty input", () => {
  expect(mergeRecords([], [])).toEqual([])
})

// --- xml template tag ---

test("xml tag trims and collapses whitespace between tags", () => {
  const result = xml`
    <root>
      <element>Hello</element>
      <empty />
    </root>
  `
  expect(result).toBe("<root><element>Hello</element><empty /></root>")
})

test("xml tag preserves whitespace inside text nodes", () => {
  const result = xml`<a>hello world</a>`
  expect(result).toBe("<a>hello world</a>")
})

test("xml tag interpolates values", () => {
  const name = "accounts"
  const result = xml`
    <entity name="${name}">
      <attribute name="x" />
    </entity>
  `
  expect(result).toBe(`<entity name="accounts"><attribute name="x" /></entity>`)
})

// --- date helpers ---

test("parseDateOnly creates local Date from first 10 chars", () => {
  const d = parseDateOnly("2024-03-05T10:00:00Z")
  expect(d.getFullYear()).toBe(2024)
  expect(d.getMonth()).toBe(2)
  expect(d.getDate()).toBe(5)
})

test("toDateOnly formats as YYYY-MM-DD with zero padding", () => {
  expect(toDateOnly(new Date(2024, 0, 5))).toBe("2024-01-05")
  expect(toDateOnly(new Date(2024, 10, 25))).toBe("2024-11-25")
})

test("toDateOnly returns null for invalid input", () => {
  expect(toDateOnly(undefined as any)).toBeNull()
})

// --- getName ---

test("getName passes strings through", () => {
  expect(getName("fullname")).toBe("fullname")
})

test("getName reads .name property", () => {
  expect(getName({ name: "fullname" })).toBe("fullname")
})

test("getName falls back to toString", () => {
  expect(getName({ toString: () => "derived" } as any)).toBe("derived")
})

// --- image helpers ---

test("base64ImageToURL detects png", () => {
  expect(base64ImageToURL("iVBORw0KGgoAAAANSUhEUgAA")).toBe("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA")
})

test("base64ImageToURL detects jpeg", () => {
  expect(base64ImageToURL("/9j/4AAQSkZJRgABAQEAYABgAAD/")).toBe("data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/")
})

test("base64ImageToURL detects gif", () => {
  expect(base64ImageToURL("R0lGODlhAQAB")).toBe("data:image/gif;base64,R0lGODlhAQAB")
})

test("base64ImageToURL defaults to png for unknown data", () => {
  expect(base64ImageToURL("c29tZXRoaW5n")).toBe("data:image/png;base64,c29tZXRoaW5n")
})

test("getImageUrl builds legacy image download URL", () => {
  const url = getImageUrl("contact", "entityimage", "abc-123")
  expect(url).toContain("/Image/download.aspx?Entity=contact&Attribute=entityimage&Id=abc-123&Full=true")
  expect(url.startsWith(location.origin)).toBe(true)
})

test("toBase64 strips data URL prefix", async () => {
  const file = new File(["hello"], "hello.txt", { type: "text/plain" })
  const base64 = await toBase64(file)
  expect(base64).toBe(btoa("hello"))
})

// --- order specs ---

test("OrderSpec joins multiple fields with direction", () => {
  expect(String(new OrderSpec(["a", "b"], "desc"))).toBe("a desc,b desc")
})

test("asc maps Name objects", () => {
  expect(`${asc({ name: "fullname" }, "email")}`).toBe("fullname asc,email asc")
})

test("desc maps Name objects", () => {
  expect(`${desc({ name: "fullname" })}`).toBe("fullname desc")
})

// --- misc ---

test("isNonEmptyString narrows correctly", () => {
  expect(isNonEmptyString("a")).toBe(true)
  expect(isNonEmptyString("")).toBe(false)
  expect(isNonEmptyString(null)).toBe(false)
  expect(isNonEmptyString(5)).toBe(false)
})

test("select deduplicates nothing but filters empties across Name types", () => {
  expect(select("a", "", { name: "b" }, { toString: () => "c" } as any)).toBe("a,b,c")
})

test("keys skips empty values", () => {
  expect(keys({ a: "x", b: "" })).toBe("a='x'")
})
