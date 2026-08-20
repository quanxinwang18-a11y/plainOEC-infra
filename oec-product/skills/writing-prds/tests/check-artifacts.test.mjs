import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { checkArtifacts, parseModules } from '../scripts/check-artifacts.mjs';

function write(root, path, content) {
  const target = join(root, path);
  mkdirSync(join(target, '..'), { recursive: true });
  writeFileSync(target, content);
}

function moduleMarkdown(feature = 'dailyDraw', story = 'US-001') {
  return `# PRD v1.2.3\n\n## 模块: ${feature} — 每日抽奖\n\n### 模块概述\n会员每日获得一次抽奖机会。\n\n### 用户故事\n| ID | 用户故事 | 优先级 |\n|---|---|---|\n| ${story} | 作为会员，我希望抽奖，以便获得权益 | P0 |\n\n### 验收标准\n#### ${story} 抽奖\n- Given 今日未抽奖，When 点击抽奖，Then 展示结果。\n\n### 待确认事项\n所有影响本版本的产品决策均已确认。\n`;
}

function validWorkspace() {
  const root = mkdtempSync(join(tmpdir(), 'oec-prd-check-'));
  write(root, 'ai-docs/prd/prd-all.md', moduleMarkdown());
  write(root, 'ai-docs/prd/prd-all-changelog.md', '# Changelog\n\n## v1.2.3\n新增每日抽奖。\n');
  write(root, 'ai-docs/versions/v1.2.3/prd/prd-v1.2.3.md', moduleMarkdown());
  write(root, 'ai-docs/versions/v1.2.3/prd/prd-v1.2.3-dailyDraw.md', moduleMarkdown());
  write(root, 'ai-docs/versions/v1.2.3/prd/HANDOFF.yaml', `schema_version: 4\nprd_version: v1.2.3\nsub_prds:\n  - featureName: dailyDraw\n    file: ai-docs/versions/v1.2.3/prd/prd-v1.2.3-dailyDraw.md\n    stories:\n      - id: US-001\n`);
  return root;
}

test('parseModules reads lowerCamelCase module keys', () => {
  assert.deepEqual(parseModules(moduleMarkdown()).map((module) => module.featureName), ['dailyDraw']);
});

test('valid finalized and split artifacts pass', () => {
  const result = checkArtifacts({ workspace: validWorkspace(), version: 'v1.2.3', stage: 'pre-publish' });
  assert.equal(result.ok, true, JSON.stringify(result, null, 2));
});

test('a story without matching acceptance criteria fails', () => {
  const root = validWorkspace();
  const broken = moduleMarkdown().replace('#### US-001 抽奖', '#### 其他验收');
  write(root, 'ai-docs/versions/v1.2.3/prd/prd-v1.2.3.md', broken);
  const result = checkArtifacts({ workspace: root, version: 'v1.2.3', stage: 'finalize' });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((entry) => entry.code === 'acceptance-missing'));
});

test('HANDOFF and child story mismatches fail', () => {
  const root = validWorkspace();
  write(root, 'ai-docs/versions/v1.2.3/prd/HANDOFF.yaml', `schema_version: 4\nprd_version: v1.2.3\nsub_prds:\n  - featureName: dailyDraw\n    file: ai-docs/versions/v1.2.3/prd/prd-v1.2.3-dailyDraw.md\n    stories:\n      - id: US-999\n`);
  const result = checkArtifacts({ workspace: root, version: 'v1.2.3', stage: 'pre-publish' });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((entry) => entry.code === 'handoff-story-mismatch'));
});

test('unsafe child paths are rejected', () => {
  const root = validWorkspace();
  write(root, 'ai-docs/versions/v1.2.3/prd/HANDOFF.yaml', `schema_version: 4\nprd_version: v1.2.3\nsub_prds:\n  - featureName: dailyDraw\n    file: ../../outside.md\n    stories:\n      - id: US-001\n`);
  const result = checkArtifacts({ workspace: root, version: 'v1.2.3', stage: 'pre-publish' });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((entry) => entry.code === 'child-path-unsafe'));
});
