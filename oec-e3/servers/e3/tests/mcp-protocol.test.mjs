import assert from 'node:assert/strict';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { ListRootsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { createE3McpServer } from '../server.mjs';

test('MCP protocol exposes publication and development-planning tools with guarded roots', async () => {
  const observed = [];
  const service = {
    async prepare(input, roots) {
      observed.push({ operation: 'prepare', input, roots });
      return { status: 'ready', planToken: 'x'.repeat(43) };
    },
    async selectProductSpace(input, roots) {
      observed.push({ operation: 'select', input, roots });
      return { status: 'selected' };
    },
    async execute(input, roots) {
      observed.push({ operation: 'execute', input, roots });
      return { status: 'published' };
    },
    async status(input, roots) {
      observed.push({ operation: 'status', input, roots });
      return { status: 'published' };
    },
    async prepareWorkspaceBinding(input, roots) {
      observed.push({ operation: 'prepare-workspace-binding', input, roots });
      return { status: 'needs_space_selection', selectionToken: 'w'.repeat(43), candidates: [] };
    },
    async workspaceBinding(input, roots) {
      observed.push({ operation: 'workspace-binding', input, roots });
      return { status: 'unbound' };
    },
  };
  const developmentService = {
    async prepare(input, roots) {
      observed.push({ operation: 'prepare-development', input, roots });
      return { status: 'ready', planToken: 'd'.repeat(43) };
    },
    async selectRequirement(input, roots) {
      observed.push({ operation: 'select-requirement', input, roots });
      return { status: 'ready', planToken: 'd'.repeat(43) };
    },
    async execute(input, roots) {
      observed.push({ operation: 'execute-development', input, roots });
      return { status: 'synced' };
    },
    async prepareProgress(input, roots) {
      observed.push({ operation: 'prepare-progress', input, roots });
      return { status: 'ready', planToken: 'p'.repeat(43) };
    },
    async executeProgress(input, roots) {
      observed.push({ operation: 'execute-progress', input, roots });
      return { status: 'synced' };
    },
    async status(input, roots) {
      observed.push({ operation: 'development-status', input, roots });
      return { status: 'synced' };
    },
  };
  const queryClient = {
    async queryMyTasks(input) {
      observed.push({ operation: 'query-my-tasks', input });
      return { status: 'success', filter: input.filter, page: input.page, pageSize: input.pageSize, total: 0, tasks: [] };
    },
    async getRequirementDetail(productId, requirementId) {
      observed.push({ operation: 'requirement-detail', productId, requirementId });
      return { workItemId: '1073', requirement: null };
    },
    async getTask(productId, taskId) {
      observed.push({ operation: 'task-detail', productId, taskId });
      return null;
    },
  };
  const server = createE3McpServer({ service, developmentService, client: queryClient });
  const client = new Client(
    { name: 'oec-mcp-protocol-test', version: '1.0.0' },
    { capabilities: { roots: { listChanged: false } } },
  );
  client.setRequestHandler(ListRootsRequestSchema, async () => ({
    roots: [{ uri: 'file:///authorized/workspace', name: 'fixture' }],
  }));
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  try {
    assert.equal(client.getServerVersion().version, '1.0.3');
    const tools = await client.listTools();
    assert.deepEqual(tools.tools.map((tool) => tool.name), [
      'prepare_prd_publish',
      'select_product_space',
      'execute_prd_publish',
      'get_prd_publish_status',
      'prepare_e3_workspace_binding',
      'get_e3_workspace_binding',
      'query_my_e3_tasks',
      'get_e3_requirement_detail',
      'get_e3_task_detail',
      'prepare_development_tasks',
      'select_development_requirement',
      'execute_development_tasks',
      'prepare_task_progress',
      'execute_task_progress',
      'get_development_task_status',
    ]);
    const execute = tools.tools.find((tool) => tool.name === 'execute_prd_publish');
    assert.equal(execute.annotations.destructiveHint, true);
    assert.equal(execute._meta['anthropic/requiresUserInteraction'], true);
    for (const name of ['query_my_e3_tasks', 'get_e3_requirement_detail', 'get_e3_task_detail']) {
      const queryTool = tools.tools.find((tool) => tool.name === name);
      assert.equal(queryTool.annotations.readOnlyHint, true);
      assert.equal(queryTool.annotations.destructiveHint, false);
      assert.equal(queryTool.annotations.idempotentHint, true);
      assert.equal(queryTool.inputSchema.additionalProperties, false);
    }
    const developmentExecute = tools.tools.find((tool) => tool.name === 'execute_development_tasks');
    assert.equal(developmentExecute.annotations.destructiveHint, true);
    assert.equal(developmentExecute._meta['anthropic/requiresUserInteraction'], true);
    const progressExecute = tools.tools.find((tool) => tool.name === 'execute_task_progress');
    assert.equal(progressExecute.annotations.destructiveHint, true);
    assert.equal(progressExecute._meta['anthropic/requiresUserInteraction'], true);

    const prepared = await client.callTool({
      name: 'prepare_prd_publish',
      arguments: { workspaceUri: 'file:///authorized/workspace', version: 'v1.2.3' },
    });
    assert.equal(prepared.structuredContent.status, 'ready');
    await client.callTool({
      name: 'select_product_space',
      arguments: { selectionToken: 's'.repeat(43), spaceId: 'space-1' },
    });
    await client.callTool({ name: 'execute_prd_publish', arguments: { planToken: 'x'.repeat(43) } });
    await client.callTool({
      name: 'get_prd_publish_status',
      arguments: { workspaceUri: 'file:///authorized/workspace', version: 'v1.2.3' },
    });
    const bindingPreparation = await client.callTool({
      name: 'prepare_e3_workspace_binding',
      arguments: { workspaceUri: 'file:///authorized/workspace' },
    });
    assert.equal(bindingPreparation.structuredContent.status, 'needs_space_selection');
    const binding = await client.callTool({
      name: 'get_e3_workspace_binding',
      arguments: { workspaceUri: 'file:///authorized/workspace' },
    });
    assert.equal(binding.structuredContent.status, 'unbound');
    const myTasks = await client.callTool({
      name: 'query_my_e3_tasks',
      arguments: { filter: 'MyToDo', productId: 'space-1', page: 1, pageSize: 20 },
    });
    assert.equal(myTasks.structuredContent.status, 'success');
    const requirementDetail = await client.callTool({
      name: 'get_e3_requirement_detail',
      arguments: { productId: 'space-1', requirementId: 'req-1' },
    });
    assert.equal(requirementDetail.structuredContent.status, 'not-found');
    const taskDetail = await client.callTool({
      name: 'get_e3_task_detail',
      arguments: { productId: 'space-1', taskId: 'task-1' },
    });
    assert.equal(taskDetail.structuredContent.status, 'not-found');
    await client.callTool({
      name: 'prepare_development_tasks',
      arguments: {
        workspaceUri: 'file:///authorized/workspace',
        changeId: 'v1.2.3-alpha',
        source: { requirementId: 'req-1' },
        tasks: [{ localId: 'DEV-001', title: 'Implement', description: 'Implement safely.' }],
      },
    });
    await client.callTool({
      name: 'select_development_requirement',
      arguments: { selectionToken: 's'.repeat(43), requirementId: 'req-1' },
    });
    await client.callTool({ name: 'execute_development_tasks', arguments: { planToken: 'd'.repeat(43) } });
    await client.callTool({
      name: 'prepare_task_progress',
      arguments: {
        workspaceUri: 'file:///authorized/workspace',
        changeId: 'v1.2.3-alpha',
        updates: [{ localId: 'DEV-001', action: 'complete', worklog: 'Verified.' }],
      },
    });
    await client.callTool({ name: 'execute_task_progress', arguments: { planToken: 'p'.repeat(43) } });
    await client.callTool({
      name: 'get_development_task_status',
      arguments: { workspaceUri: 'file:///authorized/workspace', changeId: 'v1.2.3-alpha' },
    });
    assert.equal(observed.filter((item) => item.operation.startsWith('query-') || item.operation.endsWith('-detail')).length, 3);
    assert.equal(observed.filter((item) => item.roots).length, 12);
    for (const entry of observed.filter((item) => item.roots)) {
      assert.deepEqual(entry.roots, [{ uri: 'file:///authorized/workspace', name: 'fixture' }]);
    }
  } finally {
    await Promise.all([client.close(), server.close()]);
  }
});

test('MCP protocol classifies and redacts read-only query failures', async () => {
  const queryClient = {
    async queryMyTasks() { throw new Error('E3 HTTP 403: access_token=super-secret'); },
  };
  const server = createE3McpServer({ client: queryClient });
  const client = new Client({ name: 'oec-read-query-error-test', version: '1.0.0' }, { capabilities: {} });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  try {
    const response = await client.callTool({ name: 'query_my_e3_tasks', arguments: {} });
    assert.equal(response.isError, true);
    assert.equal(response.structuredContent.status, 'blocked');
    assert.doesNotMatch(response.content[0].text, /super-secret/);
  } finally {
    await Promise.all([client.close(), server.close()]);
  }
});

test('MCP protocol classifies localized business not-found query failures without marking them as tool errors', async () => {
  const queryClient = {
    async getTask() { throw new Error('E3 API rejected request: 请求数据不存在'); },
  };
  const server = createE3McpServer({ client: queryClient });
  const client = new Client({ name: 'oec-read-query-not-found-test', version: '1.0.0' }, { capabilities: {} });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  try {
    const response = await client.callTool({
      name: 'get_e3_task_detail',
      arguments: { productId: 'space-1', taskId: 'missing-task' },
    });
    assert.notEqual(response.isError, true);
    assert.equal(response.structuredContent.status, 'not-found');
  } finally {
    await Promise.all([client.close(), server.close()]);
  }
});

test('MCP protocol converts service failures to redacted blocked tool results', async () => {
  const service = {
    async prepare() { throw new Error('access_token=super-secret'); },
  };
  const server = createE3McpServer({ service });
  const client = new Client({ name: 'oec-mcp-error-test', version: '1.0.0' }, { capabilities: {} });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  try {
    const response = await client.callTool({
      name: 'prepare_prd_publish',
      arguments: { workspaceUri: 'file:///authorized/workspace', version: 'v1.2.3' },
    });
    assert.equal(response.isError, true);
    assert.equal(response.structuredContent.status, 'blocked');
    assert.doesNotMatch(response.content[0].text, /super-secret/);
  } finally {
    await Promise.all([client.close(), server.close()]);
  }
});
