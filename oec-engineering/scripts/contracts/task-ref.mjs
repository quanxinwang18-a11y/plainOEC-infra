import { lstat, readFile, readdir, realpath } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  ContractError,
  isInside,
  parseFrontmatter,
  relativePath,
  toPosix,
} from './common.mjs';
import {
  assertDevWritePath,
  resolveSourceRef,
  resolveWorkspaceRoots,
} from './workspace-source.mjs';

export const VERSION_ID = /^v\d+\.\d+\.\d+$/;
export const TASK_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const FEATURE_NAME = /^[a-z][A-Za-z0-9]*$/;
export const DATE_CHANGE_ID = /^\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const LEGACY_VERSION_CHANGE_ID = /^v\d+\.\d+\.\d+-[A-Za-z][A-Za-z0-9]*$/;
export const CHANGE_ID = /^(?:\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*|v\d+\.\d+\.\d+-[A-Za-z][A-Za-z0-9]*)$/;

const VERSIONED_REF = /^versioned:(v\d+\.\d+\.\d+)\/([a-z0-9]+(?:-[a-z0-9]+)*)$/;
const SHORT_VERSIONED_REF = /^(v\d+\.\d+\.\d+)\/([a-z0-9]+(?:-[a-z0-9]+)*)$/;
const VERSIONED_PATH = /^ai-docs\/versions\/(v\d+\.\d+\.\d+)\/dev-task\/([a-z0-9]+(?:-[a-z0-9]+)*)$/;
const CHANGE_ID_PATTERN = '(?:\\d{4}-\\d{2}-\\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*|v\\d+\\.\\d+\\.\\d+-[A-Za-z][A-Za-z0-9]*)';
const CHANGE_REF = new RegExp(`^change:(${CHANGE_ID_PATTERN})$`);
const CHANGE_PATH = new RegExp(`^ai-docs\\/engineering\\/changes\\/(${CHANGE_ID_PATTERN})$`);

function invalid(message) {
  return { ok: false, errors: [{ code: 'task-ref-invalid', path: '', message, severity: 'error' }] };
}

function camelToKebab(value) {
  return value
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase();
}

function parsedVersioned(version, taskSlug, extra = {}) {
  return {
    kind: 'versioned',
    version,
    taskSlug,
    ref: `versioned:${version}/${taskSlug}`,
    ...extra,
  };
}

function parsedChange(changeId, extra = {}) {
  return {
    kind: 'change',
    changeId,
    ref: `change:${changeId}`,
    ...extra,
  };
}

/**
 * Parse a human or canonical task reference without touching the filesystem.
 * Legacy version-feature IDs remain unresolved until resolveTaskRef can inspect the workspace.
 */
export function parseTaskRef(input) {
  if (typeof input !== 'string' || input.trim().length === 0) {
    throw new ContractError('task-ref-invalid', 'taskRef must be a non-empty string');
  }
  const value = input.trim();
  if (value.includes('\\') || value.startsWith('/') || /^[A-Za-z]:[\\/]/.test(value) || value.split('/').includes('..')) {
    throw new ContractError('task-ref-invalid', 'taskRef must be a safe repository-relative reference');
  }
  let match = VERSIONED_REF.exec(value) ?? SHORT_VERSIONED_REF.exec(value);
  if (match) return parsedVersioned(match[1], match[2]);
  match = VERSIONED_PATH.exec(value);
  if (match) return parsedVersioned(match[1], match[2], { inputPath: value });
  match = CHANGE_REF.exec(value) ?? CHANGE_PATH.exec(value);
  if (match) return parsedChange(match[1], { inputPath: value });
  if (LEGACY_VERSION_CHANGE_ID.test(value)) {
    const separator = value.indexOf('-', 1);
    const version = value.slice(0, separator);
    const featureName = value.slice(separator + 1);
    return {
      kind: 'legacy-id',
      legacyChangeId: value,
      version,
      featureName,
      ref: null,
    };
  }
  if (DATE_CHANGE_ID.test(value)) return parsedChange(value);
  throw new ContractError('task-ref-invalid', `unsupported taskRef: ${input}`);
}

function relativeTaskPath(parsed) {
  if (parsed.kind === 'versioned') return `ai-docs/versions/${parsed.version}/dev-task/${parsed.taskSlug}`;
  if (parsed.kind === 'change') return `ai-docs/engineering/changes/${parsed.changeId}`;
  throw new ContractError('task-ref-invalid', `cannot build a path for ${parsed.kind}`);
}

async function directoryState(devRoot, relativeTask) {
  const absolute = resolve(devRoot, relativeTask);
  if (!isInside(devRoot, absolute)) throw new ContractError('task-ref-path-escape', `task path escapes DEV_ROOT: ${relativeTask}`);
  try {
    const info = await lstat(absolute);
    if (info.isSymbolicLink()) throw new ContractError('task-ref-symlink-escape', `task directory is a symbolic link: ${relativeTask}`);
    if (!info.isDirectory()) throw new ContractError('task-ref-invalid', `task path is not a directory: ${relativeTask}`);
    const canonical = await realpath(absolute);
    if (!isInside(devRoot, canonical)) throw new ContractError('task-ref-symlink-escape', `task directory resolves outside DEV_ROOT: ${relativeTask}`);
    return { exists: true, absolutePath: canonical };
  } catch (error) {
    if (error.code === 'ENOENT') return { exists: false, absolutePath: absolute };
    if (error instanceof ContractError) throw error;
    throw error;
  }
}

async function readMetadata(absolutePath, relativeTask) {
  const metadata = {};
  let legacy = true;
  for (const name of ['spec.md', 'design.md', 'change.md', 'README.md']) {
    const path = join(absolutePath, name);
    try {
      const info = await lstat(path);
      if (info.isSymbolicLink() || !info.isFile()) continue;
      const text = await readFile(path, 'utf8');
      const parsed = parseFrontmatter(text, `${relativeTask}/${name}`, { required: false });
      if (Object.keys(parsed.metadata).length > 0) {
        legacy = false;
        if (name === 'spec.md') Object.assign(metadata, parsed.metadata);
        else {
          for (const [key, value] of Object.entries(parsed.metadata)) {
            if (metadata[key] === undefined) metadata[key] = value;
          }
        }
      }
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  return { metadata, legacy };
}

async function findLegacyId(devRoot, legacyChangeId) {
  const candidates = [];
  const directRelative = `ai-docs/engineering/changes/${legacyChangeId}`;
  const directState = await directoryState(devRoot, directRelative);
  if (directState.exists) {
    const info = await readMetadata(directState.absolutePath, directRelative);
    candidates.push({
      parsed: parsedChange(legacyChangeId, { legacy: info.legacy }),
      relativeTask: directRelative,
      state: directState,
      info,
    });
  }
  const version = legacyChangeId.slice(0, legacyChangeId.indexOf('-', 1));
  const featureName = legacyChangeId.slice(legacyChangeId.indexOf('-', 1) + 1);
  const expectedSlug = camelToKebab(featureName);
  const versionsRoot = resolve(devRoot, 'ai-docs', 'versions');
  try {
    const versions = await readdir(versionsRoot, { withFileTypes: true });
    for (const entry of versions) {
      if (!entry.isDirectory() || entry.isSymbolicLink() || entry.name !== version) continue;
      const taskRoot = resolve(versionsRoot, entry.name, 'dev-task');
      let tasks;
      try {
        tasks = await readdir(taskRoot, { withFileTypes: true });
      } catch (error) {
        if (error.code === 'ENOENT') continue;
        throw error;
      }
      for (const task of tasks) {
        if (!task.isDirectory() || task.isSymbolicLink() || !TASK_SLUG.test(task.name)) continue;
        const relativeTask = `ai-docs/versions/${version}/dev-task/${task.name}`;
        const state = await directoryState(devRoot, relativeTask);
        const info = await readMetadata(state.absolutePath, relativeTask);
        const metadataId = info.metadata.external_change_id ?? info.metadata.externalChangeId;
        const metadataFeature = info.metadata.feature_name ?? info.metadata.featureName;
        if (metadataId === legacyChangeId || metadataFeature === featureName || task.name === expectedSlug) {
          candidates.push({ parsed: parsedVersioned(version, task.name, {
            featureName: metadataFeature ?? featureName,
            externalChangeId: metadataId ?? legacyChangeId,
            legacy: info.legacy,
          }), relativeTask, state, info });
        }
      }
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  return candidates;
}

function artifactPaths(devRoot, relativeTask) {
  const absolute = resolve(devRoot, relativeTask);
  return {
    spec: toPosix(`${relativeTask}/spec.md`),
    design: toPosix(`${relativeTask}/design.md`),
    readme: toPosix(`${relativeTask}/README.md`),
    absoluteSpec: resolve(absolute, 'spec.md'),
    absoluteDesign: resolve(absolute, 'design.md'),
  };
}

function appendError(errors, error, fallbackCode = 'task-ref-invalid') {
  errors.push({
    code: error.code ?? fallbackCode,
    path: error.path ?? '',
    message: error.message,
    severity: 'error',
  });
}

/**
 * Resolve every accepted taskRef form to one canonical task object.
 * `allowMissing` is intended only for a creator such as plan-change.
 */
export async function resolveTaskRef({
  workspace,
  devRoot,
  productRoot,
  taskRef,
  changeId,
  path,
  version,
  taskSlug,
  featureName,
  source,
  allowMissing = false,
  requireSource = false,
} = {}) {
  const errors = [];
  const warnings = [];
  let roots;
  try {
    roots = await resolveWorkspaceRoots({ workspace, devRoot, productRoot });
  } catch (error) {
    appendError(errors, error, 'dev-root-invalid');
    return { ok: false, errors, warnings };
  }

  const hasVersionIdentity = version !== undefined || taskSlug !== undefined;
  const hasAnyIdentity = Boolean(taskRef || changeId || path || hasVersionIdentity);
  if (!hasAnyIdentity) return invalid('one of taskRef, changeId, path, or version/taskSlug is required');
  if (taskRef && changeId) return invalid('taskRef and changeId may not be supplied together');
  if (path && (taskRef || changeId || hasVersionIdentity)) return invalid('path may not be combined with another task identity');
  if ((version && !taskSlug) || (!version && taskSlug)) return invalid('version and taskSlug must be supplied together');

  let parsed;
  try {
    if (path) {
      const normalized = relativePath(roots.devRoot, path);
      const versionMatch = VERSIONED_PATH.exec(normalized);
      const changeMatch = CHANGE_PATH.exec(normalized);
      if (versionMatch) parsed = parsedVersioned(versionMatch[1], versionMatch[2], { inputPath: normalized });
      else if (changeMatch) parsed = parsedChange(changeMatch[1], { inputPath: normalized });
      else throw new ContractError('task-ref-invalid', 'path must point to a canonical task directory');
    } else if (version && taskSlug) {
      if (!VERSION_ID.test(version) || !TASK_SLUG.test(taskSlug)) throw new ContractError('task-ref-invalid', 'invalid version or task slug');
      parsed = parsedVersioned(version, taskSlug, { featureName });
    } else {
      parsed = parseTaskRef(taskRef ?? changeId);
    }
  } catch (error) {
    appendError(errors, error);
    return { ok: false, errors, warnings };
  }
  if (featureName !== undefined && !FEATURE_NAME.test(featureName)) {
    errors.push({ code: 'feature-name-invalid', path: '', message: 'featureName must match lowerCamelCase', severity: 'error' });
    return { ok: false, errors, warnings };
  }

  if (parsed.kind === 'legacy-id') {
    let candidates;
    try {
      candidates = await findLegacyId(roots.devRoot, parsed.legacyChangeId);
    } catch (error) {
      appendError(errors, error);
      return { ok: false, errors, warnings };
    }
    if (candidates.length > 1) {
      errors.push({ code: 'task-ref-ambiguous', path: '', message: `${parsed.legacyChangeId} matches multiple task directories`, severity: 'error' });
      return { ok: false, errors, warnings };
    }
    if (candidates.length === 1) {
      parsed = candidates[0].parsed;
    } else {
      const slug = camelToKebab(parsed.featureName);
      if (!TASK_SLUG.test(slug)) {
        errors.push({ code: 'task-ref-invalid', path: '', message: `cannot derive a task slug from ${parsed.featureName}`, severity: 'error' });
        return { ok: false, errors, warnings };
      }
      parsed = parsedVersioned(parsed.version, slug, {
        featureName: parsed.featureName,
        externalChangeId: parsed.legacyChangeId,
        legacyAlias: true,
      });
    }
  }

  const relativeTask = relativeTaskPath(parsed);
  let state;
  try {
    state = await directoryState(roots.devRoot, relativeTask);
    assertDevWritePath(roots, state.absolutePath);
  } catch (error) {
    appendError(errors, error);
    return { ok: false, errors, warnings };
  }
  if (!state.exists && !allowMissing) {
    errors.push({ code: 'task-ref-not-found', path: relativeTask, message: 'task directory does not exist', severity: 'error' });
  }

  let metadata = {};
  let legacy = Boolean(parsed.legacy);
  if (state.exists) {
    try {
      const info = await readMetadata(state.absolutePath, relativeTask);
      metadata = info.metadata;
      legacy ||= info.legacy;
      if (parsed.kind === 'change' && !metadata.task_ref && !metadata.taskRef) legacy = true;
    } catch (error) {
      appendError(errors, error);
    }
  }

  const metadataRef = metadata.task_ref ?? metadata.taskRef;
  if (metadataRef) {
    try {
      const normalizedMetadata = parseTaskRef(metadataRef);
      const expected = parsed.ref;
      const actual = normalizedMetadata.kind === 'versioned'
        ? normalizedMetadata.ref
        : normalizedMetadata.kind === 'change' ? normalizedMetadata.ref : null;
      if (actual && expected && actual !== expected) {
        errors.push({ code: 'task-identity-mismatch', path: `${relativeTask}/spec.md`, message: `task_ref must be ${expected}`, severity: 'error' });
      }
    } catch (error) {
      appendError(errors, error, 'task-identity-mismatch');
    }
  }

  const resolvedFeatureName = featureName
    ?? parsed.featureName
    ?? metadata.feature_name
    ?? metadata.featureName
    ?? metadata.source?.feature_name
    ?? metadata.source?.featureName;
  const externalChangeId = parsed.externalChangeId
    ?? metadata.external_change_id
    ?? metadata.externalChangeId
    ?? metadata.source?.external_change_id
    ?? metadata.source?.externalChangeId;
  const sourceDeclared = source !== undefined || metadata.source !== undefined || metadata.source_prd !== undefined;
  const sourceMetadata = source ?? metadata.source ?? {};
  let sourceResult = { ok: true, kind: 'none', errors: [], warnings: [] };
  if (sourceDeclared) {
    sourceResult = await resolveSourceRef(sourceMetadata, roots, {
      version: parsed.version,
      featureName: resolvedFeatureName,
      requireFiles: requireSource && state.exists,
      legacy: metadata,
    });
    errors.push(...sourceResult.errors);
    warnings.push(...sourceResult.warnings);
  }

  if (requireSource && !sourceResult.ok) {
    // Source errors are already included; keep the explicit requirement visible for callers.
    warnings.push({ code: 'source-required', path: relativeTask, message: 'a resolvable Product source is required for this operation', severity: 'warning' });
  }

  const artifacts = artifactPaths(roots.devRoot, relativeTask);
  return {
    ok: errors.length === 0,
    kind: parsed.kind,
    ref: parsed.ref,
    version: parsed.version ?? null,
    taskSlug: parsed.taskSlug ?? null,
    changeId: parsed.changeId ?? null,
    featureName: resolvedFeatureName ?? null,
    externalChangeId: externalChangeId ?? null,
    devRoot: roots.devRoot,
    productRoot: roots.productRoot,
    sameSpace: roots.sameSpace,
    rootDiscovery: roots.discovery,
    relativePath: relativeTask,
    absolutePath: state.absolutePath,
    artifacts,
    exists: state.exists,
    compatibility: legacy ? 'legacy' : state.exists ? 'native' : 'missing',
    metadata,
    source: sourceResult,
    errors,
    warnings,
  };
}

export function taskRefPath(ref) {
  const parsed = typeof ref === 'string' ? parseTaskRef(ref) : ref;
  if (parsed.kind === 'legacy-id') throw new ContractError('task-ref-invalid', 'legacy task IDs must be resolved before creating a path');
  return relativeTaskPath(parsed);
}

export { camelToKebab };
