import assert from 'node:assert/strict';
import { copyFile, mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const pluginRoot = resolve(import.meta.dirname, '..', '..', '..');
const e3Bundle = resolve(pluginRoot, 'dist/e3-server.mjs');

test('committed E3 bundle contains no development path or external package import', async () => {
  const content = await readFile(e3Bundle, 'utf8');
  assert.doesNotMatch(content, new RegExp(pluginRoot.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  const imports = [...content.matchAll(/^import .* from "([^"]+)";/gm)].map((match) => match[1]);
  assert.equal(imports.every((specifier) => specifier.startsWith('node:')), true, imports.join(', '));
});

test('bundled E3 server completes MCP stdio discovery without node_modules', async () => {
  const isolated = await mkdtemp(join(tmpdir(), 'oec-e3-bundle-'));
  const executable = join(isolated, 'e3-server.mjs');
  const dataDirectory = join(isolated, 'data');
  await copyFile(e3Bundle, executable);
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [executable],
    env: { ...process.env, OEC_PLUGIN_DATA: dataDirectory },
  });
  const client = new Client({ name: 'bundle-distribution-test', version: '1.0.0' }, { capabilities: {} });
  await client.connect(transport);
  try {
    const tools = await client.listTools();
    assert.deepEqual(tools.tools.map((tool) => tool.name), [
      'prepare_prd_publish',
      'select_product_space',
      'execute_prd_publish',
      'get_prd_publish_status',
      'prepare_development_tasks',
      'select_development_requirement',
      'execute_development_tasks',
      'prepare_task_progress',
      'execute_task_progress',
      'get_development_task_status',
    ]);
    const execute = tools.tools.find((tool) => tool.name === 'execute_prd_publish');
    assert.equal(execute._meta['anthropic/requiresUserInteraction'], true);
    const developmentExecute = tools.tools.find((tool) => tool.name === 'execute_development_tasks');
    assert.equal(developmentExecute._meta['anthropic/requiresUserInteraction'], true);
    const progressExecute = tools.tools.find((tool) => tool.name === 'execute_task_progress');
    assert.equal(progressExecute._meta['anthropic/requiresUserInteraction'], true);
  } finally {
    await client.close();
  }
});
