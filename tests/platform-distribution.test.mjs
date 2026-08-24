import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

const execFileAsync = promisify(execFile);
const repositoryRoot = resolve(import.meta.dirname, '..');

async function manifest(plugin) {
  return JSON.parse(await readFile(resolve(repositoryRoot, plugin, '.claude-plugin', 'plugin.json'), 'utf8'));
}

async function skillCount(plugin) {
  try {
    const entries = await readdir(resolve(repositoryRoot, plugin, 'skills'), { withFileTypes: true });
    let count = 0;
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      try { await readFile(resolve(repositoryRoot, plugin, 'skills', entry.name, 'SKILL.md')); count += 1; } catch {}
    }
    return count;
  } catch {
    return 0;
  }
}

test('Marketplace versions and native Plugin boundaries are internally consistent', async () => {
  const marketplace = JSON.parse(await readFile(resolve(repositoryRoot, '.claude-plugin', 'marketplace.json'), 'utf8'));
  const packageManifest = JSON.parse(await readFile(resolve(repositoryRoot, 'package.json'), 'utf8'));
  assert.equal(marketplace.version, '3.0.0');
  assert.equal(packageManifest.version, marketplace.version);
  assert.deepEqual(marketplace.plugins.map((plugin) => plugin.name), [
    'oec-product', 'oec-engineering', 'oec-e3', 'oec-pipeline', 'oec-common',
  ]);
  for (const entry of marketplace.plugins) {
    assert.equal((await manifest(entry.name)).version, entry.version, entry.name);
    assert.equal(entry.source, `./${entry.name}`);
  }
  assert.deepEqual((await manifest('oec-product')).dependencies, [{ name: 'oec-e3', version: '~1.0.0' }]);
  assert.equal(await skillCount('oec-product'), 3);
  assert.equal(await skillCount('oec-engineering'), 6);
  assert.equal(await skillCount('oec-e3'), 0);
  assert.equal(await skillCount('oec-pipeline'), 0);
  assert.equal(await skillCount('oec-common'), 2);
});

test('only platform Plugins own MCP Servers and tool counts remain bounded', async () => {
  await assert.rejects(readFile(resolve(repositoryRoot, 'oec-product', '.mcp.json')), /ENOENT/);
  await assert.rejects(readFile(resolve(repositoryRoot, 'oec-engineering', '.mcp.json')), /ENOENT/);
  for (const [plugin, server, count] of [
    ['oec-e3', 'servers/e3/server.mjs', 10],
    ['oec-pipeline', 'servers/pipeline/server.mjs', 4],
  ]) {
    const mcp = JSON.parse(await readFile(resolve(repositoryRoot, plugin, '.mcp.json'), 'utf8'));
    assert.equal(Object.keys(mcp.mcpServers).length, 1);
    const source = await readFile(resolve(repositoryRoot, plugin, server), 'utf8');
    assert.equal([...source.matchAll(/registerTool\('/g)].length, count, plugin);
  }
  await assert.rejects(readFile(resolve(repositoryRoot, 'oec-product', 'dist', 'e3-server.mjs')), /ENOENT/);
  assert.ok((await readFile(resolve(repositoryRoot, 'oec-e3', 'dist', 'e3-server.mjs'))).length > 0);
  assert.ok((await readFile(resolve(repositoryRoot, 'oec-pipeline', 'dist', 'pipeline-server.mjs'))).length > 0);
});

test('a Git archive contains self-contained Plugin payloads without node_modules', async () => {
  const isolated = await mkdtemp(join(tmpdir(), 'plain-oec-archive-'));
  const archive = join(isolated, 'marketplace.tar');
  const extracted = join(isolated, 'marketplace');
  await execFileAsync('git', ['-C', repositoryRoot, 'archive', '--format=tar', '--output', archive, 'HEAD']);
  await execFileAsync('mkdir', ['-p', extracted]);
  await execFileAsync('tar', ['-xf', archive, '-C', extracted]);
  const files = (await execFileAsync('find', [extracted, '-type', 'd', '-name', 'node_modules'])).stdout.trim();
  assert.equal(files, '');
  assert.ok((await readFile(resolve(extracted, 'oec-product', 'skills/writing-prds/runtime/check-artifacts.mjs'))).length > 0);
  assert.ok((await readFile(resolve(extracted, 'oec-e3', 'dist/e3-server.mjs'))).length > 0);
  assert.ok((await readFile(resolve(extracted, 'oec-pipeline', 'dist/pipeline-server.mjs'))).length > 0);
});
