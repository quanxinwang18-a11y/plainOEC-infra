# oec-product

`oec-product` 是通过 plainOEC-infra Marketplace 分发的 Claude Code 产品管理插件。

## 组件

- Agent：`@oec-product:oec-pm`，只在用户显式选择时提供 PM 工作身份。
- Skills：`writing-prds`、`reviewing-prds`、`publishing-prds-to-e3`。
- MCP Server：`e3`，提供 prepare、空间选择、execute 和 status 四个发布工具。

Agent 只预加载 PRD 写作与评审能力。E3 发布必须由用户显式调用：

```text
/oec-product:publishing-prds-to-e3 v1.2.3
```

发布采用 prepare/confirm/execute/status 四段边界。prepare 不创建远端对象；execute 只接受
15 分钟有效的计划令牌，并在每个远端成功结果后原子更新 workspace 内的 E3 mapping。

## 本地验证

需要 Node.js 20 或更新版本：

```bash
npm ci --ignore-scripts
npm test
claude plugin validate .
```

真实 E3 写入必须使用获得授权的非生产空间。没有完成该验证时，不应把 mock 测试描述为真实
E3 E2E。
