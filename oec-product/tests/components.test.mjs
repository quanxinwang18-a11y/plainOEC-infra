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
  assert.match(publishing.body, /git add -- <mappingPath>/);
  assert.match(publishing.body, /git commit -m .* -- <mappingPath>/);
  assert.match(publishing.body, /Never stage plugin data, credentials, configuration, selection, or\s+plan files/s);
  assert.doesNotMatch(publishing.body, /oauth|token file|https?:\/\/|JSON payload|node .*\.mjs|retry/i);
});

test('each Product Skill carries executable positive and negative eval cases', () => {
  const prompts = [];
  for (const name of ['writing-prds', 'reviewing-prds', 'publishing-prds-to-e3']) {
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
    'agents/oec-pm.md',
    'skills/writing-prds/SKILL.md',
    'skills/writing-prds/references/artifact-contract.md',
    'skills/writing-prds/references/product-language.md',
    'skills/writing-prds/references/versioning.md',
    'skills/reviewing-prds/SKILL.md',
    'skills/reviewing-prds/references/review-rubric.md',
    'skills/publishing-prds-to-e3/SKILL.md',
    'skills/publishing-prds-to-e3/references/publish-contract.md',
  ];
  for (const path of paths) {
    const content = readFileSync(resolve(pluginRoot, path), 'utf8');
    assert.doesNotMatch(content, /\bOEC\b/, `${path} must describe the capability without an OEC label`);
  }

  const writing = frontmatter('skills/writing-prds/SKILL.md');
  assert.match(writing.metadata.description, /versioned PRDs/);
  assert.match(writing.metadata.description, /child PRDs/);
  assert.match(writing.metadata.description, /HANDOFF artifacts/);
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
  assert.equal(manifest.version, '3.0.2');
  assert.deepEqual(manifest.dependencies, [{ name: 'oec-e3', version: '~1.0.0' }]);
  const packageManifest = JSON.parse(readFileSync(resolve(pluginRoot, '..', 'package.json'), 'utf8'));
  assert.equal(packageManifest.version, '3.0.1');
  assert.equal('dependencies' in packageManifest, false);
  assert.equal(packageManifest.devDependencies.esbuild, '0.28.2');
  assert.equal(existsSync(resolve(pluginRoot, 'package.json')), false);
  assert.equal(existsSync(resolve(pluginRoot, 'package-lock.json')), false);
  const marketplace = JSON.parse(readFileSync(resolve(pluginRoot, '..', '.claude-plugin', 'marketplace.json'), 'utf8'));
  assert.equal(marketplace.version, '3.0.1');
  const productEntry = marketplace.plugins.find((plugin) => plugin.name === manifest.name);
  assert.equal(productEntry.version, manifest.version);
  assert.equal(productEntry.source, './oec-product');
  for (const key of ['skills', 'agents', 'mcpServers', 'commands', 'hooks']) assert.equal(key in manifest, false);
  for (const path of ['commands', 'hooks', 'settings.json', 'references', 'assets', 'lib']) {
    assert.equal(existsSync(resolve(pluginRoot, path)), false, `${path} must not exist at plugin root`);
  }
  assert.equal(existsSync(resolve(pluginRoot, '.mcp.json')), false);
  assert.equal(existsSync(resolve(pluginRoot, 'dist/e3-server.mjs')), false);
  assert.equal(existsSync(resolve(pluginRoot, 'skills/writing-prds/runtime/check-artifacts.mjs')), true);
});
