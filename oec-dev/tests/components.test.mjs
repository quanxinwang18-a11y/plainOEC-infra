import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import YAML from 'yaml';
import {
  DEV_AGENT_NAMES,
  renderCodexAgent,
} from '../../scripts/generate-dev-codex-agents.mjs';

const pluginRoot = resolve(import.meta.dirname, '..');
const forbiddenAgentSlash = ['/oec-dev', 'oec-'].join(':');

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

function openaiSkill(name) {
  const relativePath = `skills/${name}/agents/openai.yaml`;
  assert.equal(existsSync(resolve(pluginRoot, relativePath)), true, `${relativePath} is required`);
  return YAML.parse(readFileSync(resolve(pluginRoot, relativePath), 'utf8'));
}

function compact(value) {
  return value.replace(/\s+/g, ' ').trim();
}

const bootstrapSkill = 'using-oec-dev';
const expectedSkills = [
  'change-close',
  'change-implement',
  'change-plan',
  'code-review',
  'decision-challenge',
  'design-prototype',
  'failure-debug',
  'legacy-doc-migrate',
  'spec-manage',
  'test-first',
];

test('engineering plugin exposes ten task Skills, one bootstrap Skill, four Agents, and one static Hook', () => {
  const manifest = JSON.parse(readFileSync(resolve(pluginRoot, '.claude-plugin/plugin.json'), 'utf8'));
  assert.equal(manifest.name, 'oec-dev');
  assert.equal(manifest.version, '1.9.3');
  // Agents and Skills are auto-discovered from directories, not declared in plugin.json.
  for (const key of ['skills', 'agents', 'mcpServers', 'commands', 'hooks']) assert.equal(key in manifest, false);

  const discovered = readdirSync(resolve(pluginRoot, 'skills'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(resolve(pluginRoot, 'skills', entry.name, 'SKILL.md')))
    .map((entry) => entry.name)
    .sort();
  assert.deepEqual(discovered, [...expectedSkills, bootstrapSkill].sort());
  assert.equal(existsSync(resolve(pluginRoot, `skills/${bootstrapSkill}/SKILL.md`)), true);
  assert.equal(existsSync(resolve(pluginRoot, 'skills/delegate-agents')), false);
  assert.equal(existsSync(resolve(pluginRoot, 'skills/web-task-run')), false);

  for (const path of ['.mcp.json', 'commands', 'settings.json', 'references', 'assets', 'lib']) {
    assert.equal(existsSync(resolve(pluginRoot, path)), false, `${path} must not exist at plugin root`);
  }
  assert.equal(existsSync(resolve(pluginRoot, 'package.json')), false);
  assert.equal(existsSync(resolve(pluginRoot, 'package-lock.json')), false);

  const agentFiles = readdirSync(resolve(pluginRoot, 'agents'), { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => entry.name)
    .sort();
  assert.deepEqual(agentFiles, ['change-checker.md', 'task-implementer.md', 'task-researcher.md', 'web-evaluator.md']);

  const marketplace = JSON.parse(readFileSync(resolve(pluginRoot, '..', '.claude-plugin', 'marketplace.json'), 'utf8'));
  const packageManifest = JSON.parse(readFileSync(resolve(pluginRoot, '..', 'package.json'), 'utf8'));
  assert.equal(marketplace.version, '3.1.0');
  assert.equal(packageManifest.version, marketplace.version);
  assert.deepEqual(marketplace.plugins.map((plugin) => plugin.name), [
    'oec-product',
    'oec-dev',
    'oec-dev-beta',
    'oec-e3',
    'oec-pipeline',
    'oec-common',
  ]);
  const engineeringEntry = marketplace.plugins.find((plugin) => plugin.name === manifest.name);
  assert.equal(engineeringEntry.version, manifest.version);
  assert.equal(engineeringEntry.source, './oec-dev');
});

test('SessionStart injects bounded behavioral guidance without duplicating capability metadata', () => {
  const config = JSON.parse(readFileSync(resolve(pluginRoot, 'hooks/hooks.json'), 'utf8'));
  const group = config.hooks.SessionStart;
  assert.equal(group.length, 1);
  assert.equal(group[0].matcher, 'startup|clear|compact');
  assert.doesNotMatch(group[0].matcher, /resume|fork/);
  assert.equal(group[0].hooks.length, 1);
  assert.deepEqual(group[0].hooks[0], {
    type: 'command',
    command: 'node "${CLAUDE_PLUGIN_ROOT}/hooks/session-start.mjs"',
    async: false,
  });

  const script = resolve(pluginRoot, 'hooks/session-start.mjs');
  const first = execFileSync(process.execPath, [script], { encoding: 'utf8' });
  const second = execFileSync(process.execPath, [script], { encoding: 'utf8' });
  assert.equal(first, second);
  const payload = JSON.parse(first);
  assert.deepEqual(Object.keys(payload), ['hookSpecificOutput']);
  assert.equal(payload.hookSpecificOutput.hookEventName, 'SessionStart');
  const context = payload.hookSpecificOutput.additionalContext;
  assert.match(context, /^<EXTREMELY-IMPORTANT>/);
  assert.match(context, /If the user is unsure what to do/);
  assert.match(context, /using-oec-dev/);
  assert.match(context, /Before any response or action/);
  assert.match(context, /change-plan/);
  assert.match(context, /change-implement/);
  assert.match(context, /never make the user act as the router/);
  assert.match(context, /before any business-code edit/);
  assert.match(context, /proactively identify the durable document that may need review/);
  assert.match(context, /smallest sufficient change/);
  assert.match(context, /observable success criteria/);
  assert.ok(context.length <= 5000, `SessionStart context is too large: ${context.length} characters`);
  assert.ok(context.trim().split(/\s+/).length <= 600, 'SessionStart context exceeds the word budget');
  for (const name of [...expectedSkills.filter((name) => !['change-plan', 'change-implement'].includes(name)), 'change-checker', 'web-evaluator', 'task-implementer', 'task-researcher']) {
    assert.equal(context.includes(name), false, `SessionStart must not duplicate capability metadata: ${name}`);
  }
  assert.doesNotMatch(context, /oec-spec|ai-docs|taskRef|Skill count|Agent count/);

  const codexManifest = JSON.parse(readFileSync(resolve(pluginRoot, '.codex-plugin/plugin.json'), 'utf8'));
  assert.deepEqual(codexManifest.hooks, {});
});

test('Claude Agent sources deterministically generate experimental Codex mirrors', () => {
  for (const name of DEV_AGENT_NAMES) {
    const markdown = readFileSync(resolve(pluginRoot, 'agents', `${name}.md`), 'utf8');
    const committedToml = readFileSync(resolve(pluginRoot, '.codex-plugin', 'agents', `${name}.toml`), 'utf8');
    assert.equal(committedToml, renderCodexAgent(markdown, name));

    const claude = claudeAgent(name);
    const codex = codexAgent(name);
    assert.equal(codex.name, name);
    assert.match(compact(claude.metadata.description), /user explicitly requests/);
    assert.match(compact(claude.metadata.description), /explicitly invoked Skill delegates/);
    assert.equal(compact(claude.metadata.description), compact(codex.description));
    assert.equal(claude.body, codex.instructions);
  }
  const implement = claudeAgent('task-implementer');
  assert.match(compact(implement.metadata.description), /existing taskRef or legacy change ID/);
  assert.match(implement.body, /Tests: <command and pass\/fail\/not run>/);
  assert.doesNotMatch(implement.body, /oec-spec task resolve/);
  assert.doesNotMatch(implement.body, /## Implementation complete/);
  const check = claudeAgent('change-checker');
  assert.match(compact(check.metadata.description), /may modify code/);
  assert.match(compact(check.metadata.description), /Do not use for a read-only code review/);
  assert.match(check.body, /git status --short/);
  assert.match(check.body, /git diff HEAD --/);
  assert.match(check.body, /relevant untracked files/);
  assert.match(check.body, /Tests: <command and pass\/fail\/not run>/);
  assert.doesNotMatch(check.body, /oec-spec remind/);
  const research = claudeAgent('task-researcher');
  assert.match(compact(research.metadata.description), /existing taskRef or legacy change ID/);
  assert.match(research.body, /Do not create or guess a task package/);
  const evaluate = claudeAgent('web-evaluator');
  assert.ok(evaluate.metadata.tools.includes('mcp__playwright__browser_navigate'));
  assert.ok(evaluate.metadata.tools.includes('mcp__playwright__browser_snapshot'));
  assert.equal(evaluate.metadata.tools.some((tool) => tool.includes('*')), false);
  assert.equal(evaluate.metadata.tools.includes('mcp__playwright__browser_run_code_unsafe'), false);
  assert.equal(evaluate.metadata.tools.includes('Write'), false);
  assert.equal(evaluate.metadata.tools.includes('Edit'), false);
  assert.equal('mcpServers' in evaluate.metadata, false);
  assert.equal('hooks' in evaluate.metadata, false);
  assert.equal('permissionMode' in evaluate.metadata, false);
  assert.match(evaluate.body, /task Spec's `AC-NNN` acceptance items/);
  assert.match(evaluate.body, /Product depth/);
  assert.match(evaluate.body, /Working tree changed by web-evaluator/);
});

test('skill descriptions make positive and negative judgment boundaries explicit', () => {
  for (const name of expectedSkills) {
    const item = skill(name);
    assert.equal(item.metadata.name, name);
    assert.match(item.metadata.description, /Do not use/i, `${name} needs a negative trigger boundary`);
    assert.ok(item.metadata.description.length < 400, `${name} discovery text is too broad`);
    assert.ok(item.text.split('\n').length < 90, `${name} entrypoint should remain focused`);
  }

  assert.match(skill('spec-manage').metadata.description, /durable project engineering Specs and ADRs/);
  assert.match(skill('change-implement').metadata.description, /existing development task/);
  assert.match(skill('change-implement').metadata.description, /ready Spec\/Design pair/);
  assert.match(skill('change-implement').metadata.description, /PRD-only implementation request/);
  assert.match(skill('change-implement').body, /PRD.*not an implementation authorization/si);
  assert.match(skill('legacy-doc-migrate').metadata.description, /legacy repository/);
  assert.match(skill('change-plan').metadata.description, /task-level Spec and Design/);
  assert.match(skill('change-plan').metadata.description, /technical design/);
  assert.match(skill('change-plan').metadata.description, /Required first planning step/);
  assert.match(skill('change-plan').body, /planning gate before business-code/);
  const bootstrap = readFileSync(resolve(pluginRoot, `skills/${bootstrapSkill}/SKILL.md`), 'utf8');
  assert.match(bootstrap, /Before any response or action/);
  assert.match(bootstrap, /PRD.*change-plan/s);
  assert.match(bootstrap, /ready.*change-implement/s);
  assert.match(skill('change-plan').metadata.description, /small obvious fix/);
  assert.match(skill('decision-challenge').metadata.description, /asks to challenge/);
  assert.match(skill('decision-challenge').metadata.description, /ordinary planning/);
  assert.match(skill('change-implement').metadata.description, /Do not use to create task artifacts/);
  assert.match(skill('change-implement').body, /Main Session/);
  assert.match(skill('change-implement').body, /task check --dev-root/);
  assert.match(skill('change-implement').body, /Do not dispatch an Agent by default/);
  assert.match(skill('design-prototype').metadata.description, /throwaway/);
  assert.match(skill('design-prototype').metadata.description, /production features/);
  assert.match(skill('test-first').metadata.description, /explicitly asks for TDD/);
  assert.match(skill('test-first').metadata.description, /merely because.*should have tests/);
  assert.match(skill('failure-debug').metadata.description, /root cause is unclear/);
  assert.match(skill('failure-debug').metadata.description, /obvious local error/);
  assert.match(skill('code-review').metadata.description, /read-only/);
  assert.match(skill('code-review').metadata.description, /Do not use to implement/);
});

test('engineering Skill invocation boundaries remain explicit and no Skill recreates the legacy router', () => {
  for (const name of expectedSkills) {
    const item = skill(name);
    assert.equal(item.metadata['disable-model-invocation'], undefined);
    assert.doesNotMatch(item.text, /oec-dev-task|oec-dev-flow|STAGE\.md|\.codex\/skills/);
    assert.doesNotMatch(item.text, /Read .*SKILL\.md|读取.*SKILL\.md/i);
    assert.doesNotMatch(item.text, /OAuth|HTTP payload|token cache|partial resume/i);
    assert.equal(item.text.includes(forbiddenAgentSlash), false);
  }
  const managing = skill('spec-manage');
  assert.equal(managing.metadata['disable-model-invocation'], undefined);
  assert.equal(openaiSkill('spec-manage').policy, undefined);
  for (const name of ['decision-challenge', 'change-close', 'legacy-doc-migrate', 'design-prototype']) {
    assert.equal(skill(name).metadata['disable-model-invocation'], undefined);
    assert.equal(openaiSkill(name).policy, undefined);
  }

  const closing = skill('change-close');
  assert.match(closing.metadata.description, /asks to close/);
  assert.match(closing.body, /Invoking this Skill does not authorize a commit/);
  assert.match(closing.body, /git add -- <exact code and engineering-document paths>/);
  assert.match(closing.body, /git commit -m .* -- <same exact paths>/);

  const migration = skill('legacy-doc-migrate');
  assert.match(migration.body, /preserve every existing `ai-docs` file in place/i);
  assert.match(migration.body, /Do not adopt E3 records/);
  assert.match(migration.body, /Do not create a migration state file/);

  assert.equal(readFileSync(resolve(pluginRoot, 'README.md'), 'utf8').includes(forbiddenAgentSlash), false);
});

test('newly discoverable Skills have natural-language positive evals', () => {
  for (const name of ['decision-challenge', 'change-close', 'legacy-doc-migrate', 'design-prototype']) {
    const prompt = readFileSync(resolve(pluginRoot, 'evals', `${name}-positive/prompt.md`), 'utf8');
    assert.doesNotMatch(prompt, /\/oec-dev:/, `${name} positive eval should exercise natural-language discovery`);
  }
});

test('public Skill and Agent identifiers use scoped concise names without an oec prefix', () => {
  for (const name of expectedSkills) {
    assert.doesNotMatch(name, /^oec-/);
    assert.match(name, /^(?:change|code|decision|design|failure|legacy|spec|test)-/);
  }
  for (const name of ['change-checker', 'web-evaluator', 'task-implementer', 'task-researcher']) {
    assert.doesNotMatch(name, /^oec-/);
    assert.equal(claudeAgent(name).metadata.name, name);
    assert.equal(codexAgent(name).description.length > 0, true);
  }
});

test('OEC Dev task assets expose one taskRef and paired Spec/Design contract', () => {
  const development = skill('change-implement');
  assert.equal(development.metadata['disable-model-invocation'], undefined);
  assert.match(development.body, /oec-spec task check/);
  assert.match(development.body, /Do not dispatch an Agent by default/);
  assert.match(development.body, /Do not commit, push, merge/);
  const planning = skill('change-plan');
  assert.match(planning.body, /oec-spec task resolve/);
  assert.match(planning.body, /oec-spec task check/);
  assert.match(planning.body, /ai-docs\/versions\/vX\.Y\.Z\/dev-task/);
  assert.match(planning.body, /task-artifact-contract/);
  assert.match(planning.body, /Product Root/);
  assert.match(readFileSync(resolve(pluginRoot, 'skills/change-plan/references/task-artifact-contract.md'), 'utf8'), /task_ref/);
  assert.match(readFileSync(resolve(pluginRoot, 'skills/change-plan/assets/task-spec.md'), 'utf8'), /artifact: task-spec/);
  assert.match(readFileSync(resolve(pluginRoot, 'skills/change-plan/assets/task-design.md'), 'utf8'), /artifact: task-design/);
  const managing = skill('spec-manage');
  assert.equal(managing.metadata['disable-model-invocation'], undefined);
  assert.match(managing.body, /oec-spec remind/);
  const reviewing = skill('code-review');
  assert.match(reviewing.body, /oec-spec remind/);
  assert.doesNotMatch(reviewing.body, /oec-spec task resolve/);
  const closing = skill('change-close');
  assert.match(closing.body, /oec-spec task check/);
  assert.match(closing.body, /oec-spec remind/);
  assert.doesNotMatch(closing.body, /oec-spec task resolve/);
  assert.equal(existsSync(resolve(pluginRoot, 'skills/change-close/assets/evidence.md')), false);
});

test('team Spec assets encode conditional artifacts and safe project ownership', () => {
  const managing = skill('spec-manage');
  assert.match(managing.body, /absent category is better than an empty placeholder/);
  assert.match(managing.body, /oec-spec check --workspace/);
  assert.doesNotMatch(managing.metadata.description, /Creates, migrates/);

  const contract = readFileSync(resolve(
    pluginRoot,
    'skills/spec-manage/references/team-spec-contract.md',
  ), 'utf8');
  assert.match(contract, /specs\/.*system as it is now/s);
  assert.match(contract, /requires `spec\.md` plus `design\.md`/);
  assert.match(contract, /Add `design\.md` only/);
  assert.match(contract, /Add `plan\.md` only/);
  assert.match(contract, /research\/.*conditional/);
  assert.match(contract, /Add `research\/` only/);
  assert.match(contract, /Add `evidence\.md` only/);
  assert.match(contract, /evidence\.md.*conditional/);
  assert.match(contract, /Product Root.*DEV_ROOT/);
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
