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
    this.logs = new Map();
    this.starts = 0;
    this.worklogWrites = 0;
    this.unknownStartResult = false;
    this.unknownWorklogResult = false;
    this.failWorklogId = null;
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
      status: '1',
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

  async getTaskLogInfo(_spaceId, taskId) {
    const remote = await this.getTask(null, taskId);
    const stored = this.logs.get(String(taskId)) ?? {};
    return {
      planId: 'plan-1',
      projectCode: 'pomp-1',
      planWorkload: 6,
      spentHours: 0,
      remainingHours: 6,
      progress: '0',
      worklog: '',
      status: remote?.status,
      ...stored,
    };
  }
  async startTask(_spaceId, taskId) {
    this.starts += 1;
    const remote = await this.getTask(null, taskId);
    remote.status = '2';
    if (this.unknownStartResult) {
      this.unknownStartResult = false;
      throw new Error('connection reset after start');
    }
    return { id: String(taskId), status: '2' };
  }
  async writeTaskWorklog(_spaceId, taskId, logInfo, update) {
    if (String(taskId) === String(this.failWorklogId)) throw new Error('worklog write failed');
    this.worklogWrites += 1;
    const remote = await this.getTask(null, taskId);
    const complete = update.action === 'complete';
    const value = {
      ...logInfo,
      spentHours: update.spentHours ?? Number(logInfo.spentHours ?? 0),
      worklog: update.worklog,
      ...(complete ? { remainingHours: 0, progress: '100', status: '3' } : {}),
    };
    this.logs.set(String(taskId), value);
    if (complete) remote.status = '3';
    if (this.unknownWorklogResult) {
      this.unknownWorklogResult = false;
      throw new Error('connection reset after worklog');
    }
    return { id: String(taskId) };
  }
}

async function createMappedTasks(value, client, tasks = input().tasks) {
  const service = new DevelopmentTaskService({ client, dataDirectory: value.dataDirectory });
  const prepared = await service.prepare({
    workspaceUri: value.workspaceUri,
    ...input({ source: { requirementId: 'req-1' }, tasks }),
  }, value.roots);
  assert.equal(prepared.status, 'ready');
  assert.equal((await service.execute({ planToken: prepared.planToken }, value.roots)).status, 'synced');
  return service;
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

test('task progress starts a mapped task and status remains read-only', async () => {
  const value = await fixture();
  const client = new FakeClient();
  const service = await createMappedTasks(value, client);
  const prepared = await service.prepareProgress({
    workspaceUri: value.workspaceUri,
    changeId: 'v1.2.3-alpha',
    updates: [{ localId: 'DEV-001', action: 'start' }],
  }, value.roots);
  assert.equal(prepared.status, 'ready');
  const executed = await service.executeProgress({ planToken: prepared.planToken }, value.roots);
  assert.equal(executed.status, 'synced');
  assert.equal(client.starts, 1);
  assert.equal(client.tasks.get('req-1')[0].status, '2');

  const mappingPath = join(value.workspace, 'ai-docs', 'integrations', 'e3', 'development', 'v1.2.3-alpha.yaml');
  const before = await readFile(mappingPath, 'utf8');
  const status = await service.status({ workspaceUri: value.workspaceUri, changeId: 'v1.2.3-alpha' }, value.roots);
  assert.equal(status.status, 'synced');
  assert.equal(status.tasks[0].state, 'verified');
  assert.equal(status.tasks[0].status, '2');
  assert.equal(await readFile(mappingPath, 'utf8'), before);
});

test('task progress logs work and completes through server-derived metadata', async () => {
  const value = await fixture();
  const client = new FakeClient();
  const service = await createMappedTasks(value, client);
  let prepared = await service.prepareProgress({
    workspaceUri: value.workspaceUri,
    changeId: 'v1.2.3-alpha',
    updates: [{ localId: 'DEV-001', action: 'log', worklog: 'Implemented the bounded path.', spentHours: 2.5 }],
  }, value.roots);
  assert.equal((await service.executeProgress({ planToken: prepared.planToken }, value.roots)).status, 'synced');
  assert.equal((await client.getTaskLogInfo('space-1', 'task-1')).spentHours, 2.5);

  client.unknownWorklogResult = true;
  prepared = await service.prepareProgress({
    workspaceUri: value.workspaceUri,
    changeId: 'v1.2.3-alpha',
    updates: [{ localId: 'DEV-001', action: 'complete', worklog: 'Verification passed.', spentHours: 3 }],
  }, value.roots);
  const completed = await service.executeProgress({ planToken: prepared.planToken }, value.roots);
  assert.equal(completed.status, 'synced');
  assert.equal(completed.changes[0].action, 'complete-recovered');
  const info = await client.getTaskLogInfo('space-1', 'task-1');
  assert.equal(info.status, '3');
  assert.equal(info.progress, '100');
  assert.equal(info.worklog, 'Verification passed.');
  assert.equal((await service.status({
    workspaceUri: value.workspaceUri,
    changeId: 'v1.2.3-alpha',
  }, value.roots)).tasks[0].status, '3');
});

test('task progress validates bounded inputs and checkpoints before a partial failure', async () => {
  const value = await fixture();
  const client = new FakeClient();
  const tasks = [
    input().tasks[0],
    { localId: 'DEV-002', title: 'Add verification', description: 'Add deterministic verification.' },
  ];
  const service = await createMappedTasks(value, client, tasks);
  const invalid = await service.prepareProgress({
    workspaceUri: value.workspaceUri,
    changeId: 'v1.2.3-alpha',
    updates: [{ localId: 'DEV-001', action: 'complete' }],
  }, value.roots);
  assert.equal(invalid.status, 'blocked');
  assert.match(invalid.errors.join('\n'), /requires worklog/);

  client.failWorklogId = 'task-2';
  const prepared = await service.prepareProgress({
    workspaceUri: value.workspaceUri,
    changeId: 'v1.2.3-alpha',
    updates: [
      { localId: 'DEV-001', action: 'log', worklog: 'First checkpoint.', spentHours: 1 },
      { localId: 'DEV-002', action: 'log', worklog: 'Second checkpoint.', spentHours: 1 },
    ],
  }, value.roots);
  const partial = await service.executeProgress({ planToken: prepared.planToken }, value.roots);
  assert.equal(partial.status, 'partial');
  assert.deepEqual(partial.changes.map((change) => change.localId), ['DEV-001']);
  const mapping = (await readDevelopmentMapping(value.workspace, 'v1.2.3-alpha')).mapping;
  assert.equal(mapping.tasks[0].last_progress.worklog, 'First checkpoint.');
  assert.equal(mapping.tasks[1].last_progress, undefined);
});

test('progress plans cannot be executed as creation plans and remote drift blocks execution', async () => {
  const value = await fixture();
  const client = new FakeClient();
  const service = await createMappedTasks(value, client);
  const prepared = await service.prepareProgress({
    workspaceUri: value.workspaceUri,
    changeId: 'v1.2.3-alpha',
    updates: [{ localId: 'DEV-001', action: 'start' }],
  }, value.roots);
  await assert.rejects(service.execute({ planToken: prepared.planToken }, value.roots), /not a development-task creation plan/);
  client.tasks.get('req-1')[0].title = '[DEV-001] Drifted after prepare';
  const blocked = await service.executeProgress({ planToken: prepared.planToken }, value.roots);
  assert.equal(blocked.status, 'blocked');
  assert.equal(client.starts, 0);
});
