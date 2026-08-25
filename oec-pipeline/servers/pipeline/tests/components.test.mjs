import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const pluginRoot = resolve(import.meta.dirname, '..', '..', '..');
const repositoryRoot = resolve(pluginRoot, '..');

async function missing(path) {
  try { await access(path); return false; } catch { return true; }
}

test('Pipeline is a registered MCP-only Plugin', async () => {
  const manifest = JSON.parse(await readFile(resolve(pluginRoot, '.claude-plugin', 'plugin.json'), 'utf8'));
  const mcp = JSON.parse(await readFile(resolve(pluginRoot, '.mcp.json'), 'utf8'));
  const marketplace = JSON.parse(await readFile(resolve(repositoryRoot, '.claude-plugin', 'marketplace.json'), 'utf8'));
  assert.equal(manifest.name, 'oec-pipeline');
  assert.equal(manifest.version, '1.0.1');
  assert.deepEqual(Object.keys(mcp.mcpServers), ['pipeline']);
  assert.equal(marketplace.version, '3.0.1');
  const entry = marketplace.plugins.find((plugin) => plugin.name === 'oec-pipeline');
  assert.equal(entry.version, manifest.version);
  assert.equal(entry.source, './oec-pipeline');
  for (const directory of ['agents', 'skills', 'commands', 'hooks']) {
    assert.equal(await missing(resolve(pluginRoot, directory)), true, directory);
  }
});
