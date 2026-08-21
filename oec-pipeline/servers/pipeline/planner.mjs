import { createHash, randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, readFile, realpath, rename, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,}$/;
const PLAN_TTL_MS = 15 * 60 * 1000;
const NON_SENSITIVE_RUN_PARAMETERS = new Set(['BUILD_ENV']);

function dataRoot(value = process.env.OEC_PLUGIN_DATA) {
  if (!value) throw new Error('OEC_PLUGIN_DATA is not available');
  return resolve(value, 'pipeline');
}

function workspaceKey(workspace) {
  return createHash('sha256').update(workspace).digest('hex');
}

function configPath(workspace, dataDirectory) {
  return join(dataRoot(dataDirectory), 'workspaces', workspaceKey(workspace), 'config.json');
}

function selectionPath(token, dataDirectory) {
  if (!TOKEN_PATTERN.test(token)) throw new Error('Invalid pipeline selection token');
  return join(dataRoot(dataDirectory), 'selections', `${token}.json`);
}

function planPath(token, dataDirectory) {
  if (!TOKEN_PATTERN.test(token)) throw new Error('Invalid pipeline plan token');
  return join(dataRoot(dataDirectory), 'plans', `${token}.json`);
}

function runtimePath(token, dataDirectory) {
  if (!TOKEN_PATTERN.test(token)) throw new Error('Invalid pipeline run token');
  return join(dataRoot(dataDirectory), 'runtime', `${token}.json`);
}

async function atomicJson(path, value) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${process.pid}.${randomBytes(8).toString('hex')}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, path);
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT' || error instanceof SyntaxError) return null;
    throw error;
  }
}

function token() {
  return randomBytes(32).toString('base64url');
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

function fingerprint(value) {
  return `sha256:${createHash('sha256').update(JSON.stringify(stable(value))).digest('hex')}`;
}

function pipelineConfigFingerprint(detail) {
  return fingerprint({
    pipeline: {
      pipelineId: detail.pipeline.pipelineId,
      name: detail.pipeline.name,
      spaceId: detail.pipeline.spaceId,
      sources: detail.pipeline.sources,
      stages: detail.pipeline.stages,
      customParameters: detail.pipeline.customParameters,
      triggerInfo: detail.pipeline.triggerInfo,
    },
    taskDataList: detail.taskDataList,
  });
}

export function normalizeGitRemote(value) {
  const remote = String(value ?? '').trim();
  const scp = /^([^@]+@)?([^:]+):(.+)$/.exec(remote);
  let host;
  let path;
  if (scp && !remote.includes('://')) {
    host = scp[2];
    path = scp[3];
  } else {
    try {
      const url = new URL(remote);
      host = url.hostname;
      path = url.pathname;
    } catch {
      return '';
    }
  }
  return `${String(host).toLowerCase()}/${String(path).replace(/^\/+|\/+$/g, '').replace(/\.git$/i, '')}`;
}

export async function resolveAuthorizedWorkspace(workspaceUri, roots) {
  let requested;
  try {
    const url = new URL(workspaceUri);
    if (url.protocol !== 'file:') throw new Error('not file');
    requested = await realpath(fileURLToPath(url));
  } catch {
    throw new Error('workspaceUri must be an existing file:// MCP root');
  }
  const allowed = [];
  for (const root of roots ?? []) {
    try {
      const url = new URL(root.uri);
      if (url.protocol === 'file:') allowed.push(await realpath(fileURLToPath(url)));
    } catch {
      // Ignore non-file or unavailable roots.
    }
  }
  if (!allowed.includes(requested)) throw new Error('workspaceUri is not one of the client-provided MCP roots');
  return requested;
}

async function git(workspace, args) {
  try {
    const { stdout } = await execFileAsync('git', ['-C', workspace, ...args], {
      encoding: 'utf8',
      timeout: 10_000,
      maxBuffer: 1024 * 1024,
    });
    return stdout.trim();
  } catch (error) {
    throw new Error(`Unable to inspect Git workspace: ${error.stderr?.trim() || error.message}`);
  }
}

export async function readGitSnapshot(workspace, requestedRef) {
  const remote = await git(workspace, ['config', '--get', 'remote.origin.url']);
  const remoteKey = normalizeGitRemote(remote);
  if (!remoteKey) throw new Error('Git remote.origin.url is missing or unsupported');
  const commit = await git(workspace, ['rev-parse', 'HEAD']);
  let currentRef;
  try {
    currentRef = await git(workspace, ['symbolic-ref', '--quiet', '--short', 'HEAD']);
  } catch {
    currentRef = null;
  }
  const ref = requestedRef?.trim() || currentRef;
  if (!ref) throw new Error('Detached HEAD requires an explicit ref that resolves to HEAD');
  const refCommit = await git(workspace, ['rev-parse', `${ref}^{commit}`]);
  if (refCommit !== commit) throw new Error(`Requested ref ${ref} does not resolve to the current HEAD`);
  return { remoteKey, ref, commit };
}

function codeSources(detail) {
  return (detail?.pipeline?.sources ?? []).filter((source) => source?.data?.sourceType === 'code');
}

function pipelineMatchesRemote(detail, remoteKey) {
  const sources = codeSources(detail);
  return sources.length > 0 && sources.every((source) => normalizeGitRemote(source.data.repoUrl) === remoteKey);
}

function pipelineSummary(detail) {
  return {
    id: String(detail.pipeline.pipelineId),
    name: detail.pipeline.name,
    spaceId: String(detail.pipeline.spaceId),
    stages: (detail.pipeline.stages ?? []).map((stage) => stage.name),
    fingerprint: pipelineConfigFingerprint(detail),
  };
}

async function pipelineCandidate(client, environment, pipelineId, remoteKey) {
  const detail = await client.getPipeline(environment, pipelineId);
  if (!detail || !pipelineMatchesRemote(detail, remoteKey)) return null;
  return { ...pipelineSummary(detail), detail };
}

async function findCandidates(client, environment, remoteKey, pipelineId) {
  if (pipelineId) {
    const candidate = await pipelineCandidate(client, environment, pipelineId, remoteKey);
    return candidate ? [candidate] : [];
  }
  const results = [];
  const seen = new Set();
  for (const workspace of await client.listWorkspaces(environment)) {
    for (const pipeline of await client.listPipelines(environment, workspace.id)) {
      if (seen.has(pipeline.id)) continue;
      seen.add(pipeline.id);
      const candidate = await pipelineCandidate(client, environment, pipeline.id, remoteKey);
      if (candidate) results.push(candidate);
    }
  }
  return results;
}

function selectedStages(detail, requested) {
  const stages = detail.pipeline.stages ?? [];
  const names = stages.map((stage) => stage.name);
  if (new Set(names).size !== names.length) throw new Error('Pipeline has duplicate stage names and cannot be selected safely');
  const chosen = requested?.length ? requested : names;
  if (new Set(chosen).size !== chosen.length) throw new Error('stages must not contain duplicates');
  for (const name of chosen) {
    if (!names.includes(name)) throw new Error(`Pipeline has no exact stage named ${name}`);
  }
  if (chosen.length === 0) throw new Error('Pipeline has no executable stages');
  return { stages, names: chosen };
}

function taskIdsForStages(stages, names) {
  const ids = new Set();
  const stageIds = new Set();
  for (const stage of stages.filter((item) => names.includes(item.name))) {
    if (stage.id !== undefined) stageIds.add(String(stage.id));
    for (const step of stage.steps ?? []) {
      for (const task of step.tasks ?? []) if (task.id !== undefined) ids.add(String(task.id));
    }
  }
  return { ids, stageIds };
}

function buildTaskData(detail, stageSelection) {
  const allStagesSelected = stageSelection.names.length === stageSelection.stages.length;
  const selected = taskIdsForStages(stageSelection.stages, stageSelection.names);
  const tasks = (detail.taskDataList ?? []).map((task) => {
    const id = String(task.id);
    const stageId = task.data?.stageId === undefined ? null : String(task.data.stageId);
    const execute = allStagesSelected || selected.ids.has(id) || (stageId && selected.stageIds.has(stageId));
    return { ...structuredClone(task), data: { ...structuredClone(task.data ?? {}), skipExecution: !execute, hasError: false } };
  });
  if (tasks.length === 0) throw new Error('Pipeline taskDataList is empty');
  if (!tasks.some((task) => task.data.skipExecution === false)) throw new Error('Selected stages contain no executable task nodes');
  return tasks;
}

function buildParameters(detail, environment) {
  const result = [];
  const warnings = [];
  for (const parameter of detail.pipeline.customParameters ?? []) {
    const name = String(parameter.name ?? '');
    if (parameter.privateKey === true) {
      warnings.push({ code: 'private-parameter-server-default', message: `${name || 'private parameter'} is omitted and remains server-managed` });
      continue;
    }
    if (!NON_SENSITIVE_RUN_PARAMETERS.has(name)) {
      if (parameter.runSet === true) throw new Error(`Pipeline requires unsupported run parameter ${name || '<unnamed>'}`);
      continue;
    }
    const values = String(parameter.enumValue ?? '').split(',').map((item) => item.trim()).filter(Boolean);
    if (values.length && !values.includes(environment)) {
      throw new Error(`${name} does not allow the requested ${environment} environment`);
    }
    result.push({
      customParameterId: parameter.customParameterId,
      name,
      type: parameter.type,
      defaultValue: environment,
      description: parameter.description,
      enumValue: parameter.enumValue,
      privateKey: false,
      runSet: parameter.runSet,
      reSet: parameter.reSet,
      pipelineId: parameter.pipelineId,
    });
  }
  if (!result.some((item) => item.name === 'BUILD_ENV')) {
    warnings.push({ code: 'no-build-env-parameter', message: 'Pipeline has no BUILD_ENV parameter; environment only selects the fixed DevOps origin' });
  }
  return { parameters: result, warnings };
}

async function buildRunRequest(client, environment, detail, gitSnapshot, stageNames, runKey) {
  const sources = [];
  const warnings = [];
  for (const source of detail.pipeline.sources ?? []) {
    const value = structuredClone(source);
    if (value.data?.sourceType === 'code') {
      if (normalizeGitRemote(value.data.repoUrl) !== gitSnapshot.remoteKey) {
        throw new Error('Pipeline contains a code source outside the current Git remote');
      }
      const exact = (await client.listRefs(environment, value, gitSnapshot.ref))
        .filter((item) => item.name === gitSnapshot.ref);
      if (exact.length !== 1) throw new Error(`Remote ref ${gitSnapshot.ref} is missing or ambiguous`);
      if (exact[0].commitId !== gitSnapshot.commit) {
        throw new Error(`Remote ref ${gitSnapshot.ref} does not point to the current HEAD commit`);
      }
      value.refsType = value.data.refsType ?? value.refsType ?? 'BRANCH';
      value.refsTypeValue = gitSnapshot.ref;
      value.data.branch = gitSnapshot.ref;
      value.data.refsType = value.refsType;
      value.data.commitId = gitSnapshot.commit;
      value.data.commitMessage = exact[0].commitMessage;
    } else {
      warnings.push({ code: 'fixed-package-source', message: `${value.name ?? 'package source'} uses its existing remote configuration` });
    }
    sources.push(value);
  }
  const stages = selectedStages(detail, stageNames);
  const taskDataList = buildTaskData(detail, stages);
  const custom = buildParameters(detail, environment);
  return {
    body: {
      pipelineId: String(detail.pipeline.pipelineId),
      runSources: sources,
      taskDataList,
      triggerInfo: { triggerType: 0, triggerParams: {} },
      ...(custom.parameters.length ? { customParameterRuns: custom.parameters } : {}),
      autoFillRunConfig: false,
      runRemark: `oec-pipeline:${runKey}`,
    },
    stages: stages.names,
    warnings: [...warnings, ...custom.warnings],
  };
}

async function loadTokenFile(path, now, label) {
  const value = await readJson(path);
  if (!value) throw new Error(`${label} does not exist`);
  if (value.expiresAt <= now) throw new Error(`${label} expired; prepare again`);
  return value;
}

export class PipelineService {
  constructor({ client, dataDirectory, now = () => Date.now(), gitSnapshotFn = readGitSnapshot } = {}) {
    this.client = client;
    this.dataDirectory = dataDirectory;
    this.now = now;
    this.gitSnapshotFn = gitSnapshotFn;
  }

  async readyPlan({ workspaceUri, workspace, environment, gitSnapshot, candidate, stages }) {
    const runKey = token();
    const built = await buildRunRequest(this.client, environment, candidate.detail, gitSnapshot, stages, runKey);
    const createdAt = this.now();
    const plan = {
      kind: 'pipeline-run',
      workspaceUri,
      workspace,
      environment,
      git: gitSnapshot,
      pipeline: { id: candidate.id, name: candidate.name, spaceId: candidate.spaceId },
      stages: built.stages,
      configFingerprint: candidate.fingerprint,
      runKey,
      warnings: built.warnings,
      createdAt,
      expiresAt: createdAt + PLAN_TTL_MS,
    };
    const planToken = token();
    await atomicJson(planPath(planToken, this.dataDirectory), plan);
    return {
      status: 'ready',
      pipeline: plan.pipeline,
      environment,
      ref: gitSnapshot.ref,
      commit: gitSnapshot.commit,
      stages: plan.stages,
      warnings: plan.warnings,
      planToken,
      expiresAt: new Date(plan.expiresAt).toISOString(),
    };
  }

  async prepare({ workspaceUri, pipelineId, ref, environment, stages }, roots) {
    if (environment !== 'dev' && environment !== 'test') return { status: 'blocked', errors: ['Pipeline environment must be dev or test'] };
    const workspace = await resolveAuthorizedWorkspace(workspaceUri, roots);
    try {
      const gitSnapshot = await this.gitSnapshotFn(workspace, ref);
      let targetId = pipelineId?.trim();
      if (!targetId) {
        const config = await readJson(configPath(workspace, this.dataDirectory));
        if (config?.environment === environment && config?.remoteKey === gitSnapshot.remoteKey) targetId = config.pipelineId;
      }
      let candidates = await findCandidates(this.client, environment, gitSnapshot.remoteKey, targetId);
      if (targetId && candidates.length === 0 && !pipelineId) {
        candidates = await findCandidates(this.client, environment, gitSnapshot.remoteKey);
      }
      if (candidates.length === 0) return { status: 'blocked', errors: ['No existing pipeline exactly matches this Git workspace'] };
      if (candidates.length === 1) {
        return await this.readyPlan({ workspaceUri, workspace, environment, gitSnapshot, candidate: candidates[0], stages });
      }
      const createdAt = this.now();
      const selection = {
        kind: 'pipeline-target',
        workspaceUri,
        workspace,
        environment,
        git: gitSnapshot,
        stages,
        candidates: candidates.map(({ id, name, spaceId, stages: stageNames, fingerprint: value }) => ({
          id, name, spaceId, stages: stageNames, fingerprint: value,
        })),
        createdAt,
        expiresAt: createdAt + PLAN_TTL_MS,
      };
      const selectionToken = token();
      await atomicJson(selectionPath(selectionToken, this.dataDirectory), selection);
      return {
        status: 'needs_pipeline_selection',
        selectionToken,
        expiresAt: new Date(selection.expiresAt).toISOString(),
        candidates: selection.candidates.map(({ fingerprint: _value, ...candidate }) => candidate),
      };
    } catch (error) {
      return { status: 'blocked', errors: [error.message] };
    }
  }

  async selectTarget({ selectionToken, pipelineId }, roots) {
    const path = selectionPath(selectionToken, this.dataDirectory);
    const selection = await loadTokenFile(path, this.now(), 'Pipeline selection');
    if (selection.usedAt) throw new Error('Pipeline selection has already been used');
    const workspace = await resolveAuthorizedWorkspace(selection.workspaceUri, roots);
    if (workspace !== selection.workspace) throw new Error('Pipeline selection workspace changed');
    const gitSnapshot = await this.gitSnapshotFn(workspace, selection.git.ref);
    if (fingerprint(gitSnapshot) !== fingerprint(selection.git)) throw new Error('Git workspace changed after pipeline selection began');
    const selected = selection.candidates.find((candidate) => candidate.id === String(pipelineId));
    if (!selected) throw new Error('pipelineId was not returned for this selection');
    const current = await pipelineCandidate(this.client, selection.environment, selected.id, gitSnapshot.remoteKey);
    if (!current || current.fingerprint !== selected.fingerprint) {
      throw new Error('Selected pipeline changed or no longer matches the workspace');
    }
    const ready = await this.readyPlan({
      workspaceUri: selection.workspaceUri,
      workspace,
      environment: selection.environment,
      gitSnapshot,
      candidate: current,
      stages: selection.stages,
    });
    await atomicJson(configPath(workspace, this.dataDirectory), {
      environment: selection.environment,
      remoteKey: gitSnapshot.remoteKey,
      pipelineId: current.id,
      pipelineName: current.name,
      selectedAt: new Date(this.now()).toISOString(),
    });
    await atomicJson(path, { ...selection, usedAt: this.now() });
    return ready;
  }

  async execute({ planToken }, roots) {
    const plan = await loadTokenFile(planPath(planToken, this.dataDirectory), this.now(), 'Pipeline plan');
    if (plan.kind !== 'pipeline-run') throw new Error('planToken is not a pipeline-run plan');
    const workspace = await resolveAuthorizedWorkspace(plan.workspaceUri, roots);
    if (workspace !== plan.workspace) throw new Error('Pipeline workspace changed after prepare');
    const gitSnapshot = await this.gitSnapshotFn(workspace, plan.git.ref);
    if (fingerprint(gitSnapshot) !== fingerprint(plan.git)) throw new Error('Git remote, ref, or commit changed after pipeline prepare');
    const candidate = await pipelineCandidate(this.client, plan.environment, plan.pipeline.id, gitSnapshot.remoteKey);
    if (!candidate || candidate.fingerprint !== plan.configFingerprint) {
      throw new Error('Pipeline configuration changed after prepare');
    }
    const built = await buildRunRequest(this.client, plan.environment, candidate.detail, gitSnapshot, plan.stages, plan.runKey);
    if (fingerprint(built.warnings) !== fingerprint(plan.warnings)) throw new Error('Pipeline runtime configuration changed after prepare');
    let remote;
    let action = 'created';
    try {
      remote = await this.client.runPipeline(plan.environment, built.body);
    } catch (error) {
      const matches = (await this.client.listRuns(plan.environment, plan.pipeline.id))
        .filter((run) => run.runRemark === `oec-pipeline:${plan.runKey}`);
      if (matches.length === 1) {
        remote = matches[0];
        action = 'recovered-after-unknown-result';
      } else if (matches.length > 1) {
        return { status: 'blocked', errors: ['Pipeline run result is ambiguous; exact run marker matched multiple records'] };
      } else {
        const deterministic = /Pipeline API rejected|Injected Pipeline token|OAuth|environment|permission|denied/i.test(error.message);
        return { status: deterministic ? 'blocked' : 'partial', errors: [error.message] };
      }
    }
    const runToken = token();
    await atomicJson(runtimePath(runToken, this.dataDirectory), {
      workspaceUri: plan.workspaceUri,
      workspace,
      environment: plan.environment,
      pipeline: plan.pipeline,
      git: plan.git,
      stages: plan.stages,
      runKey: plan.runKey,
      runId: String(remote.id),
      createdAt: this.now(),
    });
    return { status: 'running', pipeline: plan.pipeline, runId: String(remote.id), runToken, action };
  }

  async status({ workspaceUri, runToken }, roots) {
    const runtime = await readJson(runtimePath(runToken, this.dataDirectory));
    if (!runtime) return { status: 'blocked', errors: ['Pipeline run token does not exist'] };
    const workspace = await resolveAuthorizedWorkspace(workspaceUri, roots);
    if (workspace !== runtime.workspace) {
      return { status: 'blocked', errors: ['Pipeline run token belongs to a different workspace'] };
    }
    const remote = await this.client.getRun(runtime.environment, runtime.runId);
    if (!remote) return { status: 'unknown', runId: runtime.runId, errors: ['Pipeline run is missing'] };
    if (remote.pipelineId !== runtime.pipeline.id || remote.runRemark !== `oec-pipeline:${runtime.runKey}`) {
      return { status: 'blocked', runId: runtime.runId, errors: ['Pipeline run identity drifted'] };
    }
    return {
      status: 'verified',
      environment: runtime.environment,
      pipeline: runtime.pipeline,
      ref: runtime.git.ref,
      commit: runtime.git.commit,
      stages: runtime.stages,
      run: remote,
    };
  }
}
