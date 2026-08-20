import assert from 'node:assert/strict';
import test from 'node:test';
import {
  E3Client,
  extractCreatedId,
  extractE3Data,
  isE3Success,
  normalizeRequirement,
  normalizeTask,
  selectMetadataOption,
} from '../client.mjs';

test('E3 success classifier accepts known codes and rejects permission errors', () => {
  for (const code of ['E00000000', '0', 0, '200', 200]) assert.equal(isE3Success({ code }), true);
  assert.equal(isE3Success({ success: true }), true);
  assert.equal(isE3Success({ code: '3000600023', msg: 'denied' }), false);
});

test('E3 response adapters support info/data and known created-ID shapes', () => {
  assert.deepEqual(extractE3Data({ code: 'E00000000', info: [{ id: 1 }] }), [{ id: 1 }]);
  assert.deepEqual(extractE3Data({ code: '200', data: [{ id: 2 }] }, '/ccf/example'), [{ id: 2 }]);
  assert.equal(extractCreatedId({ code: '200', data: [2064739] }, '/api/dm/story/v1/batchSave'), 2064739);
  assert.equal(extractCreatedId({ code: '0', data: [{ id: 12 }] }), 12);
  assert.equal(extractCreatedId({ code: '0', data: { taskId: 't-1' } }), 't-1');
});

test('E3 requirement and task responses normalize identity fields', () => {
  assert.deepEqual(normalizeRequirement({
    id: 12,
    fieldInfoMap: { title: { value: 'Requirement' }, description: { value: '<p>Body</p>' } },
  }), { id: '12', title: 'Requirement', description: '<p>Body</p>', priority: undefined });
  assert.deepEqual(normalizeTask({ id: 34, name: 'Task', storyId: 12 }), {
    id: '34', title: 'Task', requirementId: '12',
  });
});

test('E3 metadata selection requires a unique candidate or unique default', () => {
  assert.equal(selectMetadataOption([{ value: 'only' }], 'rdManager').value, 'only');
  assert.equal(selectMetadataOption([
    { value: 'a', isDefault: false },
    { value: 'b', isDefault: true },
  ], 'rdManager').value, 'b');
  assert.equal(selectMetadataOption([{ value: 'a' }, { value: 'b' }], 'rdManager').value, undefined);
  assert.equal(selectMetadataOption([
    { value: 'a', isDefault: true },
    { value: 'b', isDefault: true },
  ], 'rdManager').warnings[0].code, 'e3-metadata-ambiguous');
  assert.equal(selectMetadataOption([], 'qaManager').warnings[0].code, 'e3-metadata-ambiguous');
});

test('E3 client keeps business APIs under fixed /cyxt origin and CCF APIs at the portal origin', async () => {
  const urls = [];
  const client = new E3Client({
    auth: { async getAccessToken() { return { token: 'test-token', source: 'local' }; } },
    fetchFn: async (url) => {
      urls.push(url.toString());
      return new Response(JSON.stringify({ code: '0', data: [] }), { status: 200 });
    },
  });
  await client.request('GET', '/api/example');
  await client.request('GET', '/ccf/example');
  assert.deepEqual(urls, [
    'https://one.iflytek.com/cyxt/api/example',
    'https://one.iflytek.com/ccf/example',
  ]);
});

test('E3 client fetches and normalizes task identity by ID', async () => {
  const urls = [];
  const client = new E3Client({
    auth: { async getAccessToken() { return { token: 'test-token', source: 'local' }; } },
    fetchFn: async (url) => {
      urls.push(url.toString());
      return new Response(JSON.stringify({
        code: 'E00000000',
        info: { id: 34, name: 'Task', storyId: 12 },
      }), { status: 200 });
    },
  });
  assert.deepEqual(await client.getTask('space-1', '34'), {
    id: '34', title: 'Task', requirementId: '12',
  });
  assert.deepEqual(urls, [
    'https://one.iflytek.com/cyxt/api/panshi/v2/product/task/info?id=34&productId=space-1',
  ]);
});
