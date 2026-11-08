import { defineConfig } from "vitest/config";

export default defineConfig({
  // Unit tests exercise the storage layer through an in-memory directory
  // handle (see test/memory-fs.ts) — no browser or real filesystem required.
  test: {
    environment: "node",
  },
});
