# plainOEC E3 集成保守重设计方案

**文档版本**: 2.1
**制定日期**: 2026-09-04
**状态**: Approved design baseline；尚未开始实施
**代码基线**: `0f9ee81`，`oec-e3@1.0.3`
**负责人**: [待定]

---

## 一、执行摘要

本方案保留 E3 查询、workspace 绑定、需求到多仓库映射、跨仓库开发上下文以及 E3
研发任务管理能力，但采用保守的实现方式：

```text
只读查询
→ 当前 workspace 显式绑定
→ 可解释的仓库映射建议
→ 用户确认
→ 每个仓库独立规划
→ 可选的受控 E3 写入
```

核心原则：

1. **Read first**：先补齐开发者真正需要的 E3 只读查询能力。
2. **Current workspace first**：只处理当前 workspace 和用户明确授权的其他 Root。
3. **Advice, not authority**：LLM 只提出仓库候选、依据和不确定项，不决定最终范围。
4. **One repository at a time**：每个 Dev Root 独立规划、独立 `taskRef`、独立确认。
5. **Reuse the safety runtime**：E3 创建和进度更新必须复用现有 prepare/confirm/execute/status 链路。
6. **No implicit project mutation**：不自动扫描仓库，不自动 `git pull`，不在 SessionStart 注入项目状态。
7. **Graceful degradation**：E3 不可用时，用户仍可用明确的 PRD、需求文本或已有任务产物继续本地工作。

本方案不是：

- 全局任务管理器；
- 跨仓库自动编排器；
- Session 状态系统；
- E3 通用 CRUD 客户端；
- 自动同步 PRD 或代码仓库的工具。

---

## 二、当前事实与问题边界

### 2.1 当前 E3 MCP 能力

当前 `oec-e3` 不是只有四个工具。它已经提供十个 MCP 工具。

PRD 发布：

```text
prepare_prd_publish
select_product_space
execute_prd_publish
get_prd_publish_status
```

研发任务与进度：

```text
prepare_development_tasks
select_development_requirement
execute_development_tasks
prepare_task_progress
execute_task_progress
get_development_task_status
```

这些工具已经实现短期不可变 plan、Human confirmation、账号与空间绑定、create-or-reuse
快照、锁、checkpoint、未知结果恢复和 status/read-back。

### 2.2 当前真正缺少的能力

当前 MCP 对外缺少面向开发者的直接只读入口：

```text
查询我的 E3 任务
查询 E3 系统需求详情
查询 E3 开发任务详情
```

底层 `E3Client` 已经具有部分相关原语：

```text
listRequirements()
getRequirement()
listTasks()
getTask()
```

“查询我的任务”仍需要真实 API 契约和非生产 fixture 支持，不能根据接口名称猜测实现。

### 2.3 需要解决的用户问题

开发者应能用自然语言完成：

```text
“查看我的 E3 任务”
“查看 STORY-456 的需求详情”
“根据 STORY-456 规划当前仓库的开发”
“这个需求是否还涉及前端仓库？”
“为已确认的开发计划准备 E3 任务”
“把这个任务标记为完成并记录工时”
```

用户不需要预先知道 MCP 工具名、`taskRef` 或内部执行阶段。

---

## 三、明确的架构边界

### 3.1 三类事实分别归属

```text
E3：
  E3 requirement/task identity
  远端状态
  负责人
  工时和 worklog

业务仓库：
  PRD
  task spec.md/design.md
  Team Specs/ADR
  代码
  本地验证证据

Plugin Data：
  OAuth/token
  当前 workspace 的 E3 binding
  selection
  immutable plan
  lock
  checkpoint
  可失效的私有映射缓存
```

“E3 是事实源”仅指 E3 远端对象的身份和状态。E3 不是代码、PRD、Design 或本地验证证据的事实源。

### 3.2 不新增的状态

本方案不新增：

```text
global-workspace.json
active task pointer
任务生命周期状态机
通用跨会话 Journal
跨仓库全局协调文件
自动持久化的需求映射历史
```

### 3.3 不允许的隐式行为

```text
不扫描 ~/work、父目录或其他未授权目录
不根据目录名猜 E3 空间
不自动选择 latest requirement/task
不自动 git fetch/pull/checkout
不在 SessionStart 查询 E3
不在 SessionStart 注入 workspace、任务或映射状态
不根据 LLM confidence 自动决定仓库范围
不在一次未确认操作中写入多个仓库
```

---

## 四、Phase 0：真实 API 契约和证据

在增加工具前，先确认真实非生产 API 契约。

### 4.1 必须取得的证据

1. “我的任务”API 的真实 method、path、query/body 和分页字段；
2. 系统需求详情 API 的真实响应；
3. 开发任务详情 API 的真实响应；
4. `401`、`403`、`404`、空结果、分页末尾和网络错误行为；
5. 当前账号的可信来源；
6. `workItemId` 的动态解析方式；
7. 字段中可能包含的 HTML、个人信息和敏感内容；
8. 非生产 fixture 和脱敏后的响应样例。

### 4.2 API 约束

- 不硬编码 `workItemId=1077`；使用当前 `getWorkItemId(productId)` 动态解析。
- 不假设 `/task/batch-create` 存在；任何新 endpoint 必须有真实非生产证据。
- 不把自由文本中的 PRD 路径视为可信结构化字段。
- 不把组件测试或 mock 响应描述为真实 API 验收。
- 原始 token、Cookie、个人信息和完整 HTML 不进入 Git fixture。

### 4.3 Phase 0 退出条件

```text
- 三个查询场景均有脱敏 fixture
- 输入、输出和错误 schema 已评审
- 账号、空间、分页和权限边界明确
- API endpoint 有真实来源证据
- 无法确认的字段从第一版 schema 中移除
```

---

## 五、Phase 1：E3 只读查询

### 5.1 新增工具

第一阶段只新增三个 read-only MCP 工具：

```text
query_my_e3_tasks
get_e3_requirement_detail
get_e3_task_detail
```

`list_e3_product_spaces` 不是第一阶段必需工具。现有 prepare/select 流程已经能够返回和选择产品空间；
只有当查询工作流确实需要独立列举空间时，才增加只读列表工具。

### 5.2 `query_my_e3_tasks`

用途：查询当前可信 E3 账号负责的开发任务。

建议输入：

```json
{
  "productId": "optional explicit product space",
  "status": ["optional bounded filters"],
  "page": 1,
  "pageSize": 50
}
```

约束：

- “我的”账号只能来自 OAuth/JWT claim、`OEC_E3_USER_ACCOUNT` 或宿主非敏感配置；
- 不允许调用者传入任意账号冒充其他用户；
- 未提供 `productId` 时，只有真实 API 明确支持跨空间查询才允许跨空间；
- 否则返回空间候选并要求用户选择；
- `pageSize` 设置上限；
- 返回结果必须保留 `productId`、task ID、状态和父需求 identity。

### 5.3 `get_e3_requirement_detail`

建议输入：

```json
{
  "productId": "12345",
  "requirementId": "456"
}
```

实现复用：

```text
getWorkItemId(productId)
→ getRequirement(productId, workItemId, requirementId)
```

第一版只返回已验证稳定的字段：

```json
{
  "status": "success | not-found | blocked",
  "requirement": {
    "id": "456",
    "title": "优化支付流程",
    "description": "...",
    "priority": "...",
    "status": "..."
  },
  "source": {
    "productId": "12345",
    "workItemId": "dynamically resolved"
  },
  "warnings": [],
  "errors": []
}
```

未经真实 API 验证的 `planId`、URL、时间字段或 PRD 关联不进入首版 schema。

### 5.4 `get_e3_task_detail`

建议输入：

```json
{
  "productId": "12345",
  "taskId": "789"
}
```

第一版复用 `getTask()`，并在有真实证据后按需补充 worklog metadata。查询详情不会改变任务状态。

### 5.5 工具安全属性

三个工具统一声明：

```text
readOnlyHint: true
destructiveHint: false
idempotentHint: true
openWorldHint: true
```

查询不会：

```text
写业务仓库
写 E3 对象
创建 task mapping
自动开始实现
自动生成 spec/design
```

### 5.6 Phase 1 验收

```text
- 当前账号不可伪造
- 空间歧义不会静默选择
- 分页不会遗漏或重复
- 401/403/404/空结果可区分
- HTML 和错误消息经过安全处理
- 查询失败不会触发任何远端写入
- 非生产宿主查询结果与 E3 页面一致
```

---

## 六、Phase 2：当前 workspace 的显式 E3 绑定

### 6.1 目标

降低用户反复选择空间的成本，但不建立全局仓库管理系统。

### 6.2 存储范围

绑定保存在对应 Plugin Data 中，按 canonical workspace 隔离：

```text
${CLAUDE_PLUGIN_DATA}/workspaces/<canonical-workspace>/...
```

具体文件布局由 `oec-e3` runtime 统一管理，不把路径写死到 Skill 中。

概念 schema：

```json
{
  "schema_version": 1,
  "workspace": {
    "gitRemote": "git@gitlab.example/team/payment-backend.git"
  },
  "productSpace": {
    "id": "12345",
    "name": "payment"
  },
  "productRoot": {
    "localPath": "/user-confirmed/path/payment-prd",
    "gitRemote": "git@gitlab.example/product/payment-prd.git",
    "revision": "optional-confirmed-commit"
  }
}
```

`productRoot` 是可选项。本地绝对路径只保存在 Plugin Data，不进入 E3 或业务仓库。

### 6.3 首次绑定流程

```text
用户明确请求 E3 能力
→ 查询所需空间或返回候选
→ 展示当前 workspace 与空间
→ 用户确认
→ 保存 workspace binding
→ 继续原始请求
```

绑定操作不等于授权任何远端写入。

### 6.4 仓库身份

不能只用用户输入的字符串路径识别仓库。至少结合：

```text
MCP root/workspace URI
realpath containment
Git repository root
Git remote identity
```

支持 Git worktree 和多个 clone 时，不假设一个 remote 只有一个本地路径。

### 6.5 Product Root 规则

#### 6.5.1 Product Root 的发现优先级

```text
优先级 1: Git submodule
  → 检查当前 Dev Root 是否有 PRD 仓库作为 submodule
  → 如果有，直接使用 submodule 路径
  → 示例: payment-backend/prd/ (git submodule)

优先级 2: 用户手工指定
  → 询问用户："PRD 仓库本地路径？"
  → 用户提供已存在的本地路径
  → 验证路径是宿主授权 Root 或用户明确授权的可读目录
  → 保存到 workspace config

优先级 3: 当前会话辅助 clone
  → 询问用户："PRD 仓库 Git URL？"
  → 建议 clone 位置（基于约定或用户选择）
  → 用户确认后执行 git clone
  → 保存路径到 workspace config
```

#### 6.5.2 允许的操作

- 读取指定 revision 的 PRD；
- 只读检查当前 checkout 和工作区状态；
- 记录用户确认的 remote/revision；
- 用户确认后的独立 git clone（优先级 3）；
- 用户确认后的独立 git fetch/pull（过期同步）。

#### 6.5.3 不允许默认

```text
自动 git pull/fetch/checkout
自动切换 branch
自动解决冲突
在工作区有修改时同步
修改 submodule 状态（submodule update）
```

#### 6.5.4 过期检测

如果 Product Root 可能过期，只报告：

```text
当前 revision
远端 revision（git fetch --dry-run 或 git log 只读检查）
工作区是否干净
建议用户手工同步或提供确认
```

任何 Git 写操作必须由用户单独授权，且不属于 E3 查询流程的隐式步骤。

### 6.6 Phase 2 验收

```text
- 未绑定 workspace 不会静默选择空间
- 一个 workspace 的配置不会影响另一个 workspace
- 目录移动、worktree 和多个 clone 不会错绑
- Plugin Data 并发写入使用原子写和锁
- 配置损坏时安全失败，不覆盖业务仓库
- SessionStart 不读取或注入绑定状态
```

---

## 七、Phase 3：可解释的需求到仓库映射

### 7.1 定位

映射能力保留，但它是 Main Session 在 Skill 指导下完成的**建议**，不是新的 LLM 服务、自动路由器或
事实源。

### 7.2 输入边界

允许读取：

```text
E3 需求详情
用户明确提供的 PRD
当前 Dev Root 的 ai-docs/Spec
当前 Dev Root 的 CLAUDE.md
用户明确提供且宿主授权的其他 Dev Roots
```

不允许读取：

```text
~/work 下的所有仓库
Plugin Data 中任意历史路径
未出现在 MCP roots 或未获用户授权的目录
```

仓库根 `CLAUDE.md` 仅作为该业务仓库的补充证据；安装后的 PlainOEC 运行规则仍由 Plugin 自身的
Skill、Agent、Hook 和 MCP 提供。

### 7.3 映射输出

不使用未校准的数字 confidence 决定范围。使用可解释分类：

```text
required
possibly-related
not-indicated
unknown
```

每个候选包含：

```json
{
  "repository": "payment-backend",
  "classification": "required",
  "reason": "SPEC-payment-domain 明确声明负责支付重试机制",
  "matchedSpecs": ["SPEC-payment-domain"],
  "matchedPaths": ["services/payment/**"],
  "unresolvedAssumptions": []
}
```

要求：

- 理由引用具体 Spec、`applies_to`、代码或 `CLAUDE.md` 内容；
- `unknown` 是合法结果；
- 不把历史相似标题当作当前事实；
- 映射结果必须由开发者确认；
- 确认仓库集合不等于确认写文件或实现代码。

### 7.4 映射交互

```text
用户：根据 STORY-456 开发

Main Session：
1. 只读查询 STORY-456；
2. 读取当前仓库事实；
3. 如用户要求跨仓分析，询问并读取明确授权的其他仓库；
4. 展示 required / possibly-related / unknown 以及证据；
5. 用户确认本次涉及的仓库；
6. 从当前仓库开始单独规划。
```

### 7.5 历史映射

MVP 不保存映射历史。

只有在真实重复场景证明有价值后，才允许保存：

```text
用户确认过的映射
workspace/space/story identity
来源 fingerprint
失效时间
```

历史映射只能作为提示，不能：

```text
覆盖当前 Team Specs
自动选择仓库
绕过用户确认
```

### 7.6 映射评估

不能用 Mock LLM 响应证明准确度。需要固定 corpus：

```text
需求文本
可用仓库
Team Specs/CLAUDE.md fixture
人工标注的 required/possible/unknown
```

分别度量：

```text
required precision
required recall
false-positive repository rate
unknown rate
用户修正率
证据引用正确率
```

不预设未经基线支持的“准确率 >=80%”。

---

## 八、Phase 4：逐仓库规划与跨仓库开发

### 8.1 一个仓库一个任务边界

每个 Dev Root 使用独立的：

```text
DEV_ROOT
canonical taskRef
spec.md
design.md
Change Boundary
Verification
```

示例：

```text
payment-backend:
  versioned:v1.3.0/story-456-retry-backend

payment-frontend:
  versioned:v1.3.0/story-456-retry-ui
```

共同来源通过以下信息关联：

```text
E3 requirement ID
PRD version/path/revision
用户原始目标
明确的跨仓接口契约
```

不新增全局父任务状态文件。

### 8.2 写入顺序

```text
用户确认仓库候选
→ 当前 Dev Root 执行 code-plan
→ 展示当前仓库的 taskRef、精确路径、边界和验证
→ 用户确认
→ 写入当前仓库 spec.md/design.md
→ oec-spec task check --stage ready
→ 按原始目标决定是否继续实现
```

其他仓库需要切换到对应 Dev Root 后重复以上流程。不得从一个未经授权的当前会话静默写入其他仓库。

### 8.3 跨仓接口

只有确实发生跨仓边界变化时，各仓库的 `design.md` 才记录：

```text
关联 requirement/PRD identity
公共 API、消息或数据契约
提供方和消费方
兼容策略
实施顺序
回滚方式
独立验证命令
```

#### 8.3.1 一致性保证

**本方案采用人工协调机制**：

```text
Phase 1 实现方式：
- code-plan 生成 design.md 时，LLM 提示开发者：
  "注意：如果涉及跨仓接口变更，需手工确保多个仓库的 design.md 描述一致"

- 不自动检查一致性
- 不自动同步接口定义
- 依赖开发者在 Code Review 时人工确认

Phase 2 可选增强（如果用户反馈需要）：
- code-finish 时，检查 design.md 中的"跨仓接口"字段
- 如果发现不一致，警告用户（但不阻止）
```

本方案不创建跨仓库 workflow engine，也不保证多个仓库原子完成。

### 8.4 部分失败

如果只有部分仓库完成规划或实现，必须报告：

```text
completed repositories
partial repositories
blocked repositories
unresolved cross-repository contracts
```

不能将部分成功描述为整个需求完成。

---

## 九、Phase 5：受控 E3 任务创建和进度更新

### 9.1 创建开发任务

不新增可直接远端写入的：

```text
create_e3_development_tasks
```

保留能力的方式是复用：

```text
prepare_development_tasks
→ select_development_requirement（存在歧义时）
→ 展示 immutable create-or-reuse plan
→ Human confirmation
→ execute_development_tasks
→ get_development_task_status
```

如需支持一个 E3 requirement 对应多个仓库任务，只扩展 `prepare_development_tasks` 的输入和计划展示，
不得绕过当前 account、space、POMP、lock、checkpoint 和恢复逻辑。

### 9.2 任务描述

建议远端任务包含：

```text
E3 requirement ID
仓库名称或可访问 Git remote
canonical taskRef
该仓库责任范围
PRD version/path/revision
```

不得包含用户本地绝对路径。

优先级、负责人、计划工时和目标日期必须来自明确来源或用户确认，不能由 LLM 静默决定。

### 9.3 进度更新

不新增直接的：

```text
update_e3_task_status
```

继续使用：

```text
prepare_task_progress
→ 展示 start/log/complete、worklog 和工时计划
→ Human confirmation
→ execute_task_progress
→ get_development_task_status
```

因为 E3 任务完成不仅涉及状态，还涉及 worklog、工时、POMP 和 checkpoint。

### 9.4 远端写入不变量

```text
- plan 短期且不可变
- account、workspace、space、POMP 和 requirement identity 被绑定
- 每个远端对象有确定性 create-or-reuse 计划
- 用户确认前不创建或更新远端对象
- 首次 POST 前持久化 executing/checkpoint
- 未知结果只能按精确 identity/marker 恢复
- 多个匹配时 blocked
- 不盲目再次 POST
- 执行后必须 status/read-back
```

---

## 十、自然语言用户故事

### 10.1 查看我的任务

```text
用户：查看我当前的 E3 任务。

预期：
- 只读查询；
- 未绑定空间且 API 不支持跨空间时，展示空间候选；
- 显示任务 ID、标题、状态、空间和父需求；
- 不创建本地任务，不更新 E3。
```

### 10.2 根据 E3 需求规划当前仓库

```text
用户：根据 STORY-456 开发。

预期：
- 查询需求详情；
- 解析或询问 product space；
- 读取当前仓库 Team Specs；
- 展示当前仓库是否 required/possibly-related/unknown；
- 用户确认规划范围后才创建 spec.md/design.md；
- 规划确认后沿原始开发目标继续；
- E3 不可用时允许用户提供需求文本或 PRD。
```

### 10.3 分析其他仓库

```text
用户：这个需求可能还涉及 frontend，请一起分析。

预期：
- 要求用户提供或确认 frontend Root；
- 只读检查该仓库的 Team Specs/CLAUDE.md；
- 展示候选和证据；
- 不自动在 frontend 写文件；
- 用户切换到 frontend 后单独规划。
```

### 10.4 创建 E3 研发任务

```text
用户：为已经确认的后端和前端计划创建 E3 研发任务。

预期：
- 读取两个已确认 taskRef 的范围；
- prepare create-or-reuse plan；
- 展示 requirement、space、POMP、账号、任务标题和工时；
- 用户确认后 execute；
- status 验证远端 ID、父需求和当前状态；
- 不因未知响应重复创建。
```

### 10.5 更新任务进度

```text
用户：后端已经测试通过，记录工作日志并标记完成。

预期：
- 检查真实验证证据；
- prepare progress plan；
- 展示 worklog、spentHours 和 complete 动作；
- 用户确认后 execute；
- status 回读；
- 不部署、不运行 Pipeline、不提交代码，除非用户另外要求。
```

---

## 十一、实施顺序与决策门

### Gate 0：API Evidence

#### 执行计划

**Phase 0 目标**：获取真实 E3 API fixture、验证身份和分页契约。

**数据源**：`/Users/qxwang6/project/agent/harness/OBU-base/yunfan`

**执行步骤**：

1. **分析 yunfan 代码库**：
   ```
   - 查找 E3 API 调用代码
   - 提取 API endpoint、请求/响应 schema
   - 识别认证机制（OAuth/JWT）
   - 记录分页字段和错误码
   ```

2. **真实 API 验证**：
   ```
   - 测试账号：qxwang6（域账号）
   - 认证方式：OAuth 弹出登录页面，用户确认登录
   - 验证 API：
     * POST /api/workbench/v1/myWorkItem/task（我的任务）
     * GET /api/dm/story/v1/{storyId}/info（系统需求）
     * GET /api/panshi/v2/product/task/info（任务详情）
   ```

3. **保存非生产 fixture**：
   ```
   - 脱敏处理（移除真实用户名、敏感数据）
   - 保存为 JSON fixture（用于单元测试）
   - 记录字段 schema 和 null 值处理
   - 记录 401/403/404/空结果的响应格式
   ```

4. **动态字段验证**：
   ```
   - 确认 workItemId 是否需要动态解析
   - 确认分页字段（pageNo/pageSize/total）
   - 确认 productId 的来源和格式
   ```

**验收标准**：

```text
✅ 真实 API 调用成功（使用 qxwang6 账号）
✅ 保存至少 3 个成功响应 fixture
✅ 保存至少 2 个错误响应 fixture（401/403/404）
✅ 记录动态字段（workItemId）的解析逻辑
✅ 记录分页字段和边界情况
```

**当前结果**：只读成功响应、动态字段、分页以及 401/业务 not-found 已通过真实非生产验证，
脱敏 fixture 和执行记录见 [`docs/evidence/e3-readonly-query-gate-0.md`](evidence/e3-readonly-query-gate-0.md)。
真实 403 fixture 尚未取得，因此完整权限矩阵仍未完成；它不阻塞当前只读实现，但阻塞完整真实权限验收。

Gate 0 的只读查询范围已通过，可以进入 Gate 1 的真实 outcome 验收。

### Gate 1：Read-only Outcome

只读查询必须在真实非生产环境证明：

```text
账号正确
空间正确
分页正确
无任何远端写入
错误表达可操作
```

**当前结果**：使用当前 `oec-e3/dist/e3-server.mjs` 的 MCP stdio transport 已完成真实非生产只读
查询，三个查询工具均返回 `success`，没有调用任何写入工具。详细证据见
[`docs/evidence/e3-readonly-query-gate-0.md`](evidence/e3-readonly-query-gate-0.md)。

真实 403 权限错误仍待安全的非生产权限边界验证；它不阻塞当前只读功能，但阻塞完整权限矩阵声明。

Gate 1 的成功查询范围已通过，可以进入 workspace binding 的设计和测试；不得因此跳过 Gate 2 的隔离验收。

### Gate 2：Binding Safety

workspace binding 必须证明：

```text
按 workspace 隔离
不自动扫描
不自动同步 Git
不注入 SessionStart
配置损坏安全失败
```

**当前结果**：`prepare_e3_workspace_binding` 和 `get_e3_workspace_binding` 已在当前 MCP bundle 和授权
workspace root 上完成只读/prepare 验收，首次调用返回 `needs_space_selection`，未绑定状态返回 `unbound`。
用户明确选择 `202330` 后，已在隔离的临时 Plugin Data 中验证 `select_product_space` 返回 `selected`，并由
`get_e3_workspace_binding` 读回 `bound`；由于当前 shell 未提供宿主的 `${CLAUDE_PLUGIN_DATA}`，没有擅自写入猜测的用户级目录。

通过后才开放跨仓映射试点。

### Gate 3：Mapping Outcome

映射 corpus 必须证明：

```text
证据引用正确
false positive 可接受
unknown 能正确暴露
用户可以修正
确认前无跨仓写入
```

通过后才试点逐仓库规划。

### Gate 4：Controlled Write

E3 创建和进度更新只允许复用现有安全协议。任何新写入字段或 endpoint 都需要：

```text
非生产证据
immutable plan binding
Human confirmation
idempotent recovery
status/read-back
```

### 时间估算

本方案不在 API 证据缺失时承诺固定总工期。每个 Gate 单独估算、实施和验收；前一 Gate 未通过时，
不启动依赖它的高风险阶段。本地只读和文档工作可以与真实环境验收并行。

---

## 十二、验收矩阵

| 能力 | 正向验收 | 负向/安全验收 |
|---|---|---|
| 查询我的任务 | 返回当前账号任务并正确分页 | 不能伪造账号；空间歧义不静默选择 |
| 查询需求详情 | 动态解析 workItemId 并返回真实需求 | 403/404/空结果可区分；不硬编码 ID |
| 查询任务详情 | 返回任务及父需求 identity | 不改变任务状态 |
| workspace binding | 当前 workspace 可复用明确空间 | 不跨 workspace 泄漏；不触发 Git 写入 |
| 仓库映射 | 输出候选、证据和 unknown | 不用 confidence 自动决定；不读取未授权 Root |
| 逐仓规划 | 每个仓库有独立 taskRef 和 ready check | 不从当前仓库静默写其他仓库 |
| E3 创建 | prepare/confirm/execute/status 成功 | 未知结果不重复创建；漂移时 blocked |
| E3 进度 | worklog/status 回读一致 | 未确认不更新；不绕过 progress plan |
| E3 降级 | 用户提供需求文本后可继续本地规划 | 不伪造 E3 状态或远端证据 |

---

## 十三、明确不做

当前版本明确不实施：

```text
全局 namespace/仓库注册表
autoDetectDevRoots
扫描 ~/work
autoSyncProductRoot
自动 git pull/fetch/checkout
SessionStart workspace/E3 注入
数字 confidence 阈值自动选择仓库
自动持久化 requirementMappingHistory
一次调用跨多个仓库写 spec/design
跨仓库 workflow engine
直接 create/update E3 CRUD 工具
用 dryRun 代替 immutable plan
硬编码 workItemId
未经证据的 batch-create endpoint
```

这些能力如果未来需要，必须由新的真实用户证据、独立设计和安全验收支持，不能作为本方案的隐含扩展。

---

## 十四、交付物

### Phase 0

```text
脱敏 API fixtures
字段和错误 schema
API 证据记录
非生产验收计划
```

### Phase 1

```text
3 个 read-only MCP 工具
client normalization
单元和协议测试
dist bundle
用户文档
真实非生产只读验收记录
```

### Phase 2

```text
workspace-scoped binding
原子写与锁
配置迁移和损坏恢复测试
无 SessionStart/自动扫描验证
```

### Phase 3-4

```text
自然语言 route/outcome eval
可解释映射 corpus
逐仓库规划用户故事
多仓部分失败报告
```

### Phase 5

```text
现有 development/progress plan 的必要扩展
create-or-reuse、未知结果和并发测试
真实非生产写入验收和 status read-back
```

---

## 十五、最终决策

批准以下方向：

```text
补齐 E3 只读查询
按当前 workspace 显式绑定
保留可解释的多仓库映射建议
保留多仓库开发，但每个仓库独立规划和确认
保留 E3 创建/进度能力，但复用现有安全 runtime
保留 E3 不可用时的本地降级
```

否决当前阶段的侵入性实现：

```text
全局 workspace 中心系统
自动仓库发现和同步
SessionStart 状态注入
LLM 自动决定仓库范围
跨仓库隐式批量写入
直接 E3 CRUD
```

最终实施顺序：

```text
真实 API 证据
→ 只读查询
→ 当前 workspace 显式绑定
→ 可解释映射建议
→ 逐仓库规划
→ 受控 E3 创建和进度更新
```

---

## 参考资料

- [oec-e3 当前工具和安全契约](../oec-e3/README.md)
- [oec-e3 MCP 注册实现](../oec-e3/servers/e3/server.mjs)
- [oec-e3 API client](../oec-e3/servers/e3/client.mjs)
- [Team Specs 契约](../oec-dev/skills/knowledge-manage/references/team-spec-contract.md)
- [PlainOEC 务实优化方案](./optimization-plan-pragmatic.md)
- [E3 集成旧版草案](./e3-integration-redesign.md)（历史资料，不作为当前事实源）
