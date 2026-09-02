# OEC Dev 契约与实施计划

- **Status**: Implemented candidate — Engineering 1.9.0 and Dev Beta 0.1.0 follow-up pending commit and release decision
- **Owner**: `oec-engineering` / OEC Dev
- **Scope**: `plainOEC-infra/oec-engineering` (stable execution) and `plainOEC-infra/dev-beta` (experimental long-running orchestration)
- **Last updated**: 2026-09-02

本文档是稳定 OEC Dev 契约的事实源。它定义当前 `oec-engineering` 如何管理模块上下文、任务级
`Spec`/`Design`、Product/Dev 双空间来源、Team Spec 提醒、任务执行入口和静态 SessionStart 行为注入。
实验性 `dev-beta` 的长时 Web 编排只复用这些契约和宿主已发现的 Agent/runtime，不改变稳定 Plugin 的
默认边界。实现、Skill 文案、Agent 契约、测试和发布说明不得与本文档冲突；如果实现发现需要改变本文档
定义，应先更新本文档并说明兼容性影响。

## 1. 目标和非目标

### 1.1 目标

OEC Dev 是一个模块感知的工程上下文和交付能力，不是固定的 Dev workflow engine。

本轮补齐六项基础能力：

1. 所有 Skill、Agent、runtime 使用统一的 `taskRef` 解析契约；
2. 对任务 `spec.md` / `design.md` 做确定性的结构化校验；
3. 明确 Product Root 与 Dev Root，并安全解析跨空间来源；
4. 在自然检查点对可能过期的 Team Specs 给出只读提醒；
5. 通过静态 SessionStart 提示强化不确定性管理、Skill 匹配、Spec 复核和验证闭环；
6. 为已有 ready 任务提供轻量的 `develop-change` Main Session 执行入口。

### 1.2 保留的设计原则

- 普通编码由 Main Session 完成；
- 任务路径和身份由 runtime 处理，不由模型在多个 Skill 中重复拼接；
- 任务 Spec/Design 是交付产物，但不构成固定阶段状态机；
- Team Specs 描述长期当前事实，不能替代任务 Spec；
- E3/Pipeline 仍由独立 MCP 处理外部副作用；
- Plugin 安装不创建项目 `.claude`、`.codex` 或 `ai-docs`；
- SessionStart 只注入稳定行为约束，不承载能力清单、项目扫描、任务选择或状态；
- 所有写入都遵循业务仓库所有权和显式路径确认。

### 1.3 非目标

本轮不做：

- 恢复 `oec-dev-flow`、`oec-dev-task` 或内部 `STAGE.md` 路由；
- 新增默认 Dev/Planner/Architect Agent；
- 强制 TDD、固定任务拆分或固定编码顺序；
- 自动修改 Team Spec、ADR 或 Product PRD；
- 自动创建 E3 任务、更新 E3/Pipeline 或部署；
- 全量迁移或删除旧 `ai-docs`、`.oec-ai`、旧 Skills/Agents；
- 在稳定 Plugin 中提供长时 Web 编排或固定 Agent 顺序；
- 用 Hook 扫描项目、选择任务、复制能力元数据，或用后台 watcher 打断 Direct Coding。

## 2. OEC Dev 的三类持久化知识

| 类型 | Canonical 路径 | 语义 | 默认 Owner |
| --- | --- | --- | --- |
| Product 需求 | `ai-docs/prd/`、`ai-docs/versions/<version>/prd/` | 用户可见需求和交接 | Product |
| 任务交付物 | `ai-docs/versions/<version>/dev-task/<task-slug>/` | 一次研发任务的上下文和实现设计 | Dev |
| 团队工程知识 | `ai-docs/engineering/` | 当前系统事实、模块边界、长期决策 | Dev/团队 |

版本化 Product 任务的最小目录为：

```text
ai-docs/versions/vX.Y.Z/dev-task/<task-slug>/
├── README.md       # 轻量索引，建议生成，不承载状态机
├── spec.md         # 必需
└── design.md       # 必需
```

以下文件按风险或协作需要生成，不是默认必需：

```text
tasks.md
implementation-plan.md
verification.md
debug-notes.md
research/
sync-status.md
```

非版本化技术变更继续使用：

```text
ai-docs/engineering/changes/<change-id>/
```

现有 `change.md` 包保持可读兼容。新建的 Managed Task 优先使用 `spec.md` + `design.md`；不自动
改名或复制旧 `change.md`。

## 3. 统一 taskRef 契约

### 3.1 Canonical 字符串

```text
versioned:v1.2.3/payment-retry
change:2026-09-02-cache-fix
```

- `versioned:<version>/<task-slug>` 对应版本化 `dev-task` 目录；
- `change:<change-id>` 对应非版本化 `engineering/changes` 目录。

`featureName`、`task-slug` 和外部 E3 `changeId` 是不同字段：

```text
featureName:       paymentRetry
 task-slug:         payment-retry
externalChangeId:  v1.2.3-paymentRetry
```

不得把它们互相猜测后当成同一身份。

### 3.2 兼容输入

解析器可以接受以下输入，并立即归一化为 Canonical 形式：

```text
v1.2.3/payment-retry
ai-docs/versions/v1.2.3/dev-task/payment-retry
ai-docs/engineering/changes/2026-09-02-cache-fix
v1.2.3-paymentRetry
```

不接受裸 slug、模糊的 `latest`、绝对路径、含 `..` 的路径或多个候选中的静默选择。

旧 `changeId` 只作为输入别名，不写入新的 `task_ref`。

### 3.3 归一化对象

`resolveTaskRef()` 必须返回同一结构，所有 Skill、Agent 和命令都使用该结果：

```json
{
  "ok": true,
  "kind": "versioned",
  "ref": "versioned:v1.2.3/payment-retry",
  "version": "v1.2.3",
  "taskSlug": "payment-retry",
  "featureName": "paymentRetry",
  "externalChangeId": "v1.2.3-paymentRetry",
  "devRoot": "/workspace/dev",
  "relativePath": "ai-docs/versions/v1.2.3/dev-task/payment-retry",
  "absolutePath": "/workspace/dev/ai-docs/versions/v1.2.3/dev-task/payment-retry",
  "artifacts": {
    "spec": "ai-docs/versions/v1.2.3/dev-task/payment-retry/spec.md",
    "design": "ai-docs/versions/v1.2.3/dev-task/payment-retry/design.md"
  },
  "exists": true,
  "compatibility": "native"
}
```

`absolutePath` 只用于当前进程返回值，不能写入持久化文档。

### 3.4 解析规则

1. 优先使用显式 `--task-ref`；
2. 其次使用显式任务目录路径；
3. 其次使用显式 version + slug；
4. 再兼容旧 `change-id`；
5. 只有 Product 来源明确给出唯一 `featureName` 时才允许推导。

解析结果分为：

```text
resolved
missing       # 仅允许 init/plan 场景
ambiguous
invalid
unsafe
```

`allowMissing` 只能由创建任务目录的 Skill 使用。实现、研究、检查 Agent 必须要求已存在的任务
上下文。

### 3.5 身份不变量

- 版本化目录的 version 与 `task_ref` 一致；
- 目录 slug 与 `task_ref` 一致；
- 文档 frontmatter 的 `task_ref` 与目录一致；
- 如果存在 `external_change_id`，必须与 E3 mapping 中的身份一致；
- 所有路径通过 lexical containment 和 realpath containment 检查；
- 不允许 symlink 将任务目录带出 Dev Root。

### 3.6 统一错误码

```text
task-ref-invalid
task-ref-ambiguous
task-ref-not-found
task-ref-path-escape
task-ref-symlink-escape
task-identity-mismatch
task-root-missing
task-artifact-missing
legacy-task-incomplete
```

## 4. Product Root / Dev Root 来源契约

### 4.1 根目录角色

```text
DEV_ROOT
├── 业务代码
├── ai-docs/versions/*/dev-task/
└── ai-docs/engineering/

PRODUCT_ROOT
├── ai-docs/prd/
├── ai-docs/versions/*/prd/
└── ai-docs/integrations/e3/
```

支持参数：

```bash
--dev-root <path>
--product-root <path>
--workspace <path>       # 向后兼容，等同于 dev-root
```

优先级为：显式参数、明确环境变量、当前工作目录、唯一且可验证的旧 submodule 推导。不能从任意
父目录或兄弟目录模糊搜索。

### 4.2 SourceRef

版本化任务在 `spec.md` 中使用：

```yaml
source:
  kind: product
  root: product
  repository: product-requirements
  revision: abc123
  prd_path: ai-docs/versions/v1.2.3/prd/prd-v1.2.3-paymentRetry.md
  handoff_path: ai-docs/versions/v1.2.3/prd/HANDOFF.yaml
  stories:
    - US-001
```

允许的 `source.root`：

```text
product
dev
external
```

路径均相对于对应 Root；不在文档中保存机器相关的绝对路径。

### 4.3 读写边界

- PRD、Child PRD、HANDOFF 从 Product Root 读取；
- `spec.md`、`design.md`、Engineering Specs 只写入 Dev Root；
- Product Root 对 Engineering 始终是只读的；
- 同空间模式只有在两个 Root 的 canonical realpath 相同或明确声明时才启用；
- 双空间模式下，任务文档引用 Product 来源，不复制 Product 文档；
- 外部来源只能报告“无法本地验证”，不能伪造读取成功。

### 4.4 来源一致性

解析 Product 来源时校验：

- PRD 和 HANDOFF 版本一致；
- HANDOFF 的 child PRD 路径符合 Product contract；
- `featureName` 与 child PRD 一致；
- Story ID 集合一致；
- 所有来源路径位于 Product Root 内且不被 symlink 带出。

旧字段兼容：

```yaml
source_prd: ...
source_stories: ...
```

只在读取时转换成内部 SourceRef，不改变旧文件。

## 5. 任务 Spec / Design 结构化契约

### 5.1 `spec.md`

最小 Frontmatter：

```yaml
---
artifact: task-spec
schema_version: 1
task_ref: versioned:v1.2.3/payment-retry
feature_name: paymentRetry
external_change_id: v1.2.3-paymentRetry
title: Payment retry
module_ids:
  - payment
affected_paths:
  include:
    - services/payment/**
source:
  kind: product
  root: product
  prd_path: ai-docs/versions/v1.2.3/prd/prd-v1.2.3-paymentRetry.md
  handoff_path: ai-docs/versions/v1.2.3/prd/HANDOFF.yaml
  stories:
    - US-001
related_specs:
  - SPEC-payment-domain
status: draft
---
```

必需字段：

```text
artifact
schema_version
task_ref
title
affected_paths.include
```

版本化 Product 任务还必须能够解析 `source`，并在 `ready` 检查时提供 `feature_name`。`module_ids`
在进入 `ready` 检查时必须非空。

正文至少包含：

```markdown
# <title>

## Goal and scope

## Acceptance

- AC-001: <observable condition>
```

校验器要求至少一个唯一的 `AC-NNN`，但不要求在任务开始时完成勾选。

### 5.2 `design.md`

最小 Frontmatter：

```yaml
---
artifact: task-design
schema_version: 1
task_ref: versioned:v1.2.3/payment-retry
spec_ref: ./spec.md
title: Payment retry design
status: draft
---
```

正文至少包含：

```markdown
# <title>

## Constraints and affected contracts

## Chosen design

## Change boundary

## Verification
```

只有数据、公共接口、部署兼容性或回滚确实受影响时，才要求：

```markdown
## Migration and rollback
```

Design 不要求固定 API、数据库、部署、性能等章节，也不复制完整 PRD 或 Team Spec。

### 5.3 交叉校验

- `design.task_ref == spec.task_ref`；
- `design.spec_ref` 必须解析到同一任务目录的 `spec.md`；
- Spec 的模块和路径必须与模块选择结果一致；
- Product 来源的 version、featureName 和 Story 集合必须一致；
- Spec 中存在已确认的 `CQ-*` 时，Design 必须引用；不存在时不创建确认矩阵；
- 任务目录内不得出现第二份 Spec/Design 的 `final`、`v2` 或 `new` 副本。

### 5.4 `develop-change` 执行契约

`develop-change` 是稳定 Engineering Plugin 的轻量执行入口，只处理已有且可验证的任务。它不是
任务创建器、Agent 委派器或固定状态机。

触发必须同时满足：

- 请求包含 canonical `taskRef` 或明确的现有 change ID；
- 任务目录已经存在；
- `spec.md` 和 `design.md` 通过 `task check --stage ready`。

执行顺序为：

```text
task check / resolve
→ select 相关 Team Specs 和 ADRs
→ 读取 Spec、Design、来源和 Change Boundary
→ Main Session 实现
→ 测试、typecheck、lint
→ 报告最新验证证据
```

第一个任务操作必须是 `task resolve` 或 `task check`。任务不存在、身份不明确、来源不可验证或
ready 检查失败时立即停止。该 Skill 默认不创建 implementation plan、状态或 progress 文件，不
派发 Agent，不调用 E3/Pipeline，不提交或关闭任务。TDD、诊断和代码评审只有在各自用户意图出现时
才单独调用。

### 5.5 检查 profile

```bash
oec-spec task check --stage structure
oec-spec task check --stage ready
oec-spec task check --stage close
```

Profile 只改变校验强度，不表示必须按阶段执行：

- `structure`：路径、Frontmatter、章节、ID、链接；
- `ready`：来源、模块、PRD/HANDOFF、Spec/Design 配对；
- `close`：最终任务契约、验证证据和未决问题。

退出码保持：

```text
0 通过或只有非阻断提醒
1 契约阻断
2 参数或命令错误
```

## 6. Team Spec 自动提醒

### 6.1 定位

提醒是只读建议，不声称 Spec 一定过期，也不自动写文档。

新增命令：

```bash
oec-spec remind \
  --workspace "$DEV_ROOT" \
  --paths services/payment/CaptureService.java \
  --task-ref versioned:v1.2.3/payment-retry \
  --signals contract,data \
  --format json
```

输出：

```json
{
  "ok": true,
  "remind": true,
  "level": "suggestion",
  "candidates": [
    {
      "kind": "update-spec",
      "target": "SPEC-payment-domain",
      "severity": "suggestion",
      "paths": ["services/payment/**"],
      "reasons": ["changed paths match the Spec scope"]
    }
  ]
}
```

### 6.2 触发信号

支持有限、可解释的信号：

```text
contract
 data
 boundary
compatibility
ownership
command
```

规则：

| 观察 | 建议 |
| --- | --- |
| 变更路径匹配已有 Spec | 提示复核该 Spec |
| 新路径没有被任何 Spec 覆盖 | 建议创建模块 Spec |
| 修改模块索引或包边界 | 提示模块边界复核 |
| 调用方报告接口、数据或兼容性变化 | 提高提醒级别 |
| 普通私有实现修改 | 不产生强提醒 |

### 6.3 调用点

- `plan-change`：模块选择后提醒相关长期事实；
- `review-code`：读取 diff 后报告候选；
- `close-change`：收口前执行提醒，展示可能更新的精确路径；
- `manage-specs remind`：用户显式请求时单独执行。

`checker` 不重复执行 reminder；它只检查当前代码与已有契约。这样长时流程中的 fresh check 不会与随后
的 `close-change` 重复报告同一批候选。Reminder 不通过 Hook、后台任务或状态文件执行；静态
SessionStart 只提示模型主动识别复核时机。Direct Coding 不调用这些检查点时，不应被打断。

## 7. Skill 和 Agent 约定

### 7.1 Skill 可见性

稳定 `oec-engineering` 保留十个面向用户目标的 Skill，不新增总控 Router：

| Skill | Model invocation | 责任 |
| --- | --- | --- |
| `plan-change` | 可自动发现，仅限 PRD/Story/非平凡任务 | 解析来源并管理任务 Spec/Design |
| `develop-change` | 可自动发现，仅限已有且 ready 的任务 | 在 Main Session 按任务边界实现并验证 |
| `review-code` | 可自动发现 | 只读 Review，并调用 reminder |
| `manage-specs` | 可自动发现，仅限明确的 Spec/ADR 管理意图 | 写入长期 Spec/ADR；写前确认精确路径，`remind` 子模式只读 |
| `develop-test-first` | 仅明确 TDD 意图 | 可选测试方式 |
| `diagnose-failure` | 根因不清时 | 可选排障 |
| `challenge-decision` | 用户明确要求挑战决定时 | 对抗性决策检查；只读 |
| `prototype-decision` | 用户要求 throwaway 原型时 | 临时原型和 Human 方案选择 |
| `migrate-legacy-ai-docs` | 用户要求迁移旧工程知识时 | 一次性迁移，保留旧文件 |
| `close-change` | 用户要求结束工程工作时 | 最终验证、知识收口和可选提交 |

稳定 Plugin 的 Skills 均可由模型根据精确 description 主动发现；本地写入仍需文件确认，commit 仍需
单独确认。外部平台写入不属于这些 Skills。

`delegate-agents` 不再作为 Skill 提供；单个 Agent 使用宿主原生 picker。`run-long-coding` 移至
独立的实验性 `dev-beta` Plugin，保持 `disable-model-invocation: true`。

Supporting references、assets、scripts 和 bundle 不作为独立 Skill 暴露。

### 7.2 Agent

保留当前四个 Agent，不新增 Planner/Architect/Dev Orchestrator：

- `implementer`：接受 `taskRef`，读取 Spec/Design，只修改代码边界；
- `checker`：接受可选 `taskRef`，检查 diff、任务契约和模块事实，可修复明确的代码机械问题；
- `researcher`：接受已有 `taskRef`，只把研究写入对应任务的 `research/`；
- `evaluator`：显式用于非生产 Web 运行态验证，不修改源码或工程文档。

所有 Agent 支持：

```text
versioned dev-task taskRef
engineering change taskRef
```

Agent 不负责创建或修改任务 Spec/Design；主 Session 或显式的 `plan-change` 负责任务文档。
`evaluator` 以及实验性 `dev-beta` 长时流程使用的运行态 checklist 必须从任务 Spec 的 `AC-NNN`
派生并保留 ID；它可以增加环境准备和观察方式，但不能成为第二份验收事实源。
Claude Markdown 是 Agent 指令事实源，实验性 Codex TOML 由构建生成并保持正文一致；Codex 未完成
真实宿主验收前不宣称完整支持。

### 7.3 SessionStart 行为注入

Claude Plugin 从 `hooks/hooks.json` 在 `startup|clear|compact` 同步注入一段静态行为提示。提示只包含
可执行约束：基于仓库证据管理不确定性、在用户目标不清时提供有证据的选项、按原生描述匹配 Skill、
识别长期 Spec/ADR 复核时机、保持最小改动并定义可验证成功标准。它不列 Skill/Agent 元数据，不扫描
项目，不解析或选择 taskRef，不创建状态。Codex manifest 必须显式声明 `hooks: {}`，防止自动发现
Claude Hook。

## 8. 实施阶段

### Phase 0：冻结契约

- 保留并吸收当前未提交的 `spec-tool.mjs` 常量修改；
- 确认本文档中的字段、路径、错误码和兼容策略；
- 不修改业务仓库的生成文档。

完成条件：所有后续实现都有单一契约来源。

### Phase 1：TaskRef Resolver

新增或整理：

```text
oec-engineering/scripts/contracts/task-ref.mjs
oec-engineering/scripts/contracts/workspace-source.mjs
```

修改：

```text
oec-engineering/scripts/spec-tool.mjs
oec-engineering/scripts/spec-tool-cli.mjs
```

完成 `parseTaskRef`、`resolveTaskRef`、Root containment 和 legacy alias。

### Phase 2：Task Artifact Checker

新增或整理：

```text
oec-engineering/scripts/contracts/task-artifacts.mjs
```

实现 `checkTaskArtifacts`，并增加 `task resolve`、`task check` CLI。

### Phase 3：Product 来源适配

复用或抽取现有 `packages/prd-artifact-contract` 的只读解析逻辑：

- Engineering 构建时内嵌依赖；
- 安装后的 Engineering Plugin 不依赖 Product Plugin；
- Product 现有校验行为保持不变。

### Phase 4：Reminder

新增只读 `findSpecReminders` 和 `remind` CLI；在 `plan-change`、`review-code`、`close-change` 的
自然检查点调用。Reminder 不进入 SessionStart Hook，也不创建状态文件。

### Phase 5：Skill/Agent 适配

更新：

```text
oec-engineering/skills/plan-change/
oec-engineering/skills/develop-change/
oec-engineering/skills/manage-specs/
oec-engineering/skills/review-code/
oec-engineering/skills/close-change/
oec-engineering/skills/migrate-legacy-ai-docs/
oec-engineering/hooks/
oec-engineering/agents/
oec-engineering/.codex-plugin/agents/
dev-beta/skills/run-long-coding/
```

删除稳定 Plugin 中的 `delegate-agents` 和 `run-long-coding`。所有路径解析改为调用 runtime；不得在
Markdown 中复制第二套解析规则。`dev-beta` 不复制 Agent 或 runtime，只消费宿主已经发现的能力。

### Phase 6：测试、文档和发布

- 增加纯函数契约测试；
- 增加同空间、双空间和 legacy journey fixture；
- 更新 Plugin README、docs 文档地图和 CHANGELOG；
- 构建独立 bundle；
- 通过 strict validation 后再决定版本号。

## 9. 验收矩阵

### TaskRef

- Canonical versioned ref；
- Canonical unversioned ref；
- 目录路径别名；
- legacy change ID；
- missing/ambiguous/unsafe；
- identity mismatch；
- allowMissing 与 existing-only。

### Task artifacts

- 有效最小 Spec + Design；
- 缺少文件、Frontmatter、章节或 Acceptance ID；
- 交叉引用错误；
- 版本、slug、模块不一致；
- placeholder 和重复副本；
- legacy `change.md` 兼容；
- 三种检查 profile 和退出码。

### Roots and sources

- 同空间；
- Product/Dev 分离；
- Product Root 缺失；
- Product 路径越界和 symlink；
- PRD/HANDOFF 版本、featureName、Story 不一致；
- 外部来源不可验证；
- Product 永不被 Engineering 写入。

### Reminder

- 普通局部修改不产生强提醒；
- 路径覆盖、模块边界、接口、数据变化产生候选；
- reminder 是只读的；
- 不创建状态文件；
- 不影响未进入 OEC Dev 检查点的 Direct Coding。

### Distribution

- `dist/oec-spec.mjs` 无 Plugin 内运行时依赖；
- 当前 `select`、`check`、`legacy-audit` 回归通过；
- Claude/Codex Agent 描述和正文一致；
- Claude 只分发一个静态 SessionStart 行为 Hook，Codex 通过 `hooks: {}` 禁用自动发现；
- Plugin 不增加 root payload、动态 Router 或默认编排器；
- 未完成宿主验收的能力不宣称已支持。

## 10. Definition of Done

- [x] 所有 Engineering consumers 使用同一个 `resolveTaskRef()`；
- [x] 新版本化任务的 Skill contract/assets 能生成 `spec.md` 和 `design.md`；
- [x] Task checker 能在隔离 bundle 中确定性发现结构问题；
- [x] Product/Dev 双空间来源可解析且写入边界安全；
- [x] `manage-specs` reminder 在计划、Review、Close 检查点可见；
- [x] reminder 不自动写入、不阻断普通编码；
- [x] 旧任务包可读取，不产生第二套任务目录；
- [x] 现有四个 Agent 能读取两种任务来源；
- [x] SessionStart 提示无能力清单、项目扫描、任务选择或状态写入；
- [x] 稳定 Engineering Skills 可由精确自然语言意图触发，写入仍需精确路径确认；
- [x] 稳定 Plugin 不恢复旧 Dev Router、固定 Agent 顺序或默认长时编排；
- [x] `dev-beta` 以单个显式 Skill 提供实验性长时 Web 编排；
- [x] 构建、测试、strict plugin validation 和路径检查通过。

## 11. Implementation record

本轮已在仓库实现上述候选：

- 新增 `oec-engineering/scripts/contracts/` 下的 taskRef、Root/source 和任务产物契约实现；
- 新增 `oec-engineering/scripts/spec-reminder.mjs` 和 `oec-spec remind`；
- `oec-spec` 增加 `task resolve` 与 `task check`，同时保留 `select`、`check` 和 `legacy-audit`；
- `plan-change`、`develop-change`、`manage-specs`、`review-code`、`close-change` 和四个 Agent 已切换到
  canonical taskRef 语义；
- `dev-beta` 的 `run-long-coding` 只复用宿主 Agent 和 `oec-spec`，不复制文件或 runtime；
- Product/Dev 双空间、legacy alias、结构化 Spec/Design、模块索引和 reminder 已加入隔离 fixture；
- Claude 增加静态 SessionStart 行为注入，Codex 显式禁用 Hook 自动发现，稳定 Skills 改为由精确
  自然语言意图发现；实验性长时 Skill 仍保持显式调用。

本轮观察到的验证命令：

```bash
npm run build
npm test                         # 154 tests passed
claude plugin validate --strict ./oec-engineering
git diff --check
```

`dist/oec-spec.mjs` 的任务契约基线已经提交。本次后续修复将 Claude Markdown 固定为 Agent 指令事实源，
Codex TOML 镜像改由构建生成；当前工作树仍待精确审阅和提交。Codex Agent 的真实宿主发现和完整运行
旅程尚未完成，因此本文件只记录指令 parity，不宣称完整双宿主支持；发布版本策略仍需单独决定。
