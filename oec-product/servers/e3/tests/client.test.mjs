import assert from 'node:assert/strict';
import test from 'node:test';
import { E3Client, extractCreatedId, extractE3Data, isE3Success } from '../client.mjs';

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
