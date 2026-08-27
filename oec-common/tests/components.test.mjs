import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import YAML from 'yaml';

const pluginRoot = resolve(import.meta.dirname, '..');
const skillRoot = resolve(pluginRoot, 'skills/create-slides');

function skill() {
  const path = resolve(skillRoot, 'SKILL.md');
  const text = readFileSync(path, 'utf8');
  const match = /^---\n([\s\S]*?)\n---\n/.exec(text);
  assert.ok(match, 'create-slides must have YAML frontmatter');
  return { metadata: YAML.parse(match[1]), body: text.slice(match[0].length), text };
}

test('common 0.3 exposes one finished HTML Slides Skill', () => {
  const manifest = JSON.parse(readFileSync(resolve(pluginRoot, '.claude-plugin/plugin.json'), 'utf8'));
  assert.equal(manifest.name, 'oec-common');
  assert.equal(manifest.version, '0.3.0');
  assert.doesNotMatch(JSON.stringify(manifest), /gif/i);

  const names = readdirSync(resolve(pluginRoot, 'skills'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(resolve(pluginRoot, 'skills', entry.name, 'SKILL.md')))
    .map((entry) => entry.name);
  assert.deepEqual(names, ['create-slides']);

  const item = skill();
  assert.equal(item.metadata.name, 'create-slides');
  assert.match(item.metadata.description, /multi-file HTML slide decks/);
  assert.match(item.metadata.description, /Do not use/i);
  assert.equal(item.metadata['argument-hint'], '[topic, source files, brand assets, or deck brief]');
  assert.doesNotMatch(item.text, /TODO/);
});

test('create-slides supporting resources are linked, local, and attributed', () => {
  const item = skill();
  const links = [...item.body.matchAll(/\]\(([^)]+)\)/g)].map((match) => match[1]);
  assert.deepEqual(links.sort(), [
    'assets/deck-index.html',
    'assets/slide-template.html',
    'assets/tokens-template.css',
    'references/deck-contract.md',
    'references/verification.md',
  ].sort());
  for (const link of links) {
    assert.equal(existsSync(resolve(skillRoot, link)), true, `${link} must exist`);
  }
  const license = readFileSync(resolve(skillRoot, 'LICENSE.huashu-design'), 'utf8');
  assert.match(license, /MIT License/);
  assert.match(license, /alchaincyf/);
  assert.match(license, /adapted from Huashu-Design/);
});

test('deck shell is deterministic and zero dependency', () => {
  const shell = readFileSync(resolve(skillRoot, 'assets/deck-index.html'), 'utf8');
  assert.match(shell, /const DECK_MANIFEST = \[/);
  assert.match(shell, /ArrowRight/);
  assert.match(shell, /ArrowLeft/);
  assert.match(shell, /PageDown/);
  assert.match(shell, /PageUp/);
  assert.match(shell, /#slide-/);
  assert.match(shell, /#overview/);
  assert.match(shell, /@media print/);
  assert.match(shell, /1920px/);
  assert.match(shell, /1080px/);
  assert.doesNotMatch(shell, /https?:\/\//);
  assert.doesNotMatch(shell, /Math\.random|new Date|getSeconds|localStorage/);
  assert.doesNotMatch(shell, /gallery|thumbnail|thumb-img/i);
  assert.doesNotMatch(shell, /<script[^>]+src=|\bimport\s|\brequire\s*\(/i);
});

test('eval corpus exposes executable bilingual positive and negative cases', () => {
  const prompts = [];
  for (const polarity of ['positive', 'negative']) {
    const directory = resolve(pluginRoot, 'evals', `create-slides-${polarity}`);
    const promptText = readFileSync(resolve(directory, 'prompt.md'), 'utf8');
    const promptMatch = /^---\n([\s\S]*?)\n---\n/.exec(promptText);
    assert.ok(promptMatch);
    const prompt = YAML.parse(promptMatch[1]);
    const graderText = readFileSync(resolve(directory, 'graders/skill-route.md'), 'utf8');
    const graderMatch = /^---\n([\s\S]*?)\n---\n/.exec(graderText);
    assert.ok(graderMatch);
    const grader = YAML.parse(graderMatch[1]);
    prompts.push(promptText.slice(promptMatch[0].length));
    assert.equal(prompt.name, `create-slides-${polarity}`);
    assert.ok(prompt.tags.includes(polarity));
    assert.equal(grader.type, 'tool_used');
    assert.equal(grader.tool, 'Skill');
    assert.match(grader.input_match, /create-slides/);
    if (polarity === 'positive') assert.equal(grader.min, 1);
    else assert.deepEqual({ min: grader.min, max: grader.max, arm: grader.arm }, { min: 0, max: 0, arm: 'both' });
  }
  const corpus = prompts.join('\n');
  assert.match(corpus, /[\u4e00-\u9fff]/);
  assert.match(corpus, /\bCreate\b/);
  assert.doesNotMatch(corpus, /TODO/);
});
