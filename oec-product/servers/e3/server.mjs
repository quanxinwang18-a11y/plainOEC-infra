import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod/v4';
import { AuthManager, redactSecrets } from './auth.mjs';
import { E3Client } from './client.mjs';
import { PublisherService } from './publisher.mjs';

function result(value, isError = false) {
  return {
    content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    structuredContent: value,
    ...(isError ? { isError: true } : {}),
  };
}

async function rootsFor(mcpServer) {
  try {
    return (await mcpServer.server.listRoots()).roots ?? [];
  } catch {
    return [];
  }
}

export function createE3McpServer({ service } = {}) {
  const mcpServer = new McpServer({ name: 'oec-product-e3', version: '2.2.0' });
  const publisher = service ?? new PublisherService({
    client: new E3Client({ auth: new AuthManager() }),
  });

  const guarded = (handler) => async (input) => {
    try {
      return result(await handler(input));
    } catch (error) {
      return result({ status: 'blocked', errors: [redactSecrets(error.message)] }, true);
    }
  };

  mcpServer.registerTool('prepare_prd_publish', {
    title: 'Prepare OEC PRD publication',
    description: 'Validate a PRD handoff and prepare a non-mutating E3 publication plan.',
    inputSchema: {
      workspaceUri: z.string().url().describe('A file URI returned by MCP roots/list'),
      version: z.string().regex(/^v\d+\.\d+\.\d+$/).optional(),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  }, guarded(async (input) => publisher.prepare(input, await rootsFor(mcpServer))));

  mcpServer.registerTool('select_product_space', {
    title: 'Select E3 product space',
    description: 'Persist a workspace-bound product space returned by publication preparation.',
    inputSchema: {
      selectionToken: z.string().min(32),
      spaceId: z.string().min(1),
      pompProjectCode: z.string().min(1).optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  }, guarded(async (input) => publisher.selectProductSpace(input, await rootsFor(mcpServer))));

  mcpServer.registerTool('execute_prd_publish', {
    title: 'Execute OEC PRD publication',
    description: 'Execute a previously prepared immutable E3 publication plan.',
    inputSchema: { planToken: z.string().min(32) },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
    _meta: { 'anthropic/requiresUserInteraction': true },
  }, guarded(async (input) => publisher.execute(input, await rootsFor(mcpServer))));

  mcpServer.registerTool('get_prd_publish_status', {
    title: 'Verify OEC PRD publication',
    description: 'Read the local mapping and verify its E3 requirements and tasks.',
    inputSchema: {
      workspaceUri: z.string().url().describe('A file URI returned by MCP roots/list'),
      version: z.string().regex(/^v\d+\.\d+\.\d+$/),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  }, guarded(async (input) => publisher.status(input, await rootsFor(mcpServer))));

  return mcpServer;
}
