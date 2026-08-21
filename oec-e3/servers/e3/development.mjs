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

function taskFingerprint(changeId, requirementId, tasks) {
  return `sha256:${createHash('sha256').update(JSON.stringify({ changeId, requirementId, tasks })).digest('hex')}`;
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

export class DevelopmentTaskService {
  constructor({ client, dataDirectory, now = () => Date.now() }) {
    this.client = client;
    this.dataDirectory = dataDirectory;
    this.now = now;
  }

  async readyPlan({ workspaceUri, workspace, changeId, config, requirement, tasks }) {
    const inspected = await inspectTasks(this.client, workspace, changeId, config, requirement, tasks);
    const createdAt = this.now();
    const plan = {
      workspaceUri,
      workspace,
      changeId,
      config,
      requirement,
      tasks,
      fingerprint: taskFingerprint(changeId, requirement.id, tasks),
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
    const workspace = await resolveAuthorizedWorkspace(plan.workspaceUri, roots);
    if (workspace !== plan.workspace) throw new Error('Development task workspace changed after prepare');
    const config = await loadConfig(workspace, this.dataDirectory);
    if (!config || String(config.productSpace.id) !== String(plan.config.productSpace.id)
        || String(config.pompProject.code) !== String(plan.config.pompProject.code)) {
      throw new Error('E3 workspace configuration changed after development task prepare');
    }
    if (taskFingerprint(plan.changeId, plan.requirement.id, plan.tasks) !== plan.fingerprint) {
      throw new Error('Development task plan fingerprint is invalid');
    }
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
    const account = await this.client.currentAccount();
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
}
