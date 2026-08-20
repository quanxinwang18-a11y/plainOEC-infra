import { build } from 'esbuild';
import { resolve } from 'node:path';

const pluginRoot = resolve(import.meta.dirname, 'oec-product');

const common = {
  absWorkingDir: pluginRoot,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  sourcemap: false,
  legalComments: 'eof',
  banner: {
    js: 'import { createRequire as __oecCreateRequire } from "node:module"; const require = __oecCreateRequire(import.meta.url);',
  },
};

await Promise.all([
  build({
    ...common,
    entryPoints: ['servers/e3/runtime.mjs'],
    outfile: 'dist/e3-server.mjs',
  }),
  build({
    ...common,
    entryPoints: ['skills/writing-prds/scripts/check-artifacts-cli.mjs'],
    outfile: 'skills/writing-prds/runtime/check-artifacts.mjs',
  }),
]);
