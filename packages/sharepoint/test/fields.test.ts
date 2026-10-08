import { expect, test } from "vitest";
import { text, number, bool, date, datetime, json, people, lookupId, parseIdName } from "../src/fields";

// --- date: real Date objects ---

test("date reads wire strings as Date and rejects non-Date writes", () => {
    const f = date("DueDate");
    expect(f.fromSharePoint("2026-01-02")).toEqual(new Date("2026-01-02"));
    expect(f.fromSharePoint(null)).toBeNull();
    expect(f.toSharePoint(new Date("2026-01-02") as any)).toBe("2026-01-02T00:00:00.000Z");
    expect(() => f.toSharePoint("2026-01-02" as any)).toThrow(TypeError);
});

test("datetime reads wire strings as Date", () => {
    const f = datetime("Created");
    expect(f.fromSharePoint("2026-01-02T03:04:05Z")).toEqual(new Date("2026-01-02T03:04:05Z"));
    expect(f.fromSharePoint(null)).toBeNull();
});

// --- json ---

test("json parses string columns and serializes objects back", () => {
    const f = json<{ a: number }>("Meta0");
    expect(f.fromSharePoint(null)).toBeNull();
    expect(f.fromSharePoint("")).toBeNull();
    expect(f.fromSharePoint('{"a":1}')).toEqual({ a: 1 });
    expect(() => f.fromSharePoint("{oops")).toThrow('Invalid JSON in column "Meta0"');
    expect(f.toSharePoint({ a: 1 })).toBe('{"a":1}');
    // pre-serialized strings pass through (option spreads, cached strings)
    expect(f.toSharePoint('{"a":1}' as any)).toBe('{"a":1}');
    expect(f.toSharePoint(null as any)).toBeNull();
});

// --- people ---

test("people reads unexpanded, expanded numbers and legacy string shapes", () => {
    const f = people("OwnerId");
    expect(f.fromSharePoint(null)).toBeNull();
    expect(f.fromSharePoint(0)).toBeNull(); // no-user sentinel
    expect(f.fromSharePoint(17)).toEqual({ id: 17 });
    expect(f.fromSharePoint({ __metadata: { type: "SP.FieldUserValue" }, Id: 17 })).toEqual({ id: 17 });
    expect(f.fromSharePoint({ Id: 17, Title: "Jane Doe" })).toEqual({ id: 17, name: "Jane Doe" });
    expect(f.fromSharePoint("17;#Jane Doe")).toEqual({ id: 17, name: "Jane Doe" });
    expect(f.fromSharePoint("")).toBeNull();
});

test("people writes send the plain numeric id; object writes validate shape", () => {
    const f = people("OwnerId");
    expect(f.toSharePoint({ id: 17 })).toBe(17);
    expect(f.toSharePoint(null as any)).toBeNull();
    expect(() => f.toSharePoint({ id: "x" } as any)).toThrow(TypeError);
});

// --- lookupId ---

test("lookupId reads LookupId-expanded objects and legacy strings", () => {
    const f = lookupId("RefId");
    expect(f.fromSharePoint(null)).toBeNull();
    expect(f.fromSharePoint({ __metadata: { type: "SP.FieldLookupValue" }, LookupId: 2 })).toEqual({ id: 2 });
    expect(f.fromSharePoint({ Id: 2, Title: "Project Alpha" })).toEqual({ id: 2, name: "Project Alpha" });
    expect(f.fromSharePoint("2;#Project Alpha")).toEqual({ id: 2, name: "Project Alpha" });
    expect(f.toSharePoint({ id: 2 } as any)).toBe(2);
});

test("parseIdName handles id-only and empty legacy strings", () => {
    expect(parseIdName("5;#")).toEqual({ id: 5 });
    expect(parseIdName("5;#")).not.toHaveProperty("name");
    expect(parseIdName("0;#")).toBeNull();
    expect(parseIdName(undefined)).toBeNull();
});
