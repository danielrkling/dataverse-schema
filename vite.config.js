import { defineConfig } from "vite";
import dts from "vite-plugin-dts";
import path from "path";

export default defineConfig(({ mode }) => {
  if (mode === "browser-test") {
    return {
      define: {
        __BUILD_STAMP__: JSON.stringify(new Date().toISOString()),
      },
      build: {
        outDir: path.resolve(__dirname, "test/browser/dist"),
        emptyOutDir: true,
        lib: {
          entry: path.resolve(__dirname, "test/browser/main.ts"),
          formats: ["iife"],
          name: "DataverseBrowserTests",
          fileName: () => "browser-test.js",
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
