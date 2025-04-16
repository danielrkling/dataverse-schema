// vite.config.ts
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";
import path from "path";

export default defineConfig({
  build: {
    lib: {
      entry: path.resolve(__dirname, "src/index.ts"), 
      name: "dataverse-schema", 
      formats: ["es"], 
      fileName: "dataverse-schema", 
    },
    rollupOptions: {
      external: [], // Add external dependencies if needed
    },
    minify: false,
    target: "esnext",
  },
  plugins: [
    dts({
      rollupTypes: true,
      compilerOptions: {
        target: "esnext",
      },
      outDir: "dist", // Ensure d.ts files are emitted to 'dist'
      entryRoot: "src", //Ensure d.ts files are emitted from src.
    }),
  ],
});
