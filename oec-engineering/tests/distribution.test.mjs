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

async function taskFixture() {
  const product = await mkdtemp(join(tmpdir(), 'oec-spec-product-fixture-'));
  const dev = await mkdtemp(join(tmpdir(), 'oec-spec-dev-fixture-'));
  await writeFiles(product, {
    'ai-docs/versions/v1.2.3/prd/prd-v1.2.3-paymentRetry.md': '# Payment retry\n',
    'ai-docs/versions/v1.2.3/prd/HANDOFF.yaml': `schema_version: 4
prd_version: v1.2.3
sub_prds:
  - featureName: paymentRetry
    file: ai-docs/versions/v1.2.3/prd/prd-v1.2.3-paymentRetry.md
    stories:
      - id: US-001
`,
  });
  await writeFiles(dev, {
    'ai-docs/engineering/README.md': '# Engineering\n',
    'ai-docs/versions/v1.2.3/dev-task/payment-retry/spec.md': `---
artifact: task-spec
schema_version: 1
task_ref: versioned:v1.2.3/payment-retry
title: Payment retry
module_ids:
  - payment
affected_paths:
  include:
    - services/payment/**
source:
  kind: product
  root: product
  repository: product-requirements
  revision: abc123
  prd_path: ai-docs/versions/v1.2.3/prd/prd-v1.2.3-paymentRetry.md
  handoff_path: ai-docs/versions/v1.2.3/prd/HANDOFF.yaml
  feature_name: paymentRetry
  stories:
    - US-001
---
# Payment retry

## Goal and scope
Implement bounded retry.

## Acceptance
- AC-001: retry is observable
`,
    'ai-docs/versions/v1.2.3/dev-task/payment-retry/design.md': `---
artifact: task-design
schema_version: 1
task_ref: versioned:v1.2.3/payment-retry
spec_ref: ./spec.md
title: Payment retry design
---
# Payment retry design

## Constraints and affected contracts
Keep the existing contract.

## Chosen design
Use the current service boundary.

## Change boundary
Payment service only.

## Verification
Run the payment tests.
`,
  });
  return { product, dev };
}

test('isolated bundle resolves and validates a split-space task contract', async () => {
  const isolated = await mkdtemp(join(tmpdir(), 'oec-spec-task-isolated-'));
  const isolatedBundle = join(isolated, 'oec-spec.mjs');
  await copyFile(bundle, isolatedBundle);
  const { product, dev } = await taskFixture();

  let result = spawnSync(process.execPath, [
    isolatedBundle,
    'task', 'resolve',
    '--dev-root', dev,
    '--product-root', product,
    '--task-ref', 'versioned:v1.2.3/payment-retry',
    '--format', 'json',
  ], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const resolved = JSON.parse(result.stdout);
  assert.equal(resolved.ref, 'versioned:v1.2.3/payment-retry');
  assert.equal(resolved.source.root, 'product');

  result = spawnSync(process.execPath, [
    isolatedBundle,
    'task', 'check',
    '--dev-root', dev,
    '--product-root', product,
    '--task-ref', 'versioned:v1.2.3/payment-retry',
    '--stage', 'ready',
    '--format', 'json',
  ], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(JSON.parse(result.stdout).ok, true);

  result = spawnSync(process.execPath, [
    isolatedBundle,
    'remind',
    '--workspace', dev,
    '--paths', 'services/payment/CaptureService.java',
    '--signals', 'contract',
    '--format', 'json',
  ], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(JSON.parse(result.stdout).level, 'review');
});

test('bundled task checker fails with contract exit code and CLI errors use argument exit code', async () => {
  const isolated = await mkdtemp(join(tmpdir(), 'oec-spec-task-invalid-'));
  const isolatedBundle = join(isolated, 'oec-spec.mjs');
  await copyFile(bundle, isolatedBundle);
  const { dev } = await taskFixture();
  const designPath = join(dev, 'ai-docs/versions/v1.2.3/dev-task/payment-retry/design.md');
  const design = await readFile(designPath, 'utf8');
  await writeFile(designPath, design.replace('spec_ref: ./spec.md', 'spec_ref: ./missing.md'));
  let result = spawnSync(process.execPath, [
    isolatedBundle,
    'task', 'check',
    '--dev-root', dev,
    '--task-ref', 'versioned:v1.2.3/payment-retry',
    '--stage', 'structure',
    '--format', 'json',
  ], { encoding: 'utf8' });
  assert.equal(result.status, 1, result.stderr || result.stdout);
  assert.equal(JSON.parse(result.stdout).errors.some((item) => item.code === 'spec-reference-invalid'), true);
  result = spawnSync(process.execPath, [isolatedBundle, 'task', 'check', '--stage', 'unknown'], { encoding: 'utf8' });
  assert.equal(result.status, 2);
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
