import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import YAML from 'yaml';

const pluginRoot = resolve(import.meta.dirname, '..');

function frontmatter(relativePath) {
  const text = readFileSync(resolve(pluginRoot, relativePath), 'utf8');
  const match = /^---\n([\s\S]*?)\n---\n/.exec(text);
  assert.ok(match, `${relativePath} must have YAML frontmatter`);
  return { metadata: YAML.parse(match[1]), body: text.slice(match[0].length) };
}

test('product manager is explicit, inherits the model, and preloads only write and review skills', () => {
  const { metadata, body } = frontmatter('agents/prd-manager.md');
  assert.equal(metadata.name, 'prd-manager');
  assert.equal(metadata.model, 'inherit');
  assert.match(metadata.description, /explicitly asks/);
  assert.deepEqual(metadata.skills, ['prd-write', 'prd-review']);
  assert.doesNotMatch(body, /SKILL\.md|\.mcp\.json|OAuth|HTTP API|retry loop/i);
});

test('skills have distinct positive triggers and E3 publishing is manual-only', () => {
  const writing = frontmatter('skills/prd-write/SKILL.md');
  const reviewing = frontmatter('skills/prd-review/SKILL.md');
  const publishing = frontmatter('skills/prd-publish/SKILL.md');
  for (const item of [writing, reviewing, publishing]) {
    assert.match(item.metadata.description, /Do not use/i);
  }
  assert.match(writing.metadata.description, /write a PRD|change product requirements/);
  assert.match(reviewing.metadata.description, /read-only red-team review/);
  assert.match(writing.metadata.description, /technical design or implementation planning/);
  assert.match(reviewing.metadata.description, /review code or technical designs/);
  assert.match(writing.body, /assets\/root-prd\.md/);
  assert.match(reviewing.body, /RF-01.*RF-05/s);
  assert.equal(publishing.metadata['disable-model-invocation'], true);
  assert.match(publishing.metadata.description, /already finalized version/);
  assert.match(publishing.metadata.description, /completed child PRDs and HANDOFF/);
  assert.match(publishing.metadata.description, /explicit E3 PRD publishing requests/);
  assert.match(publishing.body, /original `spaceId`.*selected `pompProjectCode`/s);
  assert.match(publishing.body, /published-version-changed/);
  assert.match(publishing.body, /remote-object-drift/);
  assert.match(publishing.body, /git add -- <recordPath>/);
  assert.match(publishing.body, /git commit -m .* -- <recordPath>/);
  assert.match(publishing.body, /Never stage plugin data, credentials, configuration, selection, or\s+plan files/s);
  assert.doesNotMatch(publishing.body, /oauth|token file|https?:\/\/|JSON payload|node .*\.mjs|retry/i);
});

test('each Product Skill carries executable positive and negative eval cases', () => {
  const prompts = [];
  for (const name of ['prd-write', 'prd-review', 'prd-publish']) {
    for (const polarity of ['positive', 'negative']) {
      const directory = `evals/${name}-${polarity}`;
      const prompt = frontmatter(`${directory}/prompt.md`);
      const grader = frontmatter(`${directory}/graders/skill-route.md`).metadata;
      prompts.push(prompt.body);
      assert.equal(prompt.metadata.name, `${name}-${polarity}`);
      assert.ok(prompt.metadata.tags.includes(name));
      assert.ok(prompt.metadata.tags.includes(polarity));
      assert.equal(grader.type, 'tool_used');
      assert.equal(grader.tool, 'Skill');
      assert.match(grader.input_match, new RegExp(name));
      if (polarity === 'positive') assert.equal(grader.min, 1);
      else assert.deepEqual({ min: grader.min, max: grader.max, arm: grader.arm }, { min: 0, max: 0, arm: 'both' });
    }
  }
  const corpus = prompts.join('\n');
  assert.match(corpus, /[\u4e00-\u9fff]/);
  assert.match(corpus, /\b(?:PRD|E3|Review|Create|Design|Revise|Use)\b/i);
  assert.doesNotMatch(corpus, /TODO/);
});

test('model-facing capability text does not depend on the OEC label', () => {
  const paths = [
    'agents/prd-manager.md',
    'skills/prd-write/SKILL.md',
    'skills/prd-write/references/artifact-contract.md',
    'skills/prd-write/references/product-language.md',
    'skills/prd-write/references/versioning.md',
    'skills/prd-review/SKILL.md',
    'skills/prd-review/references/review-rubric.md',
    'skills/prd-publish/SKILL.md',
    'skills/prd-publish/references/publish-contract.md',
  ];
  for (const path of paths) {
    const content = readFileSync(resolve(pluginRoot, path), 'utf8');
    assert.doesNotMatch(content, /\bOEC\b/, `${path} must describe the capability without an OEC label`);
  }

  const writing = frontmatter('skills/prd-write/SKILL.md');
  assert.match(writing.metadata.description, /versioned PRDs/);
  assert.match(writing.metadata.description, /child PRDs/);
  assert.match(writing.metadata.description, /HANDOFF artifacts/);
});

test('writing assets cover the product SSOT and use safe exact-path commit syntax', () => {
  for (const path of [
    'skills/prd-write/assets/root-prd.md',
    'skills/prd-write/assets/root-prd-changelog.md',
  ]) assert.equal(existsSync(resolve(pluginRoot, path)), true, `${path} must exist`);
  const contract = readFileSync(resolve(pluginRoot, 'skills/prd-write/references/artifact-contract.md'), 'utf8');
  assert.match(contract, /git add -- <explicit PRD and HANDOFF paths>/);
  assert.match(contract, /git commit -m "docs\(prd\): \.\.\." -- <same explicit paths>/);
  assert.doesNotMatch(contract, /git commit -- .* -m/);
});

test('plugin relies on native discovery and has no forbidden root component framework', () => {
  const manifest = JSON.parse(readFileSync(resolve(pluginRoot, '.claude-plugin/plugin.json'), 'utf8'));
  assert.equal(manifest.name, 'oec-product');
  assert.equal(manifest.version, '3.0.3');
  assert.deepEqual(manifest.dependencies, [{ name: 'oec-e3', version: '~1.0.0' }]);
  const packageManifest = JSON.parse(readFileSync(resolve(pluginRoot, '..', 'package.json'), 'utf8'));
  assert.equal(packageManifest.version, '3.1.0');
  assert.equal('dependencies' in packageManifest, false);
  assert.equal(packageManifest.devDependencies.esbuild, '0.28.2');
  assert.equal(existsSync(resolve(pluginRoot, 'package.json')), false);
  assert.equal(existsSync(resolve(pluginRoot, 'package-lock.json')), false);
  const marketplace = JSON.parse(readFileSync(resolve(pluginRoot, '..', '.claude-plugin', 'marketplace.json'), 'utf8'));
  assert.equal(marketplace.version, '3.1.0');
  const productEntry = marketplace.plugins.find((plugin) => plugin.name === manifest.name);
  assert.equal(productEntry.version, manifest.version);
  assert.equal(productEntry.source, './oec-product');
  for (const key of ['skills', 'agents', 'mcpServers', 'commands', 'hooks']) assert.equal(key in manifest, false);
  for (const path of ['commands', 'hooks', 'settings.json', 'references', 'assets', 'lib']) {
    assert.equal(existsSync(resolve(pluginRoot, path)), false, `${path} must not exist at plugin root`);
  }
  assert.equal(existsSync(resolve(pluginRoot, '.mcp.json')), false);
  assert.equal(existsSync(resolve(pluginRoot, 'dist/e3-server.mjs')), false);
  assert.equal(existsSync(resolve(pluginRoot, 'skills/prd-write/runtime/check-artifacts.mjs')), true);
});

test('public Product identifiers use concise scoped names without an oec prefix', () => {
  for (const name of ['prd-write', 'prd-review', 'prd-publish']) assert.doesNotMatch(name, /^oec-/);
  assert.equal(frontmatter('agents/prd-manager.md').metadata.name, 'prd-manager');
});
