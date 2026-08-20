import assert from 'node:assert/strict';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { ListRootsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { createE3McpServer } from '../server.mjs';

test('MCP protocol exposes four tools and forwards client roots to guarded operations', async () => {
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
  };
  const server = createE3McpServer({ service });
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
    assert.equal(client.getServerVersion().version, '2.2.0');
    const tools = await client.listTools();
    assert.deepEqual(tools.tools.map((tool) => tool.name), [
      'prepare_prd_publish',
      'select_product_space',
      'execute_prd_publish',
      'get_prd_publish_status',
    ]);
    const execute = tools.tools.find((tool) => tool.name === 'execute_prd_publish');
    assert.equal(execute.annotations.destructiveHint, true);
    assert.equal(execute._meta['anthropic/requiresUserInteraction'], true);

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
    assert.equal(observed.length, 4);
    for (const entry of observed.filter((item) => item.roots)) {
      assert.deepEqual(entry.roots, [{ uri: 'file:///authorized/workspace', name: 'fixture' }]);
    }
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
