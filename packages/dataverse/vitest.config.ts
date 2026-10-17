import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      // Resolve the sibling sync package to source so tests don't need a prebuilt dist/.
      // The subpath entry must precede the bare specifier (first match wins).
      "dataverse-schema-sync/adapters/tanstack": path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../sync/src/adapters/tanstack.ts"),
      "dataverse-schema-sync": path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../sync/src/index.ts"),
    },
  },
});
