import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import YAML from 'yaml';

const pluginRoot = resolve(import.meta.dirname, '..');
const forbiddenAgentSlash = ['/oec-engineering', 'oec-'].join(':');

function skill(name) {
  const relativePath = `skills/${name}/SKILL.md`;
  const text = readFileSync(resolve(pluginRoot, relativePath), 'utf8');
  const match = /^---\n([\s\S]*?)\n---\n/.exec(text);
  assert.ok(match, `${relativePath} must have YAML frontmatter`);
  return { metadata: YAML.parse(match[1]), body: text.slice(match[0].length), text };
}

function claudeAgent(name) {
  const relativePath = `agents/${name}.md`;
  const text = readFileSync(resolve(pluginRoot, relativePath), 'utf8');
  const match = /^---\n([\s\S]*?)\n---\n/.exec(text);
  assert.ok(match, `${relativePath} must have YAML frontmatter`);
  const body = text.slice(match[0].length).trim().replace(/^# .*\n\n/, '');
  return { metadata: YAML.parse(match[1]), body };
}

function codexAgent(name) {
  const relativePath = `.codex-plugin/agents/${name}.toml`;
  const text = readFileSync(resolve(pluginRoot, relativePath), 'utf8');
  const description = /^description = "([^"]+)"$/m.exec(text)?.[1];
  const instructions = /developer_instructions = """\n([\s\S]*?)\n"""/.exec(text)?.[1]?.trim();
  assert.ok(description, `${relativePath} must declare description`);
  assert.ok(instructions, `${relativePath} must declare developer_instructions`);
  return { description, instructions };
}

function compact(value) {
  return value.replace(/\s+/g, ' ').trim();
}

const expectedSkills = [
  'challenging-engineering-decisions',
  'closing-engineering-changes',
  'diagnosing-failures',
  'managing-team-specs',
  'migrating-legacy-ai-docs',
  'planning-engineering-changes',
  'prototyping-decisions',
  'reviewing-code-changes',
  'test-driven-development',
];

test('engineering plugin exposes nine native Skills and no orchestration components', () => {
  const manifest = JSON.parse(readFileSync(resolve(pluginRoot, '.claude-plugin/plugin.json'), 'utf8'));
  assert.equal(manifest.name, 'oec-engineering');
  assert.equal(manifest.version, '1.5.0');
  // Agents and Skills are auto-discovered from directories, not declared in plugin.json.
  for (const key of ['skills', 'agents', 'mcpServers', 'commands', 'hooks']) assert.equal(key in manifest, false);

  const discovered = readdirSync(resolve(pluginRoot, 'skills'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(resolve(pluginRoot, 'skills', entry.name, 'SKILL.md')))
    .map((entry) => entry.name)
    .sort();
  assert.deepEqual(discovered, expectedSkills);

  for (const path of ['.mcp.json', 'commands', 'hooks', 'settings.json', 'references', 'assets', 'lib']) {
    assert.equal(existsSync(resolve(pluginRoot, path)), false, `${path} must not exist at plugin root`);
  }
  assert.equal(existsSync(resolve(pluginRoot, 'package.json')), false);
  assert.equal(existsSync(resolve(pluginRoot, 'package-lock.json')), false);

  const agentFiles = readdirSync(resolve(pluginRoot, 'agents'), { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => entry.name)
    .sort();
  assert.deepEqual(agentFiles, ['oec-check.md', 'oec-implement.md', 'oec-research.md']);

  const marketplace = JSON.parse(readFileSync(resolve(pluginRoot, '..', '.claude-plugin', 'marketplace.json'), 'utf8'));
  const packageManifest = JSON.parse(readFileSync(resolve(pluginRoot, '..', 'package.json'), 'utf8'));
  assert.equal(marketplace.version, '3.0.0');
  assert.equal(packageManifest.version, marketplace.version);
  assert.deepEqual(marketplace.plugins.map((plugin) => plugin.name), [
    'oec-product',
    'oec-engineering',
    'oec-e3',
    'oec-pipeline',
    'oec-common',
  ]);
  const engineeringEntry = marketplace.plugins.find((plugin) => plugin.name === manifest.name);
  assert.equal(engineeringEntry.version, manifest.version);
  assert.equal(engineeringEntry.source, './oec-engineering');
});

test('Claude and experimental Codex Agents keep explicit-use policy and matching instructions', () => {
  for (const name of ['oec-check', 'oec-implement', 'oec-research']) {
    const claude = claudeAgent(name);
    const codex = codexAgent(name);
    assert.match(compact(claude.metadata.description), /user explicitly requests/);
    assert.match(compact(claude.metadata.description), /explicitly invoked OEC Skill delegates/);
    assert.equal(compact(claude.metadata.description), compact(codex.description));
    assert.equal(claude.body, codex.instructions);
  }
});

test('skill descriptions make positive and negative judgment boundaries explicit', () => {
  for (const name of expectedSkills) {
    const item = skill(name);
    assert.equal(item.metadata.name, name);
    assert.match(item.metadata.description, /Do not use/i, `${name} needs a negative trigger boundary`);
    assert.ok(item.metadata.description.length < 400, `${name} discovery text is too broad`);
    assert.ok(item.text.split('\n').length < 90, `${name} entrypoint should remain focused`);
  }

  assert.match(skill('managing-team-specs').metadata.description, /durable project engineering Specs and ADRs/);
  assert.match(skill('migrating-legacy-ai-docs').metadata.description, /user explicitly invokes/);
  assert.match(skill('planning-engineering-changes').metadata.description, /technical design or implementation plan/);
  assert.match(skill('planning-engineering-changes').metadata.description, /small obvious fix/);
  assert.match(skill('challenging-engineering-decisions').metadata.description, /user explicitly invokes/);
  assert.match(skill('challenging-engineering-decisions').metadata.description, /ordinary planning/);
  assert.match(skill('prototyping-decisions').metadata.description, /throwaway/);
  assert.match(skill('prototyping-decisions').metadata.description, /production features/);
  assert.match(skill('test-driven-development').metadata.description, /explicitly asks for TDD/);
  assert.match(skill('test-driven-development').metadata.description, /merely because.*should have tests/);
  assert.match(skill('diagnosing-failures').metadata.description, /root cause is unclear/);
  assert.match(skill('diagnosing-failures').metadata.description, /obvious local error/);
  assert.match(skill('reviewing-code-changes').metadata.description, /read-only/);
  assert.match(skill('reviewing-code-changes').metadata.description, /Do not use to implement/);
});

test('explicit engineering Skills stay manual-only and no Skill recreates the legacy router', () => {
  for (const name of expectedSkills) {
    const item = skill(name);
    if ([
      'challenging-engineering-decisions',
      'closing-engineering-changes',
      'migrating-legacy-ai-docs',
    ].includes(name)) {
      assert.equal(item.metadata['disable-model-invocation'], true);
    } else {
      assert.equal(item.metadata['disable-model-invocation'], undefined);
    }
    assert.doesNotMatch(item.text, /oec-dev-task|oec-dev-flow|STAGE\.md|\.codex\/skills/);
    assert.doesNotMatch(item.text, /Read .*SKILL\.md|读取.*SKILL\.md/i);
    assert.doesNotMatch(item.text, /OAuth|HTTP payload|token cache|partial resume/i);
    assert.equal(item.text.includes(forbiddenAgentSlash), false);
  }
  const closing = skill('closing-engineering-changes');
  assert.match(closing.metadata.description, /explicitly asks/);
  assert.match(closing.body, /git add -- <exact code and engineering-document paths>/);
  assert.match(closing.body, /git commit -m .* -- <same exact paths>/);

  const migration = skill('migrating-legacy-ai-docs');
  assert.match(migration.body, /preserve every existing `ai-docs` file in place/i);
  assert.match(migration.body, /Do not adopt E3 mappings/);
  assert.match(migration.body, /Do not create a migration state file/);
  const openai = YAML.parse(readFileSync(resolve(
    pluginRoot,
    'skills/migrating-legacy-ai-docs/agents/openai.yaml',
  ), 'utf8'));
  assert.equal(openai.policy.allow_implicit_invocation, false);
  assert.match(openai.interface.default_prompt, /\$migrating-legacy-ai-docs/);

  const challenge = YAML.parse(readFileSync(resolve(
    pluginRoot,
    'skills/challenging-engineering-decisions/agents/openai.yaml',
  ), 'utf8'));
  assert.equal(challenge.policy.allow_implicit_invocation, false);
  assert.match(challenge.interface.default_prompt, /\$challenging-engineering-decisions/);
  assert.equal(readFileSync(resolve(pluginRoot, 'README.md'), 'utf8').includes(forbiddenAgentSlash), false);
});

test('team Spec assets encode conditional artifacts and safe project ownership', () => {
  const managing = skill('managing-team-specs');
  assert.match(managing.body, /absent category is better than an empty placeholder/);
  assert.match(managing.body, /oec-spec check --workspace/);
  assert.doesNotMatch(managing.metadata.description, /Creates, migrates/);

  const contract = readFileSync(resolve(
    pluginRoot,
    'skills/managing-team-specs/references/team-spec-contract.md',
  ), 'utf8');
  assert.match(contract, /specs\/.*system as it is now/s);
  assert.match(contract, /Add `design\.md` only/);
  assert.match(contract, /Add `plan\.md` only/);
  assert.match(contract, /Add `evidence\.md` only/);
  assert.match(contract, /git add -- <exact team Spec, ADR, or change paths>/);
  assert.doesNotMatch(contract, /\.claude\/settings|\.codex\/skills|SessionStart|task\.py/);
});

test('each Skill carries positive and negative eval cases', () => {
  for (const name of expectedSkills) {
    const path = resolve(pluginRoot, 'skills', name, 'evals', 'cases.md');
    assert.equal(existsSync(path), true, `${name} eval cases must exist`);
    const content = readFileSync(path, 'utf8');
    assert.match(content, /## Positive cases/);
    assert.match(content, /## Negative cases/);
  }
});
