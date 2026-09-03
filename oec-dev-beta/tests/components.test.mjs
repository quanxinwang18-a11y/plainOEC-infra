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
  return { metadata: YAML.parse(match[1]), body: text.slice(match[0].length), text };
}

test('oec-dev-beta exposes one explicit experimental Skill and no copied platform components', () => {
  const manifest = JSON.parse(readFileSync(resolve(pluginRoot, '.claude-plugin/plugin.json'), 'utf8'));
  assert.equal(manifest.name, 'oec-dev-beta');
  assert.equal(manifest.version, '0.1.0');
  assert.match(manifest.description, /实验性/);
  assert.equal('dependencies' in manifest, false);

  const skill = frontmatter('skills/web-develop/SKILL.md');
  assert.equal(skill.metadata.name, 'web-develop');
  assert.equal(skill.metadata['disable-model-invocation'], true);
  assert.match(skill.metadata.description, /experimental capability/);
  assert.match(skill.body, /host-discovered.*implementer.*evaluator.*checker.*oec-spec/s);
  assert.match(skill.body, /Do not copy/);
  assert.match(skill.body, /five.*cycles/);
  assert.match(skill.body, /ten total cycles/);
  assert.doesNotMatch(skill.body, /oec-dev:web-develop/);

  for (const path of ['.mcp.json', 'hooks', 'agents', 'dist', 'bin']) {
    assert.equal(existsSync(resolve(pluginRoot, path)), false, `${path} must not be copied into oec-dev-beta`);
  }
});

test('oec-dev-beta keeps the Codex Skill explicit and carries positive and negative route cases', () => {
  const policy = YAML.parse(readFileSync(resolve(pluginRoot, 'skills/web-develop/agents/openai.yaml'), 'utf8'));
  assert.equal(policy.policy.allow_implicit_invocation, false);
  assert.match(policy.interface.default_prompt, /\$web-develop/);

  for (const polarity of ['positive', 'negative']) {
    const directory = `evals/web-develop-${polarity}`;
    const prompt = frontmatter(`${directory}/prompt.md`);
    const grader = frontmatter(`${directory}/graders/skill-route.md`).metadata;
    assert.equal(prompt.metadata.name, `web-develop-${polarity}`);
    assert.ok(prompt.metadata.tags.includes(polarity));
    assert.equal(grader.type, 'tool_used');
    assert.equal(grader.tool, 'Skill');
    assert.match(grader.input_match, /web-develop/);
    if (polarity === 'positive') assert.equal(grader.min, 1);
    else assert.deepEqual({ min: grader.min, max: grader.max, arm: grader.arm }, { min: 0, max: 0, arm: 'both' });
  }
});
