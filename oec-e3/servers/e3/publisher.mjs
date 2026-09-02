import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, readdir, realpath, rename, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import YAML from 'yaml';
import { checkArtifacts } from '../../../packages/prd-artifact-contract/check-artifacts.mjs';
import { E3_ORIGIN } from './auth.mjs';
import { acquireExecutionLock } from './execution-lock.mjs';
import {
  adoptMappingCheckpoints,
  mappingCounts,
  mappingHasRemoteIds,
  mappingIsComplete,
  newMapping,
  readMapping,
  writeMapping,
} from './mapping.mjs';

const VERSION_PATTERN = /^v\d+\.\d+\.\d+$/;
const PLAN_TTL_MS = 15 * 60 * 1000;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,}$/;

function formatIssue(issue) {
  if (typeof issue === 'string') return issue;
  return `[${issue.code}] ${issue.path ? `${issue.path}: ` : ''}${issue.message}`;
}

function normalizeWarnings(...groups) {
  return groups.flat().filter(Boolean).map((warning) => (
    typeof warning === 'string' ? { code: 'handoff-warning', message: warning } : warning
  ));
}

function automaticPompProject(projects) {
  if (projects.length === 1) return projects[0];
  const defaults = projects.filter((item) => item.isDefault);
  return defaults.length === 1 ? defaults[0] : null;
}

async function loadValidatedPublishArtifacts(workspace, requestedVersion) {
  const gate = checkArtifacts({ workspace, version: requestedVersion, stage: 'pre-publish' });
  if (!gate.ok) {
    const error = new Error('PRD artifacts failed the pre-publish contract');
    error.issues = gate.errors;
    throw error;
  }
  const artifacts = await loadPublishArtifacts(workspace, gate.version);
  return { ...artifacts, warnings: normalizeWarnings(gate.warnings, artifacts.warnings) };
}

export function pluginDataRoot(value = process.env.OEC_PLUGIN_DATA) {
  if (!value) throw new Error('OEC_PLUGIN_DATA is not available');
  return resolve(value, 'e3');
}

export function workspaceKey(workspace) {
  return createHash('sha256').update(workspace).digest('hex');
}

export function configPath(workspace, dataDirectory) {
  return join(pluginDataRoot(dataDirectory), 'workspaces', workspaceKey(workspace), 'config.json');
}

function selectionPath(token, dataDirectory) {
  if (!TOKEN_PATTERN.test(token)) throw new Error('Invalid selection token');
  return join(pluginDataRoot(dataDirectory), 'selections', `${token}.json`);
}

function planPath(token, dataDirectory) {
  if (!TOKEN_PATTERN.test(token)) throw new Error('Invalid plan token');
  return join(pluginDataRoot(dataDirectory), 'plans', `${token}.json`);
}

export async function atomicJson(path, value) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${process.pid}.${randomBytes(8).toString('hex')}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, path);
}

export async function readJson(path) {
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

export async function loadConfig(workspace, dataDirectory) {
  return readJson(configPath(workspace, dataDirectory));
}

function sameConfig(left, right) {
  return left?.productSpace?.id === right?.productSpace?.id
    && left?.pompProject?.code === right?.pompProject?.code;
}

export function requirementUrl(spaceId, requirementId) {
  return `${E3_ORIGIN}/cloud-work/cyxt/panshi/storyManageNew/detail/${requirementId}?productId=${spaceId}&flowType=2`;
}

export function taskUrl(spaceId, taskId) {
  return `${E3_ORIGIN}/cloud-work/cyxt/panshi/staticdata/statictask/${taskId}?productId=${spaceId}`;
}

function assertRemoteTitle(remote, expected, type) {
  if (remote.title !== expected) {
    throw new Error(`remote-object-drift: mapped ${type} ${remote.id} title differs from ${expected}`);
  }
}

function assertTaskParent(task, requirementId) {
  if (task.requirementId && String(task.requirementId) !== String(requirementId)) {
    throw new Error(`remote-object-drift: mapped task ${task.id} belongs to another requirement`);
  }
}

function mappingCompatibility(mapping, artifacts, config) {
  if (!mapping) return { usableMapping: null, adoption: false, warnings: [] };
  const mappedSpaceId = mapping.product_space?.id;
  if (mappedSpaceId && String(mappedSpaceId) !== String(config.productSpace.id)) {
    throw new Error('mapping-space-mismatch: this PRD version is already bound to another E3 product space');
  }
  if (!mapping.artifact_fingerprint) {
    return {
      usableMapping: mapping,
      adoption: true,
      warnings: [{
        code: 'legacy-mapping-adoption',
        message: 'Legacy E3 record has no artifact fingerprint and will be adopted as schema v2 only after confirmation',
      }],
    };
  }
  if (mapping.artifact_fingerprint !== artifacts.fingerprint) {
    if (mappingHasRemoteIds(mapping)) {
      throw new Error('published-version-changed: this PRD version already has E3 objects; create a new PRD version');
    }
    return { usableMapping: null, adoption: false, warnings: [] };
  }
  return { usableMapping: mapping, adoption: false, warnings: [] };
}

async function resolveMappedRequirement(client, config, metadata, mappingItem, expectedTitle) {
  const id = mappingItem?.e3_requirement?.id;
  if (!id) return null;
  const found = await client.getRequirement(config.productSpace.id, metadata.workItemId, id);
  if (!found) return null;
  assertRemoteTitle(found, expectedTitle, 'requirement');
  return { id: String(id), title: found.title, source: 'mapping' };
}

async function resolveTask(client, config, requirementId, story, mappingItem) {
  const tasks = await client.listTasks(config.productSpace.id, requirementId);
  const mappedId = mappingItem?.e3_task?.id;
  if (mappedId) {
    const mapped = await client.getTask(config.productSpace.id, mappedId);
    if (mapped) {
      assertRemoteTitle(mapped, story.remoteTitle, 'task');
      assertTaskParent(mapped, requirementId);
      if (!tasks.some((item) => String(item.id) === String(mappedId))) {
        throw new Error(`remote-object-drift: mapped task ${mapped.id} is no longer under requirement ${requirementId}`);
      }
      return { ...mapped, source: 'mapping' };
    }
  }
  const matches = tasks.filter((item) => item.title === story.remoteTitle);
  if (matches.length > 1) throw new Error(`Ambiguous E3 tasks for exact title: ${story.remoteTitle}`);
  if (matches[0]) assertTaskParent(matches[0], requirementId);
  return matches[0] ?? null;
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
    let requirement = await resolveMappedRequirement(client, config, metadata, mapped, artifact.remoteTitle);
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
        const mappedTask = mapped?.story_tasks?.find((item) => item.story_id === story.id);
        task = await resolveTask(client, config, requirement.id, story, mappedTask);
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

export async function storeSelection(selection, dataDirectory, token = randomBytes(32).toString('base64url')) {
  await atomicJson(selectionPath(token, dataDirectory), selection);
  return token;
}

async function loadSelection(token, dataDirectory, now) {
  const selection = await readJson(selectionPath(token, dataDirectory));
  if (!selection) throw new Error('Selection does not exist');
  if (selection.expiresAt <= now) throw new Error('Selection expired; prepare again');
  if (selection.usedAt) throw new Error('Selection has already been completed');
  return selection;
}

async function assertSelectionWorkspace(selection, roots) {
  const workspace = await resolveAuthorizedWorkspace(pathToFileURL(selection.workspace).href, roots);
  if (workspace !== selection.workspace) throw new Error('Selection workspace changed after prepare');
  return workspace;
}

async function loadPlan(token, dataDirectory, now) {
  const plan = await readJson(planPath(token, dataDirectory));
  if (!plan) throw new Error('Publish plan does not exist');
  if (plan.expiresAt <= now) throw new Error('Publish plan expired; prepare a new plan');
  return plan;
}

async function reconcileRequirement(client, config, metadata, artifact, mappingItem) {
  let found = await resolveMappedRequirement(client, config, metadata, mappingItem, artifact.remoteTitle);
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

async function reconcileTask(client, config, account, requirementId, story, mappingItem) {
  let found = await resolveTask(client, config, requirementId, story, mappingItem);
  if (found) return { ...found, action: 'reused' };
  try {
    return { ...(await client.createTask(config.productSpace.id, requirementId, config, story, account)), action: 'created' };
  } catch (error) {
    found = await resolveTask(client, config, requirementId, story, null);
    if (found) return { ...found, action: 'reused-after-unknown-result' };
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
    let artifacts;
    try {
      artifacts = await loadValidatedPublishArtifacts(workspace, version);
    } catch (error) {
      return {
        status: 'blocked',
        version,
        errors: (error.issues ?? [error.message]).map(formatIssue),
      };
    }
    const config = await loadConfig(workspace, this.dataDirectory);
    if (!config?.productSpace) {
      const spaces = await this.client.listSpaces();
      const expiresAt = this.now() + PLAN_TTL_MS;
      const selectionToken = await storeSelection({
        workspace,
        phase: 'space',
        candidates: spaces,
        createdAt: this.now(),
        expiresAt,
      }, this.dataDirectory);
      return {
        status: 'needs_space_selection',
        version: artifacts.version,
        selectionToken,
        expiresAt: new Date(expiresAt).toISOString(),
        candidates: spaces,
      };
    }
    if (!config.pompProject) {
      const spaces = await this.client.listSpaces();
      const currentSpace = spaces.find((item) => String(item.id) === String(config.productSpace.id));
      if (!currentSpace) {
        return { status: 'blocked', version: artifacts.version, errors: ['Selected E3 product space is no longer available'] };
      }
      const projects = await this.client.listPompProjects(currentSpace.id);
      if (projects.length === 0) {
        return { status: 'blocked', version: artifacts.version, errors: ['no-pomp-projects: selected E3 space has no POMP projects'] };
      }
      const expiresAt = this.now() + PLAN_TTL_MS;
      const selectionToken = await storeSelection({
        workspace,
        phase: 'pomp',
        selectedSpace: currentSpace,
        candidates: projects,
        createdAt: this.now(),
        expiresAt,
      }, this.dataDirectory);
      return {
        status: 'needs_pomp_selection',
        version: artifacts.version,
        selectionToken,
        expiresAt: new Date(expiresAt).toISOString(),
        spaceId: String(currentSpace.id),
        productSpace: currentSpace.name,
        candidates: projects,
      };
    }
    try {
      const mappingResult = await readMapping(workspace, artifacts.version);
      const compatibility = mappingCompatibility(mappingResult.mapping, artifacts, config);
      const remote = await planRemoteObjects(this.client, config, artifacts.artifacts, compatibility.usableMapping);
      const warnings = normalizeWarnings(artifacts.warnings, compatibility.warnings, remote.metadata.warnings);
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
        warnings,
      };
    } catch (error) {
      return { status: 'blocked', version: artifacts.version, errors: [error.message] };
    }
  }

  async selectProductSpace({ selectionToken, spaceId, pompProjectCode }, roots) {
    const selection = await loadSelection(selectionToken, this.dataDirectory, this.now());
    const workspace = await assertSelectionWorkspace(selection, roots);
    const spaces = await this.client.listSpaces();
    const authorizedSpace = selection.phase === 'space'
      ? selection.candidates.find((item) => String(item.id) === String(spaceId))
      : selection.selectedSpace;
    if (!authorizedSpace || String(authorizedSpace.id) !== String(spaceId)) {
      throw new Error('spaceId was not returned for this selection');
    }
    const space = spaces.find((item) => String(item.id) === String(spaceId));
    if (!space) throw new Error('Selected E3 product space is no longer available');
    const projects = await this.client.listPompProjects(space.id);
    if (projects.length === 0) throw new Error('no-pomp-projects: selected E3 space has no POMP projects');
    if (selection.phase === 'space' && pompProjectCode) {
      throw new Error('pompProjectCode is not valid until POMP candidates are returned');
    }
    const authorizedProjectCodes = new Set(
      (selection.phase === 'pomp' ? selection.candidates : projects).map((item) => String(item.code)),
    );
    let selected = pompProjectCode
      ? projects.find((item) => item.code === String(pompProjectCode))
      : automaticPompProject(projects);
    if (pompProjectCode && (!selected || !authorizedProjectCodes.has(String(pompProjectCode)))) {
      throw new Error('pompProjectCode is not a candidate for this selection');
    }
    if (selected && !authorizedProjectCodes.has(String(selected.code))) {
      throw new Error('POMP candidates changed; prepare again');
    }
    if (!selected) {
      await atomicJson(configPath(workspace, this.dataDirectory), { productSpace: space, pendingPompSelection: true });
      await storeSelection({
        ...selection,
        phase: 'pomp',
        selectedSpace: space,
        candidates: projects,
      }, this.dataDirectory, selectionToken);
      return {
        status: 'needs_pomp_selection',
        selectionToken,
        expiresAt: new Date(selection.expiresAt).toISOString(),
        spaceId: String(space.id),
        productSpace: space.name,
        candidates: projects,
      };
    }
    const config = { productSpace: space, pompProject: selected, updatedAt: new Date(this.now()).toISOString() };
    await atomicJson(configPath(workspace, this.dataDirectory), config);
    await storeSelection({ ...selection, usedAt: this.now() }, this.dataDirectory, selectionToken);
    return { status: 'selected', productSpace: space.name, pompProject: selected.name };
  }

  async execute({ planToken }, roots) {
    const plan = await loadPlan(planToken, this.dataDirectory, this.now());
    const workspace = await resolveAuthorizedWorkspace(plan.workspaceUri, roots);
    if (workspace !== plan.workspace) throw new Error('Workspace root changed after prepare');
    const artifacts = await loadValidatedPublishArtifacts(workspace, plan.version);
    if (artifacts.fingerprint !== plan.fingerprint) throw new Error('PRD artifacts changed after prepare');
    const config = await loadConfig(workspace, this.dataDirectory);
    if (!sameConfig(config, plan.config)) throw new Error('E3 product-space configuration changed after prepare');

    const releaseLock = await acquireExecutionLock(
      pluginDataRoot(this.dataDirectory),
      `publication:${workspace}:${artifacts.version}`,
    );
    if (!releaseLock) {
      const current = await readMapping(workspace, artifacts.version);
      return {
        status: 'partial',
        recordPath: current.path,
        counts: mappingCounts(current.mapping),
        errors: ['E3 publication for this workspace version is already executing; query status and retry this plan after it finishes'],
      };
    }
    try {
    const existing = await readMapping(workspace, artifacts.version);
    const compatibility = mappingCompatibility(existing.mapping, artifacts, config);
    const metadata = await this.client.requirementMetadata(config.productSpace.id);
    const warnings = normalizeWarnings(artifacts.warnings, compatibility.warnings, metadata.warnings);
    try {
      await planRemoteObjects(this.client, config, artifacts.artifacts, compatibility.usableMapping);
    } catch (error) {
      return {
        status: 'blocked',
        recordPath: existing.path,
        counts: mappingCounts(existing.mapping),
        errors: [error.message],
      };
    }
    let mapping = compatibility.adoption || !compatibility.usableMapping
      ? adoptMappingCheckpoints(newMapping({
        version: artifacts.version,
        handoffPath: artifacts.handoffPath,
        fingerprint: artifacts.fingerprint,
        config,
        artifacts: artifacts.artifacts,
        warnings,
      }), compatibility.usableMapping)
      : compatibility.usableMapping;
    mapping.quality_gate = { ...mapping.quality_gate, warnings };
    mapping.sync_state = 'partial';
    let checkpoint = await writeMapping(workspace, artifacts.version, mapping);
    mapping = checkpoint.mapping;
    const changes = [];
    try {
      for (const artifact of artifacts.artifacts) {
        const mappingItem = mapping.requirements.find((item) => item.featureName === artifact.featureName);
        const requirement = await reconcileRequirement(this.client, config, metadata, artifact, mappingItem);
        mappingItem.e3_requirement = {
          id: requirement.id,
          title: artifact.remoteTitle,
          url: requirementUrl(config.productSpace.id, requirement.id),
          action: requirement.action,
        };
        changes.push({ type: 'requirement', featureName: artifact.featureName, ...requirement });
        checkpoint = await writeMapping(workspace, artifacts.version, mapping);
        mapping = checkpoint.mapping;

        for (const story of artifact.stories) {
          const taskItem = mappingItem.story_tasks.find((item) => item.story_id === story.id);
          const task = await reconcileTask(this.client, config, metadata.inChargeBy, requirement.id, story, taskItem);
          taskItem.e3_task = {
            id: task.id,
            title: story.remoteTitle,
            url: taskUrl(config.productSpace.id, task.id),
            action: task.action,
          };
          changes.push({ type: 'task', storyId: story.id, ...task });
          checkpoint = await writeMapping(workspace, artifacts.version, mapping);
          mapping = checkpoint.mapping;
        }
      }
      mapping.sync_state = mappingIsComplete(mapping) ? 'published' : 'partial';
      checkpoint = await writeMapping(workspace, artifacts.version, mapping);
      return { status: checkpoint.mapping.sync_state, recordPath: checkpoint.path, changes, counts: mappingCounts(checkpoint.mapping) };
    } catch (error) {
      mapping.sync_state = 'partial';
      mapping.last_error = error.message;
      checkpoint = await writeMapping(workspace, artifacts.version, mapping);
      const status = /remote-object-drift|Ambiguous E3/i.test(error.message) ? 'blocked' : 'partial';
      return { status, recordPath: checkpoint.path, changes, counts: mappingCounts(checkpoint.mapping), errors: [error.message] };
    }
    } finally {
      await releaseLock();
    }
  }

  async status({ workspaceUri, version }, roots) {
    const workspace = await resolveAuthorizedWorkspace(workspaceUri, roots);
    const artifacts = await loadValidatedPublishArtifacts(workspace, version);
    const { path, mapping } = await readMapping(workspace, artifacts.version);
    if (!mapping) return { status: 'blocked', recordPath: path, errors: ['E3 record does not exist'] };
    if (mapping.artifact_fingerprint && mapping.artifact_fingerprint !== artifacts.fingerprint) {
      return { status: 'blocked', recordPath: path, errors: ['E3 publication record fingerprint does not match current PRDs'] };
    }
    const config = await loadConfig(workspace, this.dataDirectory);
    const mappedSpace = mapping.product_space;
    const legacyMapping = mapping.schema_version < 2 || !mapping.artifact_fingerprint || !mappedSpace?.id;
    const verificationSpace = mappedSpace?.id ? mappedSpace : config?.productSpace;
    if (!verificationSpace?.id) {
      return {
        status: 'blocked',
        recordPath: path,
        errors: ['legacy-mapping-space-unknown: legacy E3 record has no product space and this workspace is not configured'],
      };
    }
    const warnings = [];
    if (mappedSpace?.id && config?.productSpace?.id
        && String(mappedSpace.id) !== String(config.productSpace.id)) {
      warnings.push({
        code: 'workspace-config-differs-from-mapping',
        message: 'The workspace configuration differs from this publication record; status used the recorded product space',
      });
    }
    if (legacyMapping) {
      warnings.push({
        code: 'legacy-mapping-adoption',
        message: 'Legacy E3 publication record is identity-verified but is not bound to the current artifact fingerprint and product space',
      });
    }
    const spaceId = verificationSpace.id;
    const metadata = await this.client.requirementMetadata(spaceId);
    const objects = [];
    let complete = true;
    let drifted = false;
    for (const requirement of mapping.requirements) {
      const artifact = artifacts.artifacts.find((item) => item.featureName === requirement.featureName);
      const requirementId = requirement.e3_requirement?.id;
      const remoteRequirement = requirementId
        ? await this.client.getRequirement(spaceId, metadata.workItemId, requirementId)
        : null;
      const exists = Boolean(remoteRequirement);
      const expectedRequirementTitle = artifact?.remoteTitle ?? requirement.e3_requirement?.title;
      const requirementDrifted = exists && remoteRequirement.title !== expectedRequirementTitle;
      if (!exists) complete = false;
      if (requirementDrifted) drifted = true;
      objects.push({
        type: 'requirement',
        featureName: requirement.featureName,
        id: requirementId,
        action: requirement.e3_requirement?.action ?? 'unknown',
        url: requirementId ? requirementUrl(spaceId, requirementId) : undefined,
        state: requirementDrifted ? 'drifted' : (exists ? 'verified' : 'missing'),
      });
      const remoteTasks = exists ? await this.client.listTasks(spaceId, requirementId) : [];
      for (const task of requirement.story_tasks ?? []) {
        const expectedStory = artifact?.stories.find((item) => item.id === task.story_id);
        const id = task.e3_task?.id;
        const remoteTask = id ? await this.client.getTask(spaceId, id) : null;
        const taskInExpectedParent = Boolean(id && remoteTasks.some((item) => String(item.id) === String(id)));
        const taskExists = Boolean(remoteTask);
        const taskDrifted = taskExists && (
          !taskInExpectedParent
          || remoteTask.title !== (expectedStory?.remoteTitle ?? task.e3_task?.title)
          || (remoteTask.requirementId && String(remoteTask.requirementId) !== String(requirementId))
        );
        if (!taskExists) complete = false;
        if (taskDrifted) drifted = true;
        objects.push({
          type: 'task',
          storyId: task.story_id,
          id,
          action: task.e3_task?.action ?? 'unknown',
          url: id ? taskUrl(spaceId, id) : undefined,
          state: taskDrifted ? 'drifted' : (taskExists ? 'verified' : 'missing'),
        });
      }
    }
    const status = drifted
      ? 'blocked'
      : (complete && mappingIsComplete(mapping) && !legacyMapping ? 'published' : 'partial');
    return { status, recordPath: path, counts: mappingCounts(mapping), objects, warnings };
  }
}
