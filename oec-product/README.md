# oec-product

`oec-product` 是通过 plainOEC-infra Marketplace 分发的 Claude Code 产品管理插件。

## 组件

- Agent：`@oec-product:oec-pm`，只在用户显式选择时提供 PM 工作身份。
- Skills：`writing-prds`、`reviewing-prds`、`publishing-prds-to-e3`。
- Platform dependency：`oec-e3@~1.0.0`，提供 E3 MCP 原子工具；Product 自身没有 MCP Server。

Agent 只预加载 PRD 写作与评审能力。完整 PM 会话通过显式 Agent 启动：

```bash
claude --agent oec-product:oec-pm
```

E3 发布必须由用户显式调用：

```text
/oec-product:publishing-prds-to-e3 v1.2.3
```

发布采用 prepare/confirm/execute/status 四段边界。prepare 不创建远端对象；execute 只接受
15 分钟有效的计划令牌、要求宿主进行人类确认，并在每个远端成功结果后原子更新 workspace
内的 E3 mapping。

产品空间和 POMP 选择使用绑定 canonical MCP root 的 15 分钟 selection token。空间配置按
workspace 隔离；OAuth token 仍由插件实例安全复用。Status 以 schema v2 mapping 中记录的空间
为历史发布归属，即使当前 workspace 配置缺失或不同也只读验证该空间。

发布版本在产生任一 E3 ID 后即与当前产物 fingerprint 和产品空间绑定。后续内容变化必须形成
新版本；远端对象 ID、标题或任务父子关系发生漂移时，插件会阻断而不会自动创建替代对象。
POMP 和系统需求元数据只在存在唯一候选或唯一默认值时自动选择。

## 分发

插件目录只包含自足的 artifact checker bundle。Claude Code 2.1.110 或更高版本会自动解析并
安装同一 Marketplace 中的 `oec-e3` 依赖。Product 与 E3 分别拥有 Plugin Data；升级到 3.0 后
首次发布需要重新 OAuth 和选择空间，项目仓库中的 mapping 保持兼容。安装不需要 npm registry、
`node_modules` 或运行时依赖安装。

## 本地验证

在 Marketplace 根执行，需要 Node.js 20 或更新版本：

```bash
npm ci --ignore-scripts
npm run build
npm test
claude plugin validate ./oec-product
```

真实 E3 写入必须使用获得授权的非生产空间。没有完成该验证时，不应把 mock 测试描述为真实
E3 E2E。

## 2.2.0 真实 E3 验收

2026-08-20，`2.2.0` 在获得明确授权的非生产 E3 空间“OBU-AI提效组”完成了真实发布验收：

- 干净 Git archive 通过 Claude CLI 安装，插件缓存没有 `node_modules`，bundled MCP 注册四个工具。
- `claude --agent oec-pm` 成功进入显式 PM 工作身份。
- 完整 fixture 通过 pre-publish artifact gate。
- prepare 计划创建一条系统需求和一条 Story 任务，execute 返回 `published`。
- status 通过真实 E3 详情和列表响应验证 ID、标题、任务父子关系和详情链接，两项对象均为
  `verified`。
- 再次 prepare 的创建数为 0，系统需求和 Story 任务各复用 1 条。
- 修改包含既有 mapping 的 fixture 副本后，prepare 返回 `published-version-changed`，mapping
  内容保持不变。
- 临时 token、产品空间配置、计划文件和 fixture 已在验收后清理；远端验收对象未删除。

这次流程没有进入“多个 POMP 候选且无唯一默认值”的分支，该交互仍由自动测试覆盖。人为制造
partial 远端写入也没有作为真实验收执行，partial resume 的证据仍来自 mock 测试。验收记录
不包含内部空间 ID、对象 ID、凭证或原始 E3 响应。
