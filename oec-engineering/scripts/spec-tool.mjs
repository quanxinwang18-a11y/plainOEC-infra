import { lstat, readFile, readdir, realpath, stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import YAML from 'yaml';

const SPEC_ID = /^SPEC-[a-z0-9][a-z0-9-]*$/;
const ADR_ID = /^ADR-\d{4}$/;
const ADR_FILE = /^(ADR-\d{4})-[a-z0-9][a-z0-9-]*\.md$/;
const CHANGE_ID = /^(?:v\d+\.\d+\.\d+-[A-Za-z][A-Za-z0-9]*|\d{4}-\d{2}-\d{2}-[a-z0-9][a-z0-9-]*)$/;
const STORY_ID = /^US-\d{3,}$/;

function issue(code, path, message) {
  return { code, path, message };
}

function toPosix(path) {
  return path.split(sep).join('/');
}

function isInside(parent, child) {
  const rel = relative(parent, child);
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel));
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

async function workspaceRoot(input) {
  if (!input) throw new Error('--workspace is required');
  const root = await realpath(resolve(input));
  const info = await stat(root);
  if (!info.isDirectory()) throw new Error(`workspace is not a directory: ${input}`);
  return root;
}

async function walkFiles(root, errors, logicalRoot = root) {
  if (!(await exists(root))) return [];
  const files = [];
  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const absolute = resolve(directory, entry.name);
      const logical = toPosix(relative(logicalRoot, absolute));
      if (entry.isSymbolicLink()) {
        errors?.push(issue('symlink-not-allowed', logical, 'symbolic links are not followed'));
      } else if (entry.isDirectory()) {
        await visit(absolute);
      } else if (entry.isFile()) {
        files.push(absolute);
      }
    }
  }
  await visit(root);
  return files;
}

function parseFrontmatter(text, path, errors, required = true) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  if (!match) {
    if (required) errors.push(issue('frontmatter-missing', path, 'YAML frontmatter is required'));
    return { metadata: {}, body: text };
  }
  try {
    const metadata = YAML.parse(match[1]);
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
      errors.push(issue('frontmatter-invalid', path, 'frontmatter must be a YAML mapping'));
      return { metadata: {}, body: text.slice(match[0].length) };
    }
    return { metadata, body: text.slice(match[0].length) };
  } catch (error) {
    errors.push(issue('frontmatter-invalid', path, error.message));
    return { metadata: {}, body: text.slice(match[0].length) };
  }
}

function validateGlob(glob) {
  if (typeof glob !== 'string' || glob.length === 0) return 'glob must be a non-empty string';
  if (isAbsolute(glob) || /^[A-Za-z]:/.test(glob)) return 'glob must be repository-relative';
  if (glob.includes('\\')) return 'glob must use POSIX separators';
  if (glob.startsWith('/') || glob.endsWith('/') || glob.includes('//')) return 'glob has an invalid separator';
  if (!/^[A-Za-z0-9._/*?-]+$/.test(glob)) return 'glob uses unsupported syntax';
  if (glob.split('/').some((part) => part === '.' || part === '..')) return 'glob may not contain . or .. segments';
  return null;
}

function globToRegExp(glob) {
  let pattern = '^';
  for (let index = 0; index < glob.length; index += 1) {
    const character = glob[index];
    if (character === '*') {
      if (glob[index + 1] === '*') {
        index += 1;
        if (glob[index + 1] === '/') {
          index += 1;
          pattern += '(?:.*/)?';
        } else {
          pattern += '.*';
        }
      } else {
        pattern += '[^/]*';
      }
    } else if (character === '?') {
      pattern += '[^/]';
    } else {
      pattern += character.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`${pattern}$`);
}

function validateStringList(value, key, path, errors, { required = false, pattern } = {}) {
  if (value === undefined && !required) return [];
  if (!Array.isArray(value) || (required && value.length === 0) || value.some((item) => typeof item !== 'string')) {
    errors.push(issue('field-invalid', path, `${key} must be ${required ? 'a non-empty' : 'an'} array of strings`));
    return [];
  }
  if (pattern) {
    for (const item of value) {
      if (!pattern.test(item)) errors.push(issue('field-invalid', path, `${key} contains invalid value: ${item}`));
    }
  }
  return value;
}

async function loadEngineering(root) {
  const engineeringRoot = resolve(root, 'ai-docs', 'engineering');
  const errors = [];
  const warnings = [];
  const specs = [];
  const adrs = [];
  const changes = [];

  if (!(await exists(engineeringRoot))) {
    errors.push(issue('engineering-root-missing', 'ai-docs/engineering', 'team engineering root does not exist'));
    return { root, engineeringRoot, errors, warnings, specs, adrs, changes };
  }

  const indexPath = resolve(engineeringRoot, 'README.md');
  if (!(await exists(indexPath))) {
    errors.push(issue('engineering-index-missing', 'ai-docs/engineering/README.md', 'engineering index is required'));
  }

  const specRoot = resolve(engineeringRoot, 'specs');
  const specFiles = (await walkFiles(specRoot, errors, root)).filter((path) => path.endsWith('.md'));
  const specIds = new Map();
  for (const absolute of specFiles) {
    const path = toPosix(relative(root, absolute));
    const text = await readFile(absolute, 'utf8');
    const { metadata, body } = parseFrontmatter(text, path, errors);
    if (!SPEC_ID.test(metadata.id ?? '')) {
      errors.push(issue('spec-id-invalid', path, 'id must match SPEC-[a-z0-9][a-z0-9-]*'));
    } else if (specIds.has(metadata.id)) {
      errors.push(issue('spec-id-duplicate', path, `${metadata.id} is already used by ${specIds.get(metadata.id)}`));
    } else {
      specIds.set(metadata.id, path);
    }
    const appliesTo = validateStringList(metadata.applies_to, 'applies_to', path, errors, { required: true });
    for (const glob of appliesTo) {
      const problem = validateGlob(glob);
      if (problem) errors.push(issue('spec-glob-invalid', path, `${glob}: ${problem}`));
    }
    if (body.trim().length === 0) errors.push(issue('document-empty', path, 'Spec body must not be empty'));
    specs.push({ id: metadata.id, path, appliesTo });
  }

  const decisionRoot = resolve(engineeringRoot, 'decisions');
  const adrFiles = (await walkFiles(decisionRoot, errors, root)).filter((path) => path.endsWith('.md'));
  const adrIds = new Map();
  for (const absolute of adrFiles) {
    const path = toPosix(relative(root, absolute));
    const filename = path.split('/').at(-1);
    const filenameMatch = ADR_FILE.exec(filename);
    const text = await readFile(absolute, 'utf8');
    const { metadata, body } = parseFrontmatter(text, path, errors);
    if (!filenameMatch) errors.push(issue('adr-filename-invalid', path, 'ADR filename must be ADR-NNNN-<slug>.md'));
    if (!ADR_ID.test(metadata.id ?? '')) {
      errors.push(issue('adr-id-invalid', path, 'id must match ADR-NNNN'));
    } else if (filenameMatch && filenameMatch[1] !== metadata.id) {
      errors.push(issue('adr-id-mismatch', path, `frontmatter id must match ${filenameMatch[1]}`));
    } else if (adrIds.has(metadata.id)) {
      errors.push(issue('adr-id-duplicate', path, `${metadata.id} is already used by ${adrIds.get(metadata.id)}`));
    } else {
      adrIds.set(metadata.id, path);
    }
    if (!['accepted', 'superseded'].includes(metadata.status)) {
      errors.push(issue('adr-status-invalid', path, 'status must be accepted or superseded'));
    }
    if (typeof metadata.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(metadata.date)) {
      errors.push(issue('adr-date-invalid', path, 'date must use YYYY-MM-DD'));
    }
    const supersedes = validateStringList(metadata.supersedes, 'supersedes', path, errors, { pattern: ADR_ID });
    if (body.trim().length === 0) errors.push(issue('document-empty', path, 'ADR body must not be empty'));
    adrs.push({ id: metadata.id, path, status: metadata.status, supersedes });
  }

  for (const adr of adrs) {
    for (const superseded of adr.supersedes) {
      if (superseded === adr.id) errors.push(issue('adr-self-reference', adr.path, 'ADR may not supersede itself'));
      else if (!adrIds.has(superseded)) errors.push(issue('adr-reference-missing', adr.path, `unknown ADR: ${superseded}`));
    }
  }

  const changesRoot = resolve(engineeringRoot, 'changes');
  if (await exists(changesRoot)) {
    const entries = await readdir(changesRoot, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const entryPath = `ai-docs/engineering/changes/${entry.name}`;
      if (entry.isSymbolicLink()) {
        errors.push(issue('symlink-not-allowed', entryPath, 'symbolic links are not followed'));
        continue;
      }
      if (!entry.isDirectory()) {
        warnings.push(issue('change-entry-ignored', entryPath, 'only change directories are inspected'));
        continue;
      }
      const changeFile = resolve(changesRoot, entry.name, 'change.md');
      if (!(await exists(changeFile))) {
        errors.push(issue('change-file-missing', `${entryPath}/change.md`, 'persisted change directory requires change.md'));
        continue;
      }
      const path = toPosix(relative(root, changeFile));
      const text = await readFile(changeFile, 'utf8');
      const { metadata, body } = parseFrontmatter(text, path, errors);
      if (metadata.id !== entry.name || !CHANGE_ID.test(metadata.id ?? '')) {
        errors.push(issue('change-id-invalid', path, 'id must match its versioned or dated directory name'));
      }
      const relatedSpecs = validateStringList(metadata.related_specs, 'related_specs', path, errors, { pattern: SPEC_ID });
      const relatedAdrs = validateStringList(metadata.related_adrs, 'related_adrs', path, errors, { pattern: ADR_ID });
      const sourceStories = validateStringList(metadata.source_stories, 'source_stories', path, errors, { pattern: STORY_ID });
      for (const id of relatedSpecs) {
        if (!specIds.has(id)) errors.push(issue('spec-reference-missing', path, `unknown Spec: ${id}`));
      }
      for (const id of relatedAdrs) {
        if (!adrIds.has(id)) errors.push(issue('adr-reference-missing', path, `unknown ADR: ${id}`));
      }
      if (metadata.source_prd !== undefined) {
        if (typeof metadata.source_prd !== 'string') {
          errors.push(issue('source-prd-invalid', path, 'source_prd must be a repository-relative path'));
        } else {
          const target = resolve(root, metadata.source_prd);
          if (isAbsolute(metadata.source_prd) || !isInside(root, target)) {
            errors.push(issue('source-prd-invalid', path, 'source_prd escapes the workspace'));
          } else if (!(await exists(target))) {
            errors.push(issue('source-prd-missing', path, `source_prd does not exist: ${metadata.source_prd}`));
          }
        }
      }
      if (body.trim().length === 0) errors.push(issue('document-empty', path, 'change body must not be empty'));
      changes.push({
        id: metadata.id,
        path,
        relatedSpecs,
        relatedAdrs,
        sourceStories,
      });
    }
  }

  const markdownFiles = (await walkFiles(engineeringRoot, errors, root)).filter((path) => path.endsWith('.md'));
  for (const absolute of markdownFiles) {
    const path = toPosix(relative(root, absolute));
    const text = await readFile(absolute, 'utf8');
    if (/(?:\bTODO\b|\bTBD\b|\[TODO[^\]]*\]|待补充)/i.test(text)) {
      warnings.push(issue('placeholder-text', path, 'document contains placeholder text'));
    }
    for (const match of text.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)) {
      let targetText = match[1].trim();
      if (!targetText || targetText.startsWith('#') || /^(?:https?:|mailto:)/i.test(targetText)) continue;
      targetText = targetText.split(/\s+["']/)[0].split('#')[0];
      try {
        targetText = decodeURIComponent(targetText);
      } catch {
        errors.push(issue('link-invalid', path, `link is not valid URI text: ${targetText}`));
        continue;
      }
      const target = resolve(absolute, '..', targetText);
      if (!isInside(engineeringRoot, target)) {
        errors.push(issue('link-path-escape', path, `link escapes ai-docs/engineering: ${targetText}`));
      } else if (!(await exists(target))) {
        errors.push(issue('broken-link', path, `link target does not exist: ${targetText}`));
      } else {
        const resolved = await realpath(target);
        if (!isInside(engineeringRoot, resolved)) {
          errors.push(issue('link-path-escape', path, `link resolves outside ai-docs/engineering: ${targetText}`));
        }
      }
    }
  }

  specs.sort((a, b) => a.path.localeCompare(b.path));
  adrs.sort((a, b) => a.path.localeCompare(b.path));
  changes.sort((a, b) => a.path.localeCompare(b.path));
  return { root, engineeringRoot, errors, warnings, specs, adrs, changes };
}

function normalizeSelectionPath(root, input) {
  if (typeof input !== 'string' || input.length === 0) throw new Error('selection paths must be non-empty strings');
  const absolute = isAbsolute(input) ? resolve(input) : resolve(root, input);
  if (!isInside(root, absolute)) throw new Error(`selection path escapes workspace: ${input}`);
  const normalized = toPosix(relative(root, absolute));
  return normalized || '.';
}

export async function checkTeamSpecs({ workspace, change } = {}) {
  const root = await workspaceRoot(workspace);
  const result = await loadEngineering(root);
  if (change && !result.changes.some((item) => item.id === change)) {
    result.errors.push(issue('change-not-found', `ai-docs/engineering/changes/${change}`, 'requested change was not found'));
  }
  return {
    ok: result.errors.length === 0,
    workspace: root,
    errors: result.errors,
    warnings: result.warnings,
    specs: result.specs,
    adrs: result.adrs,
    changes: result.changes,
  };
}

export async function selectTeamSpecs({ workspace, paths = [] } = {}) {
  const root = await workspaceRoot(workspace);
  if (!Array.isArray(paths) || paths.length === 0) throw new Error('--paths requires at least one path');
  const normalizedPaths = paths.map((path) => normalizeSelectionPath(root, path));
  const result = await loadEngineering(root);
  const selected = [];
  for (const spec of result.specs) {
    const validGlobs = spec.appliesTo.filter((glob) => !validateGlob(glob));
    const matchedPaths = normalizedPaths.filter((path) => validGlobs.some((glob) => globToRegExp(glob).test(path)));
    if (matchedPaths.length > 0) selected.push({ ...spec, matchedPaths });
  }
  return {
    ok: result.errors.length === 0,
    workspace: root,
    paths: normalizedPaths,
    errors: result.errors,
    warnings: result.warnings,
    specs: selected,
  };
}

async function countFiles(root) {
  const errors = [];
  return (await walkFiles(root, errors)).length;
}

async function inspectSkillRoot(root) {
  if (!(await exists(root))) return { root: null, topLevel: [], nestedSkillFiles: 0 };
  const entries = await readdir(root, { withFileTypes: true });
  const topLevel = [];
  let allSkillFiles = 0;
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
    if (await exists(resolve(root, entry.name, 'SKILL.md'))) topLevel.push(entry.name);
  }
  const files = await walkFiles(root);
  allSkillFiles = files.filter((path) => path.endsWith(`${sep}SKILL.md`)).length;
  topLevel.sort();
  return { root, topLevel, nestedSkillFiles: Math.max(0, allSkillFiles - topLevel.length) };
}

export async function auditLegacyInstallation({ workspace } = {}) {
  const root = await workspaceRoot(workspace);
  const installationPath = resolve(root, '.oec-ai', 'installation.json');
  let installation = null;
  const errors = [];
  if (await exists(installationPath)) {
    try {
      installation = JSON.parse(await readFile(installationPath, 'utf8'));
    } catch (error) {
      errors.push(issue('legacy-manifest-invalid', '.oec-ai/installation.json', error.message));
    }
  }

  const claudeSkills = await inspectSkillRoot(resolve(root, '.claude', 'skills'));
  const codexSkills = await inspectSkillRoot(resolve(root, '.codex', 'skills'));
  const claudeAgentFiles = (await walkFiles(resolve(root, '.claude', 'agents'))).filter((path) => path.endsWith('.md')).length;
  const codexAgentFiles = (await walkFiles(resolve(root, '.codex', 'agents'))).filter((path) => path.endsWith('.toml')).length;
  const managedFiles = Array.isArray(installation?.managedFiles)
    ? installation.managedFiles.filter((path) => typeof path === 'string')
    : [];

  return {
    ok: errors.length === 0,
    workspace: root,
    errors,
    installation: installation ? {
      path: '.oec-ai/installation.json',
      schemaVersion: installation.schemaVersion ?? null,
      version: installation.version ?? null,
      role: installation.role ?? null,
      tool: installation.tool ?? null,
      managedCount: managedFiles.length,
      managedRoots: [...new Set(managedFiles.map((path) => path.split('/').slice(0, 2).join('/')))].sort(),
    } : null,
    claude: {
      topLevelSkills: claudeSkills.topLevel,
      nestedSkillFiles: claudeSkills.nestedSkillFiles,
      markdownAgents: claudeAgentFiles,
    },
    codex: {
      legacyTopLevelSkills: codexSkills.topLevel,
      nestedSkillFiles: codexSkills.nestedSkillFiles,
      tomlAgents: codexAgentFiles,
    },
    preservedProjectContent: {
      root: 'ai-docs',
      files: await countFiles(resolve(root, 'ai-docs')),
      action: 'preserve',
    },
    destructiveActions: [],
  };
}
