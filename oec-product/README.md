# oec-product

`oec-product` 是通过 plainOEC-infra Marketplace 分发的 Claude Code 产品管理插件。

## 使用

一次性 PRD 写作或评审可以直接描述目标，分别使用 `/oec-product:prd-write` 和
`/oec-product:prd-review`。需要持续的产品经理工作身份时，在 `@` picker 中选择
`oec-product:product-manager`，或启动完整 Agent 会话：

Agent 只预加载 PRD 写作与评审能力。完整 PM 会话通过显式 Agent 启动：

```bash
claude --agent oec-product:product-manager
```

E3 发布必须由用户显式调用：

```text
/oec-product:prd-toe3 v1.2.3
```

发布采用 prepare/confirm/execute/status 四段边界。prepare 不创建远端对象；execute 只接受
15 分钟有效的计划令牌、要求宿主进行人类确认，并在每个远端成功结果后原子更新 workspace
内的 E3 record。

产品空间和 POMP 选择使用绑定 canonical MCP root 的 15 分钟 selection token。空间配置按
workspace 隔离；OAuth token 仍由插件实例安全复用。Status 以 schema v2 publication record 中记录的空间
为历史发布归属，即使当前 workspace 配置缺失或不同也只读验证该空间。

发布版本在产生任一 E3 ID 后即与当前产物 fingerprint 和产品空间绑定。后续内容变化必须形成
新版本；远端对象 ID、标题或任务父子关系发生漂移时，插件会阻断而不会自动创建替代对象。
POMP 和系统需求元数据只在存在唯一候选或唯一默认值时自动选择。

## 能力边界

Product 定义 PRD、Story 和 HANDOFF 的产品语义；`oec-e3` 负责认证、远端对象、幂等和状态查询。
安装 Product 会加载 `oec-e3@~1.0.0`，但普通 PRD 写作和评审不会触发远端发布。

当前 1.0.2 仍是未打 tag 的候选版本。验证当前候选组合时先显式安装 `oec-e3@plainOEC-infra`，再安装
Product；Product 单独安装会按 semver 选择最近已发布的 E3 tag。

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

## 当前证据

隔离 Marketplace 安装、artifact checker 和 E3 非生产主链均已有验证。当前补丁版本仍需在授权的
唯一非生产对象上复验账号归属；mock、MCP Connected 和历史版本证据不能替代该复验。

详细对象标识、结果与未覆盖边界见
[E3 平台真实验收记录](https://github.com/quanxinwang18-a11y/plainOEC-infra/blob/master/docs/evidence/e3-platform-3.0.0-real-acceptance.md)。
