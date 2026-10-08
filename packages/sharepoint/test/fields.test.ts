import { expect, test } from "vitest";
import * as v from "valibot";
import { text, number, bool, date, datetime, json, choice, multiChoice, people, person, multiLookup, lookup, parseIdName } from "../src/fields";

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

test("person reads unexpanded, expanded numbers and legacy string shapes", () => {
    const f = person("OwnerId");
    expect(f.fromSharePoint(null)).toBeNull();
    expect(f.fromSharePoint(0)).toBeNull(); // no-user sentinel
    expect(f.fromSharePoint(17)).toEqual({ id: 17 });
    expect(f.fromSharePoint({ __metadata: { type: "SP.FieldUserValue" }, Id: 17 })).toEqual({ id: 17 });
    expect(f.fromSharePoint({ Id: 17, Title: "Jane Doe", EMail: "jane@x" })).toEqual({ id: 17, name: "Jane Doe", email: "jane@x" });
    expect(f.fromSharePoint("17;#Jane Doe")).toEqual({ id: 17, name: "Jane Doe" });
    expect(f.fromSharePoint("")).toBeNull();
    expect(f.writeName).toBe("OwnerIdId"); // legacy REST write key
});

test("person writes send the plain numeric id under <Name>Id; typed shape optional", () => {
    const f = person("OwnerId");
    const t = person("OwnerId", { writeShape: "typed" });
    expect(f.toSharePoint({ id: 17 })).toBe(17);
    expect(f.toSharePoint(null)).toBeNull();
    expect(t.toSharePoint({ id: 17 })).toEqual({ __metadata: { type: "SP.FieldUserValue" }, id: 17 });
    expect(() => f.toSharePoint({ id: "x" } as any)).toThrow(TypeError);
});

test("people reads expanded person result arrays, writes the <Name>Id envelope", () => {
    const f = people("Members");
    expect(f.fromSharePoint(null)).toEqual([]); // empty ⇔ []
    expect(f.fromSharePoint({ results: [{ Id: 1, Title: "A", EMail: "a@x" }, { Id: 2, Title: "B" }] }))
        .toEqual([{ id: 1, name: "A", email: "a@x" }, { id: 2, name: "B" }]);
    expect(f.fromSharePoint([{ Id: 3 }, 4])).toEqual([{ id: 3 }, { id: 4 }]);
    expect(f.writeName).toBe("MembersId");
    expect(f.toSharePoint([{ id: 1 }, { id: 2 }] as any)).toEqual({ results: [1, 2] });
    expect(() => f.toSharePoint([{ id: "?" }] as any)).toThrow(TypeError);
});

// --- lookup ---

test("lookup reads LookupId-expanded objects and legacy strings", () => {
    const f = lookup("Ref");
    expect(f.fromSharePoint(null)).toBeNull();
    expect(f.fromSharePoint({ __metadata: { type: "SP.FieldLookupValue" }, LookupId: 2 })).toEqual({ id: 2 });
    expect(f.fromSharePoint({ Id: 2, Title: "Project Alpha" })).toEqual({ id: 2, title: "Project Alpha" });
    expect(f.fromSharePoint("2;#Project Alpha")).toEqual({ id: 2, title: "Project Alpha" });
    expect(f.writeName).toBe("RefId"); // derived write key
    expect(f.toSharePoint({ id: 2 } as any)).toBe(2);
    expect(lookup("Ref", { writeShape: "typed" }).toSharePoint({ id: 2 } as any))
        .toEqual({ __metadata: { type: "SP.FieldLookupValue" }, id: 2 });
});

test("parseIdName handles id-only and empty legacy strings", () => {
    expect(parseIdName("5;#")).toEqual({ id: 5 });
    expect(parseIdName("5;#")).not.toHaveProperty("name");
    expect(parseIdName("0;#")).toBeNull();
    expect(parseIdName(undefined)).toBeNull();
});

// --- choice: value union inferred from the choices array ---

test("choice infers the display-string union from choices (no explicit generic)", () => {
    const f = choice("Status", { choices: ["Draft", "Pending", "Approved"] });
    // compile-time evidence: the read type IS the inferred union | null —
    // these assignments only typecheck if fromSharePoint returns exactly that.
    const draft: "Draft" | "Pending" | "Approved" | null = f.fromSharePoint("Draft");
    expect(draft).toBe("Draft");
    const unsetValue: "Draft" | "Pending" | "Approved" | null = f.fromSharePoint(null);
    expect(unsetValue).toBeNull();
    // an out-of-table value must NOT be assignable (would fail: Type '"X"')
    const explicit: string | null = f.fromSharePoint("Any"); // widened ok
    expect(explicit).toBe("Any");
});

test("multiChoice values infer their element typing the same way", () => {
    const f = multiChoice("Tags", { choices: ["Alpha", "Beta"] });
    const tags = f.toSharePoint(["Alpha"] as any);
    expect(tags).toBe("Alpha");
});

// --- json: parse type + validation inferred from a Standard Schema ---

const metaSchema = v.object({ a: v.number(), raw: v.string() });

test("json infers its value type from the schema; values are validated on read", () => {
    const f = json("Meta0", { schema: metaSchema });
    // inference evidence: the read result satisfies exactly the valibot output
    const good: { a: number; raw: string } | null = f.fromSharePoint('{"a":1,"raw":"x"}');
    expect(good).toEqual({ a: 1, raw: "x" });
    expect(f.fromSharePoint(null)).toBeNull();

    // schema violation throws with the column name
    expect(() => f.fromSharePoint('{"a":"not-a-number","raw":"x"}')).toThrow('json column "Meta0" failed schema validation (1 issue)');
    expect(() => f.fromSharePoint("{broken")).toThrow('Invalid JSON in column "Meta0"');
});

test("json without a schema stays untyped parse-as-is", () => {
    const f = json("Meta0");
    expect(f.fromSharePoint('{"a":1}')).toEqual({ a: 1 });
});

// --- multiLookup: multi-lookup collections ---

test("multiLookup reads multi-lookup results and writes the <Name>Id envelope", () => {
    const f = multiLookup("Concur_x0020_Codes");
    expect(f.fromSharePoint(null)).toEqual([]);
    expect(f.fromSharePoint({ results: [
        { Id: 1, Title: "Nuc 23" },
        { LookupId: 2 },
    ] })).toEqual([{ id: 1, title: "Nuc 23" }, { id: 2 }]);
    expect(f.writeName).toBe("Concur_x0020_CodesId");
    expect(f.toSharePoint([{ id: 1 } as any, { id: 2 } as any])).toEqual({ results: [1, 2] });
});
