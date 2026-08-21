import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, realpath, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import YAML from 'yaml';
import { readMapping } from '../mapping.mjs';
import { PublisherService, escapeHtml, resolveAuthorizedWorkspace } from '../publisher.mjs';

async function fixture(storyCount = 1, sharedDataDirectory) {
  const workspace = await mkdtemp(join(tmpdir(), 'oec-publish-workspace-'));
  const dataDirectory = sharedDataDirectory ?? await mkdtemp(join(tmpdir(), 'oec-publish-data-'));
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
    this.metadataSpaces = [];
  }

  async listSpaces() { this.calls += 1; return [{ id: 'space-1', name: 'Non-production' }]; }
  async listPompProjects() { return this.projects; }
  async requirementMetadata(spaceId) {
    this.metadataSpaces.push(String(spaceId));
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
  async getTask(_spaceId, taskId) {
    return [...this.tasks.values()].flat().find((item) => String(item.id) === String(taskId)) ?? null;
  }
  async findTasksByExactTitle(spaceId, requirementId, title) {
    return (await this.listTasks(spaceId, requirementId)).filter((item) => item.title === title);
  }
  async createTask(_spaceId, requirementId, _config, story) {
    if (story.id === this.failStoryId) throw new Error('task creation failed');
    const item = { id: `t-${this.nextTask++}`, title: story.remoteTitle, requirementId: String(requirementId) };
    const tasks = this.tasks.get(String(requirementId)) ?? [];
    tasks.push(item);
    this.tasks.set(String(requirementId), tasks);
    return item;
  }
}

async function configure(service, fixtureValue) {
  const first = await service.prepare({ workspaceUri: fixtureValue.workspaceUri, version: 'v1.2.3' }, fixtureValue.roots);
  assert.equal(first.status, 'needs_space_selection');
  assert.deepEqual(first.candidates.map((item) => item.name), ['Non-production']);
  assert.match(first.selectionToken, /^[A-Za-z0-9_-]{32,}$/);
  assert.equal((await service.selectProductSpace({
    selectionToken: first.selectionToken,
    spaceId: 'space-1',
  }, fixtureValue.roots)).status, 'selected');
}

async function workspaceConfigFile(fixtureValue) {
  const canonical = await realpath(fixtureValue.workspace);
  const key = createHash('sha256').update(canonical).digest('hex');
  return join(fixtureValue.dataDirectory, 'e3', 'workspaces', key, 'config.json');
}

test('MCP roots require an exact client-provided workspace and HTML is escaped', async () => {
  const value = await fixture();
  assert.equal(await resolveAuthorizedWorkspace(value.workspaceUri, value.roots), await realpath(value.workspace));
  await assert.rejects(resolveAuthorizedWorkspace(value.workspaceUri, []), /not one of/);
  assert.equal(escapeHtml('<script> & "x"'), '&lt;script&gt; &amp; &quot;x&quot;');
});

test('workspace selections and product-space configuration are isolated by canonical root', async () => {
  const dataDirectory = await mkdtemp(join(tmpdir(), 'oec-publish-shared-data-'));
  const first = await fixture(1, dataDirectory);
  const second = await fixture(1, dataDirectory);
  const service = new PublisherService({ client: new FakeE3Client(), dataDirectory });

  await configure(service, first);
  const secondPreparation = await service.prepare({
    workspaceUri: second.workspaceUri,
    version: 'v1.2.3',
  }, second.roots);
  assert.equal(secondPreparation.status, 'needs_space_selection');
  await assert.rejects(service.selectProductSpace({
    selectionToken: secondPreparation.selectionToken,
    spaceId: 'space-1',
  }, first.roots), /not one of the client-provided MCP roots/);

  assert.equal((await service.selectProductSpace({
    selectionToken: secondPreparation.selectionToken,
    spaceId: 'space-1',
  }, second.roots)).status, 'selected');
  await assert.rejects(service.selectProductSpace({
    selectionToken: secondPreparation.selectionToken,
    spaceId: 'space-1',
  }, second.roots), /already been completed/);

  const firstConfig = await workspaceConfigFile(first);
  const secondConfig = await workspaceConfigFile(second);
  assert.notEqual(firstConfig, secondConfig);
  assert.equal(JSON.parse(await readFile(firstConfig, 'utf8')).productSpace.id, 'space-1');
  assert.equal(JSON.parse(await readFile(secondConfig, 'utf8')).productSpace.id, 'space-1');
  assert.equal((await service.prepare({ workspaceUri: first.workspaceUri, version: 'v1.2.3' }, first.roots)).status, 'ready');
  assert.equal((await service.prepare({ workspaceUri: second.workspaceUri, version: 'v1.2.3' }, second.roots)).status, 'ready');
});

test('selection tokens expire before they can change workspace configuration', async () => {
  const value = await fixture();
  let now = 1_000;
  const service = new PublisherService({
    client: new FakeE3Client(),
    dataDirectory: value.dataDirectory,
    now: () => now,
  });
  const prepared = await service.prepare({ workspaceUri: value.workspaceUri, version: 'v1.2.3' }, value.roots);
  now += 16 * 60 * 1000;
  await assert.rejects(service.selectProductSpace({
    selectionToken: prepared.selectionToken,
    spaceId: 'space-1',
  }, value.roots), /expired/);
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

test('execute repeats the complete artifact contract before remote writes', async () => {
  const value = await fixture();
  const client = new FakeE3Client();
  const service = new PublisherService({ client, dataDirectory: value.dataDirectory });
  await configure(service, value);
  const prepared = await service.prepare({ workspaceUri: value.workspaceUri, version: 'v1.2.3' }, value.roots);
  await writeFile(join(value.workspace, 'ai-docs', 'prd', 'prd-all.md'), '');
  await assert.rejects(service.execute({ planToken: prepared.planToken }, value.roots), /pre-publish contract/);
  assert.equal(client.requirements.length, 0);
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
  assert.equal(verified.objects.every((item) => item.url?.startsWith('https://one.iflytek.com/')), true);

  const mappingResult = await readMapping(value.workspace, 'v1.2.3');
  assert.match(mappingResult.mapping.requirements[0].e3_requirement.url, /storyManageNew\/detail\/r-1/);
  assert.match(mappingResult.mapping.requirements[0].story_tasks[0].e3_task.url, /statictask\/t-1\?productId=space-1/);
  mappingResult.mapping.sync_state = 'partial';
  const mappingFile = join(value.workspace, mappingResult.path);
  await writeFile(mappingFile, YAML.stringify(mappingResult.mapping));
  const beforeStatus = await readFile(mappingFile, 'utf8');
  assert.equal((await service.status({ workspaceUri: value.workspaceUri, version: 'v1.2.3' }, value.roots)).status, 'published');
  assert.equal(await readFile(mappingFile, 'utf8'), beforeStatus, 'status tool must not mutate mapping');
});

test('status uses the v2 mapping space without mutating a missing or different workspace config', async () => {
  const value = await fixture();
  const client = new FakeE3Client();
  const service = new PublisherService({ client, dataDirectory: value.dataDirectory });
  await configure(service, value);
  const plan = await service.prepare({ workspaceUri: value.workspaceUri, version: 'v1.2.3' }, value.roots);
  assert.equal((await service.execute({ planToken: plan.planToken }, value.roots)).status, 'published');

  const mappingResult = await readMapping(value.workspace, 'v1.2.3');
  const mappingFile = join(value.workspace, mappingResult.path);
  const mappingBefore = await readFile(mappingFile, 'utf8');
  const configFile = await workspaceConfigFile(value);
  const config = JSON.parse(await readFile(configFile, 'utf8'));
  config.productSpace = { id: 'space-2', name: 'Different workspace selection' };
  await writeFile(configFile, JSON.stringify(config));
  const configBefore = await readFile(configFile, 'utf8');

  let verified = await service.status({ workspaceUri: value.workspaceUri, version: 'v1.2.3' }, value.roots);
  assert.equal(verified.status, 'published');
  assert.equal(verified.warnings.some((warning) => warning.code === 'workspace-config-differs-from-mapping'), true);
  assert.equal(client.metadataSpaces.at(-1), 'space-1');
  assert.equal(await readFile(mappingFile, 'utf8'), mappingBefore);
  assert.equal(await readFile(configFile, 'utf8'), configBefore);

  await unlink(configFile);
  verified = await service.status({ workspaceUri: value.workspaceUri, version: 'v1.2.3' }, value.roots);
  assert.equal(verified.status, 'published');
  assert.equal(client.metadataSpaces.at(-1), 'space-1');
  assert.equal(await readFile(mappingFile, 'utf8'), mappingBefore);
});

test('mapped remote identity drift blocks planning and status', async () => {
  const value = await fixture();
  const client = new FakeE3Client();
  const service = new PublisherService({ client, dataDirectory: value.dataDirectory });
  await configure(service, value);
  const plan = await service.prepare({ workspaceUri: value.workspaceUri, version: 'v1.2.3' }, value.roots);
  assert.equal((await service.execute({ planToken: plan.planToken }, value.roots)).status, 'published');

  client.requirements[0].title = 'Changed remotely';
  const requirementDrift = await service.prepare({ workspaceUri: value.workspaceUri, version: 'v1.2.3' }, value.roots);
  assert.equal(requirementDrift.status, 'blocked');
  assert.match(requirementDrift.errors.join('\n'), /remote-object-drift/);
  let verified = await service.status({ workspaceUri: value.workspaceUri, version: 'v1.2.3' }, value.roots);
  assert.equal(verified.status, 'blocked');
  assert.equal(verified.objects.find((item) => item.type === 'requirement').state, 'drifted');

  client.requirements[0].title = '[v1.2.3] Alpha module';
  const task = [...client.tasks.values()][0][0];
  task.requirementId = 'another-requirement';
  const taskDrift = await service.prepare({ workspaceUri: value.workspaceUri, version: 'v1.2.3' }, value.roots);
  assert.equal(taskDrift.status, 'blocked');
  assert.match(taskDrift.errors.join('\n'), /remote-object-drift/);
  verified = await service.status({ workspaceUri: value.workspaceUri, version: 'v1.2.3' }, value.roots);
  assert.equal(verified.status, 'blocked');
  assert.equal(verified.objects.find((item) => item.type === 'task').state, 'drifted');
});

test('execute rechecks remote identity after prepare and never replaces drifted objects', async () => {
  const value = await fixture();
  const client = new FakeE3Client();
  const service = new PublisherService({ client, dataDirectory: value.dataDirectory });
  await configure(service, value);
  let plan = await service.prepare({ workspaceUri: value.workspaceUri, version: 'v1.2.3' }, value.roots);
  assert.equal((await service.execute({ planToken: plan.planToken }, value.roots)).status, 'published');

  plan = await service.prepare({ workspaceUri: value.workspaceUri, version: 'v1.2.3' }, value.roots);
  const mappingFile = join(value.workspace, (await readMapping(value.workspace, 'v1.2.3')).path);
  const mappingBeforeDrift = await readFile(mappingFile, 'utf8');
  const task = [...client.tasks.values()][0][0];
  task.title = 'Changed after prepare';
  const result = await service.execute({ planToken: plan.planToken }, value.roots);
  assert.equal(result.status, 'blocked');
  assert.match(result.errors.join('\n'), /remote-object-drift/);
  assert.equal([...client.tasks.values()].flat().length, 1);
  assert.equal(await readFile(mappingFile, 'utf8'), mappingBeforeDrift);
});

test('a legacy mapping requires confirmed adoption before publication is current', async () => {
  const value = await fixture();
  const client = new FakeE3Client();
  const service = new PublisherService({ client, dataDirectory: value.dataDirectory });
  await configure(service, value);
  const initialPlan = await service.prepare({ workspaceUri: value.workspaceUri, version: 'v1.2.3' }, value.roots);
  assert.equal((await service.execute({ planToken: initialPlan.planToken }, value.roots)).status, 'published');

  const result = await readMapping(value.workspace, 'v1.2.3');
  delete result.mapping.artifact_fingerprint;
  delete result.mapping.product_space;
  result.mapping.schema_version = 1;
  await writeFile(join(value.workspace, result.path), YAML.stringify(result.mapping));
  const beforeAdoption = await service.status({ workspaceUri: value.workspaceUri, version: 'v1.2.3' }, value.roots);
  assert.equal(beforeAdoption.status, 'partial');
  assert.equal(beforeAdoption.warnings[0].code, 'legacy-mapping-adoption');

  const adoption = await service.prepare({ workspaceUri: value.workspaceUri, version: 'v1.2.3' }, value.roots);
  assert.equal(adoption.status, 'ready');
  assert.equal(adoption.warnings.some((warning) => warning.code === 'legacy-mapping-adoption'), true);
  assert.equal((await service.execute({ planToken: adoption.planToken }, value.roots)).status, 'published');
  const adopted = await readMapping(value.workspace, 'v1.2.3');
  assert.equal(adopted.mapping.schema_version, 2);
  assert.match(adopted.mapping.artifact_fingerprint, /^sha256:/);
});

test('legacy status blocks when neither mapping nor workspace config identifies the space', async () => {
  const value = await fixture();
  const client = new FakeE3Client();
  const service = new PublisherService({ client, dataDirectory: value.dataDirectory });
  await configure(service, value);
  const plan = await service.prepare({ workspaceUri: value.workspaceUri, version: 'v1.2.3' }, value.roots);
  assert.equal((await service.execute({ planToken: plan.planToken }, value.roots)).status, 'published');

  const result = await readMapping(value.workspace, 'v1.2.3');
  delete result.mapping.artifact_fingerprint;
  delete result.mapping.product_space;
  result.mapping.schema_version = 1;
  await writeFile(join(value.workspace, result.path), YAML.stringify(result.mapping));
  await unlink(await workspaceConfigFile(value));

  const verified = await service.status({ workspaceUri: value.workspaceUri, version: 'v1.2.3' }, value.roots);
  assert.equal(verified.status, 'blocked');
  assert.match(verified.errors.join('\n'), /legacy-mapping-space-unknown/);
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
  assert.equal((await service.status({ workspaceUri: value.workspaceUri, version: 'v1.2.3' }, value.roots)).status, 'partial');

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
  const configFile = await workspaceConfigFile(value);
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
  const configFile = await workspaceConfigFile(value);
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
  const initial = await service.prepare({ workspaceUri: value.workspaceUri, version: 'v1.2.3' }, value.roots);
  const pending = await service.selectProductSpace({ selectionToken: initial.selectionToken, spaceId: 'space-1' }, value.roots);
  assert.equal(pending.status, 'needs_pomp_selection');
  const resumed = await service.prepare({ workspaceUri: value.workspaceUri, version: 'v1.2.3' }, value.roots);
  assert.equal(resumed.status, 'needs_pomp_selection');
  assert.deepEqual(resumed.candidates.map((item) => item.code), ['pomp-a', 'pomp-b']);
  await assert.rejects(service.selectProductSpace({
    selectionToken: resumed.selectionToken,
    spaceId: 'space-1',
    pompProjectCode: 'not-a-candidate',
  }, value.roots), /not a candidate/);
  const selected = await service.selectProductSpace({
    selectionToken: resumed.selectionToken,
    spaceId: 'space-1',
    pompProjectCode: 'pomp-b',
  }, value.roots);
  assert.equal(selected.status, 'selected');
  assert.equal(selected.pompProject, 'Project B');
  assert.equal((await service.prepare({ workspaceUri: value.workspaceUri, version: 'v1.2.3' }, value.roots)).status, 'ready');
});

test('POMP auto-selection requires exactly one candidate or exactly one default', async () => {
  const value = await fixture();
  const client = new FakeE3Client();
  const service = new PublisherService({ client, dataDirectory: value.dataDirectory });
  const initial = await service.prepare({ workspaceUri: value.workspaceUri, version: 'v1.2.3' }, value.roots);

  client.projects = [
    { code: 'pomp-a', name: 'Project A', isDefault: false },
    { code: 'pomp-b', name: 'Project B', isDefault: true },
  ];
  assert.equal((await service.selectProductSpace({
    selectionToken: initial.selectionToken,
    spaceId: 'space-1',
  }, value.roots)).pompProject, 'Project B');

  const second = await fixture();
  const ambiguousClient = new FakeE3Client();
  ambiguousClient.projects = [
    { code: 'pomp-a', name: 'Project A', isDefault: true },
    { code: 'pomp-b', name: 'Project B', isDefault: true },
  ];
  const ambiguousService = new PublisherService({ client: ambiguousClient, dataDirectory: second.dataDirectory });
  const ambiguousInitial = await ambiguousService.prepare({ workspaceUri: second.workspaceUri, version: 'v1.2.3' }, second.roots);
  assert.equal((await ambiguousService.selectProductSpace({
    selectionToken: ambiguousInitial.selectionToken,
    spaceId: 'space-1',
  }, second.roots)).status, 'needs_pomp_selection');

  const third = await fixture();
  const emptyClient = new FakeE3Client();
  emptyClient.projects = [];
  const emptyService = new PublisherService({ client: emptyClient, dataDirectory: third.dataDirectory });
  const emptyInitial = await emptyService.prepare({ workspaceUri: third.workspaceUri, version: 'v1.2.3' }, third.roots);
  await assert.rejects(emptyService.selectProductSpace({
    selectionToken: emptyInitial.selectionToken,
    spaceId: 'space-1',
  }, third.roots), /no-pomp-projects/);
});

test('pending POMP preparation blocks when the selected space no longer has projects', async () => {
  const value = await fixture();
  const client = new FakeE3Client();
  client.projects = [
    { code: 'pomp-a', name: 'Project A', isDefault: false },
    { code: 'pomp-b', name: 'Project B', isDefault: false },
  ];
  const service = new PublisherService({ client, dataDirectory: value.dataDirectory });
  const initial = await service.prepare({ workspaceUri: value.workspaceUri, version: 'v1.2.3' }, value.roots);
  assert.equal((await service.selectProductSpace({
    selectionToken: initial.selectionToken,
    spaceId: 'space-1',
  }, value.roots)).status, 'needs_pomp_selection');
  client.projects = [];
  const resumed = await service.prepare({ workspaceUri: value.workspaceUri, version: 'v1.2.3' }, value.roots);
  assert.equal(resumed.status, 'blocked');
  assert.match(resumed.errors.join('\n'), /no-pomp-projects/);
});

test('prepare surfaces E3 metadata ambiguity without guessing a field value', async () => {
  const value = await fixture();
  const client = new FakeE3Client();
  client.requirementMetadata = async () => ({
    workItemId: 12,
    flowDefinition: 'flow-1',
    inChargeBy: 'owner',
    warnings: [{ code: 'e3-metadata-ambiguous', message: 'rdManager has no unique default; the field will be omitted' }],
  });
  const service = new PublisherService({ client, dataDirectory: value.dataDirectory });
  await configure(service, value);
  const prepared = await service.prepare({ workspaceUri: value.workspaceUri, version: 'v1.2.3' }, value.roots);
  assert.equal(prepared.status, 'ready');
  assert.equal(prepared.warnings.some((warning) => warning.code === 'e3-metadata-ambiguous'), true);
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

test('duplicate exact task titles block preparation instead of guessing', async () => {
  const value = await fixture();
  const client = new FakeE3Client();
  client.requirements.push({ id: 'r-1', title: '[v1.2.3] Alpha module' });
  client.tasks.set('r-1', [
    { id: 't-1', title: '[US-001] Story 1', requirementId: 'r-1' },
    { id: 't-2', title: '[US-001] Story 1', requirementId: 'r-1' },
  ]);
  const service = new PublisherService({ client, dataDirectory: value.dataDirectory });
  await configure(service, value);
  const prepared = await service.prepare({ workspaceUri: value.workspaceUri, version: 'v1.2.3' }, value.roots);
  assert.equal(prepared.status, 'blocked');
  assert.match(prepared.errors.join('\n'), /Ambiguous E3 tasks/);
});
