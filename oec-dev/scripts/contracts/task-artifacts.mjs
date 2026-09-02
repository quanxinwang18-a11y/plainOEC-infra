import { lstat, readFile, readdir, realpath } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import YAML from 'yaml';
import {
  ContractError,
  hasPlaceholder,
  issue,
  isInside,
  parseFrontmatter,
  pathExists,
  sectionBody,
  stringList,
  validateGlob,
} from './common.mjs';
import { CHANGE_ID, FEATURE_NAME, parseTaskRef, resolveTaskRef } from './task-ref.mjs';

const SPEC_ID = /^SPEC-[a-z0-9][a-z0-9-]*$/;
const ADR_ID = /^ADR-\d{4}$/;
const MODULE_ID = /^[a-z][a-z0-9-]*$/;
const STATUS = new Set(['draft', 'ready', 'active', 'implemented', 'verified', 'blocked']);
const ARTIFACT_NAMES = new Set(['README.md', 'spec.md', 'design.md', 'tasks.md', 'implementation-plan.md', 'verification.md', 'debug-notes.md', 'sync-status.md', 'research']);

const SPEC_SECTIONS = [
  ['goal and scope', '目标与范围'],
  ['acceptance', '验收', '验收标准'],
];
const DESIGN_SECTIONS = [
  ['constraints and affected contracts', '约束与受影响契约'],
  ['chosen design', '选定方案', '设计方案'],
  ['change boundary', '变更边界'],
  ['verification', '验证'],
];

function addError(errors, code, path, message) {
  errors.push(issue(code, path, message, 'error'));
}

function addWarning(warnings, code, path, message) {
  warnings.push(issue(code, path, message, 'warning'));
}

function requiredString(metadata, field, path, errors) {
  if (typeof metadata[field] !== 'string' || metadata[field].trim().length === 0) {
    addError(errors, 'field-invalid', path, `${field} must be a non-empty string`);
    return null;
  }
  return metadata[field].trim();
}

function fieldArray(metadata, field, path, errors, { required = false, pattern } = {}) {
  try {
    return stringList(metadata[field], field, { required, pattern });
  } catch (error) {
    addError(errors, error.code ?? 'field-invalid', path, error.message);
    return [];
  }
}

function validatePathGlobs(value, path, errors) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    addError(errors, 'affected-paths-invalid', path, 'affected_paths must be a mapping with include');
    return [];
  }
  const include = fieldArray(value, 'include', path, errors, { required: true });
  for (const glob of include) {
    const problem = validateGlob(glob);
    if (problem) addError(errors, 'path-glob-invalid', path, `${glob}: ${problem}`);
  }
  const exclude = fieldArray(value, 'exclude', path, errors);
  for (const glob of exclude) {
    const problem = validateGlob(glob);
    if (problem) addError(errors, 'path-glob-invalid', path, `${glob}: ${problem}`);
  }
  return include;
}

function validateMetadataIdentity(metadata, artifactKind, expectedRef, path, errors, warnings) {
  if (metadata.artifact !== artifactKind) addError(errors, 'artifact-kind-invalid', path, `artifact must be ${artifactKind}`);
  if (metadata.schema_version !== 1) addError(errors, 'schema-version-invalid', path, 'schema_version must be 1');
  const taskRef = requiredString(metadata, 'task_ref', path, errors);
  if (taskRef) {
    try {
      const parsed = parseTaskRef(taskRef);
      if (parsed.kind === 'legacy-id') {
        addWarning(warnings, 'legacy-task-ref', path, 'legacy task identity is accepted for reading but should be normalized');
      } else if (parsed.ref !== expectedRef.ref) {
        addError(errors, 'task-identity-mismatch', path, `task_ref must be ${expectedRef.ref}`);
      }
    } catch (error) {
      addError(errors, error.code ?? 'task-ref-invalid', path, error.message);
    }
  }
  const title = requiredString(metadata, 'title', path, errors);
  if (title && hasPlaceholder(title)) addError(errors, 'placeholder-text', path, 'title contains a placeholder');
  if (metadata.status !== undefined && !STATUS.has(metadata.status)) {
    addError(errors, 'status-invalid', path, `status must be one of ${[...STATUS].join(', ')}`);
  }
}

function withoutComments(text) {
  return text.replace(/<!--(?:[\s\S]*?)-->/g, '').trim();
}

function withoutCodeFences(text) {
  return text.replace(/```[\s\S]*?```/g, '');
}

function validateBodySections(body, sections, path, errors) {
  const cleanBody = withoutCodeFences(body);
  for (const names of sections) {
    const content = sectionBody(cleanBody, names);
    if (content === null) {
      addError(errors, 'section-missing', path, `required section is missing: ${names[0]}`);
    } else if (!withoutComments(content)) {
      addError(errors, 'section-empty', path, `required section is empty: ${names[0]}`);
    } else if (hasPlaceholder(content)) {
      addError(errors, 'placeholder-text', path, `required section contains a placeholder: ${names[0]}`);
    }
  }
}

function acceptanceIds(body) {
  return [...withoutComments(body).matchAll(/\bAC-\d{3,}\b/g)].map((match) => match[0]);
}

function validateAcceptance(body, path, errors) {
  const cleanBody = withoutCodeFences(body);
  const ids = acceptanceIds(sectionBody(cleanBody, ['acceptance', '验收', '验收标准']) ?? '');
  if (ids.length === 0) {
    addError(errors, 'acceptance-missing', path, 'Acceptance must contain at least one AC-NNN item');
    return;
  }
  const seen = new Set();
  for (const id of ids) {
    if (seen.has(id)) addError(errors, 'acceptance-duplicate', path, `duplicate acceptance ID: ${id}`);
    seen.add(id);
  }
}

function validateSpec(metadata, body, expected, path, errors, warnings, stage) {
  validateMetadataIdentity(metadata, 'task-spec', expected, path, errors, warnings);
  const modules = fieldArray(metadata, 'module_ids', path, errors, { required: stage !== 'structure', pattern: MODULE_ID });
  if (stage !== 'structure' && modules.length === 0) addError(errors, 'module-missing', path, 'module_ids must contain at least one module before ready');
  validatePathGlobs(metadata.affected_paths, path, errors);
  const relatedSpecs = fieldArray(metadata, 'related_specs', path, errors, { pattern: SPEC_ID });
  const relatedAdrs = fieldArray(metadata, 'related_adrs', path, errors, { pattern: ADR_ID });
  if (metadata.feature_name !== undefined && (typeof metadata.feature_name !== 'string' || !FEATURE_NAME.test(metadata.feature_name))) {
    addError(errors, 'feature-name-invalid', path, 'feature_name must match lowerCamelCase');
  }
  if (metadata.external_change_id !== undefined && (typeof metadata.external_change_id !== 'string' || !CHANGE_ID.test(metadata.external_change_id))) {
    addError(errors, 'external-change-id-invalid', path, 'external_change_id has an invalid change ID');
  }
  if (metadata.feature_name && expected.featureName && metadata.feature_name !== expected.featureName) {
    addError(errors, 'feature-name-mismatch', path, `feature_name must be ${expected.featureName}`);
  }
  if (metadata.external_change_id && expected.externalChangeId && metadata.external_change_id !== expected.externalChangeId) {
    addError(errors, 'external-change-id-mismatch', path, `external_change_id must be ${expected.externalChangeId}`);
  }
  if (expected.kind === 'versioned' && stage !== 'structure') {
    if (!metadata.source || typeof metadata.source !== 'object' || Array.isArray(metadata.source)) {
      addError(errors, 'source-missing', path, 'versioned task Spec requires a structured source');
    } else if (!['product', 'issue', 'external'].includes(metadata.source.kind)) {
      addError(errors, 'source-kind-invalid', path, 'versioned task Spec source.kind must be product, issue, or external');
    } else if (metadata.source.kind === 'product' && !metadata.feature_name && !metadata.source.feature_name && !metadata.source.featureName) {
      addError(errors, 'feature-name-missing', path, 'Product task Spec requires feature_name');
    }
  }
  validateBodySections(body, SPEC_SECTIONS, path, errors);
  validateAcceptance(body, path, errors);
  return { modules, relatedSpecs, relatedAdrs };
}

function validateDesign(metadata, body, expected, specAbsolutePath, designAbsolutePath, path, errors, warnings) {
  validateMetadataIdentity(metadata, 'task-design', expected, path, errors, warnings);
  const specRef = requiredString(metadata, 'spec_ref', path, errors);
  if (specRef && !['./spec.md', 'spec.md'].includes(specRef)) {
    addError(errors, 'spec-reference-invalid', path, 'spec_ref must point to ./spec.md in the same task directory');
  }
  validateBodySections(body, DESIGN_SECTIONS, path, errors);
  if (specRef && specAbsolutePath && designAbsolutePath && resolve(designAbsolutePath, '..', specRef) !== specAbsolutePath) {
    addError(errors, 'spec-reference-invalid', path, 'spec_ref does not resolve to the task Spec');
  }
  return { specRef };
}

async function readArtifact(root, relativePath, errors, required = true) {
  const absolute = resolve(root, relativePath);
  try {
    const info = await lstat(absolute);
    if (info.isSymbolicLink()) {
      addError(errors, 'symlink-not-allowed', relativePath, 'task artifacts may not be symbolic links');
      return null;
    }
    if (!info.isFile()) {
      addError(errors, 'artifact-invalid', relativePath, 'task artifact must be a file');
      return null;
    }
    const text = await readFile(absolute, 'utf8');
    let parsed;
    try {
      parsed = parseFrontmatter(text, relativePath);
    } catch (error) {
      addError(errors, error.code ?? 'frontmatter-invalid', relativePath, error.message);
      return null;
    }
    return { relativePath, absolutePath: absolute, text, ...parsed };
  } catch (error) {
    if (error.code === 'ENOENT' && !required) return null;
    if (error.code === 'ENOENT') addError(errors, 'artifact-missing', relativePath, 'required task artifact is missing');
    else addError(errors, 'artifact-read-failed', relativePath, error.message);
    return null;
  }
}

async function collectMarkdownFiles(directory) {
  const files = [];
  async function visit(current) {
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch (error) {
      if (error.code === 'ENOENT') return;
      throw error;
    }
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const absolute = join(current, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else if (entry.isFile() && entry.name.endsWith('.md')) files.push(absolute);
    }
  }
  await visit(directory);
  return files;
}

async function loadEngineeringReferences(root, warnings) {
  const engineeringRoot = join(root, 'ai-docs', 'Spec');
  if (!(await pathExists(engineeringRoot))) return { specs: new Set(), adrs: new Set() };
  const specs = new Set();
  const adrs = new Set();
  for (const absolute of await collectMarkdownFiles(join(engineeringRoot, 'specs'))) {
    const relativePath = absolute.slice(root.length + 1).split('\\').join('/');
    try {
      const parsed = parseFrontmatter(await readFile(absolute, 'utf8'), relativePath);
      if (typeof parsed.metadata.id === 'string' && SPEC_ID.test(parsed.metadata.id)) specs.add(parsed.metadata.id);
    } catch (error) {
      warnings.push(issue('team-spec-unreadable', relativePath, error.message, 'warning'));
    }
  }
  for (const absolute of await collectMarkdownFiles(join(engineeringRoot, 'decisions'))) {
    const relativePath = absolute.slice(root.length + 1).split('\\').join('/');
    try {
      const parsed = parseFrontmatter(await readFile(absolute, 'utf8'), relativePath);
      if (typeof parsed.metadata.id === 'string' && ADR_ID.test(parsed.metadata.id)) adrs.add(parsed.metadata.id);
    } catch (error) {
      warnings.push(issue('adr-unreadable', relativePath, error.message, 'warning'));
    }
  }
  return { specs, adrs };
}

async function validateEngineeringReferences(root, relatedSpecs, relatedAdrs, errors, warnings, stage) {
  if (relatedSpecs.length === 0 && relatedAdrs.length === 0) return;
  const engineeringRoot = join(root, 'ai-docs', 'Spec');
  if (!(await pathExists(engineeringRoot))) {
    for (const id of relatedSpecs) {
      if (stage === 'structure') addWarning(warnings, 'spec-reference-unverified', 'ai-docs/Spec/specs', `cannot verify Spec before engineering root exists: ${id}`);
      else addError(errors, 'spec-reference-missing', 'ai-docs/Spec/specs', `unknown Spec: ${id}`);
    }
    for (const id of relatedAdrs) {
      if (stage === 'structure') addWarning(warnings, 'adr-reference-unverified', 'ai-docs/Spec/decisions', `cannot verify ADR before engineering root exists: ${id}`);
      else addError(errors, 'adr-reference-missing', 'ai-docs/Spec/decisions', `unknown ADR: ${id}`);
    }
    return;
  }
  const known = await loadEngineeringReferences(root, warnings);
  for (const id of relatedSpecs) {
    if (!known.specs.has(id)) {
      if (stage === 'structure') addWarning(warnings, 'spec-reference-unverified', 'ai-docs/Spec/specs', `Spec is not verified at structure stage: ${id}`);
      else addError(errors, 'spec-reference-missing', 'ai-docs/Spec/specs', `unknown Spec: ${id}`);
    }
  }
  for (const id of relatedAdrs) {
    if (!known.adrs.has(id)) {
      if (stage === 'structure') addWarning(warnings, 'adr-reference-unverified', 'ai-docs/Spec/decisions', `ADR is not verified at structure stage: ${id}`);
      else addError(errors, 'adr-reference-missing', 'ai-docs/Spec/decisions', `unknown ADR: ${id}`);
    }
  }
}

async function validateTaskLinks(file, devRoot, errors) {
  if (!file?.text) return;
  const documentText = file.text.replace(/```[\s\S]*?```/g, '');
  for (const match of documentText.matchAll(/!?(?:\[[^\]]*\])\(([^)]+)\)/g)) {
    let targetText = match[1].trim().split(/\s+["']/)[0].split('#')[0];
    if (!targetText || /^(?:https?:|mailto:|data:)/i.test(targetText)) continue;
    try {
      targetText = decodeURIComponent(targetText);
    } catch {
      addError(errors, 'link-invalid', file.relativePath, `link is not valid URI text: ${targetText}`);
      continue;
    }
    if (targetText.startsWith('/') || /^[A-Za-z]:[\\/]/.test(targetText)) {
      addError(errors, 'link-absolute', file.relativePath, 'task document links must be relative');
      continue;
    }
    const target = resolve(file.absolutePath, '..', targetText);
    if (!isInside(devRoot, target)) {
      addError(errors, 'link-path-escape', file.relativePath, `link escapes DEV_ROOT: ${targetText}`);
      continue;
    }
    try {
      const info = await lstat(target);
      if (info.isSymbolicLink()) addError(errors, 'link-symlink', file.relativePath, `link target is a symbolic link: ${targetText}`);
      else if (!info.isFile() && !info.isDirectory()) addError(errors, 'broken-link', file.relativePath, `link target is not a file or directory: ${targetText}`);
      else if (!isInside(devRoot, await realpath(target))) addError(errors, 'link-path-escape', file.relativePath, `link resolves outside DEV_ROOT: ${targetText}`);
    } catch (error) {
      if (error.code === 'ENOENT') addError(errors, 'broken-link', file.relativePath, `link target does not exist: ${targetText}`);
      else addError(errors, 'link-read-failed', file.relativePath, error.message);
    }
  }
}

async function checkModuleIds(root, modules, errors, warnings) {
  const indexPath = join(root, 'ai-docs', 'Spec', 'module-index.yaml');
  if (!(await pathExists(indexPath))) return;
  let info;
  try {
    info = await lstat(indexPath);
  } catch (error) {
    addError(errors, 'module-index-invalid', 'ai-docs/Spec/module-index.yaml', error.message);
    return;
  }
  if (info.isSymbolicLink() || !info.isFile()) {
    addError(errors, 'module-index-invalid', 'ai-docs/Spec/module-index.yaml', 'module-index.yaml must be a regular file');
    return;
  }
  let index;
  try {
    index = YAML.parse(await readFile(indexPath, 'utf8'));
  } catch (error) {
    addError(errors, 'module-index-invalid', 'ai-docs/Spec/module-index.yaml', error.message);
    return;
  }
  if (!index || typeof index !== 'object' || Array.isArray(index)) {
    addError(errors, 'module-index-invalid', 'ai-docs/Spec/module-index.yaml', 'module index must be a YAML mapping');
    return;
  }
  if (index.schema_version !== 1) addError(errors, 'module-index-schema', 'ai-docs/Spec/module-index.yaml', 'schema_version must be 1');
  if (!Array.isArray(index.modules) || index.modules.length === 0) {
    addError(errors, 'module-index-empty', 'ai-docs/Spec/module-index.yaml', 'modules must be a non-empty array');
    return;
  }
  const known = new Set();
  const declared = [];
  for (const item of index.modules) {
    const id = item?.id;
    if (typeof id !== 'string' || !MODULE_ID.test(id)) {
      addError(errors, 'module-id-invalid', 'ai-docs/Spec/module-index.yaml', 'module id must match [a-z][a-z0-9-]*');
      continue;
    }
    if (known.has(id)) addError(errors, 'module-id-duplicate', 'ai-docs/Spec/module-index.yaml', `duplicate module: ${id}`);
    known.add(id);
    const paths = Array.isArray(item.paths) ? item.paths : [];
    for (const glob of paths) {
      const problem = validateGlob(glob);
      if (problem) addError(errors, 'module-glob-invalid', 'ai-docs/Spec/module-index.yaml', `${glob}: ${problem}`);
    }
    const specIds = Array.isArray(item.specs) ? item.specs : [];
    for (const spec of specIds) {
      if (typeof spec !== 'string' || !SPEC_ID.test(spec)) addError(errors, 'module-spec-invalid', 'ai-docs/Spec/module-index.yaml', `invalid Spec reference: ${spec}`);
    }
    const dependsOn = Array.isArray(item.depends_on) ? item.depends_on : [];
    for (const dependency of dependsOn) {
      if (typeof dependency !== 'string' || !MODULE_ID.test(dependency)) addError(errors, 'module-dependency-invalid', 'ai-docs/Spec/module-index.yaml', `invalid module dependency: ${dependency}`);
    }
    declared.push({ id, specIds, dependsOn });
  }
  for (const module of declared) {
    for (const dependency of module.dependsOn) {
      if (MODULE_ID.test(dependency) && !known.has(dependency)) {
        addError(errors, 'module-dependency-missing', 'ai-docs/Spec/module-index.yaml', `${module.id} depends on unknown module: ${dependency}`);
      }
    }
  }
  if (await pathExists(join(root, 'ai-docs', 'Spec', 'specs'))) {
    const knownSpecs = await loadEngineeringReferences(root, warnings);
    for (const module of declared) {
      for (const spec of module.specIds) {
        if (SPEC_ID.test(spec) && !knownSpecs.specs.has(spec)) {
          addError(errors, 'module-spec-reference-missing', 'ai-docs/Spec/module-index.yaml', `${module.id} references unknown Spec: ${spec}`);
        }
      }
    }
  }
  for (const module of modules) {
    if (!known.has(module)) addError(errors, 'module-reference-missing', 'ai-docs/Spec/module-index.yaml', `unknown module: ${module}`);
  }
}

function knownArtifactWarnings(taskRoot, relativeTask, warnings, errors) {
  // The task package remains extensible, but unexpected files should be visible rather than silently ignored.
  return readdirNames(taskRoot).then((names) => {
    for (const name of names) {
      if (/^(?:spec|design)(?:[-_](?:final|new|v\d+)|\.(?:final|new|v\d+))\.md$/i.test(name)) {
        addError(errors, 'duplicate-artifact', `${relativeTask}/${name}`, 'use the canonical spec.md/design.md instead of a versioned or final copy');
      } else if (!ARTIFACT_NAMES.has(name) && !name.startsWith('.')) {
        addWarning(warnings, 'task-artifact-ignored', `${relativeTask}/${name}`, 'file is not part of the task artifact contract');
      }
    }
  });
}

async function readdirNames(path) {
  try {
    return (await readdir(path, { withFileTypes: true })).map((entry) => entry.name);
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

/**
 * Validate the task-level Spec and Design pair. The change checker is independent of the team-Spec root;
 * a project may validate a task package before it has initialized engineering/.
 */
export async function checkTaskArtifacts({
  workspace,
  devRoot,
  productRoot,
  taskRef,
  changeId,
  path,
  version,
  taskSlug,
  featureName,
  stage = 'structure',
  allowLegacy = true,
} = {}) {
  if (!['structure', 'ready', 'close'].includes(stage)) {
    throw new ContractError('stage-invalid', 'stage must be structure, ready, or close');
  }
  const resolved = await resolveTaskRef({
    workspace,
    devRoot,
    productRoot,
    taskRef,
    changeId,
    path,
    version,
    taskSlug,
    featureName,
    requireSource: stage !== 'structure',
  });
  const errors = [...(resolved.errors ?? [])];
  const warnings = [...(resolved.warnings ?? [])];
  if (!resolved.exists) {
    return {
      ok: false,
      stage,
      task: resolved,
      errors: errors.length ? errors : [issue('task-ref-not-found', resolved.relativePath ?? '', 'task directory does not exist')],
      warnings,
      artifacts: {},
    };
  }
  const root = resolved.devRoot;
  const taskRoot = resolved.absolutePath;
  const specPath = `${resolved.relativePath}/spec.md`;
  const designPath = `${resolved.relativePath}/design.md`;
  const legacyFilePresence = await Promise.all([
    pathExists(join(taskRoot, 'change.md')),
    pathExists(join(taskRoot, 'spec.md')),
    pathExists(join(taskRoot, 'design.md')),
    pathExists(join(taskRoot, 'README.md')),
  ]);
  const hasLegacyFiles = resolved.compatibility === 'legacy' && legacyFilePresence.some(Boolean);
  if (allowLegacy && hasLegacyFiles) {
    warnings.push(issue('legacy-task-incomplete', resolved.relativePath, 'legacy task package is readable but does not contain the new structured Spec/Design pair', 'warning'));
    if (stage !== 'structure') {
      errors.push(issue('legacy-task-incomplete', resolved.relativePath, 'legacy task package must be explicitly upgraded before ready or close validation'));
    }
    return { ok: errors.length === 0, stage, task: resolved, errors, warnings, artifacts: { spec: null, design: null } };
  }
  const spec = await readArtifact(root, specPath, errors, true);
  const design = await readArtifact(root, designPath, errors, true);

  if (!spec || !design) {
    return { ok: errors.length === 0, stage, task: resolved, errors, warnings, artifacts: { spec, design } };
  }

  let specData;
  let designData;
  const specResult = validateSpec(spec.metadata, spec.body, resolved, specPath, errors, warnings, stage);
  try {
    designData = validateDesign(design.metadata, design.body, resolved, spec.absolutePath, design.absolutePath, designPath, errors, warnings);
  } catch (error) {
    addError(errors, error.code ?? 'design-invalid', designPath, error.message);
  }
  specData = specResult;
  await checkModuleIds(root, specData.modules, errors, warnings);
  await validateEngineeringReferences(root, specData.relatedSpecs, specData.relatedAdrs, errors, warnings, stage);
  await validateTaskLinks(spec, root, errors);
  await validateTaskLinks(design, root, errors);
  await knownArtifactWarnings(taskRoot, resolved.relativePath, warnings, errors);

  if (stage === 'close' && spec.metadata.status === 'verified' && !(await pathExists(join(taskRoot, 'verification.md')))) {
    addWarning(warnings, 'verification-file-missing', `${resolved.relativePath}/verification.md`, 'verified status has no persisted verification.md; record evidence if this is a controlled change');
  }

  return {
    ok: errors.length === 0,
    stage,
    task: resolved,
    errors,
    warnings,
    artifacts: {
      spec: { ...spec, data: specData },
      design: { ...design, data: designData },
    },
  };
}

export { ARTIFACT_NAMES };
