import assert from 'node:assert/strict';
import { mkdtemp, mkdir, realpath, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import YAML from 'yaml';
import { DevelopmentTaskService } from '../development.mjs';
import { PublisherService } from '../publisher.mjs';

async function fixture() {
  const workspace = await realpath(await mkdtemp(join(tmpdir(), 'oec-e3-journey-workspace-')));
  const dataDirectory = await mkdtemp(join(tmpdir(), 'oec-e3-journey-data-'));
  const workspaceUri = pathToFileURL(workspace).href;
  const version = 'v9.9.0';
  const prd = `# PRD ${version}

## 模块: alpha — Alpha module

### 模块概述

Provide a guarded platform operation.

### 用户故事

| ID | Story | Priority |
| --- | --- | --- |
| US-001 | As a user, I want a guarded operation | P1 |

### 验收标准

#### US-001 Guarded operation

- Given valid context, When executed, Then the operation is verified.

### 待确认事项

All product decisions are confirmed.
`;
  const childPath = `ai-docs/versions/${version}/prd/prd-${version}-alpha.md`;
  const files = new Map([
    ['ai-docs/prd/prd-all.md', prd],
    ['ai-docs/prd/prd-all-changelog.md', `# Changelog\n\n## ${version}\n\nAdd Alpha module.\n`],
    [`ai-docs/versions/${version}/prd/prd-${version}.md`, prd],
    [childPath, prd],
    [`ai-docs/versions/${version}/prd/HANDOFF.yaml`, YAML.stringify({
      schema_version: 4,
      prd_version: version,
      sub_prds: [{
        featureName: 'alpha',
        file: childPath,
        title: 'Alpha module',
        priority: 'P1',
        stories: [{ id: 'US-001', title: 'Guarded operation', source_section: '用户故事' }],
      }],
      quality_gate: { warnings: [] },
    })],
  ]);
  for (const [path, content] of files) {
    const absolute = join(workspace, path);
    await mkdir(join(absolute, '..'), { recursive: true });
    await writeFile(absolute, content);
  }
  return { workspace, dataDirectory, workspaceUri, roots: [{ uri: workspaceUri }], version };
}

class JourneyClient {
  constructor() {
    this.requirements = [];
    this.tasks = new Map();
    this.logs = new Map();
    this.nextRequirement = 1;
    this.nextTask = 1;
  }

  async listSpaces() { return [{ id: 'space-1', name: 'Mock non-production' }]; }
  async listPompProjects() { return [{ code: 'pomp-1', name: 'Default POMP', isDefault: true }]; }
  async requirementMetadata() {
    return { workItemId: 'work-item-1', flowDefinition: 'flow-1', inChargeBy: 'owner', warnings: [] };
  }
  async currentAccount() { return 'owner'; }
  async listRequirements() { return this.requirements; }
  async findRequirementsByExactTitle(_spaceId, title) { return this.requirements.filter((item) => item.title === title); }
  async getRequirement(_spaceId, _workItemId, id) {
    return this.requirements.find((item) => String(item.id) === String(id)) ?? null;
  }
  async createRequirement(_spaceId, _metadata, item) {
    const remote = { id: `requirement-${this.nextRequirement++}`, title: item.remoteTitle };
    this.requirements.push(remote);
    return remote;
  }
  async listTasks(_spaceId, requirementId) { return this.tasks.get(String(requirementId)) ?? []; }
  async findTasksByExactTitle(spaceId, requirementId, title) {
    return (await this.listTasks(spaceId, requirementId)).filter((item) => item.title === title);
  }
  async getTask(_spaceId, id) {
    return [...this.tasks.values()].flat().find((item) => String(item.id) === String(id)) ?? null;
  }
  async createTask(_spaceId, requirementId, _config, task) {
    const remote = {
      id: `task-${this.nextTask++}`,
      title: task.remoteTitle,
      requirementId: String(requirementId),
      status: '1',
    };
    const tasks = this.tasks.get(String(requirementId)) ?? [];
    tasks.push(remote);
    this.tasks.set(String(requirementId), tasks);
    return remote;
  }
  async getTaskLogInfo(_spaceId, taskId) {
    const task = await this.getTask(null, taskId);
    return {
      planId: 'plan-1',
      projectCode: 'pomp-1',
      planWorkload: 4,
      spentHours: 0,
      remainingHours: 4,
      progress: '0',
      worklog: '',
      status: task.status,
      ...(this.logs.get(String(taskId)) ?? {}),
    };
  }
  async startTask(_spaceId, taskId) {
    const task = await this.getTask(null, taskId);
    task.status = '2';
    return { id: String(taskId), status: '2' };
  }
  async writeTaskWorklog(_spaceId, taskId, info, update) {
    const task = await this.getTask(null, taskId);
    const complete = update.action === 'complete';
    this.logs.set(String(taskId), {
      ...info,
      spentHours: update.spentHours ?? info.spentHours,
      worklog: update.worklog,
      ...(complete ? { remainingHours: 0, progress: '100', status: '3' } : {}),
    });
    if (complete) task.status = '3';
    return { id: String(taskId) };
  }
}

test('mock journey publishes a PRD then reuses its requirement for a completed development task', async () => {
  const value = await fixture();
  const client = new JourneyClient();
  const publisher = new PublisherService({ client, dataDirectory: value.dataDirectory });
  let publication = await publisher.prepare({ workspaceUri: value.workspaceUri, version: value.version }, value.roots);
  assert.equal(publication.status, 'needs_space_selection');
  assert.equal((await publisher.selectProductSpace({
    selectionToken: publication.selectionToken,
    spaceId: 'space-1',
  }, value.roots)).status, 'selected');
  publication = await publisher.prepare({ workspaceUri: value.workspaceUri, version: value.version }, value.roots);
  assert.equal(publication.status, 'ready');
  assert.equal((await publisher.execute({ planToken: publication.planToken }, value.roots)).status, 'published');
  assert.equal((await publisher.status({ workspaceUri: value.workspaceUri, version: value.version }, value.roots)).status, 'published');

  const development = new DevelopmentTaskService({ client, dataDirectory: value.dataDirectory });
  let taskPlan = await development.prepare({
    workspaceUri: value.workspaceUri,
    changeId: `${value.version}-alpha`,
    source: { prdVersion: value.version, featureName: 'alpha' },
    tasks: [{
      localId: 'DEV-001',
      title: 'Implement guarded operation',
      description: 'Implement the accepted Story and verification.',
      estimatedHours: 4,
    }],
  }, value.roots);
  assert.equal(taskPlan.status, 'ready');
  assert.equal(taskPlan.requirement.id, 'requirement-1');
  assert.equal((await development.execute({ planToken: taskPlan.planToken }, value.roots)).status, 'synced');

  let progress = await development.prepareProgress({
    workspaceUri: value.workspaceUri,
    changeId: `${value.version}-alpha`,
    updates: [{ localId: 'DEV-001', action: 'start' }],
  }, value.roots);
  assert.equal((await development.executeProgress({ planToken: progress.planToken }, value.roots)).status, 'synced');
  progress = await development.prepareProgress({
    workspaceUri: value.workspaceUri,
    changeId: `${value.version}-alpha`,
    updates: [{ localId: 'DEV-001', action: 'complete', worklog: 'Implementation and checks passed.', spentHours: 4 }],
  }, value.roots);
  assert.equal((await development.executeProgress({ planToken: progress.planToken }, value.roots)).status, 'synced');
  const status = await development.status({
    workspaceUri: value.workspaceUri,
    changeId: `${value.version}-alpha`,
  }, value.roots);
  assert.equal(status.status, 'synced');
  assert.equal(status.tasks[0].status, '3');
  assert.equal(status.tasks[0].progress, '100');
});
