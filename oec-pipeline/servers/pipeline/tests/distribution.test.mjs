import assert from 'node:assert/strict';
import { copyFile, mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const pluginRoot = resolve(import.meta.dirname, '..', '..', '..');
const bundle = resolve(pluginRoot, 'dist/pipeline-server.mjs');

test('committed Pipeline bundle has no development path or package import', async () => {
  const content = await readFile(bundle, 'utf8');
  assert.doesNotMatch(content, new RegExp(pluginRoot.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  const imports = [...content.matchAll(/^import .* from "([^"]+)";/gm)].map((match) => match[1]);
  assert.equal(imports.every((specifier) => specifier.startsWith('node:')), true, imports.join(', '));
});

test('bundled Pipeline Server discovers four tools without node_modules', async () => {
  const isolated = await mkdtemp(join(tmpdir(), 'oec-pipeline-bundle-'));
  const executable = join(isolated, 'pipeline-server.mjs');
  await copyFile(bundle, executable);
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [executable],
    env: { ...process.env, OEC_PLUGIN_DATA: join(isolated, 'data') },
  });
  const client = new Client({ name: 'pipeline-bundle-test', version: '1.0.0' }, { capabilities: {} });
  await client.connect(transport);
  try {
    const tools = await client.listTools();
    assert.deepEqual(tools.tools.map((tool) => tool.name), [
      'prepare_pipeline_run',
      'select_pipeline_target',
      'execute_pipeline_run',
      'get_pipeline_run_status',
    ]);
    assert.equal(tools.tools.find((tool) => tool.name === 'execute_pipeline_run')._meta['anthropic/requiresUserInteraction'], true);
  } finally {
    await client.close();
  }
});
