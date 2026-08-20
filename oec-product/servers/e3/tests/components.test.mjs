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
  assert.deepEqual(metadata.skills, ['oec-product:writing-prds', 'oec-product:reviewing-prds']);
  assert.doesNotMatch(body, /SKILL\.md|\.mcp\.json|OAuth|HTTP API|retry loop/i);
});

test('skills have distinct positive triggers and E3 publishing is manual-only', () => {
  const writing = frontmatter('skills/writing-prds/SKILL.md').metadata;
  const reviewing = frontmatter('skills/reviewing-prds/SKILL.md').metadata;
  const publishing = frontmatter('skills/publishing-prds-to-e3/SKILL.md');
  assert.match(writing.description, /write a PRD|create or change a requirement/);
  assert.match(reviewing.description, /read-only red-team review/);
  assert.doesNotMatch(writing.description, /publish/i);
  assert.doesNotMatch(reviewing.description, /write|create|change a requirement/i);
  assert.equal(publishing.metadata['disable-model-invocation'], true);
  assert.match(publishing.metadata.description, /explicit E3 publishing requests/);
  assert.doesNotMatch(publishing.body, /oauth|token file|https?:\/\/|JSON payload|node .*\.mjs|retry/i);
});

test('plugin relies on native discovery and has no forbidden root component framework', () => {
  const manifest = JSON.parse(readFileSync(resolve(pluginRoot, '.claude-plugin/plugin.json'), 'utf8'));
  assert.equal(manifest.name, 'oec-product');
  assert.equal(manifest.version, '2.0.0');
  for (const key of ['skills', 'agents', 'mcpServers', 'commands', 'hooks']) assert.equal(key in manifest, false);
  for (const path of ['commands', 'hooks', 'settings.json', 'references', 'assets', 'lib']) {
    assert.equal(existsSync(resolve(pluginRoot, path)), false, `${path} must not exist at plugin root`);
  }
  const mcp = JSON.parse(readFileSync(resolve(pluginRoot, '.mcp.json'), 'utf8'));
  assert.deepEqual(Object.keys(mcp.mcpServers), ['e3']);
});
