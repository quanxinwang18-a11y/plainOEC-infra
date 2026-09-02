import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { auditLegacyInstallation, checkTeamSpecs, selectTeamSpecs } from '../scripts/spec-tool.mjs';

async function writeFiles(root, files) {
  for (const [path, content] of Object.entries(files)) {
    const absolute = join(root, path);
    await mkdir(join(absolute, '..'), { recursive: true });
    await writeFile(absolute, content);
  }
}

async function validFixture() {
  const workspace = await mkdtemp(join(tmpdir(), 'oec-spec-valid-'));
  await writeFiles(workspace, {
    'ai-docs/Spec/README.md': `# Engineering knowledge

- [Repository rules](specs/repository.md)
- [Payment](specs/modules/payment.md)
- [Decision](decisions/ADR-0001-payment-boundary.md)
- [Change](changes/v1.2.3-payment/change.md)
`,
    'ai-docs/Spec/specs/repository.md': `---
id: SPEC-repository
applies_to:
  - "**"
---

# Repository

Use the verified build command.
`,
    'ai-docs/Spec/specs/modules/payment.md': `---
id: SPEC-payment-domain
applies_to:
  - services/payment/**
---

# Payment

Payment owns settlement state.
`,
    'ai-docs/Spec/specs/modules/search.md': `---
id: SPEC-search
applies_to:
  - services/search/**
---

# Search

Search owns query indexing.
`,
    'ai-docs/Spec/decisions/ADR-0001-payment-boundary.md': `---
id: ADR-0001
status: accepted
date: 2026-08-20
supersedes: []
---

# Payment boundary

Payment is the settlement owner.
`,
    'ai-docs/Spec/changes/v1.2.3-payment/change.md': `---
id: v1.2.3-payment
related_specs:
  - SPEC-payment-domain
related_adrs:
  - ADR-0001
source_prd: ai-docs/versions/v1.2.3/prd/prd-v1.2.3-payment.md
source_stories:
  - US-001
---

# Payment change

Add an observable settlement state.
`,
    'ai-docs/versions/v1.2.3/prd/prd-v1.2.3-payment.md': '# Payment PRD\n',
  });
  return workspace;
}

test('check accepts a valid current-state Spec, ADR, and linked change package', async () => {
  const workspace = await validFixture();
  const result = await checkTeamSpecs({ workspace, change: 'v1.2.3-payment' });
  assert.equal(result.ok, true, JSON.stringify(result.errors, null, 2));
  assert.deepEqual(result.specs.map((item) => item.id), [
    'SPEC-payment-domain',
    'SPEC-search',
    'SPEC-repository',
  ]);
  assert.deepEqual(result.adrs.map((item) => item.id), ['ADR-0001']);
  assert.deepEqual(result.changes.map((item) => item.id), ['v1.2.3-payment']);
});

test('select returns repository-wide and path-matched Specs without unrelated modules', async () => {
  const workspace = await validFixture();
  const result = await selectTeamSpecs({
    workspace,
    paths: ['services/payment/src/Settlement.java'],
  });
  assert.equal(result.ok, true, JSON.stringify(result.errors, null, 2));
  assert.deepEqual(result.specs.map((item) => item.id), ['SPEC-payment-domain', 'SPEC-repository']);
  assert.deepEqual(result.paths, ['services/payment/src/Settlement.java']);
});

test('check reports deterministic contract failures', async () => {
  const workspace = await validFixture();
  await writeFiles(workspace, {
    'ai-docs/Spec/specs/duplicate.md': `---
id: SPEC-payment-domain
applies_to:
  - ../outside/**
---

# Duplicate
`,
    'ai-docs/Spec/decisions/ADR-0002-new-boundary.md': `---
id: ADR-0002
status: accepted
date: 2026-08-20
supersedes:
  - ADR-9999
---

# New boundary
`,
    'ai-docs/Spec/changes/invalid/change.md': `---
id: another-id
related_specs:
  - SPEC-missing
---

# Invalid change
`,
  });
  const index = join(workspace, 'ai-docs/Spec/README.md');
  await writeFile(index, `${await readFile(index, 'utf8')}\n- [Missing](specs/missing.md)\n`);

  const result = await checkTeamSpecs({ workspace });
  assert.equal(result.ok, false);
  const codes = new Set(result.errors.map((item) => item.code));
  for (const code of [
    'spec-id-duplicate',
    'spec-glob-invalid',
    'adr-reference-missing',
    'change-id-invalid',
    'spec-reference-missing',
    'broken-link',
  ]) assert.equal(codes.has(code), true, `missing ${code}: ${JSON.stringify(result.errors, null, 2)}`);
});

test('selection rejects paths outside the canonical workspace', async () => {
  const workspace = await validFixture();
  await assert.rejects(
    selectTeamSpecs({ workspace, paths: ['../outside.java'] }),
    /escapes workspace/,
  );
});

test('team change source can resolve from a separate Product Root', async () => {
  const dev = await validFixture();
  const product = await mkdtemp(join(tmpdir(), 'oec-product-root-'));
  await writeFiles(product, {
    'ai-docs/versions/v1.2.3/prd/prd-v1.2.3-payment.md': '# Payment PRD\n',
  });
  await writeFiles(dev, {
    'ai-docs/Spec/changes/v1.2.3-payment/change.md': `---
id: v1.2.3-payment
related_specs:
  - SPEC-payment-domain
source:
  kind: product
  root: product
  prd_path: ai-docs/versions/v1.2.3/prd/prd-v1.2.3-payment.md
---
# Payment change
`,
  });
  const result = await checkTeamSpecs({ workspace: dev, productRoot: product, change: 'v1.2.3-payment' });
  assert.equal(result.ok, true, JSON.stringify(result.errors, null, 2));
});

test('optional module index is validated and returned with path-scoped selection', async () => {
  const workspace = await validFixture();
  await writeFiles(workspace, {
    'ai-docs/Spec/module-index.yaml': `schema_version: 1
modules:
  - id: payment
    title: Payment
    paths:
      - services/payment/**
    specs:
      - SPEC-payment-domain
    depends_on: []
`,
    'ai-docs/Spec/specs/modules/payment.md': `---
id: SPEC-payment-domain
module_id: payment
applies_to:
  - services/payment/**
---
# Payment
Payment owns settlement state.
`,
  });
  const checked = await checkTeamSpecs({ workspace });
  assert.equal(checked.ok, true, JSON.stringify(checked.errors, null, 2));
  assert.deepEqual(checked.modules.map((item) => item.id), ['payment']);
  const selected = await selectTeamSpecs({ workspace, paths: ['services/payment/Settlement.java'] });
  assert.deepEqual(selected.modules.map((item) => item.id), ['payment']);
});

test('invalid module index fails closed without affecting legacy audit', async () => {
  const workspace = await validFixture();
  await writeFiles(workspace, {
    'ai-docs/Spec/module-index.yaml': `schema_version: 9
modules:
  - id: Payment
    specs:
      - SPEC-missing
`,
  });
  const result = await checkTeamSpecs({ workspace });
  assert.equal(result.ok, false);
  const codes = new Set(result.errors.map((item) => item.code));
  assert.equal(codes.has('module-index-schema'), true);
  assert.equal(codes.has('module-id-invalid'), true);
});

test('legacy audit is read-only and separates managed configuration from ai-docs', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'oec-spec-legacy-'));
  await writeFiles(workspace, {
    '.oec-ai/installation.json': JSON.stringify({
      schemaVersion: 1,
      version: '0.2.2',
      role: 'dev',
      tool: 'claude-code',
      managedFiles: [
        '.claude/skills/oec-dev-task/SKILL.md',
        '.claude/skills/oec-test-dispatcher/SKILL.md',
        '.claude/agents/oec-tester/AGENT.md',
      ],
    }),
    '.claude/skills/oec-dev-task/SKILL.md': '# legacy\n',
    '.claude/skills/oec-test-dispatcher/SKILL.md': '# legacy\n',
    '.claude/skills/oec-test-dispatcher/skills/nested/SKILL.md': '# nested\n',
    '.claude/agents/oec-tester/AGENT.md': '# agent\n',
    'ai-docs/architecture/current.md': '# preserve\n',
    'ai-docs/versions/v1.0.0/dev-task/example/design.md': '# preserve\n',
  });
  const before = await readFile(join(workspace, '.oec-ai/installation.json'), 'utf8');
  const result = await auditLegacyInstallation({ workspace });
  const after = await readFile(join(workspace, '.oec-ai/installation.json'), 'utf8');

  assert.equal(result.ok, true);
  assert.equal(result.installation.managedCount, 3);
  assert.deepEqual(result.claude.topLevelSkills, ['oec-dev-task', 'oec-test-dispatcher']);
  assert.equal(result.claude.nestedSkillFiles, 1);
  assert.equal(result.claude.markdownAgents, 1);
  assert.equal(result.preservedProjectContent.files, 2);
  assert.deepEqual(result.destructiveActions, []);
  assert.equal(after, before);
});
