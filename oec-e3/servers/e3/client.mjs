import { E3_ORIGIN, AuthManager, redactSecrets } from './auth.mjs';

const CYXT_ORIGIN = `${E3_ORIGIN}/cyxt`;
const SUCCESS_CODES = new Set(['E00000000', '0', '200', 0, 200]);
const REQUIREMENT_PRIORITY = { P0: 4, P1: 3, P2: 2, P3: 1 };
const TASK_PRIORITY = { P0: 0, P1: 1, P2: 2, P3: 3 };

export function isE3Success(response) {
  if (!response || typeof response !== 'object' || Array.isArray(response)) return true;
  if ('code' in response) return SUCCESS_CODES.has(response.code);
  if ('success' in response) return response.success === true;
  return true;
}

export function extractE3Data(response, path = '') {
  if (!response || typeof response !== 'object' || Array.isArray(response)) return response;
  if (path === '/api/panshi/v1/ccf/workItemId/list') return response.info ?? response.data;
  if (path.includes('/ccf/')) return response.data;
  if (response.code === 'E00000000') return response.info;
  return response.data ?? response.info ?? response;
}

export function extractCreatedId(response, path = '') {
  let data = extractE3Data(response, path);
  if (Array.isArray(data)) data = data[0];
  if (data && typeof data === 'object') return data.id ?? data.taskId ?? data.storyId ?? data.workItemId;
  return data;
}

function errorMessage(response) {
  if (!response || typeof response !== 'object') return 'Unknown E3 error';
  return response.msg ?? response.message ?? response.error ?? `E3 code ${response.code ?? 'unknown'}`;
}

function decodeJwtAccount(token) {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    for (const key of ['user_name', 'username', 'preferred_username', 'account', 'login', 'sub', 'uid', 'userId']) {
      if (typeof claims[key] === 'string' && claims[key]) return claims[key];
    }
  } catch {
    return null;
  }
  return null;
}

function fieldValue(item, key) {
  const value = item?.fieldInfoMap?.[key];
  if (value && typeof value === 'object') return value.value ?? value.displayValue;
  return value ?? item?.[key];
}

export function normalizeRequirement(item, fallbackId) {
  if (!item || typeof item !== 'object') return null;
  const id = item.id ?? fieldValue(item, 'id') ?? fallbackId;
  const title = fieldValue(item, 'title') ?? item.title;
  if (id === undefined || id === null) return null;
  return {
    id: String(id),
    title: title === undefined || title === null ? '' : String(title),
    description: fieldValue(item, 'description') ?? item.description,
    priority: fieldValue(item, 'priority') ?? item.priority,
  };
}

export function normalizeTask(item) {
  if (!item || typeof item !== 'object') return null;
  const id = item.id ?? item.taskId;
  const title = item.name ?? item.taskName ?? item.title;
  if (id === undefined || id === null) return null;
  const requirementId = item.storyId ?? item.requirementId ?? item.parentStoryId;
  return {
    id: String(id),
    title: title === undefined || title === null ? '' : String(title),
    ...(requirementId === undefined || requirementId === null ? {} : { requirementId: String(requirementId) }),
    ...(item.status === undefined && item.taskStatus === undefined && item.state === undefined
      ? {} : { status: String(item.status ?? item.taskStatus ?? item.state) }),
  };
}

export function normalizeTaskLogInfo(item) {
  if (!item || typeof item !== 'object') return null;
  return {
    planId: item.planId ?? 0,
    projectCode: item.pompProjectCode ?? item.projectCode,
    planWorkload: item.planWorkload,
    estimatedWorkload: item.etplanWorkload,
    investedHours: item.hasInvestedHours,
    spentHours: item.acturelyFillInHours,
    remainingHours: item.surplusHours,
    progress: item.progressPercentage,
    worklog: item.workLog,
    date: item.date,
    status: item.status ?? item.taskStatus ?? item.state,
  };
}

function listFromPage(data) {
  if (Array.isArray(data)) return data;
  return data?.list ?? data?.records ?? data?.info ?? [];
}

function optionsFrom(data, fieldKey) {
  if (!data) return [];
  if (Array.isArray(data) && data[0]?.value !== undefined) return data;
  if (Array.isArray(data)) {
    for (const item of data) {
      if (item?.fieldKey === fieldKey || item?.options || item?.data) return item.options ?? item.data ?? [];
    }
  }
  return data.options ?? data.data ?? data.list ?? [];
}

function isDefaultOption(option) {
  return option?.isDefault === true || option?.isDefault === 1 || option?.isDefault === '1';
}

export function selectMetadataOption(options, fieldKey) {
  const values = (options ?? []).filter((item) => item?.value !== undefined && item?.value !== null);
  const defaults = values.filter(isDefaultOption);
  if (defaults.length === 1) return { value: defaults[0].value, warnings: [] };
  if (values.length === 1) return { value: values[0].value, warnings: [] };
  const reason = values.length === 0 ? 'has no candidate' : 'has no unique default';
  return {
    value: undefined,
    warnings: [{
      code: 'e3-metadata-ambiguous',
      message: `${fieldKey} ${reason}; the field will be omitted`,
    }],
  };
}

export class E3Client {
  constructor({ auth = new AuthManager(), fetchFn = fetch } = {}) {
    this.auth = auth;
    this.fetchFn = fetchFn;
  }

  async request(method, path, { query, body, retryOn401 = true } = {}) {
    const tokenInfo = await this.auth.getAccessToken();
    const base = path.startsWith('/ccf/') ? E3_ORIGIN : CYXT_ORIGIN;
    const url = new URL(`${base}${path.startsWith('/') ? path : `/${path}`}`);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    }
    const perform = async ({ token }) => this.fetchFn(url, {
      method,
      headers: { acToken: token, 'Content-Type': 'application/json', Accept: 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

    let currentToken = tokenInfo;
    let response = await perform(currentToken);
    if (response.status === 401 && retryOn401) {
      currentToken = await this.auth.recoverAfter401(tokenInfo.source);
      response = await perform(currentToken);
    }
    const rawText = await response.text();
    let payload;
    try {
      payload = rawText ? JSON.parse(rawText) : {};
    } catch {
      payload = {};
    }
    if (!response.ok) {
      throw new Error(redactSecrets(`E3 HTTP ${response.status}: ${errorMessage(payload)}`, [currentToken.token]));
    }
    if (!isE3Success(payload)) {
      throw new Error(redactSecrets(`E3 API rejected request: ${errorMessage(payload)}`, [currentToken.token]));
    }
    return { payload, data: extractE3Data(payload, path), path };
  }

  async listSpaces() {
    const { data } = await this.request('POST', '/api/panshi/product/getProductList', {
      body: { pageNo: 1, pageSize: 1000 },
    });
    return listFromPage(data).map((item) => ({
      id: String(item.id ?? item.productId),
      name: item.name ?? item.productName,
      createBy: item.createBy ?? item.creator ?? item.owner,
    })).filter((item) => item.id && item.name);
  }

  async listPompProjects(spaceId) {
    const { data } = await this.request('GET', '/api/panshi/configCenter/ps-conf-dict/pomp_project', {
      query: { productId: spaceId, filter: 1 },
    });
    return (Array.isArray(data) ? data : []).map((item) => ({
      code: String(item.dictKey),
      name: item.dictValue,
      isDefault: isDefaultOption(item),
    })).filter((item) => item.code && item.name);
  }

  async getWorkItemId(spaceId) {
    const path = '/api/panshi/v1/ccf/workItemId/list';
    const { data } = await this.request('POST', path, {
      body: { productId: spaceId, keys: ['system_requirement'] },
    });
    if (Array.isArray(data)) {
      const found = data.find((item) => (item.workItemKey ?? item.key) === 'system_requirement');
      return found?.workItemId ?? found?.id;
    }
    return data?.system_requirement;
  }

  async listFieldOptions(spaceId, workItemId, fieldKey, pomProjectId) {
    const otherParam = { productId: Number(spaceId), workItemId: Number(workItemId) };
    if (fieldKey === 'rdManager' || fieldKey === 'qaManager') {
      otherParam.pomProjectId = pomProjectId ?? null;
      otherParam.projectConstructionId = null;
    }
    const path = `/ccf/form/v1/work_item_field/options/${workItemId}/list`;
    const { data } = await this.request('POST', path, {
      body: [{ fieldKey, pageNo: 1, pageSize: 100, operateType: '1', otherParam }],
    });
    return optionsFrom(data, fieldKey);
  }

  async currentAccount() {
    for (const key of ['SKILL_USER_ACCOUNT', 'SKILL_USER_NAME', 'OPENCLAW_USER']) {
      if (process.env[key]) return process.env[key];
    }
    const { token } = await this.auth.getAccessToken();
    const jwt = decodeJwtAccount(token);
    if (jwt) return jwt;
    const spaces = await this.listSpaces();
    return spaces[0]?.createBy ?? null;
  }

  async requirementMetadata(spaceId) {
    const workItemId = await this.getWorkItemId(spaceId);
    if (!workItemId) throw new Error('Selected E3 space has no system-requirement work item');
    const flowPath = `/api/dm/story/v1/list/allFlow/${workItemId}`;
    const [{ data: flows }, pomOptions, account] = await Promise.all([
      this.request('GET', flowPath, { query: { productId: spaceId } }),
      this.listFieldOptions(spaceId, workItemId, 'pomProjectId'),
      this.currentAccount(),
    ]);
    const flowDefinition = Array.isArray(flows) ? flows[0]?.key : null;
    const pomSelection = selectMetadataOption(pomOptions, 'pomProjectId');
    const pomProjectId = pomSelection.value;
    if (!flowDefinition) throw new Error('E3 returned no system-requirement flow');
    if (!account) throw new Error('Unable to determine the current E3 account');
    const [rdOptions, qaOptions] = await Promise.all([
      this.listFieldOptions(spaceId, workItemId, 'rdManager', pomProjectId),
      this.listFieldOptions(spaceId, workItemId, 'qaManager', pomProjectId),
    ]);
    const rdSelection = selectMetadataOption(rdOptions, 'rdManager');
    const qaSelection = selectMetadataOption(qaOptions, 'qaManager');
    return {
      workItemId,
      flowDefinition,
      pomProjectId,
      inChargeBy: account,
      rdManager: rdSelection.value,
      qaManager: qaSelection.value,
      warnings: [...pomSelection.warnings, ...rdSelection.warnings, ...qaSelection.warnings],
    };
  }

  async findRequirementsByExactTitle(spaceId, title) {
    const { data } = await this.request('POST', '/api/dm/story/v1/page', {
      query: { productId: spaceId },
      body: { productId: spaceId, curPage: 1, pageSize: 100, searchKeyword: title },
    });
    return listFromPage(data).map((item) => normalizeRequirement(item)).filter((item) => item?.title === title);
  }

  async listRequirements(spaceId) {
    const { data } = await this.request('POST', '/api/dm/story/v1/page', {
      query: { productId: spaceId },
      body: { productId: spaceId, curPage: 1, pageSize: 1000 },
    });
    return listFromPage(data).map((item) => normalizeRequirement(item)).filter(Boolean);
  }

  async getRequirement(spaceId, workItemId, requirementId) {
    try {
      const { data } = await this.request('GET', `/api/dm/story/v1/${requirementId}/info`, {
        query: { workItemId, productId: spaceId },
      });
      return normalizeRequirement(data, requirementId);
    } catch (error) {
      if (/HTTP 404|not found/i.test(error.message)) return null;
      throw error;
    }
  }

  async createRequirement(spaceId, metadata, requirement) {
    const formJson = {
      title: requirement.remoteTitle,
      description: requirement.descriptionHtml,
      priority: REQUIREMENT_PRIORITY[requirement.priority] ?? REQUIREMENT_PRIORITY.P2,
      flowDefinition: metadata.flowDefinition,
      inChargeBy: metadata.inChargeBy,
      ...(metadata.rdManager ? { rdManager: metadata.rdManager } : {}),
      ...(metadata.qaManager ? { qaManager: metadata.qaManager } : {}),
      ...(metadata.pomProjectId ? { pomProjectId: metadata.pomProjectId } : {}),
    };
    const path = '/api/dm/story/v1/batchSave';
    const { payload } = await this.request('POST', path, {
      query: { productId: spaceId },
      body: { createStoryDTOs: [{ productId: spaceId, workItemId: metadata.workItemId, formJson }], index: 0 },
      retryOn401: true,
    });
    const id = extractCreatedId(payload, path);
    if (!id) throw new Error('E3 requirement creation succeeded without a verifiable ID');
    return { id: String(id), title: requirement.remoteTitle };
  }

  async listTasks(spaceId, requirementId) {
    const { data } = await this.request('POST', `/api/panshi/v2/product/${spaceId}/task/page`, {
      query: { productId: spaceId },
      body: {
        pageNo: 1,
        size: 999,
        condition: { storyId: [requirementId], storyIds: [requirementId], productId: [spaceId] },
      },
    });
    return listFromPage(data).map(normalizeTask).filter(Boolean);
  }

  async getTask(spaceId, taskId) {
    try {
      const { data } = await this.request('GET', '/api/panshi/v2/product/task/info', {
        query: { id: taskId, productId: spaceId },
      });
      return normalizeTask(data);
    } catch (error) {
      if (/HTTP 404|not found/i.test(error.message)) return null;
      throw error;
    }
  }

  async findTasksByExactTitle(spaceId, requirementId, title) {
    return (await this.listTasks(spaceId, requirementId))
      .filter((item) => item.title === title);
  }

  async createTask(spaceId, requirementId, config, story, account) {
    const date = new Date().toISOString().slice(0, 10);
    const estimatedHours = story.estimatedHours ?? 4;
    const path = `/api/panshi/v2/product/${spaceId}/task`;
    const { payload } = await this.request('POST', path, {
      query: { productId: spaceId },
      body: {
        name: story.remoteTitle,
        description: story.descriptionHtml,
        taskType: 3,
        planWorkload: estimatedHours,
        etplanWorkload: estimatedHours,
        inChargeBy: account,
        planStartTime: date,
        planEndTime: date,
        pompProjectCode: config.pompProject.code,
        storyId: String(requirementId),
        priority: TASK_PRIORITY[story.priority] ?? TASK_PRIORITY.P2,
      },
      retryOn401: true,
    });
    const id = extractCreatedId(payload, path);
    if (!id) throw new Error('E3 task creation succeeded without a verifiable ID');
    return { id: String(id), title: story.remoteTitle, requirementId: String(requirementId) };
  }

  async getTaskLogInfo(spaceId, taskId, date) {
    const { data } = await this.request('POST', '/api/panshi/iterativePlanTask/getIterativePlanTaskLogInfo', {
      query: { productId: spaceId },
      body: { id: taskId, productId: spaceId, ...(date ? { date } : {}) },
    });
    const value = normalizeTaskLogInfo(data);
    if (!value) throw new Error(`E3 returned no worklog metadata for task ${taskId}`);
    if (!value.projectCode) throw new Error(`E3 returned no POMP project code for task ${taskId}`);
    if (value.planWorkload === undefined || value.planWorkload === null) {
      throw new Error(`E3 returned no planned workload for task ${taskId}`);
    }
    return value;
  }

  async startTask(spaceId, taskId) {
    await this.request('PUT', `/api/panshi/v2/product/task/${taskId}/status`, {
      query: { productId: spaceId, status: 2 },
    });
    return { id: String(taskId), status: '2' };
  }

  async writeTaskWorklog(spaceId, taskId, logInfo, update) {
    const complete = update.action === 'complete';
    const spentHours = update.spentHours ?? Number(logInfo.spentHours ?? 0);
    if (!Number.isFinite(spentHours) || spentHours < 0 || spentHours > 24) {
      throw new Error(`E3 task ${taskId} worklog hours must be between 0 and 24`);
    }
    const body = {
      productId: spaceId,
      planId: logInfo.planId ?? 0,
      projectCode: logInfo.projectCode,
      planWorkload: logInfo.planWorkload,
      acturelyFillInHours: spentHours,
      ...(complete ? { surplusHours: 0, progressPercentage: '100', state: 3 } : {}),
      ...(!complete && logInfo.remainingHours !== undefined && logInfo.remainingHours !== null
        ? { surplusHours: logInfo.remainingHours } : {}),
      ...(!complete && logInfo.progress !== undefined && logInfo.progress !== null
        ? { progressPercentage: String(logInfo.progress) } : {}),
      workLog: update.worklog,
    };
    await this.request('PUT', `/api/panshi/v2/product/task/${taskId}/workLog`, {
      query: { productId: spaceId },
      body,
    });
    return {
      id: String(taskId),
      spentHours,
      worklog: update.worklog,
      ...(complete ? { status: '3', progress: '100' } : {}),
    };
  }
}
