# oec-dev-beta

`oec-dev-beta` 是独立的实验性 Web/全栈开发流程 Plugin。它不属于普通
`oec-dev` 流程，也不改变主会话的默认编码方式。

## 安装

先安装稳定 Engineering Plugin：

```bash
claude plugin install oec-dev@plainOEC-infra --scope user
```

需要长时 Web/full-stack 流程时，再按需安装：

```bash
claude plugin install oec-dev-beta@plainOEC-infra --scope user
```

## 能力

本 Plugin 只提供一个显式 Skill：

```text
/oec-dev-beta:web-develop [existing taskRef]
```

它要求：

- 已存在并可解析的 canonical `taskRef` 或 legacy change ID；
- 已准备好的任务 `spec.md` / `design.md`；
- 可运行的本地或内部非生产 Web 应用；
- 已由宿主配置并连接的 Playwright MCP；
- 宿主已经发现 `oec-dev` 提供的 `implementer`、`evaluator`、`checker` 和 `oec-spec`。

`oec-dev-beta` 不复制这些 Agent、Skill 或 runtime，也不新增 MCP、Hook 或状态服务。缺少依赖的宿主能力
时应报告 `blocked`，不能退化为静态猜测。

## 边界

- `web-develop` 保持 `disable-model-invocation: true`，必须由用户显式调用。
- 只在非生产目标上运行；默认最多五轮，明确继续后最多十轮。
- 运行态 checklist 从任务 Spec 的 `AC-NNN` 派生，不创建第二份验收事实源。
- 不创建项目状态文件、分支或快照。
- 不自动 commit、push、merge、部署或更新 E3/Pipeline。
- 完成后是否调用 `code-finish` 仍由用户单独决定。

这是 early-access 实验能力，不代表普通 Dev 任务必须使用长时编排，也不代表已完成真实 Web/Playwright
验收。
