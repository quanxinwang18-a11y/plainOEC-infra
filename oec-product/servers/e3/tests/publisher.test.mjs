import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import YAML from 'yaml';
import { readMapping } from '../mapping.mjs';
import { PublisherService, escapeHtml, resolveAuthorizedWorkspace } from '../publisher.mjs';

async function fixture(storyCount = 1) {
  const workspace = await mkdtemp(join(tmpdir(), 'oec-publish-workspace-'));
  const dataDirectory = await mkdtemp(join(tmpdir(), 'oec-publish-data-'));
  const prdDirectory = join(workspace, 'ai-docs', 'versions', 'v1.2.3', 'prd');
  await mkdir(prdDirectory, { recursive: true });
  const stories = Array.from({ length: storyCount }, (_, index) => ({
    id: `US-${String(index + 1).padStart(3, '0')}`,
    title: `Story ${index + 1}`,
    source_section: '用户故事',
  }));
  const storyRows = stories.map((story) => `| ${story.id} | As a user, I want safe ${story.title} | P1 |`).join('\n');
  const acceptanceRows = stories.map((story) => `- ${story.id}: Given context, when action, then result.`).join('\n');
  const child = `# Alpha — v1.2.3

## 模块: alpha — Alpha module

### 模块概述

User-visible value & scope.

### 用户故事

| ID | Story | Priority |
| --- | --- | --- |
${storyRows}

### 验收标准

${acceptanceRows}

### 待确认事项

All product decisions are confirmed.
`;
  const childPath = 'ai-docs/versions/v1.2.3/prd/prd-v1.2.3-alpha.md';
  await writeFile(join(workspace, childPath), child);
  await mkdir(join(workspace, 'ai-docs', 'prd'), { recursive: true });
  await writeFile(join(workspace, 'ai-docs', 'prd', 'prd-all.md'), child);
  await writeFile(join(workspace, 'ai-docs', 'prd', 'prd-all-changelog.md'), '# Changelog\n\n- v1.2.3: Alpha module.\n');
  await writeFile(join(prdDirectory, 'prd-v1.2.3.md'), child);
  await writeFile(join(prdDirectory, 'HANDOFF.yaml'), YAML.stringify({
    schema_version: 4,
    prd_version: 'v1.2.3',
    sub_prds: [{ featureName: 'alpha', file: childPath, title: 'Alpha module', priority: 'P1', stories }],
    quality_gate: { warnings: [] },
  }));
  return {
    workspace,
    dataDirectory,
    workspaceUri: pathToFileURL(workspace).href,
    roots: [{ uri: pathToFileURL(workspace).href }],
    childPath,
  };
}

class FakeE3Client {
  constructor() {
    this.requirements = [];
    this.tasks = new Map();
    this.nextRequirement = 1;
    this.nextTask = 1;
    this.failStoryId = null;
    this.unknownRequirementResult = false;
    this.projects = [{ code: 'pomp-1', name: 'Default POMP', isDefault: true }];
    this.calls = 0;
  }

  async listSpaces() { this.calls += 1; return [{ id: 'space-1', name: 'Non-production' }]; }
  async listPompProjects() { return this.projects; }
  async requirementMetadata() {
    return { workItemId: 12, flowDefinition: 'flow-1', pomProjectId: 'pom-1', inChargeBy: 'owner', rdManager: 'rd', qaManager: 'qa' };
  }
  async findRequirementsByExactTitle(_spaceId, title) { return this.requirements.filter((item) => item.title === title); }
  async getRequirement(_spaceId, _workItemId, id) { return this.requirements.find((item) => String(item.id) === String(id)) ?? null; }
  async createRequirement(_spaceId, _metadata, artifact) {
    const item = { id: `r-${this.nextRequirement++}`, title: artifact.remoteTitle };
    this.requirements.push(item);
    if (this.unknownRequirementResult) {
      this.unknownRequirementResult = false;
      throw new Error('connection reset after POST');
    }
    return item;
  }
  async listTasks(_spaceId, requirementId) { return this.tasks.get(String(requirementId)) ?? []; }
  async findTasksByExactTitle(spaceId, requirementId, title) {
    return (await this.listTasks(spaceId, requirementId)).filter((item) => item.title === title);
  }
  async createTask(_spaceId, requirementId, _config, story) {
    if (story.id === this.failStoryId) throw new Error('task creation failed');
    const item = { id: `t-${this.nextTask++}`, title: story.remoteTitle };
    const tasks = this.tasks.get(String(requirementId)) ?? [];
    tasks.push(item);
    this.tasks.set(String(requirementId), tasks);
    return item;
  }
}

async function configure(service, fixtureValue) {
  const first = await service.prepare({ workspaceUri: fixtureValue.workspaceUri, version: 'v1.2.3' }, fixtureValue.roots);
  assert.equal(first.status, 'needs_space_selection');
  assert.deepEqual(first.spaces.map((item) => item.name), ['Non-production']);
  assert.equal((await service.selectProductSpace({ spaceId: 'space-1' })).status, 'selected');
}

test('MCP roots require an exact client-provided workspace and HTML is escaped', async () => {
  const value = await fixture();
  assert.equal(await resolveAuthorizedWorkspace(value.workspaceUri, value.roots), await realpath(value.workspace));
  await assert.rejects(resolveAuthorizedWorkspace(value.workspaceUri, []), /not one of/);
  assert.equal(escapeHtml('<script> & "x"'), '&lt;script&gt; &amp; &quot;x&quot;');
});

test('prepare enforces the complete artifact contract before calling E3', async () => {
  const value = await fixture();
  const client = new FakeE3Client();
  await writeFile(join(value.workspace, 'ai-docs', 'prd', 'prd-all.md'), '');
  const service = new PublisherService({ client, dataDirectory: value.dataDirectory });
  const prepared = await service.prepare({ workspaceUri: value.workspaceUri, version: 'v1.2.3' }, value.roots);
  assert.equal(prepared.status, 'blocked');
  assert.match(prepared.errors.join('\n'), /artifact-empty/);
  assert.equal(client.calls, 0);
});

test('prepare is read-only, execute recovers an unknown POST result, and status verifies publication', async () => {
  const value = await fixture();
  const client = new FakeE3Client();
  client.unknownRequirementResult = true;
  const service = new PublisherService({ client, dataDirectory: value.dataDirectory });
  await configure(service, value);

  const prepared = await service.prepare({ workspaceUri: value.workspaceUri, version: 'v1.2.3' }, value.roots);
  assert.equal(prepared.status, 'ready');
  assert.deepEqual(prepared.counts, { createRequirements: 1, reuseRequirements: 0, createTasks: 1, reuseTasks: 0 });
  assert.equal(client.requirements.length, 0);

  const executed = await service.execute({ planToken: prepared.planToken }, value.roots);
  assert.equal(executed.status, 'published');
  assert.equal(client.requirements.length, 1);
  assert.equal(executed.changes[0].action, 'reused-after-unknown-result');
  const verified = await service.status({ workspaceUri: value.workspaceUri, version: 'v1.2.3' }, value.roots);
  assert.equal(verified.status, 'published');
  assert.equal(verified.objects.every((item) => item.state === 'verified'), true);

  const mappingResult = await readMapping(value.workspace, 'v1.2.3');
  mappingResult.mapping.sync_state = 'partial';
  const mappingFile = join(value.workspace, mappingResult.path);
  await writeFile(mappingFile, YAML.stringify(mappingResult.mapping));
  const beforeStatus = await readFile(mappingFile, 'utf8');
  assert.equal((await service.status({ workspaceUri: value.workspaceUri, version: 'v1.2.3' }, value.roots)).status, 'published');
  assert.equal(await readFile(mappingFile, 'utf8'), beforeStatus, 'status tool must not mutate mapping');
});

test('partial mapping checkpoints resume without duplicate objects', async () => {
  const value = await fixture(2);
  const client = new FakeE3Client();
  client.failStoryId = 'US-002';
  const service = new PublisherService({ client, dataDirectory: value.dataDirectory });
  await configure(service, value);
  const firstPlan = await service.prepare({ workspaceUri: value.workspaceUri, version: 'v1.2.3' }, value.roots);
  const first = await service.execute({ planToken: firstPlan.planToken }, value.roots);
  assert.equal(first.status, 'partial');
  assert.equal(client.requirements.length, 1);
  assert.equal([...client.tasks.values()].flat().length, 1);
  assert.equal((await readMapping(value.workspace, 'v1.2.3')).mapping.sync_state, 'partial');

  client.failStoryId = null;
  const secondPlan = await service.prepare({ workspaceUri: value.workspaceUri, version: 'v1.2.3' }, value.roots);
  assert.equal(secondPlan.counts.reuseRequirements, 1);
  assert.equal(secondPlan.counts.reuseTasks, 1);
  const second = await service.execute({ planToken: secondPlan.planToken }, value.roots);
  assert.equal(second.status, 'published');
  assert.equal(client.requirements.length, 1);
  assert.equal([...client.tasks.values()].flat().length, 2);
});

test('a mapped version is immutable and bound to its original product space', async () => {
  const value = await fixture();
  const client = new FakeE3Client();
  const service = new PublisherService({ client, dataDirectory: value.dataDirectory });
  await configure(service, value);
  const prepared = await service.prepare({ workspaceUri: value.workspaceUri, version: 'v1.2.3' }, value.roots);
  assert.equal((await service.execute({ planToken: prepared.planToken }, value.roots)).status, 'published');

  const mappingResult = await readMapping(value.workspace, 'v1.2.3');
  const mappingFile = join(value.workspace, mappingResult.path);
  const before = await readFile(mappingFile, 'utf8');
  const childBefore = await readFile(join(value.workspace, value.childPath), 'utf8');
  await writeFile(join(value.workspace, value.childPath), `${childBefore}\nClarified copy.\n`);
  const changed = await service.prepare({ workspaceUri: value.workspaceUri, version: 'v1.2.3' }, value.roots);
  assert.equal(changed.status, 'blocked');
  assert.match(changed.errors.join('\n'), /published-version-changed/);
  assert.equal(await readFile(mappingFile, 'utf8'), before);

  await writeFile(join(value.workspace, value.childPath), childBefore);
  const configFile = join(value.dataDirectory, 'e3', 'config.json');
  const config = JSON.parse(await readFile(configFile, 'utf8'));
  config.productSpace = { id: 'space-2', name: 'Another space' };
  await writeFile(configFile, JSON.stringify(config));
  const wrongSpace = await service.prepare({ workspaceUri: value.workspaceUri, version: 'v1.2.3' }, value.roots);
  assert.equal(wrongSpace.status, 'blocked');
  assert.match(wrongSpace.errors.join('\n'), /mapping-space-mismatch/);
});

test('execute rejects expired plans, changed roots, and changed artifact fingerprints', async () => {
  const value = await fixture();
  let now = 1_000;
  const service = new PublisherService({ client: new FakeE3Client(), dataDirectory: value.dataDirectory, now: () => now });
  await configure(service, value);
  const expired = await service.prepare({ workspaceUri: value.workspaceUri, version: 'v1.2.3' }, value.roots);
  now += 16 * 60 * 1000;
  await assert.rejects(service.execute({ planToken: expired.planToken }, value.roots), /expired/);

  now = 2_000;
  const changed = await service.prepare({ workspaceUri: value.workspaceUri, version: 'v1.2.3' }, value.roots);
  await assert.rejects(service.execute({ planToken: changed.planToken }, []), /not one of/);
  await writeFile(join(value.workspace, value.childPath), `${await readFile(join(value.workspace, value.childPath), 'utf8')}\nchanged\n`);
  await assert.rejects(service.execute({ planToken: changed.planToken }, value.roots), /artifacts changed/);
});

test('execute rejects product-space configuration changes made after prepare', async () => {
  const value = await fixture();
  const service = new PublisherService({ client: new FakeE3Client(), dataDirectory: value.dataDirectory });
  await configure(service, value);
  const prepared = await service.prepare({ workspaceUri: value.workspaceUri, version: 'v1.2.3' }, value.roots);
  const configFile = join(value.dataDirectory, 'e3', 'config.json');
  const config = JSON.parse(await readFile(configFile, 'utf8'));
  config.pompProject.code = 'changed-after-prepare';
  await writeFile(configFile, JSON.stringify(config));
  await assert.rejects(service.execute({ planToken: prepared.planToken }, value.roots), /configuration changed/);
});

test('multiple POMP projects require selection from the latest candidate set', async () => {
  const value = await fixture();
  const client = new FakeE3Client();
  client.projects = [
    { code: 'pomp-a', name: 'Project A', isDefault: false },
    { code: 'pomp-b', name: 'Project B', isDefault: false },
  ];
  const service = new PublisherService({ client, dataDirectory: value.dataDirectory });
  await service.prepare({ workspaceUri: value.workspaceUri, version: 'v1.2.3' }, value.roots);
  const pending = await service.selectProductSpace({ spaceId: 'space-1' });
  assert.equal(pending.status, 'needs_pomp_selection');
  await assert.rejects(service.selectProductSpace({ spaceId: 'space-1', pompProjectCode: 'not-a-candidate' }), /not a candidate/);
  const selected = await service.selectProductSpace({ spaceId: 'space-1', pompProjectCode: 'pomp-b' });
  assert.equal(selected.status, 'selected');
  assert.equal(selected.pompProject, 'Project B');
});

test('exact-title duplicates block preparation instead of guessing', async () => {
  const value = await fixture();
  const client = new FakeE3Client();
  client.requirements.push({ id: 'r-1', title: '[v1.2.3] Alpha module' }, { id: 'r-2', title: '[v1.2.3] Alpha module' });
  const service = new PublisherService({ client, dataDirectory: value.dataDirectory });
  await configure(service, value);
  const prepared = await service.prepare({ workspaceUri: value.workspaceUri, version: 'v1.2.3' }, value.roots);
  assert.equal(prepared.status, 'blocked');
  assert.match(prepared.errors[0], /Ambiguous/);
});
