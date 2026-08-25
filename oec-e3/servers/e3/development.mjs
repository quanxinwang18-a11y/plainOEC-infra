import { createHash, randomBytes } from 'node:crypto';
import { join } from 'node:path';
import {
  atomicJson,
  escapeHtml,
  loadConfig,
  pluginDataRoot,
  readJson,
  requirementUrl,
  resolveAuthorizedWorkspace,
  storeSelection,
  taskUrl,
} from './publisher.mjs';
import { readMapping } from './mapping.mjs';
import {
  developmentMappingComplete,
  newDevelopmentMapping,
  readDevelopmentMapping,
  writeDevelopmentMapping,
} from './development-mapping.mjs';

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,}$/;
const CHANGE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{1,127}$/;
const LOCAL_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const PLAN_TTL_MS = 15 * 60 * 1000;

function selectionPath(token, dataDirectory) {
  if (!TOKEN_PATTERN.test(token)) throw new Error('Invalid development selection token');
  return join(pluginDataRoot(dataDirectory), 'development', 'selections', `${token}.json`);
}

function planPath(token, dataDirectory) {
  if (!TOKEN_PATTERN.test(token)) throw new Error('Invalid development plan token');
  return join(pluginDataRoot(dataDirectory), 'development', 'plans', `${token}.json`);
}

async function storeDevelopmentSelection(value, dataDirectory) {
  const token = randomBytes(32).toString('base64url');
  await atomicJson(selectionPath(token, dataDirectory), value);
  return token;
}

async function storeDevelopmentPlan(value, dataDirectory) {
  const token = randomBytes(32).toString('base64url');
  await atomicJson(planPath(token, dataDirectory), value);
  return token;
}

async function loadDevelopmentSelection(token, dataDirectory, now) {
  const value = await readJson(selectionPath(token, dataDirectory));
  if (!value) throw new Error('Development requirement selection does not exist');
  if (value.expiresAt <= now) throw new Error('Development requirement selection expired; prepare again');
  if (value.usedAt) throw new Error('Development requirement selection has already been used');
  return value;
}

async function loadDevelopmentPlan(token, dataDirectory, now) {
  const value = await readJson(planPath(token, dataDirectory));
  if (!value) throw new Error('Development task plan does not exist');
  if (value.expiresAt <= now) throw new Error('Development task plan expired; prepare again');
  return value;
}

function normalizeTasks(tasks) {
  if (!Array.isArray(tasks) || tasks.length === 0) throw new Error('tasks must contain at least one item');
  const seen = new Set();
  return tasks.map((task) => {
    const localId = String(task?.localId ?? '').trim();
    const title = String(task?.title ?? '').trim();
    const description = String(task?.description ?? '').trim();
    if (!LOCAL_ID_PATTERN.test(localId)) throw new Error(`Invalid task localId: ${localId || '<missing>'}`);
    if (seen.has(localId)) throw new Error(`Duplicate task localId: ${localId}`);
    if (!title) throw new Error(`${localId} requires a title`);
    if (!description) throw new Error(`${localId} requires a description`);
    seen.add(localId);
    const priority = task.priority ?? 'P2';
    if (!['P0', 'P1', 'P2', 'P3'].includes(priority)) throw new Error(`${localId} has invalid priority`);
    const estimatedHours = task.estimatedHours === undefined ? 4 : Number(task.estimatedHours);
    if (!Number.isFinite(estimatedHours) || estimatedHours <= 0 || estimatedHours > 999) {
      throw new Error(`${localId} estimatedHours must be greater than 0 and no more than 999`);
    }
    return {
      localId,
      title,
      description,
      priority,
      estimatedHours,
      remoteTitle: `[${localId}] ${title}`,
      descriptionHtml: `<p>${escapeHtml(description).replaceAll('\n', '<br>')}</p>`,
    };
  });
}

function normalizeSource(source = {}) {
  const requirementId = source.requirementId === undefined ? undefined : String(source.requirementId).trim();
  const prdVersion = source.prdVersion;
  const featureName = source.featureName;
  if (requirementId && (prdVersion || featureName)) {
    throw new Error('source must identify a requirement directly or through a PRD mapping, not both');
  }
  if (Boolean(prdVersion) !== Boolean(featureName)) {
    throw new Error('source.prdVersion and source.featureName must be provided together');
  }
  return { ...(requirementId ? { requirementId } : {}), ...(prdVersion ? { prdVersion, featureName } : {}) };
}

function taskFingerprint(changeId, requirementId, tasks, account) {
  return `sha256:${createHash('sha256').update(JSON.stringify({ changeId, requirementId, tasks, account })).digest('hex')}`;
}

function progressFingerprint(changeId, config, requirement, updates, tasks) {
  return `sha256:${createHash('sha256').update(JSON.stringify({
    changeId,
    spaceId: String(config.productSpace.id),
    requirementId: String(requirement.id),
    updates,
    tasks,
  })).digest('hex')}`;
}

function normalizeUpdates(updates) {
  if (!Array.isArray(updates) || updates.length === 0) throw new Error('updates must contain at least one item');
  const seen = new Set();
  return updates.map((update) => {
    const localId = String(update?.localId ?? '').trim();
    const action = update?.action;
    const worklog = update?.worklog === undefined ? undefined : String(update.worklog).trim();
    if (!LOCAL_ID_PATTERN.test(localId)) throw new Error(`Invalid update localId: ${localId || '<missing>'}`);
    if (seen.has(localId)) throw new Error(`Duplicate update localId: ${localId}`);
    if (!['start', 'log', 'complete'].includes(action)) throw new Error(`${localId} has invalid progress action`);
    if ((action === 'log' || action === 'complete') && !worklog) {
      throw new Error(`${localId} requires worklog for ${action}`);
    }
    const spentHours = update.spentHours === undefined ? undefined : Number(update.spentHours);
    if (spentHours !== undefined && (!Number.isFinite(spentHours) || spentHours < 0 || spentHours > 24)) {
      throw new Error(`${localId} spentHours must be between 0 and 24`);
    }
    seen.add(localId);
    return { localId, action, ...(worklog === undefined ? {} : { worklog }), ...(spentHours === undefined ? {} : { spentHours }) };
  });
}

function assertMappingIdentity(mapping, config, requirement) {
  if (!mapping) return;
  if (mapping.change_id !== undefined && mapping.change_id !== requirement.changeId) {
    throw new Error('development-mapping-change-mismatch');
  }
  if (String(mapping.product_space?.id) !== String(config.productSpace.id)) {
    throw new Error('development-mapping-space-mismatch');
  }
  if (String(mapping.requirement?.id) !== String(requirement.id)) {
    throw new Error('development-mapping-requirement-mismatch');
  }
}

function taskParentMatches(task, requirementId) {
  return !task.requirementId || String(task.requirementId) === String(requirementId);
}

async function resolveExistingTask(client, spaceId, requirementId, task, mapped) {
  if (mapped?.e3_task?.id) {
    const remote = await client.getTask(spaceId, mapped.e3_task.id);
    if (!remote) throw new Error(`remote-object-drift: mapped task ${mapped.e3_task.id} is missing`);
    if (remote.title !== task.remoteTitle || !taskParentMatches(remote, requirementId)) {
      throw new Error(`remote-object-drift: mapped task ${mapped.e3_task.id} identity changed`);
    }
    if (!remote.requirementId) {
      const parentTasks = await client.listTasks(spaceId, requirementId);
      const linked = parentTasks.find((item) => String(item.id) === String(remote.id));
      if (!linked || linked.title !== task.remoteTitle) {
        throw new Error(`remote-object-drift: mapped task ${mapped.e3_task.id} is not linked to its requirement`);
      }
    }
    return { ...remote, action: 'mapping' };
  }
  const matches = await client.findTasksByExactTitle(spaceId, requirementId, task.remoteTitle);
  if (matches.length > 1) throw new Error(`Ambiguous E3 tasks for exact title: ${task.remoteTitle}`);
  if (matches[0] && !taskParentMatches(matches[0], requirementId)) {
    throw new Error(`remote-object-drift: task ${matches[0].id} has a different parent requirement`);
  }
  return matches[0] ? { ...matches[0], action: 'query' } : null;
}

async function configuredOrSelection(client, workspace, dataDirectory, now) {
  const config = await loadConfig(workspace, dataDirectory);
  if (!config?.productSpace) {
    const candidates = await client.listSpaces();
    if (candidates.length === 0) return { result: { status: 'blocked', errors: ['E3 returned no product spaces'] } };
    const expiresAt = now + PLAN_TTL_MS;
    const selectionToken = await storeSelection({
      workspace,
      phase: 'space',
      candidates,
      createdAt: now,
      expiresAt,
    }, dataDirectory);
    return {
      result: {
        status: 'needs_space_selection',
        selectionToken,
        expiresAt: new Date(expiresAt).toISOString(),
        candidates,
      },
    };
  }
  if (!config.pompProject) {
    const candidates = await client.listPompProjects(config.productSpace.id);
    if (candidates.length === 0) return { result: { status: 'blocked', errors: ['no-pomp-projects'] } };
    const expiresAt = now + PLAN_TTL_MS;
    const selectionToken = await storeSelection({
      workspace,
      phase: 'pomp',
      selectedSpace: config.productSpace,
      candidates,
      createdAt: now,
      expiresAt,
    }, dataDirectory);
    return {
      result: {
        status: 'needs_pomp_selection',
        selectionToken,
        expiresAt: new Date(expiresAt).toISOString(),
        spaceId: String(config.productSpace.id),
        productSpace: config.productSpace.name,
        candidates,
      },
    };
  }
  return { config };
}

async function requirementFromSource(client, workspace, config, source = {}) {
  const metadata = await client.requirementMetadata(config.productSpace.id);
  let requirementId = source.requirementId;
  let expectedTitle;
  if (!requirementId && source.prdVersion && source.featureName) {
    const { mapping } = await readMapping(workspace, source.prdVersion);
    if (mapping?.product_space?.id && String(mapping.product_space.id) !== String(config.productSpace.id)) {
      throw new Error('PRD mapping belongs to a different E3 product space');
    }
    const mapped = mapping?.requirements?.find((item) => item.featureName === source.featureName);
    requirementId = mapped?.e3_requirement?.id;
    expectedTitle = mapped?.e3_requirement?.title;
    if (!requirementId) throw new Error('PRD mapping has no requirement for the requested featureName');
  }
  if (!requirementId) return { metadata, requirement: null };
  const requirement = await client.getRequirement(config.productSpace.id, metadata.workItemId, requirementId);
  if (!requirement) throw new Error(`Selected E3 requirement ${requirementId} is missing`);
  if (expectedTitle && requirement.title !== expectedTitle) throw new Error('remote-object-drift: mapped requirement title changed');
  return { metadata, requirement };
}

async function inspectTasks(client, workspace, changeId, config, requirement, tasks) {
  const { path, mapping } = await readDevelopmentMapping(workspace, changeId);
  assertMappingIdentity(mapping, config, { ...requirement, changeId });
  const planned = [];
  let create = 0;
  let reuse = 0;
  for (const task of tasks) {
    const mapped = mapping?.tasks?.find((item) => item.local_id === task.localId);
    if (mapped && mapped.title !== task.title) throw new Error(`development-task-changed: ${task.localId} title is immutable after mapping`);
    const remote = await resolveExistingTask(client, config.productSpace.id, requirement.id, task, mapped);
    if (remote) reuse += 1;
    else create += 1;
    planned.push({ localId: task.localId, title: task.remoteTitle, action: remote ? 'reuse' : 'create', id: remote?.id });
  }
  return { path, mapping, planned, counts: { createTasks: create, reuseTasks: reuse } };
}

function expectedTask(mappingTask) {
  return { remoteTitle: `[${mappingTask.local_id}] ${mappingTask.title}` };
}

function terminalStatus(task) {
  return task.status === '3' || task.status === '4';
}

function sameWorklog(logInfo, update) {
  const hoursMatch = update.spentHours === undefined
    || Number(logInfo.spentHours ?? 0) === Number(update.spentHours);
  return hoursMatch && String(logInfo.worklog ?? '') === update.worklog;
}

export class DevelopmentTaskService {
  constructor({ client, dataDirectory, now = () => Date.now() }) {
    this.client = client;
    this.dataDirectory = dataDirectory;
    this.now = now;
  }

  async readyPlan({ workspaceUri, workspace, changeId, config, requirement, tasks }) {
    const inspected = await inspectTasks(this.client, workspace, changeId, config, requirement, tasks);
    const account = await this.client.currentAccount();
    const createdAt = this.now();
    const plan = {
      kind: 'task-creation',
      workspaceUri,
      workspace,
      changeId,
      config,
      requirement,
      tasks,
      account,
      fingerprint: taskFingerprint(changeId, requirement.id, tasks, account),
      createdAt,
      expiresAt: createdAt + PLAN_TTL_MS,
    };
    const planToken = await storeDevelopmentPlan(plan, this.dataDirectory);
    return {
      status: 'ready',
      changeId,
      productSpace: config.productSpace.name,
      requirement: { id: requirement.id, title: requirement.title },
      tasks: inspected.planned,
      counts: inspected.counts,
      planToken,
      expiresAt: new Date(plan.expiresAt).toISOString(),
      mappingPath: inspected.path,
    };
  }

  async prepare({ workspaceUri, changeId, source, tasks }, roots) {
    if (!CHANGE_ID_PATTERN.test(changeId ?? '')) return { status: 'blocked', errors: ['Invalid changeId'] };
    const workspace = await resolveAuthorizedWorkspace(workspaceUri, roots);
    let normalized;
    let normalizedSource;
    try {
      normalized = normalizeTasks(tasks);
      normalizedSource = normalizeSource(source);
    } catch (error) {
      return { status: 'blocked', errors: [error.message] };
    }
    const configured = await configuredOrSelection(this.client, workspace, this.dataDirectory, this.now());
    if (configured.result) return { ...configured.result, changeId };
    try {
      const resolved = await requirementFromSource(this.client, workspace, configured.config, normalizedSource);
      if (resolved.requirement) {
        return await this.readyPlan({
          workspaceUri,
          workspace,
          changeId,
          config: configured.config,
          requirement: resolved.requirement,
          tasks: normalized,
        });
      }
      const candidates = await this.client.listRequirements(configured.config.productSpace.id);
      if (candidates.length === 0) return { status: 'blocked', changeId, errors: ['E3 returned no system requirements'] };
      if (candidates.length === 1) {
        return await this.readyPlan({
          workspaceUri,
          workspace,
          changeId,
          config: configured.config,
          requirement: candidates[0],
          tasks: normalized,
        });
      }
      const expiresAt = this.now() + PLAN_TTL_MS;
      const selectionToken = await storeDevelopmentSelection({
        workspaceUri,
        workspace,
        changeId,
        config: configured.config,
        tasks: normalized,
        candidateIds: candidates.map((item) => String(item.id)),
        createdAt: this.now(),
        expiresAt,
      }, this.dataDirectory);
      return {
        status: 'needs_requirement_selection',
        changeId,
        selectionToken,
        expiresAt: new Date(expiresAt).toISOString(),
        candidates: candidates.map((item) => ({ id: item.id, title: item.title })),
      };
    } catch (error) {
      return { status: 'blocked', changeId, errors: [error.message] };
    }
  }

  async selectRequirement({ selectionToken, requirementId }, roots) {
    const selection = await loadDevelopmentSelection(selectionToken, this.dataDirectory, this.now());
    const workspace = await resolveAuthorizedWorkspace(selection.workspaceUri, roots);
    if (workspace !== selection.workspace) throw new Error('Development selection workspace changed');
    if (!selection.candidateIds.includes(String(requirementId))) throw new Error('requirementId was not returned for this selection');
    const config = await loadConfig(workspace, this.dataDirectory);
    if (!config || String(config.productSpace.id) !== String(selection.config.productSpace.id)
        || String(config.pompProject.code) !== String(selection.config.pompProject.code)) {
      throw new Error('E3 workspace configuration changed after requirement selection began');
    }
    const metadata = await this.client.requirementMetadata(config.productSpace.id);
    const requirement = await this.client.getRequirement(config.productSpace.id, metadata.workItemId, requirementId);
    if (!requirement) throw new Error('Selected E3 requirement is no longer available');
    const current = await this.client.listRequirements(config.productSpace.id);
    if (!current.some((item) => String(item.id) === String(requirementId))) {
      throw new Error('Selected E3 requirement is no longer a current candidate');
    }
    await atomicJson(selectionPath(selectionToken, this.dataDirectory), { ...selection, usedAt: this.now() });
    return this.readyPlan({
      workspaceUri: selection.workspaceUri,
      workspace,
      changeId: selection.changeId,
      config,
      requirement,
      tasks: selection.tasks,
    });
  }

  async execute({ planToken }, roots) {
    const plan = await loadDevelopmentPlan(planToken, this.dataDirectory, this.now());
    if (plan.kind !== 'task-creation') throw new Error('planToken is not a development-task creation plan');
    const workspace = await resolveAuthorizedWorkspace(plan.workspaceUri, roots);
    if (workspace !== plan.workspace) throw new Error('Development task workspace changed after prepare');
    const config = await loadConfig(workspace, this.dataDirectory);
    if (!config || String(config.productSpace.id) !== String(plan.config.productSpace.id)
        || String(config.pompProject.code) !== String(plan.config.pompProject.code)) {
      throw new Error('E3 workspace configuration changed after development task prepare');
    }
    if (taskFingerprint(plan.changeId, plan.requirement.id, plan.tasks, plan.account) !== plan.fingerprint) {
      throw new Error('Development task plan fingerprint is invalid');
    }
    const account = await this.client.currentAccount();
    if (account !== plan.account) throw new Error('E3 account changed after development task prepare');
    const metadata = await this.client.requirementMetadata(config.productSpace.id);
    const requirement = await this.client.getRequirement(config.productSpace.id, metadata.workItemId, plan.requirement.id);
    if (!requirement || requirement.title !== plan.requirement.title) {
      throw new Error('remote-object-drift: selected requirement identity changed after prepare');
    }
    const existing = await readDevelopmentMapping(workspace, plan.changeId);
    assertMappingIdentity(existing.mapping, config, { ...requirement, changeId: plan.changeId });
    let mapping = existing.mapping ?? newDevelopmentMapping({
      changeId: plan.changeId,
      config,
      requirement: {
        ...requirement,
        url: requirementUrl(config.productSpace.id, requirement.id),
      },
    });
    mapping.sync_state = 'partial';
    let checkpoint = await writeDevelopmentMapping(workspace, plan.changeId, mapping);
    mapping = checkpoint.mapping;
    const changes = [];
    try {
      for (const task of plan.tasks) {
        let item = mapping.tasks.find((candidate) => candidate.local_id === task.localId);
        if (!item) {
          item = { local_id: task.localId, title: task.title, e3_task: null };
          mapping.tasks.push(item);
        }
        if (item.title !== task.title) throw new Error(`development-task-changed: ${task.localId} title is immutable after mapping`);
        let remote = await resolveExistingTask(this.client, config.productSpace.id, requirement.id, task, item);
        let action = remote ? 'reused' : 'created';
        if (!remote) {
          try {
            remote = await this.client.createTask(config.productSpace.id, requirement.id, config, task, account);
          } catch (error) {
            const matches = await this.client.findTasksByExactTitle(config.productSpace.id, requirement.id, task.remoteTitle);
            if (matches.length === 1) {
              [remote] = matches;
              action = 'reused-after-unknown-result';
            } else if (matches.length > 1) {
              throw new Error(`Task create result is ambiguous: ${task.remoteTitle}`);
            } else throw error;
          }
        }
        item.e3_task = {
          id: String(remote.id),
          title: task.remoteTitle,
          url: taskUrl(config.productSpace.id, remote.id),
          action,
        };
        changes.push({ localId: task.localId, id: String(remote.id), action });
        checkpoint = await writeDevelopmentMapping(workspace, plan.changeId, mapping);
        mapping = checkpoint.mapping;
      }
      mapping.sync_state = developmentMappingComplete(mapping) ? 'synced' : 'partial';
      checkpoint = await writeDevelopmentMapping(workspace, plan.changeId, mapping);
      return { status: checkpoint.mapping.sync_state, changeId: plan.changeId, mappingPath: checkpoint.path, changes };
    } catch (error) {
      mapping.sync_state = 'partial';
      mapping.last_error = error.message;
      checkpoint = await writeDevelopmentMapping(workspace, plan.changeId, mapping);
      const status = /remote-object-drift|Ambiguous|changed|mismatch/i.test(error.message) ? 'blocked' : 'partial';
      return { status, changeId: plan.changeId, mappingPath: checkpoint.path, changes, errors: [error.message] };
    }
  }

  async prepareProgress({ workspaceUri, changeId, updates }, roots) {
    if (!CHANGE_ID_PATTERN.test(changeId ?? '')) return { status: 'blocked', errors: ['Invalid changeId'] };
    const workspace = await resolveAuthorizedWorkspace(workspaceUri, roots);
    let normalized;
    try {
      normalized = normalizeUpdates(updates);
    } catch (error) {
      return { status: 'blocked', changeId, errors: [error.message] };
    }
    const config = await loadConfig(workspace, this.dataDirectory);
    const stored = await readDevelopmentMapping(workspace, changeId);
    if (!config?.productSpace || !config?.pompProject) {
      return { status: 'blocked', changeId, errors: ['E3 workspace configuration is incomplete'] };
    }
    if (!stored.mapping) return { status: 'blocked', changeId, errors: ['Development task mapping does not exist'] };
    try {
      assertMappingIdentity(stored.mapping, config, { ...stored.mapping.requirement, changeId });
      const snapshots = [];
      for (const update of normalized) {
        const mapped = stored.mapping.tasks.find((item) => item.local_id === update.localId);
        if (!mapped?.e3_task?.id) throw new Error(`Development task ${update.localId} is not mapped to E3`);
        const remote = await resolveExistingTask(
          this.client,
          config.productSpace.id,
          stored.mapping.requirement.id,
          expectedTask(mapped),
          mapped,
        );
        let logInfo;
        if (update.action === 'start') {
          if (terminalStatus(remote)) throw new Error(`${update.localId} is already in a terminal state`);
        } else {
          logInfo = await this.client.getTaskLogInfo(config.productSpace.id, remote.id);
          const status = String(remote.status ?? logInfo.status ?? '');
          if (status === '4') throw new Error(`${update.localId} is terminated and cannot receive progress`);
          if (status === '3' && (update.action !== 'complete' || !sameWorklog(logInfo, update))) {
            throw new Error(`${update.localId} is completed and the requested worklog does not match E3`);
          }
        }
        snapshots.push({
          localId: update.localId,
          id: String(remote.id),
          title: remote.title,
          requirementId: String(stored.mapping.requirement.id),
          status: remote.status,
          ...(logInfo ? { logInfo } : {}),
        });
      }
      const createdAt = this.now();
      const plan = {
        kind: 'task-progress',
        workspaceUri,
        workspace,
        changeId,
        config,
        requirement: stored.mapping.requirement,
        updates: normalized,
        tasks: snapshots,
        createdAt,
        expiresAt: createdAt + PLAN_TTL_MS,
      };
      plan.fingerprint = progressFingerprint(changeId, config, plan.requirement, normalized, snapshots);
      const planToken = await storeDevelopmentPlan(plan, this.dataDirectory);
      return {
        status: 'ready',
        changeId,
        productSpace: config.productSpace.name,
        requirement: plan.requirement,
        updates: snapshots.map((task, index) => ({
          localId: task.localId,
          taskId: task.id,
          action: normalized[index].action,
          status: task.status,
        })),
        planToken,
        expiresAt: new Date(plan.expiresAt).toISOString(),
        mappingPath: stored.path,
      };
    } catch (error) {
      return { status: 'blocked', changeId, mappingPath: stored.path, errors: [error.message] };
    }
  }

  async executeProgress({ planToken }, roots) {
    const plan = await loadDevelopmentPlan(planToken, this.dataDirectory, this.now());
    if (plan.kind !== 'task-progress') throw new Error('planToken is not a development-task progress plan');
    const workspace = await resolveAuthorizedWorkspace(plan.workspaceUri, roots);
    if (workspace !== plan.workspace) throw new Error('Development task workspace changed after progress prepare');
    const config = await loadConfig(workspace, this.dataDirectory);
    if (!config || String(config.productSpace.id) !== String(plan.config.productSpace.id)
        || String(config.pompProject.code) !== String(plan.config.pompProject.code)) {
      throw new Error('E3 workspace configuration changed after task-progress prepare');
    }
    if (progressFingerprint(plan.changeId, config, plan.requirement, plan.updates, plan.tasks) !== plan.fingerprint) {
      throw new Error('Development task progress plan fingerprint is invalid');
    }
    let stored = await readDevelopmentMapping(workspace, plan.changeId);
    if (!stored.mapping) throw new Error('Development task mapping disappeared after progress prepare');
    assertMappingIdentity(stored.mapping, config, { ...plan.requirement, changeId: plan.changeId });
    const changes = [];
    try {
      for (let index = 0; index < plan.updates.length; index += 1) {
        const update = plan.updates[index];
        const snapshot = plan.tasks[index];
        const mapped = stored.mapping.tasks.find((item) => item.local_id === update.localId);
        if (!mapped?.e3_task?.id || String(mapped.e3_task.id) !== snapshot.id) {
          throw new Error(`development-mapping-task-mismatch: ${update.localId}`);
        }
        const remote = await resolveExistingTask(
          this.client,
          config.productSpace.id,
          plan.requirement.id,
          expectedTask(mapped),
          mapped,
        );
        let action = update.action;
        if (update.action === 'start') {
          if (remote.status === '3' || remote.status === '4') throw new Error(`${update.localId} entered a terminal state`);
          if (remote.status !== '2') {
            try {
              await this.client.startTask(config.productSpace.id, remote.id);
            } catch (error) {
              const recovered = await this.client.getTask(config.productSpace.id, remote.id);
              if (recovered?.status !== '2') throw error;
              action = 'start-recovered';
            }
          } else action = 'already-started';
        } else {
          let logInfo = await this.client.getTaskLogInfo(config.productSpace.id, remote.id);
          const currentStatus = String(remote.status ?? logInfo.status ?? '');
          if (currentStatus === '4') throw new Error(`${update.localId} is terminated`);
          if (currentStatus === '3') {
            if (update.action !== 'complete' || !sameWorklog(logInfo, update)) {
              throw new Error(`${update.localId} is already completed with different progress`);
            }
            action = 'already-complete';
          } else {
            try {
              await this.client.writeTaskWorklog(config.productSpace.id, remote.id, logInfo, update);
            } catch (error) {
              logInfo = await this.client.getTaskLogInfo(config.productSpace.id, remote.id);
              const recovered = sameWorklog(logInfo, update)
                && (update.action !== 'complete' || String(logInfo.status ?? logInfo.progress) === '3'
                  || String(logInfo.progress) === '100');
              if (!recovered) throw error;
              action = `${update.action}-recovered`;
            }
          }
        }
        mapped.last_progress = {
          action: update.action,
          worklog: update.worklog,
          spent_hours: update.spentHours,
          remote_result: action,
          updated_at: new Date().toISOString(),
        };
        changes.push({ localId: update.localId, taskId: remote.id, action });
        stored = await writeDevelopmentMapping(workspace, plan.changeId, stored.mapping);
      }
      return { status: 'synced', changeId: plan.changeId, mappingPath: stored.path, changes };
    } catch (error) {
      const status = /drift|mismatch|terminal|terminated|completed/i.test(error.message) ? 'blocked' : 'partial';
      return { status, changeId: plan.changeId, mappingPath: stored.path, changes, errors: [error.message] };
    }
  }

  async status({ workspaceUri, changeId }, roots) {
    if (!CHANGE_ID_PATTERN.test(changeId ?? '')) return { status: 'blocked', errors: ['Invalid changeId'] };
    const workspace = await resolveAuthorizedWorkspace(workspaceUri, roots);
    const stored = await readDevelopmentMapping(workspace, changeId);
    if (!stored.mapping) return { status: 'partial', changeId, mappingPath: stored.path, tasks: [], errors: ['Development task mapping does not exist'] };
    const spaceId = stored.mapping.product_space?.id;
    const requirementId = stored.mapping.requirement?.id;
    if (!spaceId || !requirementId) {
      return { status: 'blocked', changeId, mappingPath: stored.path, tasks: [], errors: ['Development mapping identity is incomplete'] };
    }
    const tasks = [];
    for (const mapped of stored.mapping.tasks ?? []) {
      if (!mapped.e3_task?.id) {
        tasks.push({ localId: mapped.local_id, state: 'missing' });
        continue;
      }
      try {
        const remote = await resolveExistingTask(this.client, spaceId, requirementId, expectedTask(mapped), mapped);
        const logInfo = await this.client.getTaskLogInfo(spaceId, remote.id);
        tasks.push({
          localId: mapped.local_id,
          id: remote.id,
          title: remote.title,
          state: 'verified',
          status: remote.status ?? logInfo.status,
          progress: logInfo.progress,
          spentHours: logInfo.spentHours,
          worklog: logInfo.worklog,
          url: mapped.e3_task.url,
        });
      } catch (error) {
        tasks.push({
          localId: mapped.local_id,
          id: String(mapped.e3_task.id),
          state: /missing/i.test(error.message) ? 'missing' : 'drifted',
          error: error.message,
        });
      }
    }
    const state = tasks.some((task) => task.state === 'drifted')
      ? 'blocked'
      : tasks.some((task) => task.state === 'missing') || tasks.length === 0 ? 'partial' : 'synced';
    return { status: state, changeId, mappingPath: stored.path, productSpace: stored.mapping.product_space, requirement: stored.mapping.requirement, tasks };
  }
}
