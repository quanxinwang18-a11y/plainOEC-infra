import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import YAML from 'yaml';

const VERSION_PATTERN = /^v\d+\.\d+\.\d+$/;
const CORE_SECTIONS = ['模块概述', '用户故事', '验收标准', '待确认事项'];
const TECHNICAL_LANGUAGE = [
  ['api', /\b(?:API|REST|GraphQL|HTTP|JSON)\b/i],
  ['database', /\b(?:VARCHAR|INT|Redis|MySQL|PostgreSQL|主键|外键|索引)\b/i],
  ['implementation', /\b(?:localStorage|Kafka|Docker|JWT|OAuth|微服务|消息队列|事务|幂等)\b/i],
  ['engineering-metric', /\b(?:P95|QPS|TPS)\b/i],
];

function compareVersions(left, right) {
  const a = left.slice(1).split('.').map(Number);
  const b = right.slice(1).split('.').map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
}

function detectVersion(workspace) {
  const directory = join(workspace, 'ai-docs', 'versions');
  if (!existsSync(directory)) return null;
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && VERSION_PATTERN.test(entry.name))
    .map((entry) => entry.name)
    .sort(compareVersions)
    .at(-1) ?? null;
}

function issue(code, message, path) {
  return { code, message, ...(path ? { path } : {}) };
}

function readText(workspace, relativePath) {
  const absolutePath = join(workspace, relativePath);
  if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) return null;
  return readFileSync(absolutePath, 'utf8');
}

function normalizeArtifactPath(value) {
  if (typeof value !== 'string') return '';
  let normalized = value.trim().replaceAll('\\', '/').replace(/^\.\//, '');
  if (normalized.startsWith('versions/')) normalized = `ai-docs/${normalized}`;
  return normalized;
}

function isSafeRelativePath(workspace, relativePath) {
  if (!relativePath || isAbsolute(relativePath)) return false;
  const target = resolve(workspace, relativePath);
  const rel = relative(workspace, target);
  return rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

function sectionBody(moduleBody, heading) {
  const match = new RegExp(`^### ${heading}\\s*$`, 'm').exec(moduleBody);
  if (!match) return null;
  const start = match.index + match[0].length;
  const rest = moduleBody.slice(start);
  const next = /^### /m.exec(rest);
  return (next ? rest.slice(0, next.index) : rest).trim();
}

export function parseModules(markdown) {
  const heading = /^## 模块:\s*([a-z][A-Za-z0-9]*)(?:\s+[—-]\s+(.+))?\s*$/gm;
  const matches = [...markdown.matchAll(heading)];
  return matches.map((match, index) => ({
    featureName: match[1],
    title: match[2]?.trim() || match[1],
    body: markdown.slice(match.index + match[0].length, matches[index + 1]?.index ?? markdown.length),
  }));
}

function storyIdsFrom(text) {
  return [...new Set(text.match(/\bUS-\d{3,}\b/g) ?? [])];
}

function validateModules(markdown, path, errors, warnings) {
  const modules = parseModules(markdown);
  if (modules.length === 0) {
    errors.push(issue('module-missing', 'No `## 模块: lowerCamelCase — title` block found', path));
    return [];
  }

  const seenFeatures = new Set();
  const seenStories = new Set();
  for (const module of modules) {
    if (seenFeatures.has(module.featureName)) {
      errors.push(issue('feature-duplicate', `Duplicate featureName ${module.featureName}`, path));
    }
    seenFeatures.add(module.featureName);

    for (const heading of CORE_SECTIONS) {
      const body = sectionBody(module.body, heading);
      if (body === null) errors.push(issue('core-section-missing', `${module.featureName} is missing ${heading}`, path));
      else if (!body || /\{\{[^}]+\}\}|<[^>]+>/.test(body)) {
        errors.push(issue('core-section-placeholder', `${module.featureName} ${heading} is empty or contains placeholders`, path));
      }
    }

    const storySection = sectionBody(module.body, '用户故事') ?? '';
    const acceptanceSection = sectionBody(module.body, '验收标准') ?? '';
    const storyIds = storyIdsFrom(storySection);
    if (storyIds.length === 0) errors.push(issue('story-missing', `${module.featureName} has no US-NNN story`, path));
    for (const storyId of storyIds) {
      if (seenStories.has(storyId)) errors.push(issue('story-duplicate', `Duplicate story ID ${storyId}`, path));
      seenStories.add(storyId);
      if (!new RegExp(`\\b${storyId}\\b`).test(acceptanceSection)) {
        errors.push(issue('acceptance-missing', `${storyId} has no matching acceptance criteria`, path));
      }
    }

    for (const [code, pattern] of TECHNICAL_LANGUAGE) {
      if (pattern.test(module.body)) warnings.push(issue(`product-language-${code}`, `${module.featureName} contains implementation language`, path));
    }
  }
  return modules;
}

function validateFinalize(workspace, version, errors, warnings) {
  const rootPath = 'ai-docs/prd/prd-all.md';
  const changelogPath = 'ai-docs/prd/prd-all-changelog.md';
  const incrementPath = `ai-docs/versions/${version}/prd/prd-${version}.md`;

  for (const path of [rootPath, changelogPath, incrementPath]) {
    const text = readText(workspace, path);
    if (text === null) errors.push(issue('artifact-missing', 'Required artifact is missing', path));
    else if (!text.trim()) errors.push(issue('artifact-empty', 'Required artifact is empty', path));
  }

  const increment = readText(workspace, incrementPath);
  const modules = increment ? validateModules(increment, incrementPath, errors, warnings) : [];
  const changelog = readText(workspace, changelogPath);
  if (changelog && !changelog.includes(version)) {
    errors.push(issue('changelog-version-missing', `Changelog has no ${version} entry`, changelogPath));
  }
  return { incrementPath, modules };
}

function validateHandoff(workspace, version, incrementModules, errors, warnings) {
  const handoffPath = `ai-docs/versions/${version}/prd/HANDOFF.yaml`;
  const text = readText(workspace, handoffPath);
  if (text === null) {
    errors.push(issue('handoff-missing', 'HANDOFF.yaml is missing', handoffPath));
    return;
  }

  let handoff;
  try {
    handoff = YAML.parse(text);
  } catch (error) {
    errors.push(issue('handoff-invalid-yaml', error.message, handoffPath));
    return;
  }
  if (handoff?.schema_version !== 4) errors.push(issue('handoff-schema', 'HANDOFF schema_version must be 4', handoffPath));
  if (handoff?.prd_version !== version) errors.push(issue('handoff-version', `HANDOFF prd_version must be ${version}`, handoffPath));
  if (!Array.isArray(handoff?.sub_prds) || handoff.sub_prds.length === 0) {
    errors.push(issue('handoff-sub-prds-empty', 'HANDOFF sub_prds must contain at least one item', handoffPath));
    return;
  }

  const moduleByFeature = new Map(incrementModules.map((module) => [module.featureName, module]));
  const seen = new Set();
  for (const child of handoff.sub_prds) {
    const featureName = child?.featureName;
    if (typeof featureName !== 'string' || !/^[a-z][A-Za-z0-9]*$/.test(featureName)) {
      errors.push(issue('handoff-feature-name', 'Every sub_prd requires a lowerCamelCase featureName', handoffPath));
      continue;
    }
    if (seen.has(featureName)) errors.push(issue('handoff-feature-duplicate', `Duplicate HANDOFF featureName ${featureName}`, handoffPath));
    seen.add(featureName);
    if (!moduleByFeature.has(featureName)) errors.push(issue('handoff-feature-unknown', `${featureName} is absent from the increment PRD`, handoffPath));

    const childPath = normalizeArtifactPath(child.file);
    const expected = `ai-docs/versions/${version}/prd/prd-${version}-${featureName}.md`;
    if (childPath !== expected) errors.push(issue('child-path-invalid', `${featureName} child path must be ${expected}`, handoffPath));
    if (!isSafeRelativePath(workspace, childPath)) {
      errors.push(issue('child-path-unsafe', `${featureName} child path escapes the workspace`, handoffPath));
      continue;
    }
    const childText = readText(workspace, childPath);
    if (childText === null) {
      errors.push(issue('child-missing', 'Child PRD does not exist', childPath));
      continue;
    }
    const childModules = validateModules(childText, childPath, errors, warnings);
    if (childModules.length !== 1 || childModules[0]?.featureName !== featureName) {
      errors.push(issue('child-module-mismatch', `${childPath} must contain exactly module ${featureName}`, childPath));
    }
    const expectedStories = new Set((child.stories ?? []).map((story) => story?.id).filter(Boolean));
    const actualStories = new Set(storyIdsFrom(childModules[0]?.body ?? ''));
    if (expectedStories.size === 0) errors.push(issue('handoff-stories-empty', `${featureName} has no HANDOFF stories`, handoffPath));
    if ([...expectedStories].some((id) => !actualStories.has(id)) || [...actualStories].some((id) => !expectedStories.has(id))) {
      errors.push(issue('handoff-story-mismatch', `${featureName} HANDOFF and child story IDs differ`, handoffPath));
    }
  }

  for (const featureName of moduleByFeature.keys()) {
    if (!seen.has(featureName)) errors.push(issue('handoff-module-missing', `${featureName} has no HANDOFF entry`, handoffPath));
  }

  const hasInteraction = incrementModules.some((module) => sectionBody(module.body, '交互流程'));
  if (hasInteraction) {
    const designPath = `ai-docs/versions/${version}/ui/ui-${version}-design-links.md`;
    const design = readText(workspace, designPath);
    if (!design || /TODO|待补充|\{\{/.test(design)) warnings.push(issue('ui-design-links-missing', 'Interaction exists but final UI design links are missing', designPath));
  }
}

export function checkArtifacts({ workspace, version, stage = 'finalize', strictWarnings = false }) {
  const resolvedWorkspace = realpathSync(resolve(workspace));
  const selectedVersion = version ?? detectVersion(resolvedWorkspace);
  const errors = [];
  const warnings = [];
  if (!selectedVersion) {
    errors.push(issue('version-missing', 'No version supplied and no vX.Y.Z directory found'));
    return { ok: false, stage, version: null, workspace: resolvedWorkspace, errors, warnings };
  }
  const finalized = validateFinalize(resolvedWorkspace, selectedVersion, errors, warnings);
  if (stage === 'pre-publish') validateHandoff(resolvedWorkspace, selectedVersion, finalized.modules, errors, warnings);
  return {
    ok: errors.length === 0 && (!strictWarnings || warnings.length === 0),
    stage,
    version: selectedVersion,
    workspace: resolvedWorkspace,
    errors,
    warnings,
  };
}
