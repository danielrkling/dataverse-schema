import { expect, test } from "vitest";
import { primaryKey, table } from "../src";

test("adds 1 + 2 to equal 3", () => {
  expect(table("name",{
    id: primaryKey("test")
  }))
});