# oec-dev

`oec-dev` 是稳定的 OEC Dev Plugin，提供任务级工程执行、模块上下文、Team Specs、技术决策、
故障诊断和代码评审能力。它不是固定的 Dev workflow engine；普通编码仍由 Main Session 完成。

长时 Web/full-stack 编码和 Playwright 多轮编排已经移到独立的实验性 `oec-dev-beta` Plugin，不属于本
Plugin 的默认流程。

本 Plugin 的 OEC Dev 契约事实源位于 Marketplace 仓库：

```text
docs/architecture/oec-dev-contract-implementation-plan.md
```

安装后的 Plugin 不依赖该仓库外部路径；运行期规则由本 README、Skill、Agent 和 bundled runtime
共同提供。

## 安装

```bash
claude plugin marketplace add \
  quanxinwang18-a11y/plainOEC-infra \
  --scope user

claude plugin install \
  oec-dev@plainOEC-infra \
  --scope user
```

安装不需要 `npm login`、`npm install`、GitHub Packages 或手工创建 `.claude`。提交的 runtime bundle
需要 PATH 中存在 Node.js 20 或更新版本。

需要实验性长时 Web/full-stack 流程时，另行安装：

```bash
claude plugin install oec-dev-beta@plainOEC-infra --scope user
```

`oec-dev-beta` 要求先具备本 Plugin 的 Agent 和 `oec-spec`；它不会复制这些文件或 runtime。

## 十个 Skills

所有 Engineering Skills 都可以由模型根据自然语言目标发现；描述中的负向边界仍然有效，自动发现
不等于每个任务都必须调用。

```text
/oec-dev:decision-challenge
/oec-dev:change-close
/oec-dev:change-implement
/oec-dev:test-first
/oec-dev:failure-debug
/oec-dev:spec-manage
/oec-dev:legacy-doc-migrate
/oec-dev:change-plan
/oec-dev:design-prototype
/oec-dev:code-review
```

### `change-implement`

这是已有任务的轻量执行入口。只有请求包含 canonical `taskRef` 或明确的现有 change ID，且任务
已经有可通过 `ready` 检查的 `spec.md` / `design.md` 时才使用。

```text
resolve/check taskRef
→ select 相关 Team Specs
→ 读取 Spec、Design 和 Change Boundary
→ Main Session 实现
→ 测试、typecheck、lint
→ 报告最新证据
```

它不创建任务文档、不默认派发 Agent、不创建状态文件、不调用 E3/Pipeline、不 commit，也不替代
`change-plan`、`code-review` 或 `change-close`。

### 其他 Skills

- `spec-manage`：维护有代码证据支持的 current-state Specs、ADR 和必要的 change package；`remind`
  模式只读。
- `legacy-doc-migrate`：将旧 `ai-docs` 中仍有效的工程事实迁移到当前结构，保留原文件。
- `change-plan`：为 PRD、Story、HANDOFF、issue 或非平凡变更创建任务级 `spec.md` 和 `design.md`。
- `decision-challenge`：在规划或实现前压力测试技术决策。
- `design-prototype`：用 throwaway artifact 回答一个交互、行为或状态设计问题。
- `test-first`：只在用户明确要求 TDD/test-first 时采用 red-green-refactor。
- `failure-debug`：处理难复现、flaky、性能回退或根因不清的问题。
- `code-review`：只读、风险优先地评审 diff、commit、branch 或 PR。
- `change-close`：检查最终证据、收口 Team Specs/ADR，并在用户确认后提交精确路径。

文档、Team Specs、迁移目标和提交都遵循“展示精确路径 → 用户确认”的边界；`change-implement` 只在用户
已确认的任务 Change Boundary 内实现。任何 Skill 被调用本身都不代表用户授权 commit。

## Agents

需要隔离上下文时，通过宿主 `@` Agent picker 直接选择：

- `task-implementer`：在已有任务边界内实现代码并运行相关检查。
- `change-checker`：覆盖 staged、unstaged 和 untracked 变更，可修复明确的机械问题。
- `task-researcher`：对已有任务进行有边界研究，只写入该任务的 `research/`。
- `web-evaluator`：使用已连接的 Playwright 对本地或内部非生产 Web 应用做运行态验收。

Agent 不是 slash command，也不是普通编码的必经阶段。四个 Agent 都不允许 commit、push、merge、
派生其他 Agent 或修改 Product 文件。

`web-evaluator` 只能使用预配置的 Playwright MCP；Playwright 不可用、目标不明确或证据不完整时必须
报告 `blocked`/`incomplete`，不能用静态检查冒充运行态验收。

Claude Markdown 是 Agent 指令事实源：

```text
oec-dev/agents/*.md
```

实验性的 Codex 镜像位于：

```text
oec-dev/.codex-plugin/agents/*.toml
```

镜像由构建生成，不要手工编辑：

```bash
npm run generate:dev-agents
```

## SessionStart 行为提示

本 Plugin 在 `startup`、`clear` 和 `compact` 时注入一个静态行为提示。它只帮助模型：

- 根据仓库证据和用户目标行动；
- 在存在多个合理解释时先澄清；
- 在目标不清时提供有证据的下一步选项；
- 按需匹配 Skill；
- 识别需要复核的长期 Spec/ADR；
- 保持最小变更并定义可验证成功标准。

Hook 不列出能力清单、不扫描项目、不选择 taskRef、不创建状态，也不充当 Router。`oec-spec remind`
是独立的只读检查，不由 Hook 或后台 watcher 自动执行。

## OEC Dev 任务契约

Canonical taskRef：

```text
versioned:v1.2.3/payment-retry
change:2026-09-02-cache-fix
```

版本化 Product 任务的位置：

```text
ai-docs/versions/v1.2.3/dev-task/payment-retry/
├── README.md       # 可选
├── spec.md         # 必需
└── design.md       # 必需
```

`spec.md` 保存目标、范围、来源、受影响路径和 `AC-NNN`；`design.md` 保存约束、选定设计、变更边界
和验证方式。`tasks.md`、`implementation-plan.md`、`verification.md`、`research/` 等仅在风险或协作
需要时创建。

`featureName`、任务目录 slug 和 E3 `changeId` 是独立字段：

```text
featureName:       paymentRetry
task-slug:         payment-retry
externalChangeId:  v1.2.3-paymentRetry
```

不要在 Skill 或 Agent 中自行实现另一套转换规则。

## Product / Dev 双空间

```text
PRODUCT_ROOT
├── ai-docs/prd/
├── ai-docs/versions/*/prd/
└── ai-docs/integrations/e3/publications/

DEV_ROOT
├── 业务代码
├── ai-docs/versions/*/dev-task/
└── ai-docs/Spec/
    └── integrations/e3/development-tasks/
```

Product PRD、Child PRD 和 `HANDOFF.yaml` 只从 `PRODUCT_ROOT` 读取；任务文档、Team Specs 和 ADR 只写入
`DEV_ROOT`。根目录通过 `--dev-root`、`--product-root` 或兼容的 `--workspace` 明确提供，不能在多个
候选目录中静默选择。

## oec-spec runtime

Plugin 提供自足的 `oec-spec` bundle：

```bash
oec-spec select --workspace "$DEV_ROOT" --paths <paths> --format json
oec-spec check --workspace "$DEV_ROOT"
oec-spec task resolve --dev-root "$DEV_ROOT" --product-root "$PRODUCT_ROOT" \
  --task-ref <taskRef> --format json
oec-spec task check --dev-root "$DEV_ROOT" --product-root "$PRODUCT_ROOT" \
  --task-ref <taskRef> --stage structure --format json
oec-spec remind --workspace "$DEV_ROOT" --paths <changed paths> \
  [--task-ref <taskRef>] --format json
oec-spec legacy-audit --workspace "$DEV_ROOT"
```

`task resolve` 是所有任务消费者的统一身份入口；`task check` 校验任务 Spec/Design 的路径、身份、
来源、章节、Acceptance ID 和交叉引用；`remind` 只报告可能需要更新的 Team Spec/ADR，不写文件、
不阻断普通编码。

## 推荐工作路径

简单、局部、低风险修改：

```text
用户目标 → Main Session 定位代码 → 修改 → 最小相关测试 → 报告结果
```

非平凡或需要跨会话保存上下文的修改：

```text
需求/问题
→ taskRef 与 Product/Dev Root 解析
→ 选择相关 Specs/ADR
→ change-plan 创建 spec.md + design.md
→ change-implement 或 Main Session 实现
→ 测试、typecheck、lint
→ code-review / change-checker（按需）
→ change-close（用户需要时）
```

这不是强制状态机。TDD、决策挑战、原型、诊断、Agent 和收口都按用户目标或实际风险启用。

## 外部平台边界

Engineering 不自动创建 E3 任务、不更新 E3/Pipeline、不部署。需要远端研发任务时，按需安装并调用
`oec-e3`；需要运行既有 dev/test 流水线时，按需安装 `oec-pipeline`。平台的认证、计划、幂等、恢复
和 status/read-back 由 MCP 负责，不能由 Prompt 模拟。

长时 Web/full-stack 场景使用独立的实验性 Plugin：

```text
/oec-dev-beta:web-task-run [existing taskRef]
```

## 迁移旧项目

显式或自然语言请求迁移时，`legacy-doc-migrate` 会先运行只读 legacy audit，提出“源路径 → 分类
→ 目标路径 → 证据”的计划，保留旧文件，只在确认后写入 `ai-docs/Spec/`。它不删除 `.oec-ai`、
旧 `.claude`/`.codex`、E3 record 或历史文件。

## 验证

在 Marketplace 根执行：

```bash
npm ci --ignore-scripts
npm run verify
claude plugin validate --strict ./oec-dev
git diff --check
```

当前 1.9.0 是候选版本。自动测试、bundle、Plugin validation、真实 Agent 发现和真实 Playwright
旅程是不同证据等级；不能用其中一项替代另一项。
