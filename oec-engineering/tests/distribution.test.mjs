import assert from 'node:assert/strict';
import { copyFile, mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const pluginRoot = resolve(import.meta.dirname, '..');
const bundle = resolve(pluginRoot, 'dist/oec-spec.mjs');
const executable = resolve(pluginRoot, 'bin/oec-spec');

async function writeFiles(root, files) {
  for (const [path, content] of Object.entries(files)) {
    const absolute = join(root, path);
    await mkdir(resolve(absolute, '..'), { recursive: true });
    await writeFile(absolute, content);
  }
}

async function fixture() {
  const workspace = await mkdtemp(join(tmpdir(), 'oec-spec-bundle-fixture-'));
  await writeFiles(workspace, {
    'ai-docs/engineering/README.md': '# Engineering\n\n- [Java](specs/java.md)\n- [Frontend](specs/frontend.md)\n',
    'ai-docs/engineering/specs/java.md': `---
id: SPEC-java-service
applies_to:
  - src/main/java/**
---

# Java service

Use the existing Spring module boundaries.
`,
    'ai-docs/engineering/specs/frontend.md': `---
id: SPEC-frontend
applies_to:
  - frontend/src/**
---

# Frontend

Use the existing component contracts.
`,
  });
  return workspace;
}

test('committed oec-spec bundle has no development path or external runtime import', async () => {
  const content = await readFile(bundle, 'utf8');
  assert.doesNotMatch(content, /\/Users\/qxwang6\//);
  const imports = [...content.matchAll(/^import .* from "([^"]+)";/gm)].map((match) => match[1]);
  assert.equal(imports.every((specifier) => specifier.startsWith('node:')), true, imports.join(', '));
});

test('isolated bundle validates and selects team Specs without node_modules', async () => {
  const isolated = await mkdtemp(join(tmpdir(), 'oec-spec-isolated-'));
  const isolatedBundle = join(isolated, 'oec-spec.mjs');
  await copyFile(bundle, isolatedBundle);
  const workspace = await fixture();

  let result = spawnSync(process.execPath, [
    isolatedBundle,
    'check',
    '--workspace', workspace,
    '--format', 'json',
  ], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(JSON.parse(result.stdout).ok, true);

  result = spawnSync(process.execPath, [
    isolatedBundle,
    'select',
    '--workspace', workspace,
    '--paths', 'src/main/java/com/example/App.java',
    '--format', 'json',
  ], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.deepEqual(JSON.parse(result.stdout).specs.map((item) => item.id), ['SPEC-java-service']);
});

test('plugin executable delegates to the committed bundle', async () => {
  const workspace = await fixture();
  const result = spawnSync(executable, [
    'select',
    '--workspace', workspace,
    '--paths', 'frontend/src/Button.tsx',
    '--format', 'json',
  ], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.deepEqual(JSON.parse(result.stdout).specs.map((item) => item.id), ['SPEC-frontend']);
});

test('bundled legacy audit remains read-only', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'oec-spec-bundle-legacy-'));
  await writeFiles(workspace, {
    '.oec-ai/installation.json': JSON.stringify({
      schemaVersion: 1,
      role: 'dev',
      tool: 'claude-code',
      version: '0.2.2',
      managedFiles: ['.claude/skills/oec-dev-task/SKILL.md'],
    }),
    '.claude/skills/oec-dev-task/SKILL.md': '# legacy\n',
    'ai-docs/architecture/current.md': '# preserve\n',
  });
  const manifest = join(workspace, '.oec-ai/installation.json');
  const before = await readFile(manifest, 'utf8');
  const result = spawnSync(process.execPath, [
    bundle,
    'legacy-audit',
    '--workspace', workspace,
    '--format', 'json',
  ], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const output = JSON.parse(result.stdout);
  assert.equal(output.installation.managedCount, 1);
  assert.equal(output.preservedProjectContent.action, 'preserve');
  assert.deepEqual(output.destructiveActions, []);
  assert.equal(await readFile(manifest, 'utf8'), before);
});
