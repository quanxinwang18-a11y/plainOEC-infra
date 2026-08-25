import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

const execFileAsync = promisify(execFile);
const repositoryRoot = resolve(import.meta.dirname, '..');
const forbiddenAgentSlash = ['/oec-engineering', 'oec-'].join(':');
const removedGifSkill = ['record', 'gif'].join('-');

async function manifest(plugin) {
  return JSON.parse(await readFile(resolve(repositoryRoot, plugin, '.claude-plugin', 'plugin.json'), 'utf8'));
}

async function skillCount(plugin) {
  try {
    const entries = await readdir(resolve(repositoryRoot, plugin, 'skills'), { withFileTypes: true });
    let count = 0;
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      try { await readFile(resolve(repositoryRoot, plugin, 'skills', entry.name, 'SKILL.md')); count += 1; } catch {}
    }
    return count;
  } catch {
    return 0;
  }
}

test('Marketplace versions and native Plugin boundaries are internally consistent', async () => {
  const marketplace = JSON.parse(await readFile(resolve(repositoryRoot, '.claude-plugin', 'marketplace.json'), 'utf8'));
  const packageManifest = JSON.parse(await readFile(resolve(repositoryRoot, 'package.json'), 'utf8'));
  assert.equal(marketplace.version, '3.0.1');
  assert.equal(packageManifest.version, marketplace.version);
  assert.deepEqual(marketplace.plugins.map((plugin) => plugin.name), [
    'oec-product', 'oec-engineering', 'oec-e3', 'oec-pipeline', 'oec-common',
  ]);
  for (const entry of marketplace.plugins) {
    const pluginManifest = await manifest(entry.name);
    assert.equal(pluginManifest.version, entry.version, entry.name);
    assert.match(pluginManifest.description, /[\u4e00-\u9fff]/, `${entry.name} Plugin description must be Chinese`);
    assert.match(entry.description, /[\u4e00-\u9fff]/, `${entry.name} Marketplace description must be Chinese`);
    assert.equal(entry.source, `./${entry.name}`);
  }
  assert.deepEqual((await manifest('oec-product')).dependencies, [{ name: 'oec-e3', version: '~1.0.0' }]);
  assert.equal(await skillCount('oec-product'), 3);
  assert.equal(await skillCount('oec-engineering'), 9);
  assert.equal(await skillCount('oec-e3'), 0);
  assert.equal(await skillCount('oec-pipeline'), 0);
  assert.equal(await skillCount('oec-common'), 1);
});

test('only platform Plugins own MCP Servers and tool counts remain bounded', async () => {
  await assert.rejects(readFile(resolve(repositoryRoot, 'oec-product', '.mcp.json')), /ENOENT/);
  await assert.rejects(readFile(resolve(repositoryRoot, 'oec-engineering', '.mcp.json')), /ENOENT/);
  for (const [plugin, server, count] of [
    ['oec-e3', 'servers/e3/server.mjs', 10],
    ['oec-pipeline', 'servers/pipeline/server.mjs', 4],
  ]) {
    const mcp = JSON.parse(await readFile(resolve(repositoryRoot, plugin, '.mcp.json'), 'utf8'));
    assert.equal(Object.keys(mcp.mcpServers).length, 1);
    const source = await readFile(resolve(repositoryRoot, plugin, server), 'utf8');
    assert.equal([...source.matchAll(/registerTool\('/g)].length, count, plugin);
  }
  await assert.rejects(readFile(resolve(repositoryRoot, 'oec-product', 'dist', 'e3-server.mjs')), /ENOENT/);
  assert.ok((await readFile(resolve(repositoryRoot, 'oec-e3', 'dist', 'e3-server.mjs'))).length > 0);
  assert.ok((await readFile(resolve(repositoryRoot, 'oec-pipeline', 'dist', 'pipeline-server.mjs'))).length > 0);
});

test('current-facing documentation stays aligned with Marketplace components', async () => {
  const marketplace = JSON.parse(await readFile(resolve(repositoryRoot, '.claude-plugin', 'marketplace.json'), 'utf8'));
  const rootReadme = await readFile(resolve(repositoryRoot, 'README.md'), 'utf8');
  const hierarchy = await readFile(resolve(repositoryRoot, 'docs/architecture/platform-plugin-hierarchy.md'), 'utf8');
  const reportPath = resolve(repositoryRoot, 'docs/strategy/plainoec-infra-management-report.md');
  const report = await readFile(reportPath, 'utf8');
  const architectureSvg = await readFile(resolve(
    repositoryRoot,
    'docs/strategy/assets/oec-infra-next-optimization/05-current-architecture.svg',
  ), 'utf8');
  assert.match(rootReadme, /\[PlainOEC-infra 完整架构与能力管理报告\]\(docs\/strategy\/plainoec-infra-management-report\.md\)/);
  assert.match(report, new RegExp(`Marketplace.*${marketplace.version.replaceAll('.', '\\.')}`));
  for (const plugin of marketplace.plugins) {
    assert.match(rootReadme, new RegExp(`\\b${plugin.name}\\b`), `${plugin.name} missing from root README`);
    for (const [label, document] of [['management report', report], ['hierarchy', hierarchy]]) {
      assert.match(document, new RegExp(`${plugin.name.replace('-', '\\-')}@${plugin.version.replaceAll('.', '\\.')}\\b`),
        `${label} must include ${plugin.name}@${plugin.version}`);
    }
    assert.match(architectureSvg, new RegExp(`>${plugin.name}<`), `${plugin.name} missing from current architecture SVG`);
    assert.match(architectureSvg, new RegExp(`>${plugin.version}(?: |<)`), `${plugin.version} missing from current architecture SVG`);
  }

  for (const [component, count] of [
    ['Plugin', 5], ['Agent', 4], ['Skill', 13], ['MCP Server', 2], ['MCP Tool', 14], ['Hook', 0], ['Command', 0],
  ]) {
    assert.match(report, new RegExp(`\\| ${component} \\| ${count} \\|`), `${component} count missing from report`);
  }

  for (const name of [
    'writing-prds', 'reviewing-prds', 'publishing-prds-to-e3',
    'managing-team-specs', 'migrating-legacy-ai-docs', 'challenging-engineering-decisions',
    'prototyping-decisions', 'planning-engineering-changes', 'test-driven-development',
    'diagnosing-failures', 'reviewing-code-changes', 'closing-engineering-changes', 'html-slides',
  ]) assert.match(report, new RegExp(`\\b${name}\\b`), `${name} missing from report`);

  for (const name of ['oec-pm', 'oec-implement', 'oec-check', 'oec-research']) {
    assert.match(report, new RegExp(`\\b${name}\\b`), `${name} missing from report`);
  }

  for (const name of [
    'prepare_prd_publish', 'select_product_space', 'execute_prd_publish', 'get_prd_publish_status',
    'prepare_development_tasks', 'select_development_requirement', 'execute_development_tasks',
    'prepare_task_progress', 'execute_task_progress', 'get_development_task_status',
    'prepare_pipeline_run', 'select_pipeline_target', 'execute_pipeline_run', 'get_pipeline_run_status',
  ]) assert.match(report, new RegExp(`\\b${name}\\b`), `${name} missing from report`);

  assert.match(report, /oec-e3@~1\.0\.0/);
  assert.match(report, /简单、局部、低风险改动/);
  assert.match(report, /非平凡、高风险或需跨会话保存上下文的改动/);
  for (const name of [
    'publishing-prds-to-e3', 'migrating-legacy-ai-docs',
    'challenging-engineering-decisions', 'closing-engineering-changes',
  ]) assert.match(report, new RegExp(`${name}[\\s\\S]{0,180}manual-only`), `${name} manual-only boundary missing`);
  assert.match(report, /prepared → executing → executed/);
  assert.match(report, /同一个 plan token 最多[\s\S]{0,80}一次 `runPipeline` POST/);
  assert.match(report, /无法确定账号时[\s\S]{0,100}prepare[\s\S]{0,100}失败/);
  assert.match(report, /release candidate/);
  for (const gap of ['LICENSE/notice', 'E3 `1.0.1`', 'Pipeline `1.0.1`', 'LLM eval']) {
    assert.match(report, new RegExp(gap.replaceAll('.', '\\.')));
  }
  assert.doesNotMatch(report, /```mermaid/);
  assert.doesNotMatch(report, /(?<!!)\[[^\]]+\]\([^)]+\)/, 'management report must be self-contained');

  const currentUsage = [
    rootReadme,
    await readFile(resolve(repositoryRoot, 'oec-engineering', 'README.md'), 'utf8'),
    await readFile(resolve(repositoryRoot, 'oec-common', 'README.md'), 'utf8'),
  ].join('\n');
  assert.equal(currentUsage.includes(forbiddenAgentSlash), false);
  assert.doesNotMatch(currentUsage, /SessionStart Hook/);
  assert.equal(currentUsage.includes(removedGifSkill), false);

  const contributionRules = await readFile(resolve(repositoryRoot, 'CLAUDE.md'), 'utf8');
  assert.match(contributionRules, /Marketplace、Plugin description.*README 使用中文/);
  assert.match(contributionRules, /Skill\/Agent frontmatter、正文.*使用英文/);
  assert.match(contributionRules, /eval corpus.*中文和英文/);
});

test('a Git archive contains self-contained Plugin payloads without node_modules', async () => {
  const isolated = await mkdtemp(join(tmpdir(), 'plain-oec-archive-'));
  const archive = join(isolated, 'marketplace.tar');
  const extracted = join(isolated, 'marketplace');
  await execFileAsync('git', ['-C', repositoryRoot, 'archive', '--format=tar', '--output', archive, 'HEAD']);
  await execFileAsync('mkdir', ['-p', extracted]);
  await execFileAsync('tar', ['-xf', archive, '-C', extracted]);
  const files = (await execFileAsync('find', [extracted, '-type', 'd', '-name', 'node_modules'])).stdout.trim();
  assert.equal(files, '');
  assert.ok((await readFile(resolve(extracted, 'oec-product', 'skills/writing-prds/runtime/check-artifacts.mjs'))).length > 0);
  assert.ok((await readFile(resolve(extracted, 'oec-e3', 'dist/e3-server.mjs'))).length > 0);
  assert.ok((await readFile(resolve(extracted, 'oec-pipeline', 'dist/pipeline-server.mjs'))).length > 0);
  // Engineering components are self-contained without node_modules.
  assert.ok((await readFile(resolve(extracted, 'oec-engineering', 'dist/oec-spec.mjs'))).length > 0);
  assert.ok((await readFile(resolve(extracted, 'oec-engineering', 'agents/oec-implement.md'))).length > 0);
  assert.ok((await readFile(resolve(
    extracted,
    'oec-engineering',
    'skills/migrating-legacy-ai-docs/SKILL.md',
  ))).length > 0);
  assert.ok((await readFile(resolve(
    extracted,
    'oec-engineering',
    'skills/migrating-legacy-ai-docs/agents/openai.yaml',
  ))).length > 0);
  assert.ok((await readFile(resolve(
    extracted,
    'oec-engineering',
    'skills/challenging-engineering-decisions/agents/openai.yaml',
  ))).length > 0);
  assert.ok((await readFile(resolve(
    extracted,
    'oec-engineering',
    'skills/closing-engineering-changes/agents/openai.yaml',
  ))).length > 0);
  assert.ok((await readFile(resolve(
    extracted,
    'oec-engineering',
    'skills/prototyping-decisions/SKILL.md',
  ))).length > 0);
  assert.ok((await readFile(resolve(extracted, 'oec-common', 'skills/html-slides/assets/deck-index.html'))).length > 0);
  assert.ok((await readFile(resolve(extracted, 'oec-common', 'skills/html-slides/LICENSE.huashu-design'))).length > 0);
});
