import assert from 'node:assert/strict';
import test from 'node:test';
import { isPipelineSuccess, PipelineClient } from '../client.mjs';

test('Pipeline response classifier supports verified success wrappers', () => {
  assert.equal(isPipelineSuccess({ code: 0 }), true);
  assert.equal(isPipelineSuccess({ code: '0' }), true);
  assert.equal(isPipelineSuccess({ success: true, data: { code: 0, data: 1 } }), true);
  assert.equal(isPipelineSuccess({ code: 500, message: 'denied' }), false);
});

test('Pipeline client uses fixed OpenAPI endpoints and normalizes exact run IDs', async () => {
  const requests = [];
  const client = new PipelineClient({
    auth: { async getAccessToken() { return { token: 'token', source: 'local' }; } },
    fetchFn: async (url, options) => {
      requests.push({ url: url.toString(), method: options.method, body: options.body && JSON.parse(options.body) });
      const path = url.pathname;
      let data = [];
      if (path.endsWith('/queryWorkspacePage')) data = { list: [{ id: 1, workSpaceName: 'Workspace' }] };
      if (path.endsWith('/queryPipelinePage')) data = { records: [{ id: 'p-1', pipelineName: 'Build', spaceId: 1 }] };
      if (path.endsWith('/runByManual')) data = 101;
      if (path.endsWith('/getPipelineWorkById')) data = { id: 101, pipelineId: 'p-1', pipelineStatus: '100002', runRemark: 'oec-pipeline:key' };
      return new Response(JSON.stringify({ code: 0, message: 'success', data }), { status: 200 });
    },
  });
  assert.deepEqual(await client.listWorkspaces('dev'), [{ id: '1', name: 'Workspace' }]);
  assert.deepEqual(await client.listPipelines('dev', '1'), [{ id: 'p-1', name: 'Build', spaceId: '1' }]);
  assert.deepEqual(await client.runPipeline('dev', { pipelineId: 'p-1' }), { id: '101' });
  assert.equal((await client.getRun('dev', '101')).status, '100002');
  assert.equal(requests.every((request) => new URL(request.url).origin === 'https://one-dev.iflytek.com'), true);
  assert.deepEqual(requests.map((request) => request.method), ['POST', 'POST', 'POST', 'GET']);
});

test('Pipeline client retries only an unauthorized request after local token recovery', async () => {
  let calls = 0;
  let recoveries = 0;
  const client = new PipelineClient({
    auth: {
      async getAccessToken() { return { token: 'old', source: 'local' }; },
      async recoverAfter401(environment, source) {
        assert.equal(environment, 'test');
        assert.equal(source, 'local');
        recoveries += 1;
        return { token: 'new', source: 'local' };
      },
    },
    fetchFn: async (_url, options) => {
      calls += 1;
      if (calls === 1) return new Response('{}', { status: 401 });
      assert.equal(options.headers.Authorization, 'Bearer new');
      return new Response(JSON.stringify({ code: 0, data: [] }), { status: 200 });
    },
  });
  await client.listWorkspaces('test');
  assert.equal(calls, 2);
  assert.equal(recoveries, 1);
});
