# oec-engineering

`oec-engineering` 是 OEC Dev Plugin，提供模块上下文管理、任务级 `Spec`/`Design`、团队工程知识、
技术方案、诊断、代码评审以及可选的独立 Agent。它不是固定的 Dev workflow engine；普通编码仍由
Main Session 完成。

本 Plugin 的 OEC Dev 契约事实源位于 Marketplace 仓库：

```text
docs/architecture/oec-dev-contract-implementation-plan.md
```

安装后的 Plugin 不依赖该仓库外部路径；运行期规则由本 README、Skill reference、Agent 和 bundled
runtime 共同提供。

## 安装

首次使用先添加 Git Marketplace，再安装 Engineering Plugin：

```bash
claude plugin marketplace add \
  quanxinwang18-a11y/plainOEC-infra \
  --scope user

claude plugin install \
  oec-engineering@plainOEC-infra \
  --scope user
```

安装不需要 `npm login`、`npm install`、GitHub Packages 或手工创建 `.claude`。提交的 runtime
bundle 需要 PATH 中存在 Node.js 20 或更新版本。

只有团队希望在仓库中共享 Marketplace 与 Plugin 启用声明时才使用 project scope。该 settings
文件由 CLI 管理，不要把 Plugin payload 手工复制到项目中。

## 能力

### Skills

普通请求直接用自然语言描述目标，Skills 按场景发现：

```text
/oec-engineering:manage-specs
/oec-engineering:migrate-legacy-ai-docs
/oec-engineering:plan-change
/oec-engineering:challenge-decision
/oec-engineering:prototype-decision
/oec-engineering:develop-test-first
/oec-engineering:diagnose-failure
/oec-engineering:review-code
/oec-engineering:delegate-agents
/oec-engineering:run-long-coding
/oec-engineering:close-change
```

`plan-change` 在明确的 OEC Dev、PRD、Story、HANDOFF 或非平凡变更上准备任务 Spec/Design；不用于
普通小修复。`review-code` 只读评审并可报告 Spec 提醒。`manage-specs` 负责长期 current-state
Specs/ADR；其写入遵循显式调用和确认，`remind` 只读且可在自然检查点运行。TDD、诊断和决策原型按用户意图按需使用。

`manage-specs`、`migrate-legacy-ai-docs`、`challenge-decision`、`prototype-decision`、`close-change`、
`delegate-agents` 和 `run-long-coding` 只在用户显式调用时使用。它们不恢复旧版总控 Router、阶段文件
或项目状态机。
外部 E3/Pipeline 写入不属于本 Plugin。

### Agents

需要独立上下文时，可以要求宿主使用：

- `implementer`：接收已有 canonical `taskRef` 或 legacy change ID，在已声明的代码 boundary 内隔离
  实现并运行相关测试；
- `checker`：覆盖 staged、unstaged、untracked 变更，读取任务 Spec/Design 和相关 Team Specs，必要时
  修复无歧义的代码机械问题；
- `researcher`：接收已有 `taskRef`，把有边界的研究写入对应任务的 `research/`；
- `evaluator`：接收已有 `taskRef`、完成条件和内部非生产目标，使用预配置的 Playwright MCP 运行态验证，
  不修改项目文件或 Git。

`implementer`、`researcher` 和 `evaluator` 缺少可解析的 taskRef 或对应 legacy 上下文时会停止，不会
创建或猜测任务包。任何相关测试或运行态验收未执行、失败或证据不完整时，Agent 只报告
`partial`/`failed`/`incomplete`，不会输出完成结论。

通过 Claude Code 的 `@` Agent picker 可以保证派发。Agent 不是 slash command；普通实现、评审和研究
仍可由 Main Session 完成。所有 Agent 的任务身份先由 `oec-spec task resolve` 归一化，不在 Agent
说明中重复拼接路径。

需要统一委派时，调用 `delegate-agents` 并选择 `research`、`implement`、`check` 或 `sequence`。
`sequence` 只按 `researcher → implementer → checker` 串行推进，不自动重试、不维护阶段状态，也不
提交或关闭任务。

需要在明确的非平凡 Web/full-stack taskRef 上长时间构建并进行运行态验收时，调用：

```text
/oec-engineering:run-long-coding [已有或当前已确认的 taskRef]
```

长时能力只在当前 Session 保留 implementer 与 evaluator 上下文，不创建项目状态文件，也不接管普通
Coding。完成后仍需显式调用 `close-change` 做最终收口。

三种检查能力的区别：

| 能力 | 是否修改工作树 | 适用目标 |
| --- | --- | --- |
| `review-code` | 否 | 只读、风险优先的代码 findings 和 Spec 提醒 |
| `checker` | 可能 | fresh-eyes 检查并修复无歧义机械问题 |
| `evaluator` | 不修改源码 | 操作内部测试应用并提供运行态证据 |

## OEC Dev 任务契约

任务级事实源和实施基线为：

```text
docs/architecture/oec-dev-contract-implementation-plan.md
```

Canonical taskRef：

```text
versioned:v1.2.3/payment-retry
change:2026-09-02-cache-fix
```

版本化 Product 任务的产物位置：

```text
ai-docs/versions/v1.2.3/dev-task/payment-retry/
├── README.md
├── spec.md
└── design.md
```

其中 `spec.md` 和 `design.md` 是新 Managed Task 的必需产物；`tasks.md`、`implementation-plan.md`、
`verification.md`、`research/` 和 `sync-status.md` 仅在实际风险或协作需要时生成。

`featureName`、任务目录 slug 和 E3 `changeId` 保持独立：

```text
featureName:       paymentRetry
task-slug:         payment-retry
externalChangeId:  v1.2.3-paymentRetry
```

不要在 Skill、Agent 或项目文档中自行实现另一套身份转换。

## Product / Dev 双空间

```text
PRODUCT_ROOT
├── ai-docs/prd/
├── ai-docs/versions/*/prd/
└── ai-docs/integrations/e3/

DEV_ROOT
├── 业务代码
├── ai-docs/versions/*/dev-task/
└── ai-docs/engineering/
```

Product PRD、Child PRD 和 `HANDOFF.yaml` 只从 `PRODUCT_ROOT` 读取；任务文档和团队工程文档只写入
`DEV_ROOT`。根目录通过 `--dev-root`、`--product-root` 或兼容的 `--workspace` 明确提供，不能在多个
候选目录中静默选择。文档只记录 repository、revision 和相对路径，不记录机器绝对路径。

## 团队 Specs

只有团队需要 repository-owned 工程事实时才初始化：

```text
/oec-engineering:manage-specs init
```

Skill 会先检查仓库证据并展示拟创建的路径，只生成真实事实支持的 current-state Specs 和 ADRs：

```text
ai-docs/engineering/
├── README.md
├── module-index.yaml       # 可选的稳定模块元数据
├── specs/
├── decisions/
└── changes/
```

`specs/` 描述系统当前事实，`decisions/` 描述长期技术决定，`module-index.yaml` 只描述稳定模块身份、
Owner 和依赖。缺少某类事实时不创建空模板。

## oec-spec runtime

`bin/oec-spec` 使用提交的独立 bundle，并提供只读确定性检查：

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

`task resolve` 是所有任务消费者的统一身份入口。`task check` 校验 `spec.md`/`design.md` 的路径、
Frontmatter、章节、Acceptance ID、来源和交叉引用。`remind` 只报告可能需要复核的 Team Spec/ADR，
不写文件、不创建状态，也不阻断普通编码。

`select`、`check`、`task resolve`、`task check` 和 `remind` 都不执行外部写入；legacy audit 不删除旧
managed files，也不移动 `ai-docs`。

## 旧 Dev 项目迁移

显式调用迁移 Skill：

```text
/oec-engineering:migrate-legacy-ai-docs
```

它会运行只读 legacy audit、枚举旧 `ai-docs`，提出“源路径 → 分类 → 目标路径 → 证据”的精确计划。
Product PRD、E3 mapping、历史记录和旧任务文件保持原位；旧 `dev-task` 和 `change.md` 只在明确升级时
转换，不自动扁平化或复制。`.oec-ai`、旧项目 Skills 和 Agents 的清理是另一个需要精确确认的破坏性
操作。

## 边界

- Team Specs 只保存稳定、证据支持的工程事实。
- 版本化任务的 `spec.md`/`design.md` 只保存一次变更的上下文和实现设计。
- 普通实现、探索和验证属于 Main Coding Session。
- 不强制 TDD、任务拆分、implementation plan 或 Agent 委派。
- E3、SAE、UTP、远端 Git 和飞书写入不属于本 Plugin。
- 安装不会在项目中创建 `.claude`、`.codex` 或 `ai-docs`。
- 项目文件只在用户明确要求并确认准确路径时创建或修改。

## 开发验证

在 Marketplace 根执行：

```bash
npm ci --ignore-scripts
npm run verify
claude plugin validate --strict ./oec-engineering
git diff --check
```

`dist/oec-spec.mjs` 随 Git 提交，因此 Marketplace 安装不依赖 Plugin 内的 `node_modules`。

## 兼容性

Claude Plugin 的 Skill 与 Agent 通过结构和分发校验后，仍需单独完成真实 Agent 发现、工具可用性和
完整运行旅程验收。Codex Agent 镜像在完成对应宿主验收前，不能由指令文件存在推导完整支持状态。
