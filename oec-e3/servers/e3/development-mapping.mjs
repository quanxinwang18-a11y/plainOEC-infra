import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import YAML from 'yaml';

export function developmentMappingRelativePath(changeId) {
  return `ai-docs/Spec/integrations/e3/development-tasks/${changeId}.yaml`;
}

export function legacyDevelopmentMappingRelativePath(changeId) {
  return `ai-docs/integrations/e3/development/${changeId}.yaml`;
}

export async function readDevelopmentMapping(workspace, changeId) {
  const path = developmentMappingRelativePath(changeId);
  const paths = [path, legacyDevelopmentMappingRelativePath(changeId)];
  for (const candidate of paths) {
    try {
      const value = YAML.parse(await readFile(join(workspace, candidate), 'utf8'));
      return { path: candidate, mapping: value && typeof value === 'object' ? value : null, legacyPath: candidate !== path };
    } catch (error) {
      if (error.code !== 'ENOENT') throw new Error(`Unable to read E3 development task record: ${error.message}`);
    }
  }
  return { path, mapping: null, legacyPath: false };
}

export async function writeDevelopmentMapping(workspace, changeId, mapping) {
  const path = developmentMappingRelativePath(changeId);
  const absolute = join(workspace, path);
  await mkdir(dirname(absolute), { recursive: true });
  const temporary = `${absolute}.${process.pid}.${randomBytes(8).toString('hex')}.tmp`;
  const value = { ...mapping, schema_version: 1, updated_at: new Date().toISOString() };
  await writeFile(temporary, YAML.stringify(value), { mode: 0o600 });
  await rename(temporary, absolute);
  return { path, mapping: value };
}

export function newDevelopmentMapping({ changeId, config, requirement }) {
  const timestamp = new Date().toISOString();
  return {
    schema_version: 1,
    change_id: changeId,
    sync_state: 'partial',
    created_at: timestamp,
    updated_at: timestamp,
    product_space: {
      id: String(config.productSpace.id),
      name: config.productSpace.name,
      pomp_project: config.pompProject,
    },
    requirement: {
      id: String(requirement.id),
      title: requirement.title,
      url: requirement.url,
    },
    tasks: [],
  };
}

export function developmentMappingComplete(mapping) {
  return Boolean(mapping?.tasks?.length) && mapping.tasks.every((task) => task.e3_task?.id);
}
