import { expect, test } from "vitest";
import { number, primaryKey, string, table } from "../src";

test("creates a table with a primary key", () => {
  const id = primaryKey("accountid");
  const myTable = table("accounts", {
    id
  });
  expect(myTable).toBeDefined();
  expect(myTable.properties.id).toBeDefined();
  expect(myTable.getPrimaryKey().key).toBe("id");
  expect(myTable.getPrimaryKey().property).toBe(id);
  expect(myTable.getPrimaryId({id: "12345678-90ab-cdef-1234-567890abcdef"})).toBe("12345678-90ab-cdef-1234-567890abcdef");
});

test("retrieves default values for a table", () => {
  const myTable = table("accounts", {
    id: primaryKey("accountid"),
    firstName: string("name").setDefault("Default Name"),
    lastName: string("surname"),
    numberA: number("number"),
    numberB: number("number2").setDefault(42),

  });
  const defaults = myTable.getDefault();
  expect(defaults).toHaveProperty("id");
  expect(defaults).toHaveProperty("firstName", "Default Name");
  expect(defaults).toHaveProperty("lastName", null);
  expect(defaults).toHaveProperty("numberA", null);
  expect(defaults).toHaveProperty("numberB", 42);
});

