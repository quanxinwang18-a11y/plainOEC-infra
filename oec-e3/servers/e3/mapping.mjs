import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import YAML from 'yaml';

export function mappingRelativePath(version) {
  return `ai-docs/integrations/e3/publications/${version}.yaml`;
}

export function legacyMappingRelativePath(version) {
  return `ai-docs/integrations/e3/${version}.yaml`;
}

export function newMapping({ version, handoffPath, fingerprint, config, artifacts, warnings = [] }) {
  const timestamp = new Date().toISOString();
  return {
    schema_version: 2,
    prd_version: version,
    sync_state: 'partial',
    generated_at: timestamp,
    updated_at: timestamp,
    artifact_fingerprint: fingerprint,
    source_handoff: handoffPath,
    product_space: {
      id: String(config.productSpace.id),
      name: config.productSpace.name,
      pomp_project: config.pompProject,
    },
    requirements: artifacts.map((artifact) => ({
      featureName: artifact.featureName,
      child_prd: artifact.childPrd,
      e3_requirement: null,
      story_tasks: artifact.stories.map((story) => ({
        story_id: story.id,
        title: story.title,
        e3_task: null,
      })),
    })),
    quality_gate: {
      expected_requirements: artifacts.length,
      expected_story_tasks: artifacts.reduce((total, artifact) => total + artifact.stories.length, 0),
      warnings,
    },
  };
}

export function normalizeMapping(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const requirements = Array.isArray(raw.requirements) ? raw.requirements.map((item) => {
    const { sub_prd_file: legacyChildPrd, ...current } = item;
    return {
      ...current,
      child_prd: item.child_prd ?? legacyChildPrd,
      story_tasks: Array.isArray(item.story_tasks) ? item.story_tasks : [],
    };
  }) : [];
  return {
    ...raw,
    schema_version: Number(raw.schema_version ?? 1),
    sync_state: raw.sync_state ?? raw.status ?? 'partial',
    requirements,
  };
}

export async function readMapping(workspace, version) {
  const relativePath = mappingRelativePath(version);
  const paths = [relativePath, legacyMappingRelativePath(version)];
  for (const path of paths) {
    try {
      const value = YAML.parse(await readFile(join(workspace, path), 'utf8'));
      return { path, mapping: normalizeMapping(value), legacyPath: path !== relativePath };
    } catch (error) {
      if (error.code !== 'ENOENT') throw new Error(`Unable to read E3 record: ${error.message}`);
    }
  }
  return { path: relativePath, mapping: null, legacyPath: false };
}

export async function writeMapping(workspace, version, mapping) {
  const relativePath = mappingRelativePath(version);
  const absolutePath = join(workspace, relativePath);
  await mkdir(dirname(absolutePath), { recursive: true });
  const temporary = `${absolutePath}.${process.pid}.${randomBytes(8).toString('hex')}.tmp`;
  const value = { ...mapping, schema_version: 2, updated_at: new Date().toISOString() };
  await writeFile(temporary, YAML.stringify(value), { mode: 0o600 });
  await rename(temporary, absolutePath);
  return { path: relativePath, mapping: value };
}

export function mappingIsComplete(mapping) {
  if (!mapping?.requirements?.length) return false;
  return mapping.requirements.every((requirement) =>
    requirement.e3_requirement?.id
    && Array.isArray(requirement.story_tasks)
    && requirement.story_tasks.length > 0
    && requirement.story_tasks.every((task) => task.e3_task?.id));
}

export function mappingHasRemoteIds(mapping) {
  return (mapping?.requirements ?? []).some((requirement) => (
    requirement.e3_requirement?.id
    || (requirement.story_tasks ?? []).some((task) => task.e3_task?.id)
  ));
}

export function adoptMappingCheckpoints(target, source) {
  if (!source) return target;
  for (const requirement of target.requirements ?? []) {
    const previous = (source.requirements ?? []).find((item) => (
      item.featureName === requirement.featureName
      || (item.child_prd && item.child_prd === requirement.child_prd)
    ));
    if (!previous) continue;
    requirement.e3_requirement = previous.e3_requirement ?? null;
    for (const task of requirement.story_tasks ?? []) {
      const oldTask = (previous.story_tasks ?? []).find((item) => item.story_id === task.story_id);
      if (oldTask?.e3_task) task.e3_task = oldTask.e3_task;
    }
  }
  return target;
}

export function mappingCounts(mapping) {
  const requirements = mapping?.requirements ?? [];
  const tasks = requirements.flatMap((item) => item.story_tasks ?? []);
  return {
    requirements: requirements.length,
    requirementIds: requirements.filter((item) => item.e3_requirement?.id).length,
    tasks: tasks.length,
    taskIds: tasks.filter((item) => item.e3_task?.id).length,
  };
}
