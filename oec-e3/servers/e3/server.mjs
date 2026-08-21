import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod/v4';
import { AuthManager, redactSecrets } from './auth.mjs';
import { E3Client } from './client.mjs';
import { DevelopmentTaskService } from './development.mjs';
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

export function createE3McpServer({ service, developmentService } = {}) {
  const mcpServer = new McpServer({ name: 'oec-e3', version: '1.0.0' });
  const client = new E3Client({ auth: new AuthManager() });
  const publisher = service ?? new PublisherService({
    client,
  });
  const development = developmentService ?? new DevelopmentTaskService({ client });

  const guarded = (handler) => async (input) => {
    try {
      return result(await handler(input));
    } catch (error) {
      return result({ status: 'blocked', errors: [redactSecrets(error.message)] }, true);
    }
  };

  mcpServer.registerTool('prepare_prd_publish', {
    title: 'Prepare PRD publication',
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
    title: 'Execute PRD publication',
    description: 'Execute a previously prepared immutable E3 publication plan.',
    inputSchema: { planToken: z.string().min(32) },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
    _meta: { 'anthropic/requiresUserInteraction': true },
  }, guarded(async (input) => publisher.execute(input, await rootsFor(mcpServer))));

  mcpServer.registerTool('get_prd_publish_status', {
    title: 'Verify PRD publication',
    description: 'Read the local mapping and verify its E3 requirements and tasks.',
    inputSchema: {
      workspaceUri: z.string().url().describe('A file URI returned by MCP roots/list'),
      version: z.string().regex(/^v\d+\.\d+\.\d+$/),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  }, guarded(async (input) => publisher.status(input, await rootsFor(mcpServer))));

  mcpServer.registerTool('prepare_development_tasks', {
    title: 'Prepare E3 development tasks',
    description: 'Resolve a parent requirement and prepare an immutable plan to create or reuse bounded E3 development tasks.',
    inputSchema: {
      workspaceUri: z.string().url().describe('A file URI returned by MCP roots/list'),
      changeId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{1,127}$/),
      source: z.object({
        prdVersion: z.string().regex(/^v\d+\.\d+\.\d+$/).optional(),
        featureName: z.string().regex(/^[a-z][A-Za-z0-9]*$/).optional(),
        requirementId: z.string().min(1).optional(),
      }).optional(),
      tasks: z.array(z.object({
        localId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/),
        title: z.string().trim().min(1),
        description: z.string().trim().min(1),
        priority: z.enum(['P0', 'P1', 'P2', 'P3']).optional(),
        estimatedHours: z.number().positive().max(999).optional(),
      })).min(1),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  }, guarded(async (input) => development.prepare(input, await rootsFor(mcpServer))));

  mcpServer.registerTool('select_development_requirement', {
    title: 'Select E3 development requirement',
    description: 'Select one current parent requirement from a workspace-bound development-task candidate set.',
    inputSchema: {
      selectionToken: z.string().min(32),
      requirementId: z.string().min(1),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  }, guarded(async (input) => development.selectRequirement(input, await rootsFor(mcpServer))));

  mcpServer.registerTool('execute_development_tasks', {
    title: 'Execute E3 development task plan',
    description: 'Execute a previously prepared immutable plan and checkpoint each created or reused E3 task.',
    inputSchema: { planToken: z.string().min(32) },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
    _meta: { 'anthropic/requiresUserInteraction': true },
  }, guarded(async (input) => development.execute(input, await rootsFor(mcpServer))));

  mcpServer.registerTool('prepare_task_progress', {
    title: 'Prepare E3 task progress',
    description: 'Verify mapped development tasks and prepare bounded start, worklog, or completion updates without changing E3.',
    inputSchema: {
      workspaceUri: z.string().url().describe('A file URI returned by MCP roots/list'),
      changeId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{1,127}$/),
      updates: z.array(z.object({
        localId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/),
        action: z.enum(['start', 'log', 'complete']),
        worklog: z.string().trim().min(1).optional(),
        spentHours: z.number().min(0).max(24).optional(),
      })).min(1),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  }, guarded(async (input) => development.prepareProgress(input, await rootsFor(mcpServer))));

  mcpServer.registerTool('execute_task_progress', {
    title: 'Execute E3 task progress',
    description: 'Execute a prepared task-progress plan using server-derived E3 worklog metadata and checkpoint each success.',
    inputSchema: { planToken: z.string().min(32) },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
    _meta: { 'anthropic/requiresUserInteraction': true },
  }, guarded(async (input) => development.executeProgress(input, await rootsFor(mcpServer))));

  mcpServer.registerTool('get_development_task_status', {
    title: 'Verify E3 development tasks',
    description: 'Read a development mapping and verify task identity, parent linkage, status, and current worklog in E3.',
    inputSchema: {
      workspaceUri: z.string().url().describe('A file URI returned by MCP roots/list'),
      changeId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{1,127}$/),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  }, guarded(async (input) => development.status(input, await rootsFor(mcpServer))));

  return mcpServer;
}
