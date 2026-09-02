import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import YAML from 'yaml';
import {
  ContractError,
  canonicalDirectory,
  issue,
  isInside,
  relativePath,
  safeExistingFile,
} from './common.mjs';

const VERSION_ID = /^v\d+\.\d+\.\d+$/;
const FEATURE_NAME = /^[a-z][A-Za-z0-9]*$/;
const STORY_ID = /^US-\d{3,}$/;
const ROOT_NAMES = new Set(['product', 'dev', 'external']);
const execFileAsync = promisify(execFile);

function normalizeArtifactPath(value) {
  if (typeof value !== 'string') return '';
  let normalized = value.trim().replaceAll('\\', '/').replace(/^\.\//, '');
  if (normalized.startsWith('versions/')) normalized = `ai-docs/${normalized}`;
  return normalized;
}

function sourceValue(source, snake, camel) {
  return source?.[snake] ?? source?.[camel];
}

function pathVersion(path) {
  const match = /(?:^|\/)versions\/(v\d+\.\d+\.\d+)\//.exec(path);
  return match?.[1] ?? null;
}

function storyIds(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => typeof item === 'string' ? item : item?.id)
    .filter((item) => typeof item === 'string');
}

function uniqueSorted(values) {
  return [...new Set(values)].sort();
}

async function readSourceFile(root, path, errors, warnings, { parseYaml = false, required = true } = {}) {
  try {
    const file = await safeExistingFile(root, path, 'source');
    const text = await readFile(file.absolutePath, 'utf8');
    if (!parseYaml) return { ...file, text, value: null };
    try {
      return { ...file, text, value: YAML.parse(text) };
    } catch (error) {
      errors.push(issue('source-yaml-invalid', path, error.message));
    }
  } catch (error) {
    if (!required && error.code === 'source-missing') {
      warnings.push(issue('source-unverified', path, 'source file is not present in the selected root', 'warning'));
    } else {
      errors.push(issue(error.code ?? 'source-file-invalid', path, error.message));
    }
  }
  return null;
}

async function legacySuperprojectRoot(candidate) {
  try {
    const result = await execFileAsync('git', ['-C', candidate, 'rev-parse', '--show-superproject-working-tree'], {
      encoding: 'utf8',
      timeout: 1500,
      windowsHide: true,
    });
    const value = result.stdout.trim();
    return value || null;
  } catch {
    return null;
  }
}

export async function resolveWorkspaceRoots({
  workspace,
  devRoot,
  productRoot,
  env = process.env,
  cwd = process.cwd(),
} = {}) {
  const explicitlyBoundDev = Boolean(devRoot || workspace || env.OEC_DEV_ROOT);
  const devInput = devRoot ?? workspace ?? env.OEC_DEV_ROOT ?? cwd;
  let resolvedDevRoot = await canonicalDirectory(devInput, 'dev-root-invalid');
  if (workspace && devRoot) {
    const resolvedWorkspace = await canonicalDirectory(workspace, 'dev-root-invalid');
    if (resolvedWorkspace !== resolvedDevRoot) {
      throw new ContractError('dev-root-conflict', '--workspace and --dev-root refer to different paths');
    }
  }
  const productInput = productRoot ?? env.OEC_PRODUCT_ROOT;
  let resolvedProductRoot = productInput
    ? await canonicalDirectory(productInput, 'product-root-invalid')
    : null;
  let discovery = explicitlyBoundDev ? 'explicit' : 'cwd';
  if (!resolvedProductRoot && !explicitlyBoundDev) {
    const superproject = await legacySuperprojectRoot(resolvedDevRoot);
    if (superproject) {
      try {
        const resolvedSuperproject = await canonicalDirectory(superproject, 'dev-root-invalid');
        if (resolvedSuperproject !== resolvedDevRoot) {
          resolvedProductRoot = resolvedDevRoot;
          resolvedDevRoot = resolvedSuperproject;
          discovery = 'git-submodule';
        }
      } catch {
        // A stale Git superproject path is not sufficient evidence to change workspace roots.
      }
    }
  }
  return {
    devRoot: resolvedDevRoot,
    productRoot: resolvedProductRoot,
    sameSpace: Boolean(resolvedProductRoot && resolvedProductRoot === resolvedDevRoot),
    discovery,
  };
}

export function assertDevWritePath(roots, targetAbsolute) {
  if (!isInside(roots.devRoot, targetAbsolute)) {
    throw new ContractError('dev-write-escape', 'write target is outside DEV_ROOT');
  }
  if (roots.productRoot && !roots.sameSpace && isInside(roots.productRoot, targetAbsolute)) {
    throw new ContractError('product-write-forbidden', 'Engineering may not write inside Product Root (PRODUCT_ROOT)');
  }
  return targetAbsolute;
}

function chooseRoot(source, roots, { requireLocal = false } = {}) {
  const requested = source.root ?? source.source_root;
  if (requested && requested !== 'inferred' && !ROOT_NAMES.has(requested)) {
    throw new ContractError('source-root-invalid', `source.root must be product, dev, or external: ${requested}`);
  }
  if (requested === 'external') return { role: 'external', root: null };
  if (requested === 'product') {
    if (!roots.productRoot) {
      if (!requireLocal) return { role: 'product', root: null };
      throw new ContractError('product-root-required', 'PRODUCT_ROOT is required for a product source');
    }
    return { role: 'product', root: roots.productRoot };
  }
  if (requested === 'dev') return { role: 'dev', root: roots.devRoot };
  if (roots.productRoot) return { role: 'product', root: roots.productRoot };
  if (!requireLocal) return { role: 'dev', root: roots.devRoot };
  throw new ContractError('product-root-required', 'PRODUCT_ROOT is required to resolve a Product source');
}

function normalizeSource(source = {}, legacy = {}) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) source = {};
  const prdPath = sourceValue(source, 'prd_path', 'prdPath')
    ?? legacy.source_prd
    ?? legacy.sourcePrd;
  const handoffPath = sourceValue(source, 'handoff_path', 'handoffPath');
  const stories = sourceValue(source, 'stories', 'storyIds') ?? legacy.source_stories ?? legacy.sourceStories;
  const kind = source.kind ?? (prdPath || handoffPath ? 'product' : 'none');
  const root = source.root ?? source.source_root ?? (kind === 'product' ? 'inferred' : undefined);
  return {
    kind,
    root,
    repository: source.repository,
    revision: source.revision,
    prdPath: prdPath ? normalizeArtifactPath(prdPath) : undefined,
    handoffPath: handoffPath ? normalizeArtifactPath(handoffPath) : undefined,
    stories: stories === undefined ? undefined : storyIds(stories),
    featureName: source.feature_name ?? source.featureName,
    reference: source.reference,
  };
}

async function validateProductFiles(normalized, root, errors, warnings, {
  version,
  featureName,
  requireFiles,
} = {}) {
  const result = {
    prd: null,
    handoff: null,
    version: pathVersion(normalized.prdPath ?? normalized.handoffPath ?? ''),
    featureName: featureName ?? normalized.featureName ?? null,
    stories: uniqueSorted(normalized.stories ?? []),
  };
  if (featureName && normalized.featureName && featureName !== normalized.featureName) {
    errors.push(issue('source-feature-mismatch', normalized.handoffPath ?? normalized.prdPath ?? '', `source feature_name must be ${featureName}`));
  }
  if (normalized.prdPath) {
    result.prd = await readSourceFile(root, normalized.prdPath, errors, warnings, { required: requireFiles });
    if (result.prd && !result.prd.text.trim()) errors.push(issue('source-file-empty', normalized.prdPath, 'Product source file is empty'));
  } else if (requireFiles) {
    errors.push(issue('source-prd-missing', '', 'Product source requires prd_path'));
  }
  if (normalized.handoffPath) {
    result.handoff = await readSourceFile(root, normalized.handoffPath, errors, warnings, { parseYaml: true, required: requireFiles });
    const handoff = result.handoff?.value;
    if (handoff && typeof handoff !== 'object') {
      errors.push(issue('handoff-invalid', normalized.handoffPath, 'HANDOFF must be a YAML mapping'));
    } else if (handoff) {
      if (handoff.schema_version !== 4) {
        if (requireFiles) errors.push(issue('handoff-schema', normalized.handoffPath, 'HANDOFF schema_version must be 4'));
        else warnings.push(issue('handoff-schema', normalized.handoffPath, 'HANDOFF schema_version is not 4', 'warning'));
      }
      const handoffVersion = handoff.prd_version;
      if (!VERSION_ID.test(handoffVersion ?? '')) {
        if (requireFiles) errors.push(issue('handoff-version-invalid', normalized.handoffPath, 'HANDOFF prd_version must use vX.Y.Z'));
        else warnings.push(issue('handoff-version-invalid', normalized.handoffPath, 'HANDOFF prd_version is missing or invalid', 'warning'));
      } else if (version && handoffVersion !== version) {
        errors.push(issue('source-version-mismatch', normalized.handoffPath, `HANDOFF version must be ${version}`));
      }
      const children = Array.isArray(handoff.sub_prds) ? handoff.sub_prds : [];
      if (children.length === 0) {
        if (requireFiles) errors.push(issue('handoff-sub-prds-empty', normalized.handoffPath, 'HANDOFF sub_prds must contain at least one item'));
        else warnings.push(issue('handoff-sub-prds-empty', normalized.handoffPath, 'HANDOFF has no sub_prds', 'warning'));
      }
      if (featureName) {
        const child = children.find((item) => item?.featureName === featureName);
        if (!child) errors.push(issue('source-feature-missing', normalized.handoffPath, `${featureName} is absent from HANDOFF`));
        else {
          result.featureName = featureName;
          const expectedStories = uniqueSorted(storyIds(child.stories));
          if (result.stories.length > 0 && expectedStories.join('|') !== result.stories.join('|')) {
            errors.push(issue('source-story-mismatch', normalized.handoffPath, `${featureName} HANDOFF stories differ from task source`));
          }
          result.stories = expectedStories;
          const childPath = normalizeArtifactPath(child.file);
          const expectedChildPath = version
            ? `ai-docs/versions/${version}/prd/prd-${version}-${featureName}.md`
            : null;
          if (!childPath) {
            if (requireFiles) errors.push(issue('source-prd-missing', normalized.handoffPath, `${featureName} HANDOFF entry has no child PRD path`));
          } else if (expectedChildPath && childPath !== expectedChildPath) {
            errors.push(issue('source-prd-mismatch', normalized.handoffPath, `HANDOFF child path must be ${expectedChildPath}`));
          } else if (normalized.prdPath && childPath !== normalized.prdPath) {
            errors.push(issue('source-prd-mismatch', normalized.handoffPath, `HANDOFF child path must equal ${normalized.prdPath}`));
          }
          if (childPath) {
            const childFile = await readSourceFile(root, childPath, errors, warnings, { required: requireFiles });
            if (childFile && !childFile.text.trim()) errors.push(issue('source-file-empty', childPath, 'Child PRD is empty'));
          }
        }
      }
    }
  }
  if (version && !VERSION_ID.test(version)) {
    errors.push(issue('source-version-invalid', normalized.prdPath ?? normalized.handoffPath ?? '', `invalid version: ${version}`));
  }
  if (result.featureName && !FEATURE_NAME.test(result.featureName)) {
    errors.push(issue('source-feature-invalid', normalized.handoffPath ?? normalized.prdPath ?? '', `invalid featureName: ${result.featureName}`));
  }
  if (normalized.prdPath && result.featureName && version) {
    const expectedChild = `ai-docs/versions/${version}/prd/prd-${version}-${result.featureName}.md`;
    if (normalized.handoffPath && normalized.prdPath !== expectedChild) {
      errors.push(issue('source-prd-mismatch', normalized.prdPath, `Product child PRD path must be ${expectedChild}`));
    }
  }
  const discoveredVersion = pathVersion(normalized.prdPath ?? normalized.handoffPath ?? '');
  if (version && discoveredVersion && discoveredVersion !== version) {
    errors.push(issue('source-version-mismatch', normalized.prdPath ?? normalized.handoffPath, `source version must be ${version}`));
  }
  if (normalized.stories !== undefined) {
    for (const story of normalized.stories) {
      if (!STORY_ID.test(story)) errors.push(issue('source-story-invalid', normalized.prdPath ?? normalized.handoffPath, `invalid Story ID: ${story}`));
    }
  }
  return result;
}

export async function resolveSourceRef(source, roots, options = {}) {
  const errors = [];
  const warnings = [];
  if (source !== undefined && source !== null && (typeof source !== 'object' || Array.isArray(source))) {
    errors.push(issue('source-invalid', '', 'source must be a YAML mapping'));
    return { ok: false, kind: 'invalid', root: null, source: {}, errors, warnings };
  }
  const normalized = normalizeSource(source, options.legacy ?? {});
  if (normalized.kind === 'none') {
    const hasLegacySource = Boolean(options.legacy?.source_prd || options.legacy?.sourcePrd || options.legacy?.source_stories || options.legacy?.sourceStories);
    if (source !== undefined && source !== null && !hasLegacySource && Object.keys(source).length === 0) {
      if (options.requireFiles) errors.push(issue('source-empty', '', 'source must identify a Product, issue, or external source'));
      else warnings.push(issue('source-empty', '', 'source is empty at structure stage', 'warning'));
      return { ok: errors.length === 0, kind: 'none', root: null, source: normalized, errors, warnings };
    }
    return { ok: true, kind: 'none', root: null, source: normalized, errors, warnings };
  }
  if (!['product', 'issue', 'external'].includes(normalized.kind)) {
    errors.push(issue('source-kind-invalid', '', `unsupported source kind: ${normalized.kind}`));
    return { ok: false, kind: normalized.kind, root: null, source: normalized, errors, warnings };
  }
  for (const path of [normalized.prdPath, normalized.handoffPath].filter((value) => value !== undefined)) {
    if (!path || path.startsWith('/') || /^[A-Za-z]:[\\/]/.test(path) || path.includes('\\') || path.split('/').some((part) => part === '.' || part === '..')) {
      errors.push(issue(path.includes('..') ? 'source-path-escape' : 'source-path-invalid', path, 'source paths must be safe POSIX repository-relative paths'));
    }
  }
  if (normalized.kind === 'issue') {
    if (!normalized.reference) warnings.push(issue('source-reference-missing', '', 'issue source has no reference', 'warning'));
    return { ok: errors.length === 0, kind: 'issue', root: null, source: normalized, errors, warnings };
  }
  if (normalized.kind === 'external' || normalized.root === 'external') {
    if (!normalized.repository || !normalized.revision || !normalized.prdPath) {
      if (options.requireFiles) errors.push(issue('external-source-incomplete', normalized.prdPath ?? '', 'external Product source requires repository, revision, and prd_path'));
      else warnings.push(issue('external-source-incomplete', normalized.prdPath ?? '', 'external Product source is incomplete at structure stage', 'warning'));
    } else {
      warnings.push(issue('source-unverifiable', normalized.prdPath, 'external Product source cannot be verified in the local workspace', 'warning'));
    }
    return { ok: errors.length === 0, kind: 'external', root: null, source: normalized, errors, warnings };
  }

  let selected;
  try {
    selected = chooseRoot(normalized, roots, { requireLocal: options.requireFiles !== false });
  } catch (error) {
    errors.push(issue(error.code ?? 'source-root-invalid', '', error.message));
    return { ok: false, kind: normalized.kind, root: null, source: normalized, errors, warnings };
  }
  const root = selected.root;
  if (!root) {
    warnings.push(issue('source-unverified', '', 'PRODUCT_ROOT was not provided; Product source was not locally verified', 'warning'));
    return { ok: true, kind: 'product', root: selected.role, rootPath: null, source: normalized, product: null, errors, warnings };
  }
  if (!normalized.prdPath && !normalized.handoffPath) {
    if (options.requireFiles) errors.push(issue('source-path-missing', '', 'Product source requires prd_path or handoff_path'));
    else warnings.push(issue('source-path-missing', '', 'Product source has no prd_path or handoff_path yet', 'warning'));
    return { ok: errors.length === 0, kind: 'product', root: selected.role, source: normalized, errors, warnings };
  }
  for (const path of [normalized.prdPath, normalized.handoffPath].filter(Boolean)) {
    try {
      relativePath(root, path);
    } catch (error) {
      errors.push(issue(error.code === 'path-escape' ? 'source-path-escape' : 'source-path-invalid', path, error.message));
    }
  }
  if (errors.length === 0) {
    const product = await validateProductFiles(normalized, root, errors, warnings, options);
    return {
      ok: errors.length === 0,
      kind: 'product',
      root: selected.role,
      rootPath: root,
      source: normalized,
      product,
      errors,
      warnings,
    };
  }
  return { ok: false, kind: 'product', root: selected.role, rootPath: root, source: normalized, errors, warnings };
}

export function sourceForDocument(sourceResult) {
  if (!sourceResult || sourceResult.kind === 'none') return undefined;
  const source = sourceResult.source ?? sourceResult;
  return {
    kind: source.kind,
    root: sourceResult.root ?? source.root,
    ...(source.repository ? { repository: source.repository } : {}),
    ...(source.revision ? { revision: source.revision } : {}),
    ...(source.prdPath ? { prd_path: source.prdPath } : {}),
    ...(source.handoffPath ? { handoff_path: source.handoffPath } : {}),
    ...(source.stories?.length ? { stories: source.stories } : {}),
    ...(source.featureName ? { feature_name: source.featureName } : {}),
    ...(source.reference ? { reference: source.reference } : {}),
  };
}

export { normalizeArtifactPath };
