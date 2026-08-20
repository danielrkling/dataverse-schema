import { defineConfig } from "vite";
import dts from "vite-plugin-dts";
import path from "path";

export default defineConfig(({ mode }) => {
  if (mode === "browser-test") {
    return {
      build: {
        emptyOutDir: false,
        lib: {
          entry: path.resolve(__dirname, "test/browser-smoke.ts"),
          formats: ["iife"],
          name: "DataverseSchemaBrowserTest",
          fileName: () => "browser-smoke.js",
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
          index: path.resolve(__dirname, 'src/index.ts'),
          "tanstack-db": path.resolve(__dirname, 'src/tanstack-db/index.ts')
        },
        formats: ["es"],
              fileName: (format, entryName) => {
                        if (entryName === 'tanstack-db') {
          return 'tanstack-db/index.mjs';
        }
        return `${entryName}.mjs`;
      },
      },
      rollupOptions: {
        external: ["@tanstack/db","valibot","dataverse-schema"],
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
