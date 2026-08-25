import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

const execFileAsync = promisify(execFile);
const repositoryRoot = resolve(import.meta.dirname, '..');
const forbiddenAgentSlash = ['/oec-engineering', 'oec-'].join(':');
const removedGifSkill = ['record', 'gif'].join('-');

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
    const pluginManifest = await manifest(entry.name);
    assert.equal(pluginManifest.version, entry.version, entry.name);
    assert.match(pluginManifest.description, /[\u4e00-\u9fff]/, `${entry.name} Plugin description must be Chinese`);
    assert.match(entry.description, /[\u4e00-\u9fff]/, `${entry.name} Marketplace description must be Chinese`);
    assert.equal(entry.source, `./${entry.name}`);
  }
  assert.deepEqual((await manifest('oec-product')).dependencies, [{ name: 'oec-e3', version: '~1.0.0' }]);
  assert.equal(await skillCount('oec-product'), 3);
  assert.equal(await skillCount('oec-engineering'), 9);
  assert.equal(await skillCount('oec-e3'), 0);
  assert.equal(await skillCount('oec-pipeline'), 0);
  assert.equal(await skillCount('oec-common'), 1);
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

test('current-facing documentation stays aligned with Marketplace components', async () => {
  const marketplace = JSON.parse(await readFile(resolve(repositoryRoot, '.claude-plugin', 'marketplace.json'), 'utf8'));
  const rootReadme = await readFile(resolve(repositoryRoot, 'README.md'), 'utf8');
  const hierarchy = await readFile(resolve(repositoryRoot, 'docs/architecture/platform-plugin-hierarchy.md'), 'utf8');
  const strategy = await readFile(resolve(repositoryRoot, 'docs/strategy/oec-infra-next-optimization.md'), 'utf8');
  const talkTrack = await readFile(resolve(repositoryRoot, 'docs/strategy/oec-infra-next-optimization-talk-track.md'), 'utf8');
  const architectureSvg = await readFile(resolve(
    repositoryRoot,
    'docs/strategy/assets/oec-infra-next-optimization/05-current-architecture.svg',
  ), 'utf8');
  for (const plugin of marketplace.plugins) {
    assert.match(rootReadme, new RegExp(`\\b${plugin.name}\\b`), `${plugin.name} missing from root README`);
    for (const [label, document] of [['hierarchy', hierarchy], ['strategy', strategy], ['talk track', talkTrack]]) {
      assert.match(document, new RegExp(`${plugin.name.replace('-', '\\-')}@${plugin.version.replaceAll('.', '\\.')}\\b`),
        `${label} must include ${plugin.name}@${plugin.version}`);
    }
    assert.match(architectureSvg, new RegExp(`>${plugin.name}<`), `${plugin.name} missing from current architecture SVG`);
    assert.match(architectureSvg, new RegExp(`>${plugin.version}(?: |<)`), `${plugin.version} missing from current architecture SVG`);
  }

  const currentUsage = [
    rootReadme,
    await readFile(resolve(repositoryRoot, 'oec-engineering', 'README.md'), 'utf8'),
    await readFile(resolve(repositoryRoot, 'oec-common', 'README.md'), 'utf8'),
  ].join('\n');
  assert.equal(currentUsage.includes(forbiddenAgentSlash), false);
  assert.doesNotMatch(currentUsage, /SessionStart Hook/);
  assert.equal(currentUsage.includes(removedGifSkill), false);

  const contributionRules = await readFile(resolve(repositoryRoot, 'CLAUDE.md'), 'utf8');
  assert.match(contributionRules, /Marketplace、Plugin description.*README 使用中文/);
  assert.match(contributionRules, /Skill\/Agent frontmatter、正文.*使用英文/);
  assert.match(contributionRules, /eval corpus.*中文和英文/);
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
  // Engineering components are self-contained without node_modules.
  assert.ok((await readFile(resolve(extracted, 'oec-engineering', 'dist/oec-spec.mjs'))).length > 0);
  assert.ok((await readFile(resolve(extracted, 'oec-engineering', 'agents/oec-implement.md'))).length > 0);
  assert.ok((await readFile(resolve(
    extracted,
    'oec-engineering',
    'skills/migrating-legacy-ai-docs/SKILL.md',
  ))).length > 0);
  assert.ok((await readFile(resolve(
    extracted,
    'oec-engineering',
    'skills/migrating-legacy-ai-docs/agents/openai.yaml',
  ))).length > 0);
  assert.ok((await readFile(resolve(
    extracted,
    'oec-engineering',
    'skills/challenging-engineering-decisions/agents/openai.yaml',
  ))).length > 0);
  assert.ok((await readFile(resolve(
    extracted,
    'oec-engineering',
    'skills/prototyping-decisions/SKILL.md',
  ))).length > 0);
  assert.ok((await readFile(resolve(extracted, 'oec-common', 'skills/html-slides/assets/deck-index.html'))).length > 0);
  assert.ok((await readFile(resolve(extracted, 'oec-common', 'skills/html-slides/LICENSE.huashu-design'))).length > 0);
});
