import { defineConfig } from "vitest/config";

export default defineConfig({
  // Engine tests run in Node with fake-indexeddb providing the IDB globals.
  test: {
    environment: "node",
  },
});
