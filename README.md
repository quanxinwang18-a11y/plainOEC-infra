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

将 GitHub 仓库加入 Claude Code Marketplace，然后安装插件：

```bash
claude plugin marketplace add quanxinwang18-a11y/plainOEC-infra
claude plugin install oec-product@plainOEC-infra
```

安装范围可以通过 `--scope user|project|local` 显式指定。完整能力、调用方式和 E3 发布边界见
[oec-product/README.md](oec-product/README.md)。

## 使用入口

```text
@oec-product:oec-pm
/oec-product:writing-prds
/oec-product:reviewing-prds
/oec-product:publishing-prds-to-e3 v1.2.3
```

`oec-pm` 不会接管 Claude 主线程，也不会预加载具有外部副作用的 E3 发布 Skill。E3 发布必须
由用户显式调用，并经过 prepare、计划确认、execute 和 status 验证。

## 开发与验证

```bash
cd oec-product
npm ci --ignore-scripts
npm test

cd ..
claude plugin validate .
claude plugin validate ./oec-product
claude --plugin-dir ./oec-product plugin details oec-product
```

贡献规则见 [CLAUDE.md](CLAUDE.md)。版本变化记录见
[oec-product/CHANGELOG.md](oec-product/CHANGELOG.md)。
