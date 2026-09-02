import { build } from 'esbuild';
import { resolve } from 'node:path';
import { generateDevCodexAgents } from './scripts/generate-dev-codex-agents.mjs';

const workspaceRoot = import.meta.dirname;
const productRoot = resolve(workspaceRoot, 'oec-product');
const engineeringRoot = resolve(workspaceRoot, 'oec-dev');
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

// Claude Markdown is the canonical Engineering Agent source. Keep the committed
// experimental Codex mirrors generated instead of maintaining two prompt copies.
await generateDevCodexAgents({ pluginRoot: engineeringRoot });

await Promise.all([
  build({
    ...common,
    absWorkingDir: e3Root,
    entryPoints: ['servers/e3/runtime.mjs'],
    outfile: 'dist/e3-server.mjs',
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
    entryPoints: ['skills/prd-write/scripts/check-artifacts-cli.mjs'],
    outfile: 'skills/prd-write/runtime/check-artifacts.mjs',
  }),
  build({
    ...common,
    absWorkingDir: engineeringRoot,
    entryPoints: ['scripts/spec-tool-cli.mjs'],
    outfile: 'dist/oec-spec.mjs',
  }),
]);
