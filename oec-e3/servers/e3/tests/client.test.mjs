import assert from 'node:assert/strict';
import test from 'node:test';
import {
  E3Client,
  extractCreatedId,
  extractE3Data,
  isE3Success,
  normalizeRequirement,
  normalizeRequirementDetail,
  normalizeTask,
  normalizeTaskLogInfo,
  normalizeWorkbenchTask,
  selectMetadataOption,
} from '../client.mjs';

test('E3 success classifier accepts known codes and rejects permission errors', () => {
  for (const code of ['E00000000', '0', 0, '200', 200]) assert.equal(isE3Success({ code }), true);
  assert.equal(isE3Success({ success: true }), true);
  assert.equal(isE3Success({ code: '3000600023', msg: 'denied' }), false);
  assert.equal(isE3Success({ message: 'unknown 2xx shape' }), false);
  assert.equal(isE3Success({}), false);
  assert.equal(isE3Success([]), false);
  assert.equal(isE3Success(null), false);
});

test('E3 account resolution uses explicit configuration or JWT claims and never a space creator', async () => {
  const keys = ['OEC_E3_USER_ACCOUNT', 'SKILL_USER_ACCOUNT', 'SKILL_USER_NAME', 'OPENCLAW_USER'];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  for (const key of keys) delete process.env[key];
  try {
    const opaque = new E3Client({
      auth: { async getAccessToken() { return { token: 'opaque-token', source: 'local' }; } },
      fetchFn: async () => { throw new Error('currentAccount must not query product spaces'); },
    });
    process.env.OEC_E3_USER_ACCOUNT = ' configured-owner ';
    assert.equal(await opaque.currentAccount(), 'configured-owner');
    delete process.env.OEC_E3_USER_ACCOUNT;
    await assert.rejects(opaque.currentAccount(), /Unable to determine the current E3 account/);

    const claims = Buffer.from(JSON.stringify({ preferred_username: 'jwt-owner' })).toString('base64url');
    const jwt = new E3Client({
      auth: { async getAccessToken() { return { token: `header.${claims}.signature`, source: 'local' }; } },
    });
    assert.equal(await jwt.currentAccount(), 'jwt-owner');
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});

test('E3 client rejects malformed or unknown HTTP 2xx payloads', async () => {
  for (const payload of ['not-json', JSON.stringify({ message: 'denied without a known wrapper' })]) {
    const client = new E3Client({
      auth: { async getAccessToken() { return { token: 'test-token', source: 'local' }; } },
      fetchFn: async () => new Response(payload, { status: 200 }),
    });
    await assert.rejects(client.request('GET', '/api/example'), /E3 API rejected request/);
  }
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
  assert.deepEqual(normalizeTaskLogInfo({
    planId: 5,
    pompProjectCode: 'pomp-1',
    planWorkload: 8,
    acturelyFillInHours: '1.5',
    surplusHours: 6.5,
    progressPercentage: '20',
    workLog: 'Started',
  }), {
    planId: 5,
    projectCode: 'pomp-1',
    planWorkload: 8,
    estimatedWorkload: undefined,
    investedHours: undefined,
    spentHours: '1.5',
    remainingHours: 6.5,
    progress: '20',
    worklog: 'Started',
    date: undefined,
    status: undefined,
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

test('E3 client normalizes workbench task fields without accepting a caller-supplied account', () => {
  assert.deepEqual(normalizeWorkbenchTask({
    workItemId: 34,
    title: 'Task',
    productId: 123,
    productName: 'Payment',
    storyId: 12,
    status: 2,
    statusDesc: 'In progress',
    priority: 3,
    priorityDesc: 'High',
  }), {
    id: '34',
    title: 'Task',
    productId: '123',
    productName: 'Payment',
    requirementId: '12',
    status: '2',
    statusDisplay: 'In progress',
    priority: '3',
    priorityDisplay: 'High',
  });
  assert.equal(normalizeWorkbenchTask({ title: 'Missing ID' }), null);
});

test('E3 client queries my tasks with bounded pagination and current-account API scope', async () => {
  const requests = [];
  const client = new E3Client({
    auth: { async getAccessToken() { return { token: 'test-token', source: 'local' }; } },
    fetchFn: async (url, options) => {
      requests.push({ url: url.toString(), method: options.method, body: JSON.parse(options.body) });
      return new Response(JSON.stringify({
        code: '200',
        data: {
          total: 2,
          pageNo: 2,
          size: 2,
          list: [{
            workItemId: 34,
            title: 'Task',
            productId: 123,
            storyId: 12,
            status: 2,
          }],
        },
      }), { status: 200 });
    },
  });
  assert.deepEqual(await client.queryMyTasks({
    filter: 'MyCharged',
    productIds: ['123', '456'],
    status: [1, 2],
    keyword: 'payment',
    page: 2,
    pageSize: 2,
  }), {
    status: 'success',
    filter: 'MyCharged',
    page: 2,
    pageSize: 2,
    total: 2,
    tasks: [{ id: '34', title: 'Task', productId: '123', requirementId: '12', status: '2' }],
  });
  assert.deepEqual(requests, [{
    url: 'https://one.iflytek.com/cyxt/api/workbench/v1/myWorkItem/task',
    method: 'POST',
    body: {
      param: {
        size: 2,
        pageNo: 2,
        orders: [{ asc: true, column: 'createTime' }],
        condition: 'payment',
      },
      filter: 'MyCharged',
      productId: ['123', '456'],
      status: [1, 2],
    },
  }]);
});

test('E3 client resolves requirement workItemId dynamically before detail query', async () => {
  const requests = [];
  const client = new E3Client({
    auth: { async getAccessToken() { return { token: 'test-token', source: 'local' }; } },
    fetchFn: async (url, options) => {
      requests.push({ url: url.toString(), method: options.method, body: options.body ? JSON.parse(options.body) : undefined });
      if (url.pathname.endsWith('/workItemId/list')) {
        return new Response(JSON.stringify({ code: 'E00000000', info: [{ workItemKey: 'system_requirement', workItemId: 1073 }] }), { status: 200 });
      }
      return new Response(JSON.stringify({
        code: 'E00000000',
        info: {
          id: 456,
          fieldInfoMap: {
            title: { value: 'Requirement' },
            description: { value: '<p>Body</p>' },
            priority: { value: 3 },
            status: { value: 'developing', displayValue: 'Developing' },
          },
        },
      }), { status: 200 });
    },
  });
  assert.deepEqual(await client.getRequirementDetail('123', '456'), {
    workItemId: '1073',
    requirement: {
      id: '456',
      title: 'Requirement',
      description: '<p>Body</p>',
      priority: 3,
      status: 'developing',
      statusDisplay: 'Developing',
    },
  });
  assert.deepEqual(requests.map(({ url, method }) => [method, url]), [
    ['POST', 'https://one.iflytek.com/cyxt/api/panshi/v1/ccf/workItemId/list'],
    ['GET', 'https://one.iflytek.com/cyxt/api/dm/story/v1/456/info?workItemId=1073&productId=123'],
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

test('E3 task progress uses fixed endpoints and server-derived worklog fields', async () => {
  const requests = [];
  const client = new E3Client({
    auth: { async getAccessToken() { return { token: 'test-token', source: 'local' }; } },
    fetchFn: async (url, options) => {
      requests.push({ url: url.toString(), method: options.method, body: options.body ? JSON.parse(options.body) : undefined });
      const info = url.pathname.endsWith('/getIterativePlanTaskLogInfo') ? {
        planId: 9,
        pompProjectCode: 'pomp-1',
        planWorkload: 8,
        acturelyFillInHours: 1,
        surplusHours: 7,
        progressPercentage: '10',
        workLog: 'Earlier',
      } : true;
      return new Response(JSON.stringify({ code: 'E00000000', info }), { status: 200 });
    },
  });
  const info = await client.getTaskLogInfo('space-1', 'task-1', '2026-08-21');
  await client.startTask('space-1', 'task-1');
  await client.writeTaskWorklog('space-1', 'task-1', info, {
    action: 'complete',
    worklog: 'Verified',
    spentHours: 2.5,
  });
  assert.deepEqual(requests.map((request) => [request.method, new URL(request.url).pathname]), [
    ['POST', '/cyxt/api/panshi/iterativePlanTask/getIterativePlanTaskLogInfo'],
    ['PUT', '/cyxt/api/panshi/v2/product/task/task-1/status'],
    ['PUT', '/cyxt/api/panshi/v2/product/task/task-1/workLog'],
  ]);
  assert.equal(new URL(requests[1].url).searchParams.get('status'), '2');
  assert.deepEqual(requests[2].body, {
    productId: 'space-1',
    planId: 9,
    projectCode: 'pomp-1',
    planWorkload: 8,
    acturelyFillInHours: 2.5,
    surplusHours: 0,
    progressPercentage: '100',
    state: 3,
    workLog: 'Verified',
  });
});
