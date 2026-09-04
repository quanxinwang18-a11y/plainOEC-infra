import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod/v4';
import { AuthManager, redactSecrets } from './auth.mjs';
import { E3Client, isE3NotFoundError } from './client.mjs';
import { DevelopmentTaskService } from './development.mjs';
import { PublisherService } from './publisher.mjs';

function result(value, isError = false) {
  return {
    content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    structuredContent: value,
    ...(isError ? { isError: true } : {}),
  };
}

function readOnlyError(error) {
  const message = redactSecrets(error instanceof Error ? error.message : String(error));
  const notFound = isE3NotFoundError(error);
  return result({ status: notFound ? 'not-found' : 'blocked', errors: [message] }, !notFound);
}

async function rootsFor(mcpServer) {
  try {
    return (await mcpServer.server.listRoots()).roots ?? [];
  } catch {
    return [];
  }
}

export function createE3McpServer({ service, developmentService, client: clientOverride } = {}) {
  const mcpServer = new McpServer({ name: 'oec-e3', version: '1.0.3' });
  const client = clientOverride ?? new E3Client({ auth: new AuthManager() });
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
  const readOnlyGuarded = (handler) => async (input) => {
    try {
      return result(await handler(input));
    } catch (error) {
      return readOnlyError(error);
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
    description: 'Persist a workspace-bound product space returned by PRD publication or workspace-binding preparation.',
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
    description: 'Read the local E3 publication record and verify its requirements and tasks.',
    inputSchema: {
      workspaceUri: z.string().url().describe('A file URI returned by MCP roots/list'),
      version: z.string().regex(/^v\d+\.\d+\.\d+$/),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  }, guarded(async (input) => publisher.status(input, await rootsFor(mcpServer))));

  mcpServer.registerTool('prepare_e3_workspace_binding', {
    title: 'Prepare E3 workspace binding',
    description: 'Read the authenticated E3 spaces and prepare a workspace-scoped selection without changing E3.',
    inputSchema: {
      workspaceUri: z.string().url().describe('A file URI returned by MCP roots/list'),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  }, readOnlyGuarded(async (input) => publisher.prepareWorkspaceBinding(input, await rootsFor(mcpServer))));

  mcpServer.registerTool('get_e3_workspace_binding', {
    title: 'Get E3 workspace binding',
    description: 'Read the E3 product-space binding for one client-authorized workspace.',
    inputSchema: {
      workspaceUri: z.string().url().describe('A file URI returned by MCP roots/list'),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  }, readOnlyGuarded(async (input) => publisher.workspaceBinding(input, await rootsFor(mcpServer))));

  mcpServer.registerTool('query_my_e3_tasks', {
    title: 'Query my E3 tasks',
    description: 'Read the current authenticated account\'s E3 tasks with bounded filters and pagination.',
    inputSchema: z.object({
      filter: z.enum(['MyToDo', 'MyCharged', 'MyParticipated']).default('MyToDo'),
      productId: z.string().trim().min(1).max(128).optional(),
      productIds: z.array(z.string().trim().min(1).max(128)).max(100).optional(),
      status: z.array(z.number().int().min(0).max(99)).max(20).optional(),
      keyword: z.string().trim().max(200).optional(),
      page: z.number().int().min(1).max(10000).default(1),
      pageSize: z.number().int().min(1).max(100).default(20),
    }).strict(),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  }, readOnlyGuarded(async (input) => {
    if (input.productId && input.productIds) {
      throw new Error('productId and productIds may not be supplied together');
    }
    return client.queryMyTasks({
      ...input,
      productIds: input.productIds ?? (input.productId ? [input.productId] : undefined),
    });
  }));

  mcpServer.registerTool('get_e3_requirement_detail', {
    title: 'Get E3 requirement detail',
    description: 'Read one E3 system requirement after resolving its product-specific work item type.',
    inputSchema: z.object({
      productId: z.string().trim().min(1).max(128),
      requirementId: z.string().trim().min(1).max(128),
    }).strict(),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  }, readOnlyGuarded(async (input) => {
    const resolved = await client.getRequirementDetail(input.productId, input.requirementId);
    if (!resolved.requirement) {
      return {
        status: 'not-found',
        source: { productId: input.productId, workItemId: resolved.workItemId, requirementId: input.requirementId },
      };
    }
    return {
      status: 'success',
      requirement: resolved.requirement,
      source: { productId: input.productId, workItemId: resolved.workItemId },
    };
  }));

  mcpServer.registerTool('get_e3_task_detail', {
    title: 'Get E3 task detail',
    description: 'Read one E3 development task without changing its status or worklog.',
    inputSchema: z.object({
      productId: z.string().trim().min(1).max(128),
      taskId: z.string().trim().min(1).max(128),
    }).strict(),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  }, readOnlyGuarded(async (input) => {
    const task = await client.getTask(input.productId, input.taskId);
    if (!task) {
      return {
        status: 'not-found',
        source: { productId: input.productId, taskId: input.taskId },
      };
    }
    return {
      status: 'success',
      task,
      source: { productId: input.productId },
    };
  }));

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
    description: 'Read an E3 development task record and verify task identity, parent linkage, status, and current worklog.',
    inputSchema: {
      workspaceUri: z.string().url().describe('A file URI returned by MCP roots/list'),
      changeId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{1,127}$/),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  }, guarded(async (input) => development.status(input, await rootsFor(mcpServer))));

  return mcpServer;
}
