# plainOEC-infra

`plainOEC-infra` 是面向 Claude Code 的 OEC 组织级 Marketplace，按独立生命周期分发产品管理和
软件工程能力：

- `oec-product`：PRD 编写、只读评审和经确认的 E3 发布。
- `oec-engineering`：团队工程 Specs、技术规划、显式 TDD、困难故障诊断、只读代码评审和工程收口。

## 原生层级

```text
Marketplace: plainOEC-infra
├── Plugin: oec-product
│   ├── Agent: oec-pm
│   ├── Skills: writing / reviewing / publishing PRDs
│   └── MCP Server: e3
└── Plugin: oec-engineering
    ├── Skills: team Specs / planning / TDD / diagnosis / review / closing
    └── Runtime: oec-spec
```

- Marketplace 只负责组织级发现和分发。
- Plugin 是可独立安装、升级和卸载的产品域能力包。
- Agent 只用于确有独立身份或上下文边界的任务；工程插件不创建通用 Dev Agent。
- Skills 承载可发现、可组合的领域能力及其渐进披露资源。
- MCP Server 确定性实现 E3 认证、类型化工具、幂等、映射和恢复。
- `oec-spec` 确定性选择和校验项目团队 Specs，并只读审计旧 Dev 安装。

仓库不使用 legacy Commands、Hooks、默认 Agent settings，也不建立插件根公共
`references/assets/lib` 层。Skill 的 supporting files 必须归属于对应 Skill。

## 安装

前提是 PATH 中存在 Node.js 20 或更高版本，并且当前 Git 环境有权读取 Marketplace 仓库。
使用 user scope 安装时，产品仓库不需要创建 `.claude/`：

```bash
claude plugin marketplace add quanxinwang18-a11y/plainOEC-infra --scope user
claude plugin install oec-product@plainOEC-infra --scope user
claude plugin install oec-engineering@plainOEC-infra --scope user
```

插件从 Git 仓库分发，运行时依赖已经打入 bundle。安装不需要 `npm login`、`npm install`、
GitHub Packages 或 SessionStart 安装 Hook。

只需要其中一个领域时，可以只安装对应 Plugin。团队需要在仓库中共享插件声明时，将相关命令改为
`--scope project`。Claude Code 会自动生成只
包含 Marketplace 和插件启用状态的 `.claude/settings.json`，不需要手工编写。完整能力和 E3
边界见 [oec-product/README.md](oec-product/README.md)，工程能力见
[oec-engineering/README.md](oec-engineering/README.md)。

## 使用入口

```text
@oec-product:oec-pm
/oec-product:writing-prds
/oec-product:reviewing-prds
/oec-product:publishing-prds-to-e3 v1.2.3
```

完整 PM 会话使用：

```bash
claude --agent oec-pm
```

`oec-pm` 不会默认接管普通 Claude 主线程，也不会预加载具有外部副作用的 E3 发布 Skill。
E3 发布必须由用户显式调用，并经过 prepare、计划确认、宿主确认、execute 和 status 验证。

工程能力不要求启动专用 Agent：

```text
/oec-engineering:managing-team-specs init
/oec-engineering:planning-engineering-changes
/oec-engineering:test-driven-development
/oec-engineering:diagnosing-failures
/oec-engineering:reviewing-code-changes
/oec-engineering:closing-engineering-changes
```

只有 `closing-engineering-changes` 是手动调用；安装工程 Plugin 不会创建项目 `.claude`、`.codex`
或 `ai-docs`。团队显式初始化后，工程事实由项目仓库中的 `ai-docs/engineering/` 管理。

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
claude --plugin-dir ./oec-product plugin details oec-product
claude --plugin-dir ./oec-engineering plugin details oec-engineering
```

`package.json` 和 lockfile 位于 Marketplace 根，仅供维护和构建使用，不会随 Plugin 复制到缓存。
发布前重新构建 bundles，并确认没有未提交差异。

贡献规则见 [CLAUDE.md](CLAUDE.md)。版本变化记录见
[oec-product/CHANGELOG.md](oec-product/CHANGELOG.md) 和
[oec-engineering/CHANGELOG.md](oec-engineering/CHANGELOG.md)。旧 PM 与 Dev 的迁移证据分别见
[migration.md](migration.md) 和 [dev-migration.md](dev-migration.md)。
