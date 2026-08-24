import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import YAML from 'yaml';

const pluginRoot = resolve(import.meta.dirname, '..');
const skillRoot = resolve(pluginRoot, 'skills/html-slides');

function skill() {
  const path = resolve(skillRoot, 'SKILL.md');
  const text = readFileSync(path, 'utf8');
  const match = /^---\n([\s\S]*?)\n---\n/.exec(text);
  assert.ok(match, 'html-slides must have YAML frontmatter');
  return { metadata: YAML.parse(match[1]), body: text.slice(match[0].length), text };
}

test('common 0.2 exposes one finished HTML Slides Skill', () => {
  const manifest = JSON.parse(readFileSync(resolve(pluginRoot, '.claude-plugin/plugin.json'), 'utf8'));
  assert.equal(manifest.name, 'oec-common');
  assert.equal(manifest.version, '0.2.0');
  assert.doesNotMatch(JSON.stringify(manifest), /gif/i);

  const names = readdirSync(resolve(pluginRoot, 'skills'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(resolve(pluginRoot, 'skills', entry.name, 'SKILL.md')))
    .map((entry) => entry.name);
  assert.deepEqual(names, ['html-slides']);

  const item = skill();
  assert.equal(item.metadata.name, 'html-slides');
  assert.match(item.metadata.description, /multi-file HTML slide decks/);
  assert.match(item.metadata.description, /Do not use/i);
  assert.equal(item.metadata['argument-hint'], '[topic, source files, brand assets, or deck brief]');
  assert.doesNotMatch(item.text, /TODO/);
});

test('html-slides supporting resources are linked, local, and attributed', () => {
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

test('eval corpus covers bilingual positive and negative intent', () => {
  const path = resolve(skillRoot, 'evals/cases.md');
  const cases = readFileSync(path, 'utf8');
  assert.equal(dirname(path), resolve(skillRoot, 'evals'));
  assert.match(cases, /## Positive cases/);
  assert.match(cases, /## Negative cases/);
  assert.match(cases, /[\u4e00-\u9fff]/);
  assert.match(cases, /\bCreate\b/);
  assert.doesNotMatch(cases, /TODO/);
});
