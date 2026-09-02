import { lstat, readFile, readdir } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import YAML from 'yaml';
import {
  globToRegExp,
  issue,
  parseFrontmatter,
  relativePath,
  validateGlob,
} from './contracts/common.mjs';
import { resolveTaskRef } from './contracts/task-ref.mjs';
import { resolveWorkspaceRoots } from './contracts/workspace-source.mjs';

const HIGH_SIGNALS = new Set(['contract', 'data', 'boundary', 'compatibility', 'ownership', 'command']);
const SIGNALS = new Set([...HIGH_SIGNALS]);

function normalizeSignals(value) {
  const values = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [];
  return [...new Set(values.map((item) => String(item).trim().toLowerCase()).filter(Boolean))];
}

function matchingPaths(paths, globs) {
  const valid = globs.filter((glob) => !validateGlob(glob)).map(globToRegExp);
  return paths.filter((path) => valid.some((pattern) => pattern.test(path)));
}

async function walkMarkdown(root, logicalRoot = root) {
  const files = [];
  async function visit(directory) {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (error.code === 'ENOENT') return;
      throw error;
    }
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const absolute = resolve(directory, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) await visit(absolute);
      else if (entry.isFile() && entry.name.endsWith('.md')) files.push({ absolute, path: relative(logicalRoot, absolute).split('\\').join('/') });
    }
  }
  await visit(root);
  return files;
}

async function loadSpecs(devRoot) {
  const specRoot = resolve(devRoot, 'ai-docs', 'engineering', 'specs');
  const files = await walkMarkdown(specRoot, devRoot);
  const specs = [];
  const warnings = [];
  for (const file of files) {
    let text;
    try {
      text = await readFile(file.absolute, 'utf8');
    } catch (error) {
      warnings.push(issue('spec-read-failed', file.path, error.message, 'warning'));
      continue;
    }
    let parsed;
    try {
      parsed = parseFrontmatter(text, file.path);
    } catch (error) {
      warnings.push(issue(error.code ?? 'spec-frontmatter-invalid', file.path, error.message, 'warning'));
      continue;
    }
    const appliesTo = Array.isArray(parsed.metadata.applies_to)
      ? parsed.metadata.applies_to.filter((item) => typeof item === 'string')
      : [];
    specs.push({
      id: parsed.metadata.id ?? file.path,
      path: file.path,
      appliesTo,
      moduleId: parsed.metadata.module_id ?? parsed.metadata.moduleId ?? null,
    });
  }
  return { specs, warnings };
}

async function loadModuleIndex(devRoot) {
  const path = resolve(devRoot, 'ai-docs', 'engineering', 'module-index.yaml');
  try {
    const info = await lstat(path);
    if (info.isSymbolicLink() || !info.isFile()) return { modules: [], warnings: [] };
    const parsed = YAML.parse(await readFile(path, 'utf8'));
    const modules = Array.isArray(parsed?.modules)
      ? parsed.modules.filter((item) => item && typeof item.id === 'string')
      : [];
    return { modules, warnings: [] };
  } catch (error) {
    if (error.code === 'ENOENT') return { modules: [], warnings: [] };
    return { modules: [], warnings: [issue('module-index-invalid', 'ai-docs/engineering/module-index.yaml', error.message, 'warning')] };
  }
}

async function taskSignals(task) {
  if (!task?.exists || !task.absolutePath) return { paths: [], signals: [], candidates: [] };
  const specPath = join(task.absolutePath, 'spec.md');
  try {
    const info = await lstat(specPath);
    if (info.isSymbolicLink() || !info.isFile()) return { paths: [], signals: [], candidates: [] };
    const parsed = parseFrontmatter(await readFile(specPath, 'utf8'), `${task.relativePath}/spec.md`);
    const paths = parsed.metadata.affected_paths?.include ?? [];
    const explicitSignals = parsed.metadata.impact_signals ?? parsed.metadata.impactSignals ?? [];
    const declared = parsed.metadata.knowledge_impact ?? parsed.metadata.durable_updates ?? [];
    return {
      paths: Array.isArray(paths) ? paths.filter((item) => typeof item === 'string') : [],
      signals: normalizeSignals(explicitSignals),
      candidates: Array.isArray(declared) ? declared : [],
    };
  } catch {
    return { paths: [], signals: [], candidates: [] };
  }
}

function candidateKey(candidate) {
  return `${candidate.kind}:${candidate.target}`;
}

function addCandidate(map, candidate) {
  if (!candidate.target) return;
  const key = candidateKey(candidate);
  const existing = map.get(key);
  if (!existing) {
    map.set(key, { ...candidate, reasons: [...new Set(candidate.reasons ?? [])], paths: [...new Set(candidate.paths ?? [])] });
    return;
  }
  existing.reasons = [...new Set([...existing.reasons, ...(candidate.reasons ?? [])])];
  existing.paths = [...new Set([...existing.paths, ...(candidate.paths ?? [])])];
  if (candidate.severity === 'review' || (existing.severity !== 'review' && candidate.severity === 'high')) {
    existing.severity = candidate.severity;
  }
}

/**
 * Produce advisory candidates for durable Spec/ADR updates. This function never writes files.
 */
export async function findSpecReminders({
  workspace,
  devRoot,
  productRoot,
  paths = [],
  taskRef,
  changeId,
  signals = [],
} = {}) {
  const errors = [];
  const warnings = [];
  let roots;
  try {
    roots = await resolveWorkspaceRoots({ workspace, devRoot, productRoot });
  } catch (error) {
    return {
      ok: false,
      remind: false,
      level: 'blocked',
      candidates: [],
      errors: [issue(error.code ?? 'dev-root-invalid', '', error.message)],
      warnings,
    };
  }

  const normalizedPaths = [];
  const pathInputs = Array.isArray(paths) ? paths : paths ? [paths] : [];
  for (const input of pathInputs) {
    try {
      normalizedPaths.push(relativePath(roots.devRoot, input));
    } catch (error) {
      errors.push(issue(error.code ?? 'path-invalid', '', error.message));
    }
  }
  const resolvedTask = taskRef || changeId
    ? await resolveTaskRef({ workspace, devRoot, productRoot, taskRef, changeId, allowMissing: false })
    : null;
  if (resolvedTask?.errors?.length) errors.push(...resolvedTask.errors);
  const taskInfo = await taskSignals(resolvedTask);
  const allPaths = normalizedPaths.length > 0
    ? [...new Set(normalizedPaths)]
    : [...new Set(taskInfo.paths)];
  const explicitSignals = [...new Set([...normalizeSignals(signals), ...taskInfo.signals])];
  const unknownSignals = explicitSignals.filter((signal) => !SIGNALS.has(signal));
  for (const signal of unknownSignals) warnings.push(issue('reminder-signal-unknown', '', `unknown reminder signal: ${signal}`, 'warning'));
  const high = explicitSignals.some((signal) => HIGH_SIGNALS.has(signal));
  const severity = high ? 'review' : 'suggestion';
  const { specs, warnings: specWarnings } = await loadSpecs(roots.devRoot);
  warnings.push(...specWarnings);
  const { modules, warnings: moduleWarnings } = await loadModuleIndex(roots.devRoot);
  warnings.push(...moduleWarnings);
  const candidates = new Map();

  for (const spec of specs) {
    const matched = matchingPaths(allPaths, spec.appliesTo);
    if (matched.length === 0) continue;
    addCandidate(candidates, {
      kind: 'update-spec',
      target: spec.id,
      severity,
      paths: matched,
      reasons: ['changed paths match the Spec scope'],
    });
  }

  const specificGlobs = specs.flatMap((spec) => spec.appliesTo.filter((glob) => glob !== '**'));
  const uncoveredPaths = allPaths.filter((path) => !specificGlobs.some((glob) => matchingPaths([path], [glob]).length > 0));
  if (uncoveredPaths.length > 0 && (high || specs.length === 0)) {
    addCandidate(candidates, {
      kind: 'create-spec',
      target: 'ai-docs/engineering/specs/<module>.md',
      severity,
      paths: uncoveredPaths,
      reasons: ['changed paths are not covered by a module-scoped Spec'],
    });
  }

  if (high && allPaths.length > 0) {
    const boundaryPaths = allPaths.filter((path) => /(?:module-index\.yaml|package\.json|pom\.xml|build\.gradle|settings\.gradle|openapi|schema|migration|migrations|proto|routes?|commands?)/i.test(path));
    if (boundaryPaths.length > 0 || explicitSignals.some((signal) => ['boundary', 'ownership', 'compatibility'].includes(signal))) {
      addCandidate(candidates, {
        kind: 'review-adr',
        target: 'ai-docs/engineering/decisions/ADR-NNNN-<slug>.md',
        severity: 'review',
        paths: boundaryPaths.length > 0 ? boundaryPaths : allPaths,
        reasons: ['change carries a durable boundary, ownership, compatibility, or contract signal'],
      });
    }
  }

  for (const declared of taskInfo.candidates) {
    if (typeof declared === 'string') {
      addCandidate(candidates, { kind: 'update-spec', target: declared, severity: 'review', paths: allPaths, reasons: ['task source declares a durable knowledge update'] });
    } else if (declared && typeof declared === 'object') {
      const target = declared.target ?? declared.id;
      const kind = declared.kind === 'adr' ? 'review-adr' : 'update-spec';
      addCandidate(candidates, {
        kind,
        target,
        severity: 'review',
        paths: allPaths,
        reasons: [declared.reason ?? 'task source declares a durable knowledge update'],
      });
    }
  }

  // Module metadata is useful for selecting context, but the reminder remains advisory when the index is absent.
  if (modules.length > 0 && explicitSignals.includes('boundary') && allPaths.length > 0) {
    const matchedModules = modules.filter((module) => matchingPaths(allPaths, Array.isArray(module.paths) ? module.paths : []).length > 0);
    for (const module of matchedModules) {
      addCandidate(candidates, {
        kind: 'review-module',
        target: module.id,
        severity: 'review',
        paths: allPaths,
        reasons: ['changed paths intersect a declared module boundary'],
      });
    }
  }

  const ordered = [...candidates.values()].sort((left, right) => `${left.kind}:${left.target}`.localeCompare(`${right.kind}:${right.target}`));
  return {
    ok: errors.length === 0,
    remind: ordered.length > 0,
    level: ordered.some((candidate) => candidate.severity === 'review') ? 'review' : ordered.length > 0 ? 'suggestion' : 'none',
    workspace: roots.devRoot,
    productRoot: roots.productRoot,
    paths: allPaths,
    signals: explicitSignals,
    candidates: ordered,
    errors,
    warnings,
  };
}
