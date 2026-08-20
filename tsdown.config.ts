import { defineConfig } from 'tsdown';

export default defineConfig({
  // 1. Define your entry points exactly like you did in Vite
  entry: {
    index: 'src/index.ts',
    'tanstack-db/index': 'src/tanstack-db/index.ts' 
  },
  
  // 2. Output ES modules (.mjs)
  format: ['esm'],
  
  // 3. Enable automatic isolated type-bundling
  dts: true,
  
  // 4. Mark dependencies & peer dependencies as external
  external: ['@tanstack/db', 'valibot', 'dataverse-schema'],
  
  // 5. Build configuration optimization
  minify: false,
  platform: 'browser',
  clean: true, // Clean the dist folder before every build automatically!
});