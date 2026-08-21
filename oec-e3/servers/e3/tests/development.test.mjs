import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import YAML from 'yaml';
import { DevelopmentTaskService } from '../development.mjs';
import { readDevelopmentMapping } from '../development-mapping.mjs';
import { atomicJson, configPath } from '../publisher.mjs';

async function fixture() {
  const workspace = await mkdtemp(join(tmpdir(), 'oec-development-workspace-'));
  const dataDirectory = await mkdtemp(join(tmpdir(), 'oec-development-data-'));
  const canonical = await realpath(workspace);
  const workspaceUri = pathToFileURL(canonical).href;
  await atomicJson(configPath(canonical, dataDirectory), {
    productSpace: { id: 'space-1', name: 'OBU-AI提效组' },
    pompProject: { code: 'pomp-1', name: 'Default POMP' },
  });
  return {
    workspace: canonical,
    workspaceUri,
    roots: [{ uri: workspaceUri }],
    dataDirectory,
  };
}

function input(overrides = {}) {
  return {
    changeId: 'v1.2.3-alpha',
    tasks: [{
      localId: 'DEV-001',
      title: 'Implement guarded operation',
      description: 'Implement and verify the bounded development operation.',
      priority: 'P1',
      estimatedHours: 6,
    }],
    ...overrides,
  };
}

class FakeClient {
  constructor() {
    this.requirements = [
      { id: 'req-1', title: '[v1.2.3] Alpha' },
      { id: 'req-2', title: '[v1.2.3] Beta' },
    ];
    this.tasks = new Map();
    this.nextTask = 1;
    this.creates = 0;
    this.failTitle = null;
    this.unknownResult = false;
  }

  async listRequirements() { return this.requirements; }
  async requirementMetadata() { return { workItemId: 'work-item-1' }; }
  async getRequirement(_spaceId, _workItemId, id) {
    return this.requirements.find((item) => String(item.id) === String(id)) ?? null;
  }
  async currentAccount() { return 'owner'; }
  async listTasks(_spaceId, requirementId) { return this.tasks.get(String(requirementId)) ?? []; }
  async getTask(_spaceId, taskId) {
    return [...this.tasks.values()].flat().find((item) => String(item.id) === String(taskId)) ?? null;
  }
  async findTasksByExactTitle(spaceId, requirementId, title) {
    return (await this.listTasks(spaceId, requirementId)).filter((item) => item.title === title);
  }
  async createTask(_spaceId, requirementId, _config, task) {
    if (task.remoteTitle === this.failTitle) throw new Error('E3 task creation failed');
    this.creates += 1;
    const remote = {
      id: `task-${this.nextTask++}`,
      title: task.remoteTitle,
      requirementId: String(requirementId),
    };
    const items = this.tasks.get(String(requirementId)) ?? [];
    items.push(remote);
    this.tasks.set(String(requirementId), items);
    if (this.unknownResult) {
      this.unknownResult = false;
      throw new Error('connection reset after POST');
    }
    return remote;
  }
}

test('development planning binds a current requirement selection to one workspace', async () => {
  const value = await fixture();
  const client = new FakeClient();
  const service = new DevelopmentTaskService({ client, dataDirectory: value.dataDirectory });
  const prepared = await service.prepare({ workspaceUri: value.workspaceUri, ...input() }, value.roots);
  assert.equal(prepared.status, 'needs_requirement_selection');
  assert.deepEqual(prepared.candidates.map((candidate) => candidate.id), ['req-1', 'req-2']);

  await assert.rejects(service.selectRequirement({
    selectionToken: prepared.selectionToken,
    requirementId: 'not-a-candidate',
  }, value.roots), /not returned for this selection/);
  const selected = await service.selectRequirement({
    selectionToken: prepared.selectionToken,
    requirementId: 'req-1',
  }, value.roots);
  assert.equal(selected.status, 'ready');
  assert.deepEqual(selected.counts, { createTasks: 1, reuseTasks: 0 });
  await assert.rejects(service.selectRequirement({
    selectionToken: prepared.selectionToken,
    requirementId: 'req-1',
  }, value.roots), /already been used/);
});

test('development execution checkpoints created tasks and later plans reuse them', async () => {
  const value = await fixture();
  const client = new FakeClient();
  const service = new DevelopmentTaskService({ client, dataDirectory: value.dataDirectory });
  const prepared = await service.prepare({
    workspaceUri: value.workspaceUri,
    ...input({ source: { requirementId: 'req-1' } }),
  }, value.roots);
  assert.equal(prepared.status, 'ready');
  assert.equal((await readDevelopmentMapping(value.workspace, 'v1.2.3-alpha')).mapping, null);

  const executed = await service.execute({ planToken: prepared.planToken }, value.roots);
  assert.equal(executed.status, 'synced');
  assert.equal(client.creates, 1);
  const stored = await readDevelopmentMapping(value.workspace, 'v1.2.3-alpha');
  assert.equal(stored.mapping.product_space.id, 'space-1');
  assert.equal(stored.mapping.requirement.id, 'req-1');
  assert.equal(stored.mapping.tasks[0].e3_task.id, 'task-1');
  assert.match(stored.mapping.tasks[0].e3_task.url, /task-1\?productId=space-1$/);

  const repeated = await service.prepare({
    workspaceUri: value.workspaceUri,
    ...input({ source: { requirementId: 'req-1' } }),
  }, value.roots);
  assert.deepEqual(repeated.counts, { createTasks: 0, reuseTasks: 1 });
  assert.equal((await service.execute({ planToken: repeated.planToken }, value.roots)).status, 'synced');
  assert.equal(client.creates, 1);
});

test('development planning reuses a PRD requirement mapping without copying product requirements', async () => {
  const value = await fixture();
  const directory = join(value.workspace, 'ai-docs', 'integrations', 'e3');
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, 'v1.2.3.yaml'), YAML.stringify({
    schema_version: 2,
    product_space: { id: 'space-1', name: 'OBU-AI提效组' },
    requirements: [{
      featureName: 'alpha',
      e3_requirement: { id: 'req-1', title: '[v1.2.3] Alpha' },
      story_tasks: [],
    }],
  }));
  const client = new FakeClient();
  const service = new DevelopmentTaskService({ client, dataDirectory: value.dataDirectory });
  const prepared = await service.prepare({
    workspaceUri: value.workspaceUri,
    ...input({ source: { prdVersion: 'v1.2.3', featureName: 'alpha' } }),
  }, value.roots);
  assert.equal(prepared.status, 'ready');
  assert.equal(prepared.requirement.id, 'req-1');
});

test('development execution resumes after partial failure and recovers an unknown POST result', async () => {
  const value = await fixture();
  const client = new FakeClient();
  const service = new DevelopmentTaskService({ client, dataDirectory: value.dataDirectory });
  const tasks = [
    input().tasks[0],
    { localId: 'DEV-002', title: 'Add verification', description: 'Add a deterministic check.' },
  ];
  client.failTitle = '[DEV-002] Add verification';
  const prepared = await service.prepare({
    workspaceUri: value.workspaceUri,
    ...input({ source: { requirementId: 'req-1' }, tasks }),
  }, value.roots);
  const partial = await service.execute({ planToken: prepared.planToken }, value.roots);
  assert.equal(partial.status, 'partial');
  let stored = (await readDevelopmentMapping(value.workspace, 'v1.2.3-alpha')).mapping;
  assert.equal(stored.tasks[0].e3_task.id, 'task-1');
  assert.equal(stored.tasks[1].e3_task, null);

  client.failTitle = null;
  client.unknownResult = true;
  const resumed = await service.prepare({
    workspaceUri: value.workspaceUri,
    ...input({ source: { requirementId: 'req-1' }, tasks }),
  }, value.roots);
  assert.deepEqual(resumed.counts, { createTasks: 1, reuseTasks: 1 });
  assert.equal((await service.execute({ planToken: resumed.planToken }, value.roots)).status, 'synced');
  stored = (await readDevelopmentMapping(value.workspace, 'v1.2.3-alpha')).mapping;
  assert.equal(stored.tasks[1].e3_task.action, 'reused-after-unknown-result');
});

test('mapped task identity is immutable and remote drift is blocked without replacement', async () => {
  const value = await fixture();
  const client = new FakeClient();
  const service = new DevelopmentTaskService({ client, dataDirectory: value.dataDirectory });
  const prepared = await service.prepare({
    workspaceUri: value.workspaceUri,
    ...input({ source: { requirementId: 'req-1' } }),
  }, value.roots);
  await service.execute({ planToken: prepared.planToken }, value.roots);

  const changed = await service.prepare({
    workspaceUri: value.workspaceUri,
    ...input({ source: { requirementId: 'req-1' }, tasks: [{
      ...input().tasks[0],
      title: 'Silently changed title',
    }] }),
  }, value.roots);
  assert.equal(changed.status, 'blocked');
  assert.match(changed.errors.join('\n'), /title is immutable/);

  client.tasks.get('req-1')[0].title = '[DEV-001] Drifted remotely';
  const drifted = await service.prepare({
    workspaceUri: value.workspaceUri,
    ...input({ source: { requirementId: 'req-1' } }),
  }, value.roots);
  assert.equal(drifted.status, 'blocked');
  assert.match(drifted.errors.join('\n'), /remote-object-drift/);
  assert.equal(client.creates, 1);
  const file = await readFile(join(value.workspace, 'ai-docs', 'integrations', 'e3', 'development', 'v1.2.3-alpha.yaml'), 'utf8');
  assert.match(file, /task-1/);
});
