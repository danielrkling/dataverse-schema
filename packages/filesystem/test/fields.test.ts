import { expect, test } from "vitest";
import * as v from "valibot";
import {
  bool,
  choice,
  date,
  datetime,
  json,
  multiChoice,
  number,
  primaryKey,
  text,
  title,
} from "../src/fields";

test("string and title fields read missing values as an empty string", () => {
  expect(text("title").fromStorage(null)).toBe("");
  expect(text("title").fromStorage(42)).toBe("42");
  expect(title().name).toBe("title");
  expect(title("Title").name).toBe("Title");
});

test("number fields parse numeric values and read missing values as null", () => {
  const field = number("amount");
  expect(field.fromStorage("3.5")).toBe(3.5);
  expect(field.fromStorage(null)).toBeNull();
  expect(field.fromStorage("nope")).toBeNull();
});

test("boolean fields read null as false and write only real booleans", () => {
  const field = bool("done");
  expect(field.fromStorage(null)).toBe(false);
  expect(field.fromStorage(true)).toBe(true);
  expect(field.fromStorage("true")).toBe(false);
  expect(field.toStorage(false)).toBe(false);
});

test("date/datetime fields round-trip through ISO strings", () => {
  const dateField = date("due");
  const datetimeField = datetime("created");

  expect(dateField.fromStorage("2026-01-02")).toEqual(new Date("2026-01-02"));
  expect(dateField.fromStorage(null)).toBeNull();
  expect(dateField.toStorage(new Date("2026-01-02") as any)).toBe("2026-01-02T00:00:00.000Z");
  expect(() => dateField.toStorage("2026-01-02" as any)).toThrow(TypeError);

  expect(datetimeField.fromStorage("2026-03-05T06:07:08Z")).toEqual(new Date("2026-03-05T06:07:08Z"));
  expect(datetimeField.fromStorage("not-a-date")).toBeNull();
});

test("json fields store real JSON and validate through a Standard Schema", () => {
  const noSchema = json("meta");
  expect(noSchema.fromStorage({ a: 1 })).toEqual({ a: 1 });
  expect(noSchema.fromStorage(null)).toBeNull();

  const withSchema = json("meta", { schema: v.object({ priority: v.number() }) });
  expect(withSchema.fromStorage({ priority: 2 })).toEqual({ priority: 2 });
  expect(() => withSchema.fromStorage({ priority: "high" })).toThrow(/failed schema validation/);
});

test("choice infers its literal union from the choices array", () => {
  const field = choice("status", { choices: ["Draft", "Done"] as const });
  const draft: "Draft" | "Done" | null = field.fromStorage("Draft");
  expect(draft).toBe("Draft");
  expect(field.fromStorage("")).toBeNull();
});

test("multiChoice reads JSON arrays and treats missing values as []", () => {
  const field = multiChoice("tags", { choices: ["a", "b"] as const });
  expect(field.fromStorage(["a"])).toEqual(["a"]);
  expect(field.fromStorage(null)).toEqual([]);
  expect(() => field.fromStorage("a")).toThrow(TypeError);
});

test("primaryKey coerces ids to strings and is read-only metadata", () => {
  const field = primaryKey();
  expect(field.name).toBe("id");
  expect(field.options.readonly).toBe(true);
  expect(field.fromStorage(12)).toBe("12");
  expect(field.toStorage("abc")).toBe("abc");
});
