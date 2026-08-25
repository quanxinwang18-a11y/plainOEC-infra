import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';
import { normalizeGitRemote, PipelineService, readGitSnapshot } from '../planner.mjs';

const execFileAsync = promisify(execFile);

async function fixture(sharedDataDirectory) {
  const workspace = await realpath(await mkdtemp(join(tmpdir(), 'oec-pipeline-workspace-')));
  const dataDirectory = sharedDataDirectory ?? await mkdtemp(join(tmpdir(), 'oec-pipeline-data-'));
  const workspaceUri = pathToFileURL(workspace).href;
  return { workspace, workspaceUri, roots: [{ uri: workspaceUri }], dataDirectory };
}

function pipeline(id, name = `Pipeline ${id}`) {
  return {
    pipeline: {
      pipelineId: id,
      name,
      spaceId: 'space-1',
      sources: [{
        id: `source-${id}`,
        name: 'team/repo',
        refsType: 'BRANCH',
        data: {
          sourceType: 'code',
          repoType: 'GITEE',
          repoUrl: 'https://gitee.com/team/repo.git',
          refsType: 'BRANCH',
          branch: 'main',
          commitId: 'old-commit',
          workPath: 'repo',
        },
      }],
      stages: [
        { id: 'stage-build', name: 'Build', steps: [{ tasks: [{ id: `build-${id}` }] }] },
        { id: 'stage-deploy', name: 'Deploy', steps: [{ tasks: [{ id: `deploy-${id}` }] }] },
      ],
      customParameters: [{
        customParameterId: 1,
        name: 'BUILD_ENV',
        type: 'enum',
        enumValue: 'dev,test',
        defaultValue: 'dev',
        privateKey: false,
        runSet: true,
      }],
      triggerInfo: { triggerType: 1, triggerParams: { legacy: true } },
    },
    taskDataList: [
      { id: `build-${id}`, data: { name: 'Build', stageId: 'stage-build', skipExecution: false } },
      { id: `deploy-${id}`, data: { name: 'Deploy', stageId: 'stage-deploy', skipExecution: false } },
    ],
  };
}

class FakeClient {
  constructor() {
    this.pipelines = new Map([
      ['pipeline-1', pipeline('pipeline-1')],
      ['pipeline-2', pipeline('pipeline-2')],
    ]);
    this.runs = [];
    this.runCalls = [];
    this.refCommit = 'a'.repeat(40);
    this.unknownRunResult = false;
    this.failBeforeRemoteResult = false;
    this.deterministicFailure = false;
  }

  async listWorkspaces() { return [{ id: 'space-1', name: 'Workspace' }]; }
  async listPipelines() {
    return [...this.pipelines.values()].map((detail) => ({
      id: detail.pipeline.pipelineId,
      name: detail.pipeline.name,
      spaceId: detail.pipeline.spaceId,
    }));
  }
  async getPipeline(_environment, id) {
    const value = this.pipelines.get(String(id));
    return value ? structuredClone(value) : null;
  }
  async listRefs(_environment, _source, ref) {
    return [{ name: ref, commitId: this.refCommit, commitMessage: 'Current HEAD' }];
  }
  async runPipeline(_environment, body) {
    this.runCalls.push(structuredClone(body));
    if (this.deterministicFailure) throw new Error('Pipeline API rejected request: denied');
    if (this.failBeforeRemoteResult) {
      this.failBeforeRemoteResult = false;
      throw new Error('connection reset before a remote run became visible');
    }
    const run = {
      id: String(this.runs.length + 1),
      pipelineId: body.pipelineId,
      pipelineName: this.pipelines.get(body.pipelineId).pipeline.name,
      status: '100002',
      statusName: 'Running',
      runRemark: body.runRemark,
    };
    this.runs.push(run);
    if (this.unknownRunResult) {
      this.unknownRunResult = false;
      throw new Error('connection reset after POST');
    }
    return run;
  }
  async listRuns(_environment, pipelineId) { return this.runs.filter((run) => run.pipelineId === pipelineId); }
  async getRun(_environment, id) { return this.runs.find((run) => run.id === String(id)) ?? null; }
}

function snapshot(overrides = {}) {
  return {
    remoteKey: 'gitee.com/team/repo',
    ref: 'main',
    commit: 'a'.repeat(40),
    ...overrides,
  };
}

function service(value, client, snapshotState = { value: snapshot() }) {
  return new PipelineService({
    client,
    dataDirectory: value.dataDirectory,
    gitSnapshotFn: async () => structuredClone(snapshotState.value),
  });
}

test('Git remote normalization requires exact host and repository identity', () => {
  assert.equal(normalizeGitRemote('git@gitee.com:team/repo.git'), 'gitee.com/team/repo');
  assert.equal(normalizeGitRemote('https://gitee.com/team/repo.git'), 'gitee.com/team/repo');
  assert.equal(normalizeGitRemote('ssh://git@gitee.com/team/repo.git'), 'gitee.com/team/repo');
  assert.equal(normalizeGitRemote('not a remote'), '');
});

test('Git snapshot reads origin, ref, and HEAD and rejects a different requested ref', async () => {
  const value = await fixture();
  await execFileAsync('git', ['init', '-b', 'main', value.workspace]);
  await execFileAsync('git', ['-C', value.workspace, 'config', 'user.email', 'fixture@example.com']);
  await execFileAsync('git', ['-C', value.workspace, 'config', 'user.name', 'Fixture']);
  await execFileAsync('git', ['-C', value.workspace, 'remote', 'add', 'origin', 'git@gitee.com:team/repo.git']);
  await writeFile(join(value.workspace, 'README.md'), '# Fixture\n');
  await execFileAsync('git', ['-C', value.workspace, 'add', '--', 'README.md']);
  await execFileAsync('git', ['-C', value.workspace, 'commit', '-m', 'fixture']);
  const resolved = await readGitSnapshot(value.workspace);
  assert.equal(resolved.remoteKey, 'gitee.com/team/repo');
  assert.equal(resolved.ref, 'main');
  assert.match(resolved.commit, /^[0-9a-f]{40}$/);
  await execFileAsync('git', ['-C', value.workspace, 'branch', 'other', 'HEAD~0']);
  await writeFile(join(value.workspace, 'README.md'), '# Fixture changed\n');
  await execFileAsync('git', ['-C', value.workspace, 'commit', '-am', 'second']);
  await assert.rejects(readGitSnapshot(value.workspace, 'other'), /does not resolve to the current HEAD/);
});

test('multiple exact pipelines require selection and persist only an explicit workspace target', async () => {
  const dataDirectory = await mkdtemp(join(tmpdir(), 'oec-pipeline-shared-data-'));
  const first = await fixture(dataDirectory);
  const second = await fixture(dataDirectory);
  const client = new FakeClient();
  const firstService = service(first, client);
  const prepared = await firstService.prepare({
    workspaceUri: first.workspaceUri,
    environment: 'dev',
  }, first.roots);
  assert.equal(prepared.status, 'needs_pipeline_selection');
  assert.deepEqual(prepared.candidates.map((candidate) => candidate.id), ['pipeline-1', 'pipeline-2']);
  await assert.rejects(firstService.selectTarget({
    selectionToken: prepared.selectionToken,
    pipelineId: 'not-a-candidate',
  }, first.roots), /not returned for this selection/);
  await assert.rejects(firstService.selectTarget({
    selectionToken: prepared.selectionToken,
    pipelineId: 'pipeline-2',
  }, second.roots), /not one of the client-provided MCP roots/);
  const selected = await firstService.selectTarget({
    selectionToken: prepared.selectionToken,
    pipelineId: 'pipeline-2',
  }, first.roots);
  assert.equal(selected.status, 'ready');
  assert.equal(selected.pipeline.id, 'pipeline-2');
  await assert.rejects(firstService.selectTarget({
    selectionToken: prepared.selectionToken,
    pipelineId: 'pipeline-2',
  }, first.roots), /already been used/);

  const repeated = await firstService.prepare({ workspaceUri: first.workspaceUri, environment: 'dev' }, first.roots);
  assert.equal(repeated.status, 'ready');
  assert.equal(repeated.pipeline.id, 'pipeline-2');
  const isolated = await service(second, client).prepare({ workspaceUri: second.workspaceUri, environment: 'dev' }, second.roots);
  assert.equal(isolated.status, 'needs_pipeline_selection');
});

test('prepare is non-mutating and execute binds selected stages to exact Git HEAD', async () => {
  const value = await fixture();
  const client = new FakeClient();
  const pipelineService = service(value, client);
  const prepared = await pipelineService.prepare({
    workspaceUri: value.workspaceUri,
    pipelineId: 'pipeline-1',
    environment: 'test',
    stages: ['Build'],
  }, value.roots);
  assert.equal(prepared.status, 'ready');
  assert.equal(client.runCalls.length, 0);
  assert.deepEqual(prepared.stages, ['Build']);

  const executed = await pipelineService.execute({ planToken: prepared.planToken }, value.roots);
  assert.equal(executed.status, 'running');
  assert.equal(client.runCalls.length, 1);
  const request = client.runCalls[0];
  assert.equal(request.runSources[0].data.commitId, 'a'.repeat(40));
  assert.equal(request.runSources[0].data.branch, 'main');
  assert.equal(request.taskDataList.find((task) => task.id === 'build-pipeline-1').data.skipExecution, false);
  assert.equal(request.taskDataList.find((task) => task.id === 'deploy-pipeline-1').data.skipExecution, true);
  assert.equal(request.customParameterRuns[0].defaultValue, 'test');
  assert.deepEqual(request.triggerInfo, { triggerType: 0, triggerParams: {} });
  const replayed = await pipelineService.execute({ planToken: prepared.planToken }, value.roots);
  assert.equal(replayed.runId, executed.runId);
  assert.equal(replayed.runToken, executed.runToken);
  assert.equal(client.runCalls.length, 1);

  const runtimeFile = join(value.dataDirectory, 'pipeline', 'runtime', `${executed.runToken}.json`);
  const before = await readFile(runtimeFile, 'utf8');
  const status = await pipelineService.status({ workspaceUri: value.workspaceUri, runToken: executed.runToken }, value.roots);
  assert.equal(status.status, 'verified');
  assert.equal(status.run.status, '100002');
  assert.equal(await readFile(runtimeFile, 'utf8'), before);
});

test('prod, invalid stages, unsupported required parameters, and unrelated pipelines fail closed', async () => {
  const value = await fixture();
  const client = new FakeClient();
  const pipelineService = service(value, client);
  assert.equal((await pipelineService.prepare({
    workspaceUri: value.workspaceUri,
    pipelineId: 'pipeline-1',
    environment: 'prod',
  }, value.roots)).status, 'blocked');
  const stage = await pipelineService.prepare({
    workspaceUri: value.workspaceUri,
    pipelineId: 'pipeline-1',
    environment: 'dev',
    stages: ['Does not exist'],
  }, value.roots);
  assert.equal(stage.status, 'blocked');
  assert.match(stage.errors.join('\n'), /no exact stage/);

  client.pipelines.get('pipeline-1').pipeline.customParameters.push({ name: 'ARBITRARY_VALUE', runSet: true, privateKey: false });
  const parameter = await pipelineService.prepare({
    workspaceUri: value.workspaceUri,
    pipelineId: 'pipeline-1',
    environment: 'dev',
  }, value.roots);
  assert.equal(parameter.status, 'blocked');
  assert.match(parameter.errors.join('\n'), /unsupported run parameter/);

  client.pipelines.get('pipeline-1').pipeline.sources[0].data.repoUrl = 'https://gitee.com/other/repo.git';
  const unrelated = await pipelineService.prepare({
    workspaceUri: value.workspaceUri,
    pipelineId: 'pipeline-1',
    environment: 'dev',
  }, value.roots);
  assert.equal(unrelated.status, 'blocked');
});

test('execute blocks Git, ref, pipeline configuration, and run identity drift', async () => {
  const value = await fixture();
  const client = new FakeClient();
  const snapshotState = { value: snapshot() };
  const pipelineService = service(value, client, snapshotState);
  let prepared = await pipelineService.prepare({
    workspaceUri: value.workspaceUri,
    pipelineId: 'pipeline-1',
    environment: 'dev',
  }, value.roots);
  snapshotState.value = snapshot({ commit: 'b'.repeat(40) });
  await assert.rejects(pipelineService.execute({ planToken: prepared.planToken }, value.roots), /Git remote, ref, or commit changed/);

  snapshotState.value = snapshot();
  prepared = await pipelineService.prepare({ workspaceUri: value.workspaceUri, pipelineId: 'pipeline-1', environment: 'dev' }, value.roots);
  client.pipelines.get('pipeline-1').pipeline.stages[0].name = 'Changed Build';
  await assert.rejects(pipelineService.execute({ planToken: prepared.planToken }, value.roots), /configuration changed/);

  client.pipelines.set('pipeline-1', pipeline('pipeline-1'));
  prepared = await pipelineService.prepare({ workspaceUri: value.workspaceUri, pipelineId: 'pipeline-1', environment: 'dev' }, value.roots);
  client.refCommit = 'c'.repeat(40);
  await assert.rejects(pipelineService.execute({ planToken: prepared.planToken }, value.roots), /does not point to the current HEAD/);

  client.refCommit = 'a'.repeat(40);
  prepared = await pipelineService.prepare({ workspaceUri: value.workspaceUri, pipelineId: 'pipeline-1', environment: 'dev' }, value.roots);
  const executed = await pipelineService.execute({ planToken: prepared.planToken }, value.roots);
  client.runs[0].pipelineId = 'drifted-pipeline';
  assert.equal((await pipelineService.status({
    workspaceUri: value.workspaceUri,
    runToken: executed.runToken,
  }, value.roots)).status, 'blocked');
});

test('unknown POST results are recovered by exact marker and deterministic rejection is blocked', async () => {
  const value = await fixture();
  const client = new FakeClient();
  const pipelineService = service(value, client);
  client.unknownRunResult = true;
  let prepared = await pipelineService.prepare({
    workspaceUri: value.workspaceUri,
    pipelineId: 'pipeline-1',
    environment: 'dev',
  }, value.roots);
  const recovered = await pipelineService.execute({ planToken: prepared.planToken }, value.roots);
  assert.equal(recovered.action, 'recovered-after-unknown-result');
  assert.equal(client.runCalls.length, 1);

  client.deterministicFailure = true;
  prepared = await pipelineService.prepare({
    workspaceUri: value.workspaceUri,
    pipelineId: 'pipeline-1',
    environment: 'dev',
  }, value.roots);
  const blocked = await pipelineService.execute({ planToken: prepared.planToken }, value.roots);
  assert.equal(blocked.status, 'blocked');
  const callsAfterFailure = client.runCalls.length;
  assert.equal((await pipelineService.execute({ planToken: prepared.planToken }, value.roots)).status, 'blocked');
  assert.equal(client.runCalls.length, callsAfterFailure);
});

test('an executing Pipeline plan never reposts and recovers only from its exact marker', async () => {
  const value = await fixture();
  const client = new FakeClient();
  const pipelineService = service(value, client);
  client.failBeforeRemoteResult = true;
  const prepared = await pipelineService.prepare({
    workspaceUri: value.workspaceUri,
    pipelineId: 'pipeline-1',
    environment: 'dev',
  }, value.roots);
  const uncertain = await pipelineService.execute({ planToken: prepared.planToken }, value.roots);
  assert.equal(uncertain.status, 'unknown');
  assert.equal(client.runCalls.length, 1);
  assert.equal((await pipelineService.execute({ planToken: prepared.planToken }, value.roots)).status, 'unknown');
  assert.equal(client.runCalls.length, 1);

  const body = client.runCalls[0];
  client.runs.push({
    id: 'eventual-run',
    pipelineId: body.pipelineId,
    pipelineName: 'Pipeline pipeline-1',
    status: '100002',
    statusName: 'Running',
    runRemark: body.runRemark,
  });
  const recovered = await pipelineService.execute({ planToken: prepared.planToken }, value.roots);
  assert.equal(recovered.status, 'running');
  assert.equal(recovered.runId, 'eventual-run');
  assert.equal(recovered.action, 'recovered-after-replay');
  assert.equal(client.runCalls.length, 1);
});

test('multiple remote runs for one Pipeline plan block replay recovery', async () => {
  const value = await fixture();
  const client = new FakeClient();
  const pipelineService = service(value, client);
  client.failBeforeRemoteResult = true;
  const prepared = await pipelineService.prepare({
    workspaceUri: value.workspaceUri,
    pipelineId: 'pipeline-1',
    environment: 'dev',
  }, value.roots);
  assert.equal((await pipelineService.execute({ planToken: prepared.planToken }, value.roots)).status, 'unknown');
  const body = client.runCalls[0];
  for (const id of ['duplicate-1', 'duplicate-2']) {
    client.runs.push({
      id,
      pipelineId: body.pipelineId,
      pipelineName: 'Pipeline pipeline-1',
      status: '100002',
      statusName: 'Running',
      runRemark: body.runRemark,
    });
  }
  const blocked = await pipelineService.execute({ planToken: prepared.planToken }, value.roots);
  assert.equal(blocked.status, 'blocked');
  assert.match(blocked.errors.join('\n'), /ambiguous/);
  assert.equal(client.runCalls.length, 1);
});
