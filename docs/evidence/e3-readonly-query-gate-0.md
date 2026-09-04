# E3 只读查询 Gate 0 证据

> 日期：2026-09-04
> 目标：为 `oec-e3` 只读查询能力确认 API 路径、响应结构、动态字段和错误边界
> 环境：已授权的非生产 E3 空间；不包含远端写入操作

## 1. 证据来源

静态 API 依据：

- `/Users/qxwang6/project/agent/harness/OBU-base/yunfan/manage-dev-task/references/api-reference.md`
- `/Users/qxwang6/project/agent/harness/OBU-base/yunfan/manage-dev-task/scripts/query_task.py`
- `/Users/qxwang6/project/agent/harness/OBU-base/yunfan/query-system-requirements/references/api-contracts.md`
- `/Users/qxwang6/project/agent/harness/OBU-base/yunfan/query-system-requirements/scripts/get_requirement.py`
- `/Users/qxwang6/project/agent/harness/OBU-base/yunfan/query-system-requirements/scripts/get_work_item_id.py`

当前仓库实现依据：

- `oec-e3/servers/e3/client.mjs`
- `oec-e3/servers/e3/server.mjs`
- `oec-e3/servers/e3/tests/client.test.mjs`
- `oec-e3/servers/e3/tests/mcp-protocol.test.mjs`

## 2. 真实只读验证

所有命令均使用 `uv run --with requests>=2.28.0`，因为原始 Python 环境没有预装 `requests`。

### 2.1 查询我的任务

```text
POST /api/workbench/v1/myWorkItem/task
filter=MyToDo
page=1
size=5
```

结果：

```text
HTTP/API success
response wrapper: code=E00000000, info={total,totalPages,curPage,pageSize,list}
returned records: 5
```

另以当前非生产空间执行：

```text
POST /api/workbench/v1/myWorkItem/task
filter=MyCharged
productId=[redacted non-production space]
page=1
size=5
```

结果：

```text
HTTP/API success
response wrapper: code=E00000000, info={total,totalPages,curPage,pageSize,list}
total: 9
page: 1
pageSize: 5
```

确认事项：

- `filter` 支持 `MyToDo`、`MyCharged`、`MyParticipated`；
- 分页字段为 `pageNo`、`size`；
- 响应页信息位于 `info`；
- 账号由登录态决定，查询请求不接受调用者传入账号；
- 本次只读请求没有产生 E3 写入。

### 2.2 动态解析 system-requirement workItemId

```text
POST /api/panshi/v1/ccf/workItemId/list
body: {"productId": <non-production space>, "keys": ["system_requirement"]}
```

结果：

```text
HTTP/API success
key: system_requirement
workItemId: dynamically returned value
```

本次验证的实际值已写入测试 fixture 前经过脱敏处理。实现不硬编码 `1077`，而是调用现有
`E3Client.getWorkItemId(productId)`。

### 2.3 查询系统需求详情

```text
GET /api/dm/story/v1/{requirementId}/info
query: workItemId=<dynamically resolved>, productId=<non-production space>
```

结果：

```text
HTTP/API success
response wrapper: code=E00000000, info=BizDataDetailVO
fieldInfoMap contains: id, title, description, priority, status
```

确认事项：

- `workItemId` 必须随 product space 动态解析；
- `fieldInfoMap` 是详情字段的主要来源；
- `status` 同时可能包含 value 和 displayValue；
- description 可能是 HTML，用户输出需要经过安全处理。

### 2.4 查询开发任务详情

```text
GET /api/panshi/v2/product/task/info
query: id=<non-production task>, productId=<non-production space>
```

结果：

```text
HTTP/API success
response wrapper: code=E00000000, info=PsWorkItemVO
info contains: id, name, status, storyId, productId, priority
```

确认事项：

- 任务详情可通过 `id + productId` 唯一读取；
- 父需求身份由 `storyId` 返回；
- 详情查询不改变状态、worklog 或任务映射。

## 3. 错误边界验证

### 3.1 401 无效 token

使用明确无效的临时 token 对只读详情接口执行探测：

```text
HTTP status: 401
body: {"error":"invalid_token","error_description":"Cannot convert access token to JSON"}
```

该响应未保存 token，仅保存脱敏后的错误 fixture。

### 3.2 业务层 not-found

使用不存在的任务 ID 执行只读详情查询：

```text
HTTP status: 200
body: {"code":"2004","info":{},"msg":"请求数据不存在"}
```

该平台将“数据不存在”作为业务错误返回，而不是 HTTP 404。实现已将以下情况统一归类为
`not-found`，不会错误报告为工具异常：

```text
HTTP 404
not found
请求数据不存在
任务不存在
需求不存在
```

### 3.3 未完成项

本次没有使用未知空间制造 403；权限错误仍由 mock/protocol test 覆盖，真实 403 fixture 待获得安全的
非生产权限边界后补充。它不阻塞当前只读查询代码，但阻塞“完整真实权限矩阵”声明。

## 4. 脱敏 fixture

以下 fixture 保存 API 结构，不保存真实账号、token、完整内部描述或可识别远端身份：

```text
oec-e3/servers/e3/tests/fixtures/query-my-tasks.success.json
oec-e3/servers/e3/tests/fixtures/requirement-detail.success.json
oec-e3/servers/e3/tests/fixtures/task-detail.success.json
oec-e3/servers/e3/tests/fixtures/error-401.invalid-token.json
oec-e3/servers/e3/tests/fixtures/error-404.business-not-found.json
```

fixture 仅用于本地响应归一化和错误分类测试，不替代真实宿主验收。

## 5. Gate 1：打包 MCP 真实只读 outcome

使用当前生成的 `oec-e3/dist/e3-server.mjs`，通过 MCP stdio transport 和已授权的非生产账号执行：

```text
query_my_e3_tasks(productId=202330, filter=MyToDo, page=1, pageSize=2)
get_e3_requirement_detail(productId=202330, requirementId=<non-production requirement>)
get_e3_task_detail(productId=202330, taskId=<non-production task>)
```

结果：

```text
toolCount: 15
read-only query tools discovered: true
query_my_e3_tasks: status=success, taskCount=2, isError=false
get_e3_requirement_detail: status=success, workItemId=1057, isError=false
get_e3_task_detail: status=success, isError=false
```

本次 MCP client 没有调用任何写入工具，未执行 `execute_*`，也未改变 E3 对象。

## 6. Gate 2：workspace binding prepare

使用当前生成的 MCP bundle，并向 Server 提供当前 workspace 的授权 MCP root：

```text
prepare_e3_workspace_binding(workspaceUri=<authorized current workspace>)
get_e3_workspace_binding(workspaceUri=<authorized current workspace>)
```

结果：

```text
prepare status: needs_space_selection
candidate count: 2
binding status before selection: unbound
isError: false
```

在用户明确选择空间 `202330` 后，使用隔离的临时 Plugin Data 完成了选择行为验证：

```text
select_product_space: selected
get_e3_workspace_binding: bound
productSpaceId: 202330
POMP selection: present
isError: false
```

该验证只写入隔离的临时 Plugin Data，不写入业务仓库，也没有执行任何 E3 远端业务写入。
正式宿主实例仍需使用其实际提供的 `${CLAUDE_PLUGIN_DATA}` 重复一次绑定；本 shell 未提供该宿主变量，
因此没有擅自写入猜测的用户级目录。

## 7. Gate 0/1/2 结论

```text
静态 API 契约：通过
真实只读成功响应：通过
打包 MCP stdio outcome：通过
动态 workItemId：通过
分页结构：通过
401/业务 not-found：通过
workspace binding prepare：通过
真实 403：待补充
远端写入：本次未执行
```

因此只读查询和 workspace binding prepare 已具备继续进行用户选择验收的证据，但不能据此宣称完整 E3
写入流程或全部权限矩阵已经完成。E3 创建、进度更新仍必须继续使用现有 prepare/execute/status 安全链路。
