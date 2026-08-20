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

发布版本在产生任一 E3 ID 后即与当前产物 fingerprint 和产品空间绑定。后续内容变化必须形成
新版本；远端对象 ID、标题或任务父子关系发生漂移时，插件会阻断而不会自动创建替代对象。
POMP 和系统需求元数据只在存在唯一候选或唯一默认值时自动选择。

## 本地验证

需要 Node.js 20 或更新版本：

```bash
npm ci --ignore-scripts
npm test
claude plugin validate .
```

真实 E3 写入必须使用获得授权的非生产空间。没有完成该验证时，不应把 mock 测试描述为真实
E3 E2E。

## 2.1.0 真实 E3 验收

2026-08-20，`2.1.0` 在获得明确授权的非生产 E3 空间中完成了真实发布验收：

- 完整 fixture 通过 pre-publish artifact gate。
- prepare 计划创建一条系统需求和一条 Story 任务，execute 返回 `published`。
- status 通过真实 E3 详情和列表响应验证 ID、标题、任务父子关系和详情链接，两项对象均为
  `verified`。
- 再次 prepare 的创建数为 0，系统需求和 Story 任务各复用 1 条。
- 修改包含既有 mapping 的 fixture 副本后，prepare 返回 `published-version-changed`，mapping
  内容保持不变。
- 临时 token、产品空间配置、计划文件和 fixture 已在验收后清理；远端验收对象未删除。

这次真实环境只有一个 POMP 候选，因此“多个候选且无唯一默认值”的交互分支仍由自动测试
覆盖。人为制造 partial 远端写入也没有作为真实验收执行，partial resume 的证据仍来自 mock
测试。验收记录不包含内部空间 ID、对象 ID、凭证或原始 E3 响应。
