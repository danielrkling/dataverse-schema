import { defineConfig } from "vitest/config";

export default defineConfig({
  // Unit tests exercise pure logic only (URL/header builders, transforms) —
  // no HTTP mocking, matching the monorepo's test strategy.
  test: {
    environment: "node",
  },
});
