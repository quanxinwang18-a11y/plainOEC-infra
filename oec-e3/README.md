# oec-e3

`oec-e3` 是 MCP-only Claude Code Plugin，负责受门禁保护的 E3 平台操作。它没有 Agent、Skill、
Command、Hook、默认 settings 或通用 CRUD surface。

Plugin 提供四个 PRD 发布工具、六个研发任务规划/创建/复用/进度/状态验证工具，以及三个只读查询工具（我的任务、需求详情、任务详情）。产品发布结果保存为 E3 publication record，研发任务结果保存为 E3 development task record。
`oec-product@3.x` 声明 `oec-e3@~1.0.0` 为原生依赖，因此安装 Product 会加载这一 Server，不会再
内嵌第二套 E3 runtime。

运行时状态保存在 `${CLAUDE_PLUGIN_DATA}`。提交的 `dist/e3-server.mjs` 在 Node.js 20 或更新版本上
运行，不依赖 Plugin 内的 `node_modules`。

账号只从 OAuth JWT 中可验证的 account claim、`OEC_E3_USER_ACCOUNT` 或兼容旧变量取得；无法确定时
prepare 在任何远端创建调用前失败。JWT 不含可识别 claim 时，可通过 Plugin 的非敏感
`e3_user_account` user config 显式提供账号，OAuth token 仍只存放在 Plugin Data。

## Tools

```text
prepare_prd_publish
select_product_space
execute_prd_publish
get_prd_publish_status
query_my_e3_tasks
get_e3_requirement_detail
get_e3_task_detail
prepare_development_tasks
select_development_requirement
execute_development_tasks
prepare_task_progress
execute_task_progress
get_development_task_status
```

项目侧记录：

```text
ai-docs/integrations/e3/publications/<version>.yaml
ai-docs/Spec/integrations/e3/development-tasks/<changeId>.yaml
```

新的 record 路径由 Server 写入；旧 mapping 路径仍可只读恢复，避免已有 E3 身份丢失。

面向用户时优先描述目标，不直接调用 `execute_*`：

```text
检查当前 PRD 的 E3 发布状态，不要更新任何对象。
```

```text
为当前 Change 准备研发任务计划，展示将创建或复用的对象，不要执行。
```

所有远端写入都来自短期不可变 plan，并要求宿主人类交互。PRD publication plan 同时绑定解析出的
E3 account、产物 fingerprint、目标空间/POMP 和 requirement/task create-or-reuse 快照；execute 发现
账号、配置、对象身份或确认快照变化时必须重新 prepare。Server 不提供通用 E3 CRUD、缺陷/测试
请求工作流、任意字段编辑或任意 payload。在同一 Plugin Data 内，PRD publication 按 canonical
workspace 与 version 串行，研发任务创建和 progress 按 canonical workspace 与 change ID 串行；并发
竞争者返回 partial 并要求查询 status 后重试，不会同时创建对象或重复写 worklog。项目仓库中的 publication record 和 development task record 只保存远端身份、关联和恢复所需信息；资源锁只存在于
Plugin Data，不进入业务仓库，也不声称协调使用不同 Plugin Data 的独立安装。

## 当前证据

PRD 发布、精确复用、研发任务创建/复用、进度和最终状态回读已有授权非生产主链证据。当前补丁版本
仍需在唯一授权对象上复验账号归属；mock、Connected 和旧版本主链不能替代该复验。

完整证据和未覆盖边界见
[E3 平台真实验收记录](https://github.com/quanxinwang18-a11y/plainOEC-infra/blob/master/docs/evidence/e3-platform-3.0.0-real-acceptance.md)。
