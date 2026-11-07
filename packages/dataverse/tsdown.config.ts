import { defineConfig } from 'tsdown';

export default defineConfig({
  // 1. Define your entry points exactly like you did in Vite
  entry: {
    index: 'src/index.ts',
    'sync/index': 'src/sync/index.ts',
    'sync/tanstack': 'src/sync/tanstack.ts',
  },

  // 2. Output ES modules (.mjs)
  format: ['esm'],

  // 3. Enable automatic isolated type-bundling
  dts: true,
  deps:{
    neverBundle:['valibot', '@tanstack/db']
  },

  // 5. Build configuration optimization
  minify: false,
  platform: 'browser',
  clean: true, // Clean the dist folder before every build automatically!
});
