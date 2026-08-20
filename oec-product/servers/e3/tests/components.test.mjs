import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import YAML from 'yaml';

const pluginRoot = resolve(import.meta.dirname, '..', '..', '..');

function frontmatter(relativePath) {
  const text = readFileSync(resolve(pluginRoot, relativePath), 'utf8');
  const match = /^---\n([\s\S]*?)\n---\n/.exec(text);
  assert.ok(match, `${relativePath} must have YAML frontmatter`);
  return { metadata: YAML.parse(match[1]), body: text.slice(match[0].length) };
}

test('PM agent is explicit, inherits the model, and preloads only writing and review skills', () => {
  const { metadata, body } = frontmatter('agents/oec-pm.md');
  assert.equal(metadata.name, 'oec-pm');
  assert.equal(metadata.model, 'inherit');
  assert.match(metadata.description, /explicitly asks/);
  assert.deepEqual(metadata.skills, ['writing-prds', 'reviewing-prds']);
  assert.doesNotMatch(body, /SKILL\.md|\.mcp\.json|OAuth|HTTP API|retry loop/i);
});

test('skills have distinct positive triggers and E3 publishing is manual-only', () => {
  const writing = frontmatter('skills/writing-prds/SKILL.md');
  const reviewing = frontmatter('skills/reviewing-prds/SKILL.md');
  const publishing = frontmatter('skills/publishing-prds-to-e3/SKILL.md');
  assert.match(writing.metadata.description, /write a PRD|create or change a requirement/);
  assert.match(reviewing.metadata.description, /read-only red-team review/);
  assert.doesNotMatch(writing.metadata.description, /publish/i);
  assert.doesNotMatch(reviewing.metadata.description, /write|create|change a requirement/i);
  assert.match(writing.body, /assets\/root-prd\.md/);
  assert.match(reviewing.body, /RF-01.*RF-05/s);
  assert.equal(publishing.metadata['disable-model-invocation'], true);
  assert.match(publishing.metadata.description, /explicit E3 publishing requests/);
  assert.match(publishing.body, /original `spaceId`.*selected `pompProjectCode`/s);
  assert.match(publishing.body, /published-version-changed/);
  assert.match(publishing.body, /remote-object-drift/);
  assert.match(publishing.body, /git add -- <mappingPath>/);
  assert.match(publishing.body, /git commit -m .* -- <mappingPath>/);
  assert.match(publishing.body, /Never stage plugin data, credentials, configuration, selection, or\s+plan files/s);
  assert.doesNotMatch(publishing.body, /oauth|token file|https?:\/\/|JSON payload|node .*\.mjs|retry/i);
});

test('writing assets cover the product SSOT and use safe exact-path commit syntax', () => {
  for (const path of [
    'skills/writing-prds/assets/root-prd.md',
    'skills/writing-prds/assets/root-prd-changelog.md',
  ]) assert.equal(existsSync(resolve(pluginRoot, path)), true, `${path} must exist`);
  const contract = readFileSync(resolve(pluginRoot, 'skills/writing-prds/references/artifact-contract.md'), 'utf8');
  assert.match(contract, /git add -- <explicit PRD and HANDOFF paths>/);
  assert.match(contract, /git commit -m "docs\(prd\): \.\.\." -- <same explicit paths>/);
  assert.doesNotMatch(contract, /git commit -- .* -m/);
});

test('plugin relies on native discovery and has no forbidden root component framework', () => {
  const manifest = JSON.parse(readFileSync(resolve(pluginRoot, '.claude-plugin/plugin.json'), 'utf8'));
  assert.equal(manifest.name, 'oec-product');
  assert.equal(manifest.version, '2.1.0');
  const packageManifest = JSON.parse(readFileSync(resolve(pluginRoot, '..', 'package.json'), 'utf8'));
  assert.equal(packageManifest.version, manifest.version);
  assert.equal('dependencies' in packageManifest, false);
  assert.equal(packageManifest.devDependencies.esbuild, '0.28.2');
  assert.equal(existsSync(resolve(pluginRoot, 'package.json')), false);
  assert.equal(existsSync(resolve(pluginRoot, 'package-lock.json')), false);
  const marketplace = JSON.parse(readFileSync(resolve(pluginRoot, '..', '.claude-plugin', 'marketplace.json'), 'utf8'));
  assert.equal(marketplace.version, manifest.version);
  for (const key of ['skills', 'agents', 'mcpServers', 'commands', 'hooks']) assert.equal(key in manifest, false);
  for (const path of ['commands', 'hooks', 'settings.json', 'references', 'assets', 'lib']) {
    assert.equal(existsSync(resolve(pluginRoot, path)), false, `${path} must not exist at plugin root`);
  }
  const mcp = JSON.parse(readFileSync(resolve(pluginRoot, '.mcp.json'), 'utf8'));
  assert.deepEqual(Object.keys(mcp.mcpServers), ['e3']);
  assert.deepEqual(mcp.mcpServers.e3.args, ['${CLAUDE_PLUGIN_ROOT}/dist/e3-server.mjs']);
  assert.equal(existsSync(resolve(pluginRoot, 'dist/e3-server.mjs')), true);
  assert.equal(existsSync(resolve(pluginRoot, 'skills/writing-prds/runtime/check-artifacts.mjs')), true);
});
