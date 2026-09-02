import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

import { checkTaskArtifacts } from '../scripts/contracts/task-artifacts.mjs';
import { parseTaskRef, resolveTaskRef } from '../scripts/contracts/task-ref.mjs';
import { resolveSourceRef, resolveWorkspaceRoots, sourceForDocument } from '../scripts/contracts/workspace-source.mjs';
import { findSpecReminders } from '../scripts/spec-reminder.mjs';

async function writeFiles(root, files) {
  for (const [path, content] of Object.entries(files)) {
    const absolute = join(root, path);
    await mkdir(resolve(absolute, '..'), { recursive: true });
    await writeFile(absolute, content);
  }
}

function specText({ ref = 'versioned:v1.2.3/payment-retry', sourceRoot = 'product', source = true } = {}) {
  return `---
artifact: task-spec
schema_version: 1
task_ref: ${ref}
feature_name: paymentRetry
external_change_id: v1.2.3-paymentRetry
title: Payment retry
module_ids:
  - payment
affected_paths:
  include:
    - services/payment/**
${source ? `source:
  kind: product
  root: ${sourceRoot}
  repository: product-requirements
  revision: abc123
  prd_path: ai-docs/versions/v1.2.3/prd/prd-v1.2.3-paymentRetry.md
  handoff_path: ai-docs/versions/v1.2.3/prd/HANDOFF.yaml
  feature_name: paymentRetry
  stories:
    - US-001
` : ''}related_specs:
  - SPEC-payment-domain
---
# Payment retry

## Goal and scope
Add bounded retry behavior.

## Acceptance
- AC-001: retry is observable
`;
}

function designText({ ref = 'versioned:v1.2.3/payment-retry', specRef = './spec.md' } = {}) {
  return `---
artifact: task-design
schema_version: 1
task_ref: ${ref}
spec_ref: ${specRef}
title: Payment retry design
---
# Payment retry design

## Constraints and affected contracts
The existing payment contract remains compatible.

## Chosen design
Use the existing retry boundary.

## Change boundary
Only the payment service is changed.

## Verification
Run the payment tests.
`;
}

async function productFixture() {
  const product = await mkdtemp(join(tmpdir(), 'oec-product-source-'));
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
  return product;
}

async function devFixture(productRoot) {
  const dev = await mkdtemp(join(tmpdir(), 'oec-dev-contract-'));
  await writeFiles(dev, {
    'ai-docs/engineering/README.md': '# Engineering\n',
    'ai-docs/engineering/specs/payment.md': `---
id: SPEC-payment-domain
module_id: payment
applies_to:
  - services/payment/**
---
# Payment
Payment owns settlement behavior.
`,
    'ai-docs/engineering/module-index.yaml': `schema_version: 1
modules:
  - id: payment
    paths:
      - services/payment/**
`,
    'ai-docs/versions/v1.2.3/dev-task/payment-retry/spec.md': specText({ sourceRoot: 'product' }),
    'ai-docs/versions/v1.2.3/dev-task/payment-retry/design.md': designText(),
  });
  return dev;
}

test('taskRef parser normalizes canonical and legacy forms', () => {
  assert.deepEqual(parseTaskRef('versioned:v1.2.3/payment-retry'), {
    kind: 'versioned',
    version: 'v1.2.3',
    taskSlug: 'payment-retry',
    ref: 'versioned:v1.2.3/payment-retry',
  });
  assert.equal(parseTaskRef('v1.2.3/payment-retry').ref, 'versioned:v1.2.3/payment-retry');
  assert.equal(parseTaskRef('change:2026-09-02-cache-fix').ref, 'change:2026-09-02-cache-fix');
  assert.equal(parseTaskRef('v1.2.3-paymentRetry').kind, 'legacy-id');
  assert.throws(() => parseTaskRef('../outside'), /safe repository-relative/);
  assert.throws(() => parseTaskRef('payment-retry'), /unsupported taskRef/);
});

test('taskRef resolves a versioned task and preserves the external E3 identity', async () => {
  const dev = await devFixture(null);
  const result = await resolveTaskRef({
    devRoot: dev,
    taskRef: 'versioned:v1.2.3/payment-retry',
  });
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.relativePath, 'ai-docs/versions/v1.2.3/dev-task/payment-retry');
  assert.equal(result.exists, true);
  assert.equal(result.featureName, 'paymentRetry');
  assert.equal(result.externalChangeId, 'v1.2.3-paymentRetry');
});

test('taskRef path aliases and conflicting identities fail deterministically', async () => {
  const dev = await devFixture(null);
  const byPath = await resolveTaskRef({
    workspace: dev,
    path: 'ai-docs/versions/v1.2.3/dev-task/payment-retry',
  });
  assert.equal(byPath.ok, true, JSON.stringify(byPath.errors));
  assert.equal(byPath.ref, 'versioned:v1.2.3/payment-retry');
  const conflict = await resolveTaskRef({
    devRoot: dev,
    taskRef: 'versioned:v1.2.3/payment-retry',
    changeId: '2026-09-02-cache-fix',
  });
  assert.equal(conflict.ok, false);
  assert.equal(conflict.errors[0].code, 'task-ref-invalid');
});

test('legacy version-feature IDs resolve to the unique versioned task', async () => {
  const dev = await devFixture(null);
  const result = await resolveTaskRef({ devRoot: dev, changeId: 'v1.2.3-paymentRetry' });
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.ref, 'versioned:v1.2.3/payment-retry');
  assert.equal(result.externalChangeId, 'v1.2.3-paymentRetry');
  assert.equal(result.compatibility, 'native');
});

test('a legacy ID matching both canonical locations is rejected as ambiguous', async () => {
  const dev = await devFixture(null);
  await writeFiles(dev, {
    'ai-docs/engineering/changes/v1.2.3-paymentRetry/change.md': '# duplicate location\n',
  });
  const result = await resolveTaskRef({ devRoot: dev, changeId: 'v1.2.3-paymentRetry' });
  assert.equal(result.ok, false);
  assert.equal(result.errors.some((item) => item.code === 'task-ref-ambiguous'), true);
});

test('versioned and unversioned task references do not share path semantics', async () => {
  const dev = await mkdtemp(join(tmpdir(), 'oec-dev-unversioned-'));
  await writeFiles(dev, {
    'ai-docs/engineering/changes/2026-09-02-cache-fix/change.md': `---
id: 2026-09-02-cache-fix
---
# Cache fix
`,
  });
  const result = await resolveTaskRef({ devRoot: dev, taskRef: 'change:2026-09-02-cache-fix' });
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.kind, 'change');
  assert.equal(result.compatibility, 'legacy');
  assert.match(result.relativePath, /ai-docs\/engineering\/changes\/2026-09-02-cache-fix/);
});

test('task artifacts validate as a pair with structured identity and sections', async () => {
  const product = await productFixture();
  const dev = await devFixture(product);
  const result = await checkTaskArtifacts({
    devRoot: dev,
    productRoot: product,
    taskRef: 'versioned:v1.2.3/payment-retry',
    stage: 'ready',
  });
  assert.equal(result.ok, true, JSON.stringify(result.errors, null, 2));
  assert.deepEqual(result.artifacts.spec.data.modules, ['payment']);
  assert.equal(result.artifacts.design.data.specRef, './spec.md');
});

test('task checker reports identity, section, and reference errors', async () => {
  const dev = await devFixture(null);
  const design = join(dev, 'ai-docs/versions/v1.2.3/dev-task/payment-retry/design.md');
  const original = await readFile(design, 'utf8');
  await writeFile(design, original.replace('versioned:v1.2.3/payment-retry', 'versioned:v1.2.3/other-task').replace('spec_ref: ./spec.md', 'spec_ref: ./missing.md').replace('## Verification', '## Verification\n{{missing}}'));
  const result = await checkTaskArtifacts({
    devRoot: dev,
    taskRef: 'versioned:v1.2.3/payment-retry',
    stage: 'structure',
  });
  assert.equal(result.ok, false);
  const codes = new Set(result.errors.map((item) => item.code));
  assert.equal(codes.has('task-identity-mismatch'), true);
  assert.equal(codes.has('spec-reference-invalid'), true);
  assert.equal(codes.has('placeholder-text'), true);
});

test('Product source resolution keeps split roots read-only and checks HANDOFF identity', async () => {
  const product = await productFixture();
  const dev = await devFixture(product);
  const roots = await resolveWorkspaceRoots({ devRoot: dev, productRoot: product });
  assert.equal(roots.sameSpace, false);
  const source = await resolveSourceRef({
    kind: 'product',
    root: 'product',
    prd_path: 'ai-docs/versions/v1.2.3/prd/prd-v1.2.3-paymentRetry.md',
    handoff_path: 'ai-docs/versions/v1.2.3/prd/HANDOFF.yaml',
    feature_name: 'paymentRetry',
    stories: ['US-001'],
  }, roots, { version: 'v1.2.3', featureName: 'paymentRetry', requireFiles: true });
  assert.equal(source.ok, true, JSON.stringify(source.errors, null, 2));
  assert.equal(source.root, 'product');
  assert.equal(source.product.featureName, 'paymentRetry');
  const persisted = sourceForDocument(source);
  assert.equal(persisted.root, 'product');
  assert.equal(Object.values(persisted).some((value) => typeof value === 'string' && value.startsWith('/')), false);
  const bad = await resolveSourceRef({
    kind: 'product',
    root: 'product',
    prd_path: '../outside.md',
  }, roots, { version: 'v1.2.3', requireFiles: true });
  assert.equal(bad.ok, false);
  assert.equal(bad.errors.some((item) => item.code === 'source-path-escape'), true);
});

test('structure validation can inspect a Product task before Product Root is available', async () => {
  const dev = await devFixture(null);
  const result = await checkTaskArtifacts({
    devRoot: dev,
    taskRef: 'versioned:v1.2.3/payment-retry',
    stage: 'structure',
  });
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.warnings.some((item) => item.code === 'source-unverified'), true);
  const ready = await checkTaskArtifacts({
    devRoot: dev,
    taskRef: 'versioned:v1.2.3/payment-retry',
    stage: 'ready',
  });
  assert.equal(ready.ok, false);
  assert.equal(ready.errors.some((item) => item.code === 'product-root-required'), true);
});

test('Spec reminder is advisory, deterministic, and read-only', async () => {
  const dev = await devFixture(null);
  const before = await readFile(join(dev, 'ai-docs/engineering/specs/payment.md'), 'utf8');
  const result = await findSpecReminders({
    devRoot: dev,
    paths: ['services/payment/CaptureService.java'],
    signals: ['contract'],
  });
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.remind, true);
  assert.equal(result.level, 'review');
  assert.equal(result.candidates.some((item) => item.kind === 'update-spec' && item.target === 'SPEC-payment-domain'), true);
  assert.equal(await readFile(join(dev, 'ai-docs/engineering/specs/payment.md'), 'utf8'), before);
});

test('reminder reports an invalid taskRef instead of hiding it as a warning', async () => {
  const dev = await devFixture(null);
  const result = await findSpecReminders({ devRoot: dev, taskRef: 'not-a-task-ref', paths: ['services/payment/Capture.java'] });
  assert.equal(result.ok, false);
  assert.equal(result.errors.some((item) => item.code === 'task-ref-invalid'), true);
});

test('private implementation paths do not force a durable Spec reminder', async () => {
  const dev = await devFixture(null);
  const result = await findSpecReminders({
    devRoot: dev,
    paths: ['services/payment/internal/formatting/LocalValue.java'],
  });
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.remind, true, 'a path-scoped Spec is still a useful advisory candidate');
  assert.equal(result.level, 'suggestion');
  assert.equal(result.candidates.every((item) => item.severity === 'suggestion'), true);
});

test('a Product task without feature identity is not ready', async () => {
  const product = await productFixture();
  const dev = await devFixture(product);
  const spec = join(dev, 'ai-docs/versions/v1.2.3/dev-task/payment-retry/spec.md');
  const original = await readFile(spec, 'utf8');
  await writeFile(spec, original
    .replace('feature_name: paymentRetry\n', '')
    .replace('  feature_name: paymentRetry\n', ''));
  const result = await checkTaskArtifacts({ devRoot: dev, productRoot: product, taskRef: 'versioned:v1.2.3/payment-retry', stage: 'ready' });
  assert.equal(result.ok, false);
  assert.equal(result.errors.some((item) => item.code === 'feature-name-missing'), true);
});

test('an empty structured source is rejected at ready validation', async () => {
  const dev = await devFixture(null);
  const spec = join(dev, 'ai-docs/versions/v1.2.3/dev-task/payment-retry/spec.md');
  const original = await readFile(spec, 'utf8');
  await writeFile(spec, original.replace(/source:\n(?:  .*\n)+/, 'source: {}\n'));
  const result = await checkTaskArtifacts({ devRoot: dev, taskRef: 'versioned:v1.2.3/payment-retry', stage: 'ready' });
  assert.equal(result.ok, false);
  assert.equal(result.errors.some((item) => item.code === 'source-empty'), true);
});

test('malformed structured source is rejected instead of being treated as absent', async () => {
  const dev = await mkdtemp(join(tmpdir(), 'oec-dev-source-invalid-'));
  const result = await resolveSourceRef('not-a-mapping', { devRoot: dev, productRoot: null }, { requireFiles: true });
  assert.equal(result.ok, false);
  assert.equal(result.errors[0].code, 'source-invalid');
});

test('a directly referenced Product PRD does not require HANDOFF', async () => {
  const product = await productFixture();
  const dev = await mkdtemp(join(tmpdir(), 'oec-dev-direct-prd-'));
  const roots = await resolveWorkspaceRoots({ devRoot: dev, productRoot: product });
  const result = await resolveSourceRef({
    kind: 'product',
    root: 'product',
    prd_path: 'ai-docs/versions/v1.2.3/prd/prd-v1.2.3-paymentRetry.md',
  }, roots, { version: 'v1.2.3', requireFiles: true });
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.product.handoff, null);
});

test('source resolution distinguishes external provenance from locally verified Product files', async () => {
  const roots = await resolveWorkspaceRoots({ devRoot: await mkdtemp(join(tmpdir(), 'oec-dev-external-')) });
  const result = await resolveSourceRef({
    kind: 'product',
    root: 'external',
    repository: 'product-requirements',
    revision: 'abc123',
    prd_path: 'ai-docs/versions/v1.2.3/prd/prd-v1.2.3-paymentRetry.md',
  }, roots, { version: 'v1.2.3', requireFiles: true });
  assert.equal(result.ok, true);
  assert.equal(result.warnings.some((item) => item.code === 'source-unverifiable'), true);
  const unsafe = await resolveSourceRef({
    kind: 'product',
    root: 'external',
    repository: 'product-requirements',
    revision: 'abc123',
    prd_path: '../outside.md',
  }, roots, { version: 'v1.2.3', requireFiles: true });
  assert.equal(unsafe.ok, false);
  assert.equal(unsafe.errors.some((item) => item.code === 'source-path-escape'), true);
});

test('Product source rejects feature and version drift from HANDOFF', async () => {
  const product = await productFixture();
  const dev = await mkdtemp(join(tmpdir(), 'oec-dev-source-drift-'));
  const roots = await resolveWorkspaceRoots({ devRoot: dev, productRoot: product });
  const result = await resolveSourceRef({
    kind: 'product',
    root: 'product',
    prd_path: 'ai-docs/versions/v1.2.3/prd/prd-v1.2.3-paymentRetry.md',
    handoff_path: 'ai-docs/versions/v1.2.3/prd/HANDOFF.yaml',
    feature_name: 'otherFeature',
  }, roots, { version: 'v1.2.3', featureName: 'otherFeature', requireFiles: true });
  assert.equal(result.ok, false);
  assert.equal(result.errors.some((item) => item.code === 'source-feature-missing'), true);
  const wrongVersion = await resolveSourceRef({
    kind: 'product',
    root: 'product',
    prd_path: 'ai-docs/versions/v9.9.9/prd/prd-v9.9.9-paymentRetry.md',
  }, roots, { version: 'v1.2.3', requireFiles: true });
  assert.equal(wrongVersion.ok, false);
  assert.equal(wrongVersion.errors.some((item) => item.code === 'source-version-mismatch'), true);
});

test('Product Root cannot become a Dev write target', async () => {
  const dev = await mkdtemp(join(tmpdir(), 'oec-dev-write-'));
  const product = join(dev, 'product-requirements');
  await mkdir(product, { recursive: true });
  const roots = await resolveWorkspaceRoots({ devRoot: dev, productRoot: product });
  const { assertDevWritePath } = await import('../scripts/contracts/workspace-source.mjs');
  assert.throws(
    () => assertDevWritePath(roots, join(roots.devRoot, 'product-requirements', 'ai-docs/versions/v1.2.3/dev-task/x')),
    /Product Root/,
  );
});

test('legacy task packages remain readable but cannot claim new readiness', async () => {
  const dev = await mkdtemp(join(tmpdir(), 'oec-dev-legacy-task-'));
  await writeFiles(dev, {
    'ai-docs/versions/v1.0.0/dev-task/old-task/README.md': '# Old task\n',
    'ai-docs/versions/v1.0.0/dev-task/old-task/spec.md': '# Old spec\n',
    'ai-docs/versions/v1.0.0/dev-task/old-task/design.md': '# Old design\n',
  });
  const readable = await checkTaskArtifacts({ devRoot: dev, taskRef: 'versioned:v1.0.0/old-task', stage: 'structure' });
  assert.equal(readable.ok, true, JSON.stringify(readable.errors));
  assert.equal(readable.warnings.some((item) => item.code === 'legacy-task-incomplete'), true);
  const notReady = await checkTaskArtifacts({ devRoot: dev, taskRef: 'versioned:v1.0.0/old-task', stage: 'ready' });
  assert.equal(notReady.ok, false);
  assert.equal(notReady.errors.some((item) => item.code === 'legacy-task-incomplete'), true);
});

test('task link validation rejects missing and escaping targets', async () => {
  const dev = await devFixture(null);
  const design = join(dev, 'ai-docs/versions/v1.2.3/dev-task/payment-retry/design.md');
  const original = await readFile(design, 'utf8');
  await writeFile(design, `${original}\n[missing](./does-not-exist.md)\n[escape](../../../../../../outside.md)\n`);
  const result = await checkTaskArtifacts({ devRoot: dev, taskRef: 'versioned:v1.2.3/payment-retry', stage: 'structure' });
  assert.equal(result.ok, false);
  const codes = new Set(result.errors.map((item) => item.code));
  assert.equal(codes.has('broken-link'), true);
  assert.equal(codes.has('link-path-escape'), true);
});

test('task checker rejects parallel final or versioned Spec copies', async () => {
  const dev = await devFixture(null);
  await writeFiles(dev, {
    'ai-docs/versions/v1.2.3/dev-task/payment-retry/design-final.md': '# duplicate\n',
  });
  const result = await checkTaskArtifacts({ devRoot: dev, taskRef: 'versioned:v1.2.3/payment-retry', stage: 'structure' });
  assert.equal(result.ok, false);
  assert.equal(result.errors.some((item) => item.code === 'duplicate-artifact'), true);
});

test('invalid module index blocks task readiness', async () => {
  const dev = await devFixture(null);
  await writeFiles(dev, {
    'ai-docs/engineering/module-index.yaml': `schema_version: 2
modules:
  - id: Payment
`,
  });
  const result = await checkTaskArtifacts({ devRoot: dev, taskRef: 'versioned:v1.2.3/payment-retry', stage: 'ready' });
  assert.equal(result.ok, false);
  assert.equal(result.errors.some((item) => item.code === 'module-index-schema'), true);
  assert.equal(result.errors.some((item) => item.code === 'module-id-invalid'), true);
});

test('task resolver allows a missing destination only for creation planning', async () => {
  const dev = await mkdtemp(join(tmpdir(), 'oec-dev-missing-'));
  const missing = await resolveTaskRef({ devRoot: dev, taskRef: 'versioned:v2.0.0/new-feature', allowMissing: true });
  assert.equal(missing.ok, true);
  assert.equal(missing.exists, false);
  const blocked = await resolveTaskRef({ devRoot: dev, taskRef: 'versioned:v2.0.0/new-feature' });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.errors.some((item) => item.code === 'task-ref-not-found'), true);
});
