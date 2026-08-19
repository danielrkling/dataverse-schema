import { defineConfig } from "vite";
import dts from "vite-plugin-dts";
import path from "path";

const src = path.resolve(__dirname, "src");

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

  if (mode === "tanstack") {
    return {
      build: {
        emptyOutDir: false,
        lib: {
          entry: path.resolve(src, "tanstack/index.ts"),
          formats: ["es"],
          fileName: () => "tanstack.mjs",
        },
        rollupOptions: {
          external: ["@tanstack/db", "dataverse-schema"],
        },
        minify: false,
        target: "esnext",
      },

      plugins: [
        dts({
          rollupTypes: true,
          outDir: "dist",
          entryRoot: src,
          compilerOptions: {
            target: "esnext",
          },
          beforeWriteFile(filePath, content) {
            if (path.basename(filePath) === "dataverse-schema.d.ts") {
              return {
                filePath: path.resolve("dist", "tanstack.d.ts"),
                content,
              };
            }
          },
        }),
      ],
    };
  }

  if (mode === "tanstack-db") {
    return {
      build: {
        emptyOutDir: false,
        lib: {
          entry: path.resolve(src, "tanstack-db/index.ts"),
          formats: ["es"],
          fileName: () => "tanstack-db.mjs",
        },
        rollupOptions: {
          external: ["@tanstack/db", "dataverse-schema"],
        },
        minify: false,
        target: "esnext",
      },

      plugins: [
        dts({
          rollupTypes: true,
          outDir: "dist",
          entryRoot: src,
          compilerOptions: {
            target: "esnext",
          },
          beforeWriteFile(filePath, content) {
            if (path.basename(filePath) === "dataverse-schema.d.ts") {
              return {
                filePath: path.resolve("dist", "tanstack-db.d.ts"),
                content,
              };
            }
          },
        }),
      ],
    };
  }

  return {
    build: {
      lib: {
        entry: path.resolve(src, "index.ts"),
        formats: ["es"],
        fileName: () => "dataverse-schema.mjs",
      },
      rollupOptions: {
        external: ["@tanstack/db"],
      },
      minify: false,
      target: "esnext",
    },

    plugins: [
      dts({
        rollupTypes: true,
        outDir: "dist",
        entryRoot: src,
        compilerOptions: {
          target: "esnext",
        },
      }),
    ],
  };
});
