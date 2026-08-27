import assert from 'node:assert/strict';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { ListRootsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { createPipelineMcpServer } from '../server.mjs';

test('Pipeline MCP exposes four bounded tools and forwards client roots', async () => {
  const observed = [];
  const service = {
    async prepare(input, roots) { observed.push({ operation: 'prepare', input, roots }); return { status: 'ready', planToken: 'p'.repeat(43) }; },
    async selectTarget(input, roots) { observed.push({ operation: 'select', input, roots }); return { status: 'ready', planToken: 'p'.repeat(43) }; },
    async execute(input, roots) { observed.push({ operation: 'execute', input, roots }); return { status: 'running', runToken: 'r'.repeat(43) }; },
    async status(input, roots) { observed.push({ operation: 'status', input, roots }); return { status: 'verified' }; },
  };
  const server = createPipelineMcpServer({ service });
  const client = new Client({ name: 'pipeline-protocol-test', version: '1.0.0' }, { capabilities: { roots: { listChanged: false } } });
  client.setRequestHandler(ListRootsRequestSchema, async () => ({ roots: [{ uri: 'file:///authorized/workspace' }] }));
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  try {
    assert.equal(client.getServerVersion().version, '1.0.2');
    const tools = await client.listTools();
    assert.deepEqual(tools.tools.map((tool) => tool.name), [
      'prepare_pipeline_run',
      'select_pipeline_target',
      'execute_pipeline_run',
      'get_pipeline_run_status',
    ]);
    const execute = tools.tools.find((tool) => tool.name === 'execute_pipeline_run');
    assert.equal(execute.annotations.destructiveHint, true);
    assert.equal(execute.annotations.idempotentHint, true);
    assert.equal(execute._meta['anthropic/requiresUserInteraction'], true);
    const prepareSchema = tools.tools.find((tool) => tool.name === 'prepare_pipeline_run').inputSchema;
    assert.deepEqual(prepareSchema.properties.environment.enum, ['dev', 'test']);
    assert.equal('parameters' in prepareSchema.properties, false);

    await client.callTool({ name: 'prepare_pipeline_run', arguments: {
      workspaceUri: 'file:///authorized/workspace', environment: 'dev', stages: ['Build'],
    } });
    await client.callTool({ name: 'select_pipeline_target', arguments: { selectionToken: 's'.repeat(43), pipelineId: 'p-1' } });
    await client.callTool({ name: 'execute_pipeline_run', arguments: { planToken: 'p'.repeat(43) } });
    await client.callTool({ name: 'get_pipeline_run_status', arguments: {
      workspaceUri: 'file:///authorized/workspace', runToken: 'r'.repeat(43),
    } });
    assert.equal(observed.length, 4);
    for (const item of observed) assert.deepEqual(item.roots, [{ uri: 'file:///authorized/workspace' }]);
  } finally {
    await Promise.all([client.close(), server.close()]);
  }
});

test('Pipeline MCP redacts guarded errors', async () => {
  const server = createPipelineMcpServer({ service: {
    async prepare() { throw new Error('Authorization: Bearer super-secret'); },
  } });
  const client = new Client({ name: 'pipeline-error-test', version: '1.0.0' }, { capabilities: {} });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  try {
    const response = await client.callTool({ name: 'prepare_pipeline_run', arguments: {
      workspaceUri: 'file:///authorized/workspace', environment: 'dev',
    } });
    assert.equal(response.isError, true);
    assert.equal(response.structuredContent.status, 'blocked');
    assert.doesNotMatch(response.content[0].text, /super-secret/);
  } finally {
    await Promise.all([client.close(), server.close()]);
  }
});
