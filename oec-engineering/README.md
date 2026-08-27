# oec-engineering

`oec-engineering` 提供十一个聚焦的软件工程 Skills、四个显式使用的可选 Agent，以及项目自有的团队
Spec 契约。它不会替代 Claude Code 主 Coding Agent，不安装研发状态机，也不向所有会话注入
SessionStart 上下文。

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
/oec-engineering:managing-team-specs
/oec-engineering:migrating-legacy-ai-docs
/oec-engineering:planning-engineering-changes
/oec-engineering:challenging-engineering-decisions
/oec-engineering:prototyping-decisions
/oec-engineering:test-driven-development
/oec-engineering:diagnosing-failures
/oec-engineering:reviewing-code-changes
/oec-engineering:delegating-engineering-agents
/oec-engineering:orchestrating-long-running-coding
/oec-engineering:closing-engineering-changes
```

`migrating-legacy-ai-docs`、`challenging-engineering-decisions`、`closing-engineering-changes`、
`delegating-engineering-agents` 和 `orchestrating-long-running-coding` 都是 user-invoked only。
决策挑战只压力测试一个技术决定，不自动进入规划或实现；Agent 委派只协调已有 change 或当前 diff，
不创建工作流状态；长时 Coding 只处理已有 change 的非平凡 Web/full-stack 任务，并在当前主 Session
内复用实现与运行态评估 Agent。决策原型只在用户明确要求用 throwaway artifact 回答交互或状态问题时
发现。迁移不删除源文件，TDD 也只在用户明确要求 test-first 时适用。

### Agents

需要独立上下文时，可以要求 Claude 使用：

- `oec-implement`：接收已有 change ID，在已声明的 boundary 内隔离实现并运行相关测试；
- `oec-check`：通过 status 与 `diff HEAD` 覆盖 staged、unstaged、untracked 变更，运行相关测试后做
  fresh-eyes 检查；
- `oec-research`：接收已有 change ID，把有边界的研究结果写入对应 change 目录。
- `oec-evaluate`：接收已有 change ID、当前会话完成条件和内部非生产目标，使用预配置的 Playwright
  MCP 操作运行中的 Web 应用，按产品深度、功能、视觉与代码质量返回独立证据，不修改项目文件或 Git。

`oec-implement`、`oec-research` 和 `oec-evaluate` 缺少 change ID 或对应 `change.md` 时会停止并请求
主会话补充，不会创建或猜测 change package。任何相关测试或运行态验收未执行、失败或证据不完整时，
Agent 只报告 partial/failed/incomplete，不会输出完成结论。

通过 Claude Code 的 `@` Agent picker 可以保证派发。它们不是 slash commands，只在用户明确请求，
或显式调用的 OEC Skill 委派有边界任务时使用；普通实现、评审和研究仍可由主会话完成。

需要统一入口时，显式调用 `delegating-engineering-agents` 并选择 `research`、`implement`、`check`
或 `full`。`full` 只按 `research → implement → check` 串行推进，任何 Agent 未报告 complete 或研究
要求修改设计时立即停止；该 Skill 不自动重试、不维护阶段状态，也不提交或关闭 change。

需要在明确的非平凡 Web/full-stack change 上长时间构建并进行运行态验收时，用户可以显式调用：

```text
/oec-engineering:orchestrating-long-running-coding [已确认目标或输入引用]
```

主 Session 只读取用户明确选择的 PRD、Task、Change、Spec、Plan 或其他参考文件，分别创建一次
`oec-implement` 与 `oec-evaluate`，随后按 Agent ID 在最多五个 build/evaluate cycle 中恢复同一对
Agent。第五次仍未通过时必须停止；用户明确继续后绝对上限为十次。Runtime 通过后再创建 fresh
`oec-check`。该流程不引入 Sprint、backlog、项目级运行文件、框架 adapter、snapshot、commit 或
closing，也不接管普通 Coding。

`oec-evaluate` 要求团队或用户预先配置并连接名为 `playwright` 的 MCP Server。Plugin 不安装、不
内联启动也不声明该 MCP；缺失时长时流程 fail closed，不以静态测试替代运行态验收。第一版只支持
本地或明确授权的内部非生产目标。

仓库同时保留实验性 Codex manifest 和 TOML Agent。由于本轮没有完成真实 Codex 安装、Agent 发现和
`oec-spec` PATH 验收，不把这些文件描述为已验证的 Codex 支持。

## 团队 Specs

只有团队需要 repository-owned 工程事实时才初始化：

```text
/oec-engineering:managing-team-specs init
```

Skill 会先检查仓库证据并展示拟创建的路径，只生成真实事实支持的 current-state Specs 和 ADRs：

```text
ai-docs/engineering/
├── README.md
├── specs/
├── decisions/
└── changes/
```

缺少某类事实时不创建空模板。可选根 `CLAUDE.md` 或 `AGENTS.md` 只指向团队索引，不复制 Skill
工作流。

Plugin 启用后，`bin/oec-spec` 会加入 Claude Bash PATH：

```bash
oec-spec select --workspace "$PWD" --paths <paths> --format json
oec-spec check --workspace "$PWD"
oec-spec legacy-audit --workspace "$PWD"
```

三个命令均为只读；legacy audit 不删除旧 managed files，也不移动 `ai-docs`。

## 旧 Dev 项目迁移

显式调用迁移 Skill：

```text
/oec-engineering:migrating-legacy-ai-docs
```

它会运行只读 legacy audit、枚举旧 `ai-docs`、提出“源路径 → 分类 → 目标路径 → 证据”的精确
计划，并在确认后只写 `ai-docs/engineering/`。Product PRD、E3 mapping、历史记录和全部旧文件保持
原位；`.oec-ai`、旧项目 Skills 和 Agents 的清理是另一个需要精确确认的破坏性操作。

迁移依据和旧分发实测见
[Engineering 能力迁移分析](../docs/migrations/engineering-capability-migration.md)。

## 边界

- Team Specs 只保存稳定、证据支持的工程事实。
- Change packages 只保存非平凡变更需要的上下文和证据。
- 普通实现、探索和验证属于主 Coding Agent。
- E3、SAE、UTP、远端 Git 和飞书写入不属于本 Plugin。
- 安装不会在项目中创建 `.claude`、`.codex` 或 `ai-docs`。
- 项目文件只在用户要求管理团队 Specs 并确认对应路径时创建或修改。

## 开发验证

在 Marketplace 根执行：

```bash
npm ci --ignore-scripts
npm run build
npm test
claude plugin validate --strict ./oec-engineering
git diff --check
```

`dist/oec-spec.mjs` 随 Git 提交，因此 Marketplace 安装不依赖 Plugin 内的 `node_modules`。
