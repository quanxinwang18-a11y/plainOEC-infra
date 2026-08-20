import assert from 'node:assert/strict';
import { copyFile, mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const pluginRoot = resolve(import.meta.dirname, '..', '..', '..');
const e3Bundle = resolve(pluginRoot, 'dist/e3-server.mjs');
const checkerBundle = resolve(pluginRoot, 'skills/writing-prds/runtime/check-artifacts.mjs');

async function artifactFixture() {
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

test('committed runtime bundles contain no development path or external package import', async () => {
  for (const path of [e3Bundle, checkerBundle]) {
    const content = await readFile(path, 'utf8');
    assert.doesNotMatch(content, new RegExp(pluginRoot.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    const imports = [...content.matchAll(/^import .* from "([^"]+)";/gm)].map((match) => match[1]);
    assert.equal(imports.every((specifier) => specifier.startsWith('node:')), true, imports.join(', '));
  }
});

test('bundled artifact checker works without node_modules for valid and invalid fixtures', async () => {
  const isolated = await mkdtemp(join(tmpdir(), 'oec-checker-bundle-'));
  const executable = join(isolated, 'check-artifacts.mjs');
  await copyFile(checkerBundle, executable);
  const fixture = await artifactFixture();
  const args = ['--workspace', fixture.workspace, '--version', 'v1.2.3', '--stage', 'pre-publish', '--json'];

  let checked = spawnSync(process.execPath, [executable, ...args], { encoding: 'utf8' });
  assert.equal(checked.status, 0, checked.stderr || checked.stdout);
  assert.equal(JSON.parse(checked.stdout).ok, true);

  const broken = (await readFile(fixture.increment, 'utf8')).replace('#### US-001 抽奖', '#### 其他验收');
  await writeFile(fixture.increment, broken);
  checked = spawnSync(process.execPath, [executable, ...args], { encoding: 'utf8' });
  assert.equal(checked.status, 1, checked.stderr || checked.stdout);
  assert.equal(JSON.parse(checked.stdout).errors.some((issue) => issue.code === 'acceptance-missing'), true);
});

test('bundled E3 server completes MCP stdio discovery without node_modules', async () => {
  const isolated = await mkdtemp(join(tmpdir(), 'oec-e3-bundle-'));
  const executable = join(isolated, 'e3-server.mjs');
  const dataDirectory = join(isolated, 'data');
  await copyFile(e3Bundle, executable);
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [executable],
    env: { ...process.env, OEC_PLUGIN_DATA: dataDirectory },
  });
  const client = new Client({ name: 'bundle-distribution-test', version: '1.0.0' }, { capabilities: {} });
  await client.connect(transport);
  try {
    const tools = await client.listTools();
    assert.deepEqual(tools.tools.map((tool) => tool.name), [
      'prepare_prd_publish',
      'select_product_space',
      'execute_prd_publish',
      'get_prd_publish_status',
    ]);
    const execute = tools.tools.find((tool) => tool.name === 'execute_prd_publish');
    assert.equal(execute._meta['anthropic/requiresUserInteraction'], true);
  } finally {
    await client.close();
  }
});
