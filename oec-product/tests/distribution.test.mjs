import assert from 'node:assert/strict';
import { copyFile, mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const pluginRoot = resolve(import.meta.dirname, '..');
const artifactCheckerBundle = resolve(pluginRoot, 'skills/prd-write/runtime/check-artifacts.mjs');

async function fixture() {
  const workspace = await mkdtemp(join(tmpdir(), 'oec-bundle-artifacts-'));
  const prd = `# PRD v1.2.3

## 模块: dailyDraw — 每日抽奖

### 模块概述
会员每日获得一次抽奖机会。

### 用户故事
| ID | 用户故事 | 优先级 |
|---|---|---|
| US-001 | 作为会员，我希望抽奖，以便获得权益 | P0 |

### 验收标准
#### US-001 抽奖
- Given 今日未抽奖，When 点击抽奖，Then 展示结果。

### 待确认事项
所有产品决策均已确认。
`;
  const childPath = 'ai-docs/versions/v1.2.3/prd/prd-v1.2.3-dailyDraw.md';
  const files = new Map([
    ['ai-docs/prd/prd-all.md', prd],
    ['ai-docs/prd/prd-all-changelog.md', '# Changelog\n\n## v1.2.3\n新增每日抽奖。\n'],
    ['ai-docs/versions/v1.2.3/prd/prd-v1.2.3.md', prd],
    [childPath, prd],
    ['ai-docs/versions/v1.2.3/prd/HANDOFF.yaml', `schema_version: 4
prd_version: v1.2.3
sub_prds:
  - featureName: dailyDraw
    file: ${childPath}
    stories:
      - id: US-001
`],
  ]);
  for (const [path, content] of files) {
    const absolute = join(workspace, path);
    await mkdir(resolve(absolute, '..'), { recursive: true });
    await writeFile(absolute, content);
  }
  return { workspace, increment: join(workspace, 'ai-docs/versions/v1.2.3/prd/prd-v1.2.3.md') };
}

test('committed artifact checker bundle has no development path or external runtime import', async () => {
  const content = await readFile(artifactCheckerBundle, 'utf8');
  assert.doesNotMatch(content, new RegExp(pluginRoot.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  const imports = [...content.matchAll(/^import .* from "([^"]+)";/gm)].map((match) => match[1]);
  assert.equal(imports.every((specifier) => specifier.startsWith('node:')), true, imports.join(', '));
});

test('bundled artifact checker works without node_modules for valid and invalid fixtures', async () => {
  const isolated = await mkdtemp(join(tmpdir(), 'prd-artifact-checker-bundle-'));
  const executable = join(isolated, 'check-artifacts.mjs');
  await copyFile(artifactCheckerBundle, executable);
  const value = await fixture();
  const args = ['--workspace', value.workspace, '--version', 'v1.2.3', '--stage', 'pre-publish', '--json'];

  let checked = spawnSync(process.execPath, [executable, ...args], { encoding: 'utf8' });
  assert.equal(checked.status, 0, checked.stderr || checked.stdout);
  assert.equal(JSON.parse(checked.stdout).ok, true);

  const broken = (await readFile(value.increment, 'utf8')).replace('#### US-001 抽奖', '#### 其他验收');
  await writeFile(value.increment, broken);
  checked = spawnSync(process.execPath, [executable, ...args], { encoding: 'utf8' });
  assert.equal(checked.status, 1, checked.stderr || checked.stdout);
  assert.equal(JSON.parse(checked.stdout).errors.some((issue) => issue.code === 'acceptance-missing'), true);
});
