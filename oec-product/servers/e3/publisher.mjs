import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, readdir, realpath, rename, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { E3_ORIGIN } from './auth.mjs';
import { mappingCounts, mappingIsComplete, newMapping, readMapping, writeMapping } from './mapping.mjs';

const VERSION_PATTERN = /^v\d+\.\d+\.\d+$/;
const PLAN_TTL_MS = 15 * 60 * 1000;

function pluginDataRoot(value = process.env.OEC_PLUGIN_DATA) {
  if (!value) throw new Error('OEC_PLUGIN_DATA is not available');
  return resolve(value, 'e3');
}

function configPath(dataDirectory) {
  return join(pluginDataRoot(dataDirectory), 'config.json');
}

function candidatesPath(dataDirectory) {
  return join(pluginDataRoot(dataDirectory), 'space-candidates.json');
}

function planPath(token, dataDirectory) {
  if (!/^[A-Za-z0-9_-]{32,}$/.test(token)) throw new Error('Invalid plan token');
  return join(pluginDataRoot(dataDirectory), 'plans', `${token}.json`);
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

function compareVersions(left, right) {
  const a = left.slice(1).split('.').map(Number);
  const b = right.slice(1).split('.').map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
}

async function latestVersion(workspace) {
  const entries = await readdir(join(workspace, 'ai-docs', 'versions'), { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory() && VERSION_PATTERN.test(entry.name))
    .map((entry) => entry.name).sort(compareVersions).at(-1);
}

function isWithin(root, target) {
  const value = relative(root, target);
  return value === '' || (value !== '..' && !value.startsWith(`..${sep}`) && !isAbsolute(value));
}

async function safeExistingFile(workspace, relativePath) {
  if (!relativePath || isAbsolute(relativePath)) throw new Error(`Unsafe artifact path: ${relativePath}`);
  const lexical = resolve(workspace, relativePath);
  if (!isWithin(workspace, lexical)) throw new Error(`Artifact path escapes workspace: ${relativePath}`);
  const canonical = await realpath(lexical);
  if (!isWithin(workspace, canonical)) throw new Error(`Artifact symlink escapes workspace: ${relativePath}`);
  if (!(await stat(canonical)).isFile()) throw new Error(`Artifact is not a file: ${relativePath}`);
  return canonical;
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
  const rootPaths = [];
  for (const root of roots ?? []) {
    try {
      const url = new URL(root.uri);
      if (url.protocol === 'file:') rootPaths.push(await realpath(fileURLToPath(url)));
    } catch {
      // Ignore non-file or unavailable client roots.
    }
  }
  if (!rootPaths.includes(requested)) throw new Error('workspaceUri is not one of the client-provided MCP roots');
  return requested;
}

function section(markdown, heading) {
  const match = new RegExp(`^### ${heading}\\s*$`, 'm').exec(markdown);
  if (!match) return '';
  const rest = markdown.slice(match.index + match[0].length);
  const next = /^### /m.exec(rest);
  return (next ? rest.slice(0, next.index) : rest).trim();
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function paragraphsToHtml(markdown) {
  return markdown.split(/\n{2,}/).map((block) => `<p>${escapeHtml(block.trim()).replaceAll('\n', '<br>')}</p>`).join('');
}

function descriptionHtml(childMarkdown, storyId) {
  const overview = section(childMarkdown, '模块概述');
  const stories = section(childMarkdown, '用户故事');
  const acceptance = section(childMarkdown, '验收标准');
  return [
    ['模块概述', overview],
    [`用户故事 ${storyId ?? ''}`.trim(), stories],
    ['验收标准', acceptance],
  ].filter(([, body]) => body).map(([heading, body]) => `<h2>${escapeHtml(heading)}</h2>${paragraphsToHtml(body)}`).join('');
}

function artifactFingerprint(files) {
  const hash = createHash('sha256');
  for (const file of [...files].sort((left, right) => left.path.localeCompare(right.path))) {
    hash.update(file.path).update('\0').update(file.content).update('\0');
  }
  return `sha256:${hash.digest('hex')}`;
}

export async function loadPublishArtifacts(workspace, requestedVersion) {
  const version = requestedVersion ?? await latestVersion(workspace);
  if (!version || !VERSION_PATTERN.test(version)) throw new Error('version must match vX.Y.Z');
  const handoffPath = `ai-docs/versions/${version}/prd/HANDOFF.yaml`;
  const handoffAbsolute = await safeExistingFile(workspace, handoffPath);
  const handoffContent = await readFile(handoffAbsolute, 'utf8');
  let handoff;
  try {
    handoff = YAML.parse(handoffContent);
  } catch (error) {
    throw new Error(`HANDOFF.yaml is invalid: ${error.message}`);
  }
  if (handoff?.schema_version !== 4 || handoff?.prd_version !== version) {
    throw new Error(`HANDOFF must use schema v4 and prd_version ${version}`);
  }
  if (!Array.isArray(handoff.sub_prds) || handoff.sub_prds.length === 0) {
    throw new Error('HANDOFF sub_prds must contain at least one child PRD');
  }

  const files = [{ path: handoffPath, content: handoffContent }];
  const seenFeatures = new Set();
  const seenStories = new Set();
  const artifacts = [];
  for (const child of handoff.sub_prds) {
    const featureName = child?.featureName;
    if (!/^[a-z][A-Za-z0-9]*$/.test(featureName ?? '') || seenFeatures.has(featureName)) {
      throw new Error(`Invalid or duplicate HANDOFF featureName: ${featureName ?? '<missing>'}`);
    }
    seenFeatures.add(featureName);
    const childPrd = String(child.file ?? child.child_prd ?? child.sub_prd_file ?? '').replaceAll('\\', '/').replace(/^\.\//, '');
    const expectedPath = `ai-docs/versions/${version}/prd/prd-${version}-${featureName}.md`;
    if (childPrd !== expectedPath) throw new Error(`${featureName} child PRD must be ${expectedPath}`);
    const absolute = await safeExistingFile(workspace, childPrd);
    const content = await readFile(absolute, 'utf8');
    const moduleMatch = new RegExp(`^## 模块:\\s*${featureName}\\s+[—-]\\s+(.+)$`, 'm').exec(content);
    if (!moduleMatch) throw new Error(`${childPrd} must contain exactly module ${featureName}`);
    for (const required of ['模块概述', '用户故事', '验收标准', '待确认事项']) {
      if (!section(content, required)) throw new Error(`${childPrd} is missing non-empty core section ${required}`);
    }
    const stories = (child.stories ?? []).map((story) => {
      const id = story?.id;
      if (!/^US-\d{3,}$/.test(id ?? '') || seenStories.has(id)) throw new Error(`Invalid or duplicate story ID: ${id ?? '<missing>'}`);
      seenStories.add(id);
      if (!new RegExp(`\\b${id}\\b`).test(section(content, '用户故事'))
          || !new RegExp(`\\b${id}\\b`).test(section(content, '验收标准'))) {
        throw new Error(`${id} must appear in both user stories and acceptance criteria of ${childPrd}`);
      }
      const title = story.title ?? id;
      return {
        id,
        title,
        priority: child.priority ?? 'P2',
        remoteTitle: `[${id}] ${title}`,
        descriptionHtml: descriptionHtml(content, id),
      };
    });
    if (stories.length === 0) throw new Error(`${featureName} has no HANDOFF stories`);
    files.push({ path: childPrd, content });
    artifacts.push({
      featureName,
      title: child.title ?? moduleMatch[1].trim(),
      priority: child.priority ?? 'P2',
      childPrd,
      remoteTitle: `[${version}] ${child.title ?? moduleMatch[1].trim()}`,
      descriptionHtml: descriptionHtml(content),
      stories,
    });
  }
  const warnings = Array.isArray(handoff.quality_gate?.warnings) ? handoff.quality_gate.warnings : [];
  return { version, handoffPath, artifacts, warnings, fingerprint: artifactFingerprint(files) };
}

async function loadConfig(dataDirectory) {
  return readJson(configPath(dataDirectory));
}

function sameConfig(left, right) {
  return left?.productSpace?.id === right?.productSpace?.id
    && left?.pompProject?.code === right?.pompProject?.code;
}

async function resolveMappedRequirement(client, config, metadata, mappingItem) {
  const id = mappingItem?.e3_requirement?.id;
  if (!id) return null;
  const found = await client.getRequirement(config.productSpace.id, metadata.workItemId, id);
  return found ? { id: String(id), title: mappingItem.e3_requirement.title, source: 'mapping' } : null;
}

async function planRemoteObjects(client, config, artifacts, mapping) {
  const metadata = await client.requirementMetadata(config.productSpace.id);
  const requirements = [];
  let createRequirements = 0;
  let reuseRequirements = 0;
  let createTasks = 0;
  let reuseTasks = 0;
  for (const artifact of artifacts) {
    const mapped = mapping?.requirements?.find((item) => item.featureName === artifact.featureName);
    let requirement = await resolveMappedRequirement(client, config, metadata, mapped);
    if (!requirement) {
      const matches = await client.findRequirementsByExactTitle(config.productSpace.id, artifact.remoteTitle);
      if (matches.length > 1) throw new Error(`Ambiguous E3 requirements for exact title: ${artifact.remoteTitle}`);
      requirement = matches[0] ? { ...matches[0], source: 'query' } : null;
    }
    if (requirement) reuseRequirements += 1;
    else createRequirements += 1;
    const tasks = [];
    for (const story of artifact.stories) {
      let task = null;
      if (requirement) {
        const mappedTask = mapped?.story_tasks?.find((item) => item.story_id === story.id)?.e3_task;
        const existing = await client.findTasksByExactTitle(config.productSpace.id, requirement.id, story.remoteTitle);
        if (existing.length > 1) throw new Error(`Ambiguous E3 tasks for exact title: ${story.remoteTitle}`);
        task = existing.find((item) => String(item.id) === String(mappedTask?.id)) ?? existing[0] ?? null;
      }
      if (task) reuseTasks += 1;
      else createTasks += 1;
      tasks.push({ storyId: story.id, title: story.remoteTitle, action: task ? 'reuse' : 'create', id: task?.id });
    }
    requirements.push({
      featureName: artifact.featureName,
      title: artifact.remoteTitle,
      action: requirement ? 'reuse' : 'create',
      id: requirement?.id,
      tasks,
    });
  }
  return { metadata, requirements, counts: { createRequirements, reuseRequirements, createTasks, reuseTasks } };
}

async function storePlan(plan, dataDirectory) {
  const token = randomBytes(32).toString('base64url');
  await atomicJson(planPath(token, dataDirectory), plan);
  return token;
}

async function loadPlan(token, dataDirectory, now) {
  const plan = await readJson(planPath(token, dataDirectory));
  if (!plan) throw new Error('Publish plan does not exist');
  if (plan.expiresAt <= now) throw new Error('Publish plan expired; prepare a new plan');
  return plan;
}

async function reconcileRequirement(client, config, metadata, artifact, mappingItem) {
  let found = await resolveMappedRequirement(client, config, metadata, mappingItem);
  if (found) return { ...found, action: 'reused' };
  let matches = await client.findRequirementsByExactTitle(config.productSpace.id, artifact.remoteTitle);
  if (matches.length > 1) throw new Error(`Ambiguous E3 requirements for exact title: ${artifact.remoteTitle}`);
  if (matches.length === 1) return { ...matches[0], action: 'reused' };
  try {
    return { ...(await client.createRequirement(config.productSpace.id, metadata, artifact)), action: 'created' };
  } catch (error) {
    matches = await client.findRequirementsByExactTitle(config.productSpace.id, artifact.remoteTitle);
    if (matches.length === 1) return { ...matches[0], action: 'reused-after-unknown-result' };
    if (matches.length > 1) throw new Error(`Requirement create result is ambiguous: ${artifact.remoteTitle}`);
    throw error;
  }
}

async function reconcileTask(client, config, account, requirementId, story) {
  let matches = await client.findTasksByExactTitle(config.productSpace.id, requirementId, story.remoteTitle);
  if (matches.length > 1) throw new Error(`Ambiguous E3 tasks for exact title: ${story.remoteTitle}`);
  if (matches.length === 1) return { ...matches[0], action: 'reused' };
  try {
    return { ...(await client.createTask(config.productSpace.id, requirementId, config, story, account)), action: 'created' };
  } catch (error) {
    matches = await client.findTasksByExactTitle(config.productSpace.id, requirementId, story.remoteTitle);
    if (matches.length === 1) return { ...matches[0], action: 'reused-after-unknown-result' };
    if (matches.length > 1) throw new Error(`Task create result is ambiguous: ${story.remoteTitle}`);
    throw error;
  }
}

export class PublisherService {
  constructor({ client, dataDirectory, now = () => Date.now() }) {
    this.client = client;
    this.dataDirectory = dataDirectory;
    this.now = now;
  }

  async prepare({ workspaceUri, version }, roots) {
    if (Number(process.versions.node.split('.')[0]) < 20) {
      return { status: 'blocked', errors: ['E3 MCP requires Node.js 20 or newer'] };
    }
    const workspace = await resolveAuthorizedWorkspace(workspaceUri, roots);
    const artifacts = await loadPublishArtifacts(workspace, version);
    const config = await loadConfig(this.dataDirectory);
    if (!config?.productSpace || !config?.pompProject) {
      const spaces = await this.client.listSpaces();
      await atomicJson(candidatesPath(this.dataDirectory), {
        expiresAt: this.now() + PLAN_TTL_MS,
        spaces,
      });
      return { status: 'needs_space_selection', version: artifacts.version, spaces };
    }
    try {
      const mappingResult = await readMapping(workspace, artifacts.version);
      const usableMapping = mappingResult.mapping?.artifact_fingerprint === artifacts.fingerprint
        && String(mappingResult.mapping?.product_space?.id) === String(config.productSpace.id)
        ? mappingResult.mapping : null;
      const remote = await planRemoteObjects(this.client, config, artifacts.artifacts, usableMapping);
      const plan = {
        workspaceUri,
        workspace,
        version: artifacts.version,
        fingerprint: artifacts.fingerprint,
        config,
        createdAt: this.now(),
        expiresAt: this.now() + PLAN_TTL_MS,
      };
      const planToken = await storePlan(plan, this.dataDirectory);
      return {
        status: 'ready',
        version: artifacts.version,
        planToken,
        expiresAt: new Date(plan.expiresAt).toISOString(),
        productSpace: config.productSpace.name,
        counts: remote.counts,
        requirements: remote.requirements,
        warnings: artifacts.warnings,
      };
    } catch (error) {
      return { status: 'blocked', version: artifacts.version, errors: [error.message] };
    }
  }

  async selectProductSpace({ spaceId, pompProjectCode }) {
    const candidates = await readJson(candidatesPath(this.dataDirectory));
    if (!candidates || candidates.expiresAt <= this.now()) throw new Error('Space candidates expired; prepare again');
    const space = candidates.spaces.find((item) => String(item.id) === String(spaceId));
    if (!space) throw new Error('spaceId was not returned by the most recent prepare call');
    const projects = await this.client.listPompProjects(space.id);
    let selected = pompProjectCode
      ? projects.find((item) => item.code === String(pompProjectCode))
      : projects.find((item) => item.isDefault) ?? (projects.length === 1 ? projects[0] : null);
    if (pompProjectCode && !selected) throw new Error('pompProjectCode is not a candidate for the selected space');
    if (!selected) {
      await atomicJson(configPath(this.dataDirectory), { productSpace: space, pendingPompSelection: true });
      return { status: 'needs_pomp_selection', productSpace: space.name, pompProjects: projects };
    }
    const config = { productSpace: space, pompProject: selected, updatedAt: new Date(this.now()).toISOString() };
    await atomicJson(configPath(this.dataDirectory), config);
    return { status: 'selected', productSpace: space.name, pompProject: selected.name };
  }

  async execute({ planToken }, roots) {
    const plan = await loadPlan(planToken, this.dataDirectory, this.now());
    const workspace = await resolveAuthorizedWorkspace(plan.workspaceUri, roots);
    if (workspace !== plan.workspace) throw new Error('Workspace root changed after prepare');
    const artifacts = await loadPublishArtifacts(workspace, plan.version);
    if (artifacts.fingerprint !== plan.fingerprint) throw new Error('PRD artifacts changed after prepare');
    const config = await loadConfig(this.dataDirectory);
    if (!sameConfig(config, plan.config)) throw new Error('E3 product-space configuration changed after prepare');

    const existing = await readMapping(workspace, artifacts.version);
    let mapping = existing.mapping?.artifact_fingerprint === artifacts.fingerprint
      && String(existing.mapping?.product_space?.id) === String(config.productSpace.id)
      ? existing.mapping
      : newMapping({
        version: artifacts.version,
        handoffPath: artifacts.handoffPath,
        fingerprint: artifacts.fingerprint,
        config,
        artifacts: artifacts.artifacts,
        warnings: artifacts.warnings,
      });
    mapping.sync_state = 'partial';
    let checkpoint = await writeMapping(workspace, artifacts.version, mapping);
    mapping = checkpoint.mapping;
    const changes = [];
    try {
      const metadata = await this.client.requirementMetadata(config.productSpace.id);
      for (const artifact of artifacts.artifacts) {
        const mappingItem = mapping.requirements.find((item) => item.featureName === artifact.featureName);
        const requirement = await reconcileRequirement(this.client, config, metadata, artifact, mappingItem);
        mappingItem.e3_requirement = {
          id: requirement.id,
          title: artifact.remoteTitle,
          url: `${E3_ORIGIN}/cloud-work/cyxt/panshi/storyManageNew/detail/${requirement.id}?productId=${config.productSpace.id}&flowType=2`,
          action: requirement.action,
        };
        changes.push({ type: 'requirement', featureName: artifact.featureName, ...requirement });
        checkpoint = await writeMapping(workspace, artifacts.version, mapping);
        mapping = checkpoint.mapping;

        for (const story of artifact.stories) {
          const task = await reconcileTask(this.client, config, metadata.inChargeBy, requirement.id, story);
          const taskItem = mappingItem.story_tasks.find((item) => item.story_id === story.id);
          taskItem.e3_task = { id: task.id, title: story.remoteTitle, action: task.action };
          changes.push({ type: 'task', storyId: story.id, ...task });
          checkpoint = await writeMapping(workspace, artifacts.version, mapping);
          mapping = checkpoint.mapping;
        }
      }
      mapping.sync_state = mappingIsComplete(mapping) ? 'published' : 'partial';
      checkpoint = await writeMapping(workspace, artifacts.version, mapping);
      return { status: checkpoint.mapping.sync_state, mappingPath: checkpoint.path, changes, counts: mappingCounts(checkpoint.mapping) };
    } catch (error) {
      mapping.sync_state = 'partial';
      mapping.last_error = error.message;
      checkpoint = await writeMapping(workspace, artifacts.version, mapping);
      return { status: 'partial', mappingPath: checkpoint.path, changes, counts: mappingCounts(checkpoint.mapping), errors: [error.message] };
    }
  }

  async status({ workspaceUri, version }, roots) {
    const workspace = await resolveAuthorizedWorkspace(workspaceUri, roots);
    const artifacts = await loadPublishArtifacts(workspace, version);
    const config = await loadConfig(this.dataDirectory);
    if (!config?.productSpace || !config?.pompProject) return { status: 'blocked', errors: ['E3 product space is not configured'] };
    const { path, mapping } = await readMapping(workspace, artifacts.version);
    if (!mapping) return { status: 'blocked', mappingPath: path, errors: ['E3 mapping does not exist'] };
    if (mapping.artifact_fingerprint && mapping.artifact_fingerprint !== artifacts.fingerprint) {
      return { status: 'blocked', mappingPath: path, errors: ['Mapping artifact fingerprint does not match current PRDs'] };
    }
    const metadata = await this.client.requirementMetadata(config.productSpace.id);
    const objects = [];
    let complete = true;
    for (const requirement of mapping.requirements) {
      const requirementId = requirement.e3_requirement?.id;
      const exists = requirementId
        ? Boolean(await this.client.getRequirement(config.productSpace.id, metadata.workItemId, requirementId))
        : false;
      if (!exists) complete = false;
      objects.push({
        type: 'requirement',
        featureName: requirement.featureName,
        id: requirementId,
        action: requirement.e3_requirement?.action ?? 'unknown',
        state: exists ? 'verified' : 'missing',
      });
      const remoteTasks = exists ? await this.client.listTasks(config.productSpace.id, requirementId) : [];
      for (const task of requirement.story_tasks ?? []) {
        const id = task.e3_task?.id;
        const taskExists = id && remoteTasks.some((item) => String(item.id ?? item.taskId) === String(id));
        if (!taskExists) complete = false;
        objects.push({
          type: 'task',
          storyId: task.story_id,
          id,
          action: task.e3_task?.action ?? 'unknown',
          state: taskExists ? 'verified' : 'missing',
        });
      }
    }
    const status = complete && mappingIsComplete(mapping) ? 'published' : 'partial';
    return { status, mappingPath: path, counts: mappingCounts(mapping), objects };
  }
}
