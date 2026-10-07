import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['esm'],
  dts: true,
  // don't bundle the workspace engine — it's a separate entry point
  deps: { neverBundle: ['@dataverse-schema/sync'] },
  minify: false,
  platform: 'browser',
  clean: true,
});
