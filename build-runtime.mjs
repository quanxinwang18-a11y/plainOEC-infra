import { build } from 'esbuild';
import { resolve } from 'node:path';

const workspaceRoot = import.meta.dirname;
const productRoot = resolve(workspaceRoot, 'oec-product');
const engineeringRoot = resolve(workspaceRoot, 'oec-engineering');
const e3Root = resolve(workspaceRoot, 'oec-e3');
const pipelineRoot = resolve(workspaceRoot, 'oec-pipeline');

const common = {
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  sourcemap: false,
  legalComments: 'eof',
  alias: {
    yaml: resolve(workspaceRoot, 'node_modules/yaml'),
  },
  banner: {
    js: 'import { createRequire as __oecCreateRequire } from "node:module"; const require = __oecCreateRequire(import.meta.url);',
  },
};

await Promise.all([
  build({
    ...common,
    absWorkingDir: e3Root,
    entryPoints: ['servers/e3/runtime.mjs'],
    outfile: 'dist/e3-server.mjs',
  }),
  build({
    ...common,
    absWorkingDir: e3Root,
    entryPoints: ['servers/e3/runtime.mjs'],
    // Transitional bundle retained until oec-product declares the oec-e3 dependency.
    outfile: resolve(productRoot, 'dist/e3-server.mjs'),
  }),
  build({
    ...common,
    absWorkingDir: pipelineRoot,
    entryPoints: ['servers/pipeline/runtime.mjs'],
    outfile: 'dist/pipeline-server.mjs',
  }),
  build({
    ...common,
    absWorkingDir: productRoot,
    entryPoints: ['skills/writing-prds/scripts/check-artifacts-cli.mjs'],
    outfile: 'skills/writing-prds/runtime/check-artifacts.mjs',
  }),
  build({
    ...common,
    absWorkingDir: engineeringRoot,
    entryPoints: ['scripts/spec-tool-cli.mjs'],
    outfile: 'dist/oec-spec.mjs',
  }),
]);
