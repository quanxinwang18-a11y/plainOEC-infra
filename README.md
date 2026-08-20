# plainOEC-infra

`plainOEC-infra` 是面向 Claude Code 的 OEC 组织级 Marketplace。目前只分发一个产品域插件
`oec-product`，提供 PRD 编写、只读评审和经确认的 E3 发布能力。

## 原生层级

```text
Marketplace: plainOEC-infra
└── Plugin: oec-product
    ├── Agent: oec-pm
    ├── Skills
    │   ├── writing-prds
    │   ├── reviewing-prds
    │   └── publishing-prds-to-e3
    └── MCP Server: e3
```

- Marketplace 只负责组织级发现和分发。
- Plugin 是可独立安装、升级和卸载的产品域能力包。
- Agent 只定义显式 PM 工作身份、产物范围和权限边界。
- Skills 承载可发现、可组合的领域能力及其渐进披露资源。
- MCP Server 确定性实现 E3 认证、类型化工具、幂等、映射和恢复。

仓库不使用 legacy Commands、Hooks、默认 Agent settings，也不建立插件根公共
`references/assets/lib` 层。Skill 的 supporting files 必须归属于对应 Skill。

## 安装

前提是 PATH 中存在 Node.js 20 或更高版本，并且当前 Git 环境有权读取 Marketplace 仓库。
使用 user scope 安装时，产品仓库不需要创建 `.claude/`：

```bash
claude plugin marketplace add quanxinwang18-a11y/plainOEC-infra --scope user
claude plugin install oec-product@plainOEC-infra --scope user
```

插件从 Git 仓库分发，运行时依赖已经打入 bundle。安装不需要 `npm login`、`npm install`、
GitHub Packages 或 SessionStart 安装 Hook。

团队需要在仓库中共享插件声明时，将两个命令改为 `--scope project`。Claude Code 会自动生成只
包含 Marketplace 和插件启用状态的 `.claude/settings.json`，不需要手工编写。完整能力和 E3
边界见 [oec-product/README.md](oec-product/README.md)。

## 使用入口

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

产品仓库可以在根 `CLAUDE.md` 中记录产品定位、目标用户、业务词汇、已确认规则和资料入口；
不要复制 Skill 工作流、PRD 模板、E3 API 或权限配置。

## 开发与验证

```bash
npm ci --ignore-scripts
npm run build
npm test
claude plugin validate .
claude plugin validate ./oec-product
claude --plugin-dir ./oec-product plugin details oec-product
```

`package.json` 和 lockfile 位于 Marketplace 根，仅供维护和构建使用，不会随 `oec-product/`
复制到插件缓存。发布前重新构建 bundle，并确认两个 runtime 文件没有未提交差异。

贡献规则见 [CLAUDE.md](CLAUDE.md)。版本变化记录见
[oec-product/CHANGELOG.md](oec-product/CHANGELOG.md)。
