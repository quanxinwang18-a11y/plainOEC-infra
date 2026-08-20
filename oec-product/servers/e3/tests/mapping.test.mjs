import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import YAML from 'yaml';
import { mappingIsComplete, readMapping, writeMapping } from '../mapping.mjs';

test('mapping v1 reads legacy sub_prd_file and v2 writes child_prd atomically', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'oec-map-'));
  const directory = join(workspace, 'ai-docs', 'integrations', 'e3');
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, 'v1.0.0.yaml'), YAML.stringify({
    schema_version: 1,
    status: 'partial',
    requirements: [{ featureName: 'alpha', sub_prd_file: 'legacy.md', story_tasks: [] }],
  }));
  const legacy = await readMapping(workspace, 'v1.0.0');
  assert.equal(legacy.mapping.child_prd, undefined);
  assert.equal(legacy.mapping.requirements[0].child_prd, 'legacy.md');

  const written = await writeMapping(workspace, 'v1.0.0', legacy.mapping);
  assert.equal(written.mapping.schema_version, 2);
  const parsed = YAML.parse(await readFile(join(workspace, written.path), 'utf8'));
  assert.equal(parsed.requirements[0].child_prd, 'legacy.md');
  assert.equal('sub_prd_file' in parsed.requirements[0], false);
});

test('published gate requires every requirement and every story task ID', () => {
  const mapping = {
    requirements: [{
      e3_requirement: { id: 'r-1' },
      story_tasks: [{ e3_task: { id: 't-1' } }, { e3_task: null }],
    }],
  };
  assert.equal(mappingIsComplete(mapping), false);
  mapping.requirements[0].story_tasks[1].e3_task = { id: 't-2' };
  assert.equal(mappingIsComplete(mapping), true);
});
