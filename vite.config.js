import { defineConfig } from "vite";
import dts from "vite-plugin-dts";
import path from "path";

export default defineConfig(({ mode }) => {
  if (mode === "browser-test" || mode === "browser-db-test") {
    const isDb = mode === "browser-db-test"
    return {
      define: {
        __BUILD_STAMP__: JSON.stringify(new Date().toISOString()),
      },
      resolve: {
        alias: {
          // The tanstack-db adapter imports the core library via the bare
          // "dataverse-schema" specifier; point it at the source during the
          // browser-test build so we don't depend on a prebuilt dist/.
          "dataverse-schema": path.resolve(__dirname, "src/index.ts"),
        },
      },
      build: {
        outDir: path.resolve(__dirname, "test/browser/dist"),
        // Keep the two bundles side by side in dist/.
        emptyOutDir: false,
        lib: {
          entry: path.resolve(__dirname, isDb ? "test/browser/tanstack/main.ts" : "test/browser/main.ts"),
          formats: ["iife"],
          name: isDb ? "DataverseBrowserDbTests" : "DataverseBrowserTests",
          fileName: () => (isDb ? "browser-db-test.js" : "browser-test.js"),
        },
        rollupOptions: {
          output: {
            inlineDynamicImports: true,
          },
        },
        minify: false,
        target: "esnext",
      },
    };
  }

  return {
    build: {
      lib: {
        entry: {
          "dataverse-schema": path.resolve(__dirname, 'src/index.ts'),
          "tanstack-db": path.resolve(__dirname, 'src/tanstack-db/index.ts')
        },
        formats: ["es"],
        // fileName: (format, entryName) => {
        //   return `${entryName}.mjs`;
        // },
      },
      rollupOptions: {
        external: ["@tanstack/db", "valibot", "dataverse-schema"],
      },
      minify: false,
      target: "esnext",
    },

    plugins: [
      dts({
        insertTypesEntry: true,
        tsconfigPath: './tsconfig.json',
      }),
    ],
  };
});
