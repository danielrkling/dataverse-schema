import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: { index: 'src/index.ts', 'adapters/tanstack': 'src/adapters/tanstack.ts' },
  format: ['esm'],
  dts: true,
  deps: { neverBundle: ['@tanstack/db'] },
  minify: false,
  platform: 'browser',
  clean: true,
});
