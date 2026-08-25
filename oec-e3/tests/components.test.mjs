import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const pluginRoot = resolve(import.meta.dirname, '..');
const marketplaceRoot = resolve(pluginRoot, '..');

test('E3 is the registered MCP-only platform dependency', () => {
  const manifest = JSON.parse(readFileSync(resolve(pluginRoot, '.claude-plugin/plugin.json'), 'utf8'));
  assert.equal(manifest.name, 'oec-e3');
  assert.equal(manifest.version, '1.0.1');
  for (const key of ['skills', 'agents', 'mcpServers', 'commands', 'hooks']) assert.equal(key in manifest, false);
  for (const path of ['skills', 'agents', 'commands', 'hooks', 'settings.json', 'references', 'assets', 'lib']) {
    assert.equal(existsSync(resolve(pluginRoot, path)), false, `${path} must not exist`);
  }
  const mcp = JSON.parse(readFileSync(resolve(pluginRoot, '.mcp.json'), 'utf8'));
  assert.deepEqual(Object.keys(mcp.mcpServers), ['e3']);
  assert.deepEqual(mcp.mcpServers.e3.args, ['${CLAUDE_PLUGIN_ROOT}/dist/e3-server.mjs']);
  assert.equal(existsSync(resolve(pluginRoot, 'dist/e3-server.mjs')), true);
  const marketplace = JSON.parse(readFileSync(resolve(marketplaceRoot, '.claude-plugin/marketplace.json'), 'utf8'));
  assert.equal(marketplace.version, '3.0.1');
  const entry = marketplace.plugins.find((plugin) => plugin.name === 'oec-e3');
  assert.equal(entry.version, manifest.version);
  assert.equal(entry.source, './oec-e3');
  const product = JSON.parse(readFileSync(resolve(marketplaceRoot, 'oec-product/.claude-plugin/plugin.json'), 'utf8'));
  assert.deepEqual(product.dependencies, [{ name: 'oec-e3', version: '~1.0.0' }]);
});
