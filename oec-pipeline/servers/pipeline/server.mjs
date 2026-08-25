import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod/v4';
import { AuthManager, redactSecrets } from './auth.mjs';
import { PipelineClient } from './client.mjs';
import { PipelineService } from './planner.mjs';

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

export function createPipelineMcpServer({ service } = {}) {
  const mcpServer = new McpServer({ name: 'oec-pipeline', version: '1.0.1' });
  const pipeline = service ?? new PipelineService({
    client: new PipelineClient({ auth: new AuthManager() }),
  });
  const guarded = (handler) => async (input) => {
    try {
      return result(await handler(input));
    } catch (error) {
      return result({ status: 'blocked', errors: [redactSecrets(error.message)] }, true);
    }
  };

  mcpServer.registerTool('prepare_pipeline_run', {
    title: 'Prepare existing pipeline run',
    description: 'Inspect the current Git workspace and prepare a non-production run of an existing exactly matched pipeline.',
    inputSchema: {
      workspaceUri: z.string().url().describe('A file URI returned by MCP roots/list'),
      pipelineId: z.string().trim().min(1).optional(),
      ref: z.string().trim().min(1).optional(),
      environment: z.enum(['dev', 'test']),
      stages: z.array(z.string().trim().min(1)).min(1).optional(),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  }, guarded(async (input) => pipeline.prepare(input, await rootsFor(mcpServer))));

  mcpServer.registerTool('select_pipeline_target', {
    title: 'Select existing pipeline target',
    description: 'Select one current exact pipeline candidate from a workspace-bound candidate set.',
    inputSchema: {
      selectionToken: z.string().min(32),
      pipelineId: z.string().min(1),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  }, guarded(async (input) => pipeline.selectTarget(input, await rootsFor(mcpServer))));

  mcpServer.registerTool('execute_pipeline_run', {
    title: 'Execute existing pipeline run',
    description: 'Execute a prepared immutable dev or test pipeline plan after rechecking Git and remote configuration.',
    inputSchema: { planToken: z.string().min(32) },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
    _meta: { 'anthropic/requiresUserInteraction': true },
  }, guarded(async (input) => pipeline.execute(input, await rootsFor(mcpServer))));

  mcpServer.registerTool('get_pipeline_run_status', {
    title: 'Verify pipeline run status',
    description: 'Verify the exact run created by this Plugin without modifying pipeline or workspace state.',
    inputSchema: {
      workspaceUri: z.string().url().describe('A file URI returned by MCP roots/list'),
      runToken: z.string().min(32),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  }, guarded(async (input) => pipeline.status(input, await rootsFor(mcpServer))));

  return mcpServer;
}
