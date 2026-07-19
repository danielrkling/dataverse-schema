// vite.config.ts
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";
import path from "path";

export default defineConfig({
  build: {
    lib: {
      entry: {
        "dataverse-schema": path.resolve(__dirname, "src/index.ts"),
        tanstack: path.resolve(__dirname, "src/tanstack/index.ts"),
      },
      formats: ["es"],
      fileName: (format, entryName) => `${entryName}.js`,
    },
    rollupOptions: {
      external: ["@tanstack/db"],
    },
    minify: false,
    target: "esnext",
  },
  test:{
    environment:"jsdom",
    setupFiles:["./test/setup.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
    },
  },
  plugins: [
    dts({
      rollupTypes: true,
      compilerOptions: {
        target: "esnext",
      },
      outDir: "dist",
      entryRoot: "src",
    }),
  ],
});
