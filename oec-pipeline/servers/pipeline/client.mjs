import { AuthManager, originFor, redactSecrets } from './auth.mjs';

const SUCCESS_CODES = new Set([0, '0', 200, '200']);

function unwrap(payload) {
  if (payload?.success === true && payload.data && typeof payload.data === 'object' && 'code' in payload.data) {
    return payload.data;
  }
  return payload;
}

function responseData(payload) {
  const value = unwrap(payload);
  if (!value || typeof value !== 'object') return value;
  return value.data ?? value.info ?? value;
}

function responseMessage(payload) {
  const value = unwrap(payload);
  return value?.message ?? value?.msg ?? value?.error ?? `Pipeline API code ${value?.code ?? 'unknown'}`;
}

export function isPipelineSuccess(payload) {
  const value = unwrap(payload);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if ('code' in value) return SUCCESS_CODES.has(value.code);
  if ('success' in value) return value.success === true;
  return false;
}

function pageItems(data) {
  if (Array.isArray(data)) return data;
  return data?.records ?? data?.list ?? data?.data ?? [];
}

export class PipelineClient {
  constructor({ auth = new AuthManager(), fetchFn = fetch } = {}) {
    this.auth = auth;
    this.fetchFn = fetchFn;
  }

  async request(environment, method, path, { query, body, retryOn401 = true } = {}) {
    const url = new URL(`${originFor(environment)}${path}`);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    }
    let tokenInfo = await this.auth.getAccessToken(environment);
    const perform = async ({ token }) => this.fetchFn(url, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    let response = await perform(tokenInfo);
    if (response.status === 401 && retryOn401) {
      tokenInfo = await this.auth.recoverAfter401(environment, tokenInfo.source);
      response = await perform(tokenInfo);
    }
    const text = await response.text();
    let payload;
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      payload = {};
    }
    if (!response.ok) {
      throw new Error(redactSecrets(`Pipeline HTTP ${response.status}: ${responseMessage(payload)}`, [tokenInfo.token]));
    }
    if (!isPipelineSuccess(payload)) {
      throw new Error(redactSecrets(`Pipeline API rejected request: ${responseMessage(payload)}`, [tokenInfo.token]));
    }
    return { payload, data: responseData(payload) };
  }

  async listWorkspaces(environment) {
    const { data } = await this.request(environment, 'POST', '/devops/api/ai-bff/openapi/pipeline/queryWorkspacePage', {
      body: { currentPage: 1, pageSize: 1000 },
    });
    return pageItems(data).map((item) => ({
      id: String(item.id ?? item.spaceId),
      name: item.workSpaceName ?? item.workspaceName ?? item.name,
    })).filter((item) => item.id && item.name);
  }

  async listPipelines(environment, spaceId) {
    const { data } = await this.request(environment, 'POST', '/devops/api/ai-bff/openapi/pipeline/queryPipelinePage', {
      body: { spaceId, queryFlag: 0, currentPage: 1, pageSize: 1000 },
    });
    return pageItems(data).map((item) => ({
      id: String(item.id ?? item.pipelineId),
      name: item.pipelineName ?? item.name,
      spaceId: String(item.spaceId ?? spaceId),
    })).filter((item) => item.id && item.name);
  }

  async getPipeline(environment, pipelineId) {
    const { data } = await this.request(environment, 'GET', '/devops/api/ai-bff/openapi/pipeline/edit', {
      query: { pipelineId },
    });
    if (!data?.pipeline) return null;
    return {
      pipeline: data.pipeline,
      taskDataList: Array.isArray(data.taskDataList) ? data.taskDataList : [],
    };
  }

  async listRefs(environment, source, ref) {
    const refsType = source.data?.refsType ?? source.refsType ?? 'BRANCH';
    const { data } = await this.request(environment, 'POST', '/devops/api/ai-bff/openapi/pipeline/getRepoBranchAndTagList', {
      body: [{
        refsType,
        repoType: source.data?.repoType,
        repoUrl: source.data?.repoUrl,
        search: ref,
        currentPage: 1,
        pageSize: 100,
      }],
    });
    const first = Array.isArray(data) ? data[0] : data;
    const page = refsType === 'TAG'
      ? first?.tagListVO?.tagVOPage
      : first?.branchListVO?.branchVOPage;
    return pageItems(page).map((item) => ({
      name: String(item.name ?? ''),
      commitId: String(item.commitId ?? ''),
      commitMessage: item.commitMessage,
    })).filter((item) => item.name && item.commitId);
  }

  async runPipeline(environment, body) {
    const { data } = await this.request(environment, 'POST', '/devops/api/ai-bff/openapi/pipeline/runByManual', { body });
    const id = typeof data === 'object' && data !== null ? data.pipelineLogId ?? data.id : data;
    if (id === undefined || id === null || id === '') throw new Error('Pipeline run succeeded without a verifiable run ID');
    return { id: String(id) };
  }

  async listRuns(environment, pipelineId) {
    const { data } = await this.request(environment, 'GET', '/devops/api/ai-bff/openapi/pipeline/queryPipelineWorkPage', {
      query: { pipelineId, pageNum: 1, pageSize: 100 },
    });
    return pageItems(data).map((item) => ({
      id: String(item.id ?? item.pipelineLogId),
      pipelineId: String(item.pipelineId ?? pipelineId),
      pipelineName: item.pipelineName,
      status: String(item.pipelineStatus ?? item.status ?? ''),
      statusName: item.pipelineStatusName ?? item.statusName,
      runRemark: item.runRemark,
      createTime: item.createTime,
    })).filter((item) => item.id);
  }

  async getRun(environment, runId) {
    const { data } = await this.request(environment, 'GET', '/devops/api/ai-bff/openapi/pipeline/getPipelineWorkById', {
      query: { pipelineLogId: runId },
    });
    if (!data || typeof data !== 'object') return null;
    return {
      id: String(data.id ?? data.pipelineLogId ?? runId),
      pipelineId: String(data.pipelineId ?? ''),
      pipelineName: data.pipelineName,
      status: String(data.pipelineStatus ?? data.status ?? ''),
      statusName: data.pipelineStatusName ?? data.statusName,
      stages: data.pipelineStageInfo,
      runRemark: data.runRemark,
      createTime: data.createTime,
      endTime: data.endTime,
      duration: data.duration,
    };
  }
}
