# plainOEC-infra

`plainOEC-infra` 是面向 Claude Code 的 OEC 组织级 Marketplace，按领域能力和平台原子能力的
独立生命周期分发：

- `oec-product`：PRD 编写、只读评审和经确认的 E3 发布；原生依赖 `oec-e3`。
- `oec-engineering`：团队工程 Specs、技术规划、显式 TDD、困难故障诊断、只读代码评审和工程收口。
- `oec-e3`：PRD 发布与研发任务创建、进度和状态验证的 10 个类型化工具。
- `oec-pipeline`：现有 dev/test 流水线的受控发现、执行和状态验证。
- `oec-common`：零运行时依赖的 HTML-first 演示幻灯片。

## 原生层级

```text
Marketplace: plainOEC-infra
├── Plugin: oec-product
│   ├── Agent: oec-pm
│   ├── Skills: writing / reviewing / publishing PRDs
│   └── dependency: oec-e3@~1.0.0
├── Plugin: oec-engineering
│   ├── Skills: team Specs / planning / TDD / diagnosis / review / closing
│   ├── Agents: implement / check / research（显式使用）
│   └── Runtime: oec-spec
├── Plugin: oec-e3
│   └── MCP Server: e3 (10 tools)
├── Plugin: oec-pipeline
│   └── MCP Server: pipeline (4 tools)
└── Plugin: oec-common
    └── Skill: html-slides
```

- Marketplace 只负责组织级发现和分发。
- Plugin 是可独立安装、升级和卸载的产品域能力包。
- Agent 只用于用户明确要求或 OEC Skill 显式委派的独立上下文任务；不会默认接管普通编码。
- Skills 承载可发现、可组合的领域能力及其渐进披露资源。
- MCP Server 确定性实现平台认证、类型化工具、计划门禁、幂等、映射和恢复。
- `oec-spec` 确定性选择和校验项目团队 Specs，并只读审计旧 Dev 安装。

仓库不使用 legacy Commands、Hooks、默认 Agent settings，也不建立插件根公共
`references/assets/lib` 层。Skill 的 supporting files 必须归属于对应 Skill。

## 安装

前提是 Claude Code 2.1.110 或更高版本、PATH 中存在 Node.js 20 或更高版本，并且当前 Git 环境
有权读取 Marketplace 仓库。
使用 user scope 安装时，产品仓库不需要创建 `.claude/`：

```bash
claude plugin marketplace add quanxinwang18-a11y/plainOEC-infra --scope user
claude plugin install oec-product@plainOEC-infra --scope user
claude plugin install oec-engineering@plainOEC-infra --scope user
claude plugin install oec-pipeline@plainOEC-infra --scope user
claude plugin install oec-common@plainOEC-infra --scope user
```

插件从 Git 仓库分发，运行时依赖已经打入 bundle。安装不需要 `npm login`、`npm install`、
GitHub Packages 或 SessionStart 安装 Hook。

安装 Product 时 Claude Code 会自动解析同一 Marketplace 中的 `oec-e3@~1.0.0`。工程用户也可以
按需单独安装 `oec-e3`；Pipeline 和 Common 不会被 Product 或 Engineering 自动安装。团队需要在仓库中共享插件声明时，将相关命令改为
`--scope project`。Claude Code 会自动生成只
包含 Marketplace 和插件启用状态的 `.claude/settings.json`，不需要手工编写。完整能力和 E3
边界见 [oec-product/README.md](oec-product/README.md)，工程能力见
[oec-engineering/README.md](oec-engineering/README.md)。

## 按角色使用

### 产品

一次性 PRD 写作或评审直接用自然语言描述目标。只有需要持续 PM 工作身份时才启动 Agent；E3
发布仍必须显式调用：

```text
@oec-product:oec-pm
/oec-product:writing-prds
/oec-product:reviewing-prds
/oec-product:publishing-prds-to-e3 v1.2.3
```

完整 PM 会话使用：

```bash
claude --agent oec-product:oec-pm
```

`oec-pm` 不会默认接管普通 Claude 主线程，也不会预加载具有外部副作用的 E3 发布 Skill。
E3 发布必须由用户显式调用，并经过 prepare、计划确认、宿主确认、execute 和 status 验证。

### 研发

普通工程请求直接用自然语言描述目标；五个 model-invoked Skills 按场景发现。只有工程收口需要
显式调用：

```text
/oec-engineering:managing-team-specs init
/oec-engineering:planning-engineering-changes
/oec-engineering:test-driven-development
/oec-engineering:diagnosing-failures
/oec-engineering:reviewing-code-changes
/oec-engineering:closing-engineering-changes
```

团队需要仓库内共享工程事实时，才运行 `/oec-engineering:managing-team-specs init`。需要独立上下文
时，可以要求 Claude 使用 `oec-implement`、`oec-check` 或 `oec-research`，并通过 `@` Agent picker
保证派发。安装工程 Plugin 不会创建项目 `.claude`、`.codex` 或 `ai-docs`。

### 公共工具

安装 Common 后直接说“把这份材料做成 HTML 幻灯片”。`html-slides` 交付可浏览器演讲、概览和
打印的多文件 HTML deck，不生成 `.pptx`、视频或 GIF。

产品仓库可以在根 `CLAUDE.md` 中记录产品定位、目标用户、业务词汇、已确认规则和资料入口；
不要复制 Skill 工作流、PRD 模板、E3 API 或权限配置。

## 开发与验证

```bash
npm ci --ignore-scripts
npm run build
npm test
claude plugin validate .
claude plugin validate ./oec-product
claude plugin validate ./oec-engineering
claude plugin validate ./oec-e3
claude plugin validate ./oec-pipeline
claude plugin validate ./oec-common
claude --plugin-dir ./oec-product plugin details oec-product
claude --plugin-dir ./oec-engineering plugin details oec-engineering
claude --plugin-dir ./oec-common plugin details oec-common
```

`package.json` 和 lockfile 位于 Marketplace 根，仅供维护和构建使用，不会随 Plugin 复制到缓存。
发布前重新构建 bundles，并确认没有未提交差异。

贡献规则见 [CLAUDE.md](CLAUDE.md)。版本变化记录见
[oec-product/CHANGELOG.md](oec-product/CHANGELOG.md) 和
[oec-engineering/CHANGELOG.md](oec-engineering/CHANGELOG.md)、
[oec-e3/CHANGELOG.md](oec-e3/CHANGELOG.md) 和
[oec-pipeline/CHANGELOG.md](oec-pipeline/CHANGELOG.md)、
[oec-common/CHANGELOG.md](oec-common/CHANGELOG.md)。旧 PM 与 Dev 的迁移证据分别见
[migration.md](migration.md) 和 [dev-migration.md](dev-migration.md)。

## 设计与评审文档

- [OEC-infra 下一步完整优化思路](docs/strategy/oec-infra-next-optimization.md)：面向技术与管理决策者，说明旧 PM、研发、测试真实流程、配置问题、组件边界与下一阶段路线。
- [PM 实现迁移 Review](docs/reviews/pm-implementation-review.md)：对比旧真实分发结构与当前原生实现。
- [平台 Plugin 层级与 MCP 迁移设计](docs/architecture/platform-plugin-hierarchy.md)：记录已实现的领域/平台分层、分发关系与验收边界。
- [SAE 与 UTP 平台能力准入审计](docs/audits/sae-utp-admission-audit.md)：定义尚未进入 Marketplace 的平台能力分类和证据门槛。
- [E3 平台 Plugin 3.0.0 真实验收](docs/evidence/e3-platform-3.0.0-real-acceptance.md)：记录 PRD 发布与研发任务主链的真实非生产证据和未覆盖边界。
