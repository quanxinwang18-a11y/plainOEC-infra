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
  const declaredName = /^name = "([^"]+)"$/m.exec(text)?.[1];
  const instructions = /developer_instructions = """\n([\s\S]*?)\n"""/.exec(text)?.[1]?.trim();
  assert.ok(description, `${relativePath} must declare description`);
  assert.ok(instructions, `${relativePath} must declare developer_instructions`);
  return { name: declaredName, description, instructions };
}

function compact(value) {
  return value.replace(/\s+/g, ' ').trim();
}

const expectedSkills = [
  'challenge-decision',
  'close-change',
  'delegate-agents',
  'develop-test-first',
  'diagnose-failure',
  'manage-specs',
  'migrate-legacy-ai-docs',
  'plan-change',
  'prototype-decision',
  'review-code',
  'run-long-coding',
];

test('engineering plugin exposes eleven native Skills and no always-on orchestration components', () => {
  const manifest = JSON.parse(readFileSync(resolve(pluginRoot, '.claude-plugin/plugin.json'), 'utf8'));
  assert.equal(manifest.name, 'oec-engineering');
  assert.equal(manifest.version, '1.8.0');
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
  assert.deepEqual(agentFiles, ['checker.md', 'evaluator.md', 'implementer.md', 'researcher.md']);

  const marketplace = JSON.parse(readFileSync(resolve(pluginRoot, '..', '.claude-plugin', 'marketplace.json'), 'utf8'));
  const packageManifest = JSON.parse(readFileSync(resolve(pluginRoot, '..', 'package.json'), 'utf8'));
  assert.equal(marketplace.version, '3.0.2');
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
  for (const name of ['checker', 'evaluator', 'implementer', 'researcher']) {
    const claude = claudeAgent(name);
    const codex = codexAgent(name);
    assert.equal(codex.name, name);
    assert.match(compact(claude.metadata.description), /user explicitly requests/);
    assert.match(compact(claude.metadata.description), /explicitly invoked Skill delegates/);
    assert.equal(compact(claude.metadata.description), compact(codex.description));
    assert.equal(claude.body, codex.instructions);
  }
  const implement = claudeAgent('implementer');
  assert.match(compact(implement.metadata.description), /existing change ID/);
  assert.match(implement.body, /Tests: <command and pass\/fail\/not run>/);
  assert.doesNotMatch(implement.body, /## Implementation complete/);
  const check = claudeAgent('checker');
  assert.match(compact(check.metadata.description), /may modify the working tree/);
  assert.match(compact(check.metadata.description), /Do not use for a read-only code review/);
  assert.match(check.body, /git status --short/);
  assert.match(check.body, /git diff HEAD --/);
  assert.match(check.body, /relevant untracked files/);
  assert.match(check.body, /Tests: <command and pass\/fail\/not run>/);
  const research = claudeAgent('researcher');
  assert.match(compact(research.metadata.description), /existing change ID/);
  assert.match(research.body, /Do not create or guess a change package/);
  const evaluate = claudeAgent('evaluator');
  assert.ok(evaluate.metadata.tools.includes('mcp__playwright__browser_navigate'));
  assert.ok(evaluate.metadata.tools.includes('mcp__playwright__browser_snapshot'));
  assert.equal(evaluate.metadata.tools.some((tool) => tool.includes('*')), false);
  assert.equal(evaluate.metadata.tools.includes('mcp__playwright__browser_run_code_unsafe'), false);
  assert.equal(evaluate.metadata.tools.includes('Write'), false);
  assert.equal(evaluate.metadata.tools.includes('Edit'), false);
  assert.equal('mcpServers' in evaluate.metadata, false);
  assert.equal('hooks' in evaluate.metadata, false);
  assert.equal('permissionMode' in evaluate.metadata, false);
  assert.match(evaluate.body, /Product depth/);
  assert.match(evaluate.body, /Working tree changed by evaluator/);
});

test('skill descriptions make positive and negative judgment boundaries explicit', () => {
  for (const name of expectedSkills) {
    const item = skill(name);
    assert.equal(item.metadata.name, name);
    assert.match(item.metadata.description, /Do not use/i, `${name} needs a negative trigger boundary`);
    assert.ok(item.metadata.description.length < 400, `${name} discovery text is too broad`);
    assert.ok(item.text.split('\n').length < 90, `${name} entrypoint should remain focused`);
  }

  assert.match(skill('manage-specs').metadata.description, /durable project engineering Specs and ADRs/);
  assert.match(skill('migrate-legacy-ai-docs').metadata.description, /user explicitly invokes/);
  assert.match(skill('plan-change').metadata.description, /technical design or implementation plan/);
  assert.match(skill('plan-change').metadata.description, /small obvious fix/);
  assert.match(skill('challenge-decision').metadata.description, /user explicitly invokes/);
  assert.match(skill('challenge-decision').metadata.description, /ordinary planning/);
  assert.match(skill('delegate-agents').metadata.description, /Routes a bounded engineering change/);
  assert.match(skill('delegate-agents').metadata.description, /ordinary coding/);
  assert.match(skill('run-long-coding').metadata.description, /resumed implementation/);
  assert.match(skill('run-long-coding').metadata.description, /Playwright runtime evaluation/);
  assert.match(skill('run-long-coding').metadata.description, /small fixes/);
  assert.match(skill('prototype-decision').metadata.description, /throwaway/);
  assert.match(skill('prototype-decision').metadata.description, /production features/);
  assert.match(skill('develop-test-first').metadata.description, /explicitly asks for TDD/);
  assert.match(skill('develop-test-first').metadata.description, /merely because.*should have tests/);
  assert.match(skill('diagnose-failure').metadata.description, /root cause is unclear/);
  assert.match(skill('diagnose-failure').metadata.description, /obvious local error/);
  assert.match(skill('review-code').metadata.description, /read-only/);
  assert.match(skill('review-code').metadata.description, /Do not use to implement/);
});

test('explicit engineering Skills stay manual-only and no Skill recreates the legacy router', () => {
  for (const name of expectedSkills) {
    const item = skill(name);
    if ([
      'challenge-decision',
      'close-change',
      'delegate-agents',
      'migrate-legacy-ai-docs',
      'run-long-coding',
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
  const closing = skill('close-change');
  assert.match(closing.metadata.description, /explicitly asks/);
  assert.match(closing.body, /git add -- <exact code and engineering-document paths>/);
  assert.match(closing.body, /git commit -m .* -- <same exact paths>/);

  const delegation = skill('delegate-agents');
  assert.match(delegation.body, /existing change ID and a concrete research question/);
  assert.match(delegation.body, /make the first repository operation a direct existence/);
  assert.match(delegation.body, /run no further tools/);
  assert.match(delegation.body, /Never create or guess a change package/);
  assert.match(delegation.body, /`researcher`[\s\S]*`implementer`[\s\S]*`checker`/);
  assert.match(delegation.body, /Treat a missing status as `partial`/);
  assert.match(delegation.body, /stop on `partial`, `failed`, or `blocked`/);
  assert.match(delegation.metadata['argument-hint'], /sequence/);
  assert.doesNotMatch(delegation.metadata['argument-hint'], /full/);
  assert.match(delegation.body, /`researcher`[\s\S]*`implementer`[\s\S]*`checker`/);
  assert.match(delegation.body, /Never run Agents concurrently in `sequence`/);
  assert.match(delegation.body, /automatic retry loop/);
  assert.match(delegation.body, /Do not claim that the engineering change is closed/);

  const delegationOpenai = YAML.parse(readFileSync(resolve(
    pluginRoot,
    'skills/delegate-agents/agents/openai.yaml',
  ), 'utf8'));
  assert.equal(delegationOpenai.policy.allow_implicit_invocation, false);
  assert.match(delegationOpenai.interface.default_prompt, /\$delegate-agents/);

  const orchestration = skill('run-long-coding');
  assert.equal(orchestration.metadata['argument-hint'], '[existing change ID or currently confirmed change]');
  assert.match(orchestration.body, /existing `ai-docs\/engineering\/changes\/<change-id>\/change\.md`/);
  assert.match(orchestration.body, /Playwright tools are unavailable, report `blocked`/);
  assert.match(orchestration.body, /Retain the returned Agent ID/);
  assert.match(orchestration.body, /five build-and-evaluate cycles by default/);
  assert.match(orchestration.body, /up to ten total cycles/);
  assert.match(orchestration.body, /Do not create state files, snapshots, branches/);
  assert.doesNotMatch(orchestration.body, /Sprint|backlog|run\.json|progress\.md|ledger/);
  const orchestrationOpenai = YAML.parse(readFileSync(resolve(
    pluginRoot,
    'skills/run-long-coding/agents/openai.yaml',
  ), 'utf8'));
  assert.equal(orchestrationOpenai.policy.allow_implicit_invocation, false);
  assert.match(orchestrationOpenai.interface.default_prompt, /\$run-long-coding/);

  const migration = skill('migrate-legacy-ai-docs');
  assert.match(migration.body, /preserve every existing `ai-docs` file in place/i);
  assert.match(migration.body, /Do not adopt E3 mappings/);
  assert.match(migration.body, /Do not create a migration state file/);
  const openai = YAML.parse(readFileSync(resolve(
    pluginRoot,
    'skills/migrate-legacy-ai-docs/agents/openai.yaml',
  ), 'utf8'));
  assert.equal(openai.policy.allow_implicit_invocation, false);
  assert.match(openai.interface.default_prompt, /\$migrate-legacy-ai-docs/);

  const challenge = YAML.parse(readFileSync(resolve(
    pluginRoot,
    'skills/challenge-decision/agents/openai.yaml',
  ), 'utf8'));
  assert.equal(challenge.policy.allow_implicit_invocation, false);
  assert.match(challenge.interface.default_prompt, /\$challenge-decision/);

  const closingOpenai = YAML.parse(readFileSync(resolve(
    pluginRoot,
    'skills/close-change/agents/openai.yaml',
  ), 'utf8'));
  assert.equal(closingOpenai.policy.allow_implicit_invocation, false);
  assert.match(closingOpenai.interface.default_prompt, /\$close-change/);
  assert.equal(readFileSync(resolve(pluginRoot, 'README.md'), 'utf8').includes(forbiddenAgentSlash), false);
});

test('public Skill and Agent identifiers use scoped concise names without an oec prefix', () => {
  for (const name of expectedSkills) {
    assert.doesNotMatch(name, /^oec-/);
    assert.match(name, /^(?:challenge|close|delegate|develop|diagnose|manage|migrate|plan|prototype|review|run)-/);
  }
  for (const name of ['checker', 'evaluator', 'implementer', 'researcher']) {
    assert.doesNotMatch(name, /^oec-/);
    assert.equal(claudeAgent(name).metadata.name, name);
    assert.equal(codexAgent(name).description.length > 0, true);
  }
});

test('team Spec assets encode conditional artifacts and safe project ownership', () => {
  const managing = skill('manage-specs');
  assert.match(managing.body, /absent category is better than an empty placeholder/);
  assert.match(managing.body, /oec-spec check --workspace/);
  assert.doesNotMatch(managing.metadata.description, /Creates, migrates/);

  const contract = readFileSync(resolve(
    pluginRoot,
    'skills/manage-specs/references/team-spec-contract.md',
  ), 'utf8');
  assert.match(contract, /specs\/.*system as it is now/s);
  assert.match(contract, /Add `design\.md` only/);
  assert.match(contract, /Add `plan\.md` only/);
  assert.match(contract, /research\/.*conditional/);
  assert.match(contract, /Add `research\/` only/);
  assert.match(contract, /Add `evidence\.md` only/);
  assert.match(contract, /evidence\.md.*conditional/);
  assert.match(contract, /git add -- <exact team Spec, ADR, or change paths>/);
  assert.doesNotMatch(contract, /\.claude\/settings|\.codex\/skills|SessionStart|task\.py/);
});

test('each Skill carries executable positive and negative eval cases', () => {
  for (const name of expectedSkills) {
    for (const polarity of ['positive', 'negative']) {
      const directory = resolve(pluginRoot, 'evals', `${name}-${polarity}`);
      const promptText = readFileSync(resolve(directory, 'prompt.md'), 'utf8');
      const promptMatch = /^---\n([\s\S]*?)\n---\n/.exec(promptText);
      assert.ok(promptMatch, `${name}-${polarity} prompt needs frontmatter`);
      const prompt = YAML.parse(promptMatch[1]);
      const graderText = readFileSync(resolve(directory, 'graders/skill-route.md'), 'utf8');
      const graderMatch = /^---\n([\s\S]*?)\n---\n/.exec(graderText);
      assert.ok(graderMatch, `${name}-${polarity} grader needs frontmatter`);
      const grader = YAML.parse(graderMatch[1]);
      assert.equal(prompt.name, `${name}-${polarity}`);
      assert.ok(prompt.tags.includes(name));
      assert.ok(prompt.tags.includes(polarity));
      assert.equal(grader.type, 'tool_used');
      assert.equal(grader.tool, 'Skill');
      assert.match(grader.input_match, new RegExp(name));
      if (polarity === 'positive') assert.equal(grader.min, 1);
      else assert.deepEqual({ min: grader.min, max: grader.max, arm: grader.arm }, { min: 0, max: 0, arm: 'both' });
    }
  }
});
