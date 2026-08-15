import { defineConfig } from "vite";
import dts from "vite-plugin-dts";
import path from "path";

const src = path.resolve(__dirname, "src");

export default defineConfig(({ mode }) => {
  if (mode === "tanstack") {
    return {
      build: {
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
