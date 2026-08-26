# plainOEC-infra

`plainOEC-infra` 是面向 Claude Code 的 OEC 组织级 Marketplace：领域 Plugin 提供 Product、
Engineering 和内容交付能力，平台 Plugin 用确定性 MCP 处理 E3 与 Pipeline 的认证、远端副作用、
幂等、恢复和状态回读。

> **当前状态：release candidate，尚未正式发布。**
>
> 第一次使用请从 [QUICKSTART](QUICKSTART.md) 开始。先认识全部五个 Plugin，再按产品、研发或其他角色
> 选择安装；不提供一键安装全部 Plugin 的推荐路径。

## 五个 Plugin

| Plugin | 作用 | 组件 | 外部副作用 | 依赖 |
| --- | --- | --- | --- | --- |
| `oec-product` | PRD 写作、只读评审和显式发布 | 1 Agent + 3 Skills | 显式发布时写 E3 | 自动依赖 `oec-e3` |
| `oec-engineering` | 团队 Specs、规划、诊断、显式 Agent 委派、review 和 closing | 10 Skills + 3 Agents + `oec-spec` | 无默认外部写入 | 无平台强依赖 |
| `oec-e3` | PRD 发布、研发任务、进度和状态 | 1 MCP Server / 10 Tools | 受控写 E3 | 可独立安装，也被 Product 依赖 |
| `oec-pipeline` | 发现并运行已有 dev/test 流水线 | 1 MCP Server / 4 Tools | 受控启动流水线 | 独立安装 |
| `oec-common` | 可演讲、概览和打印的 HTML Slides | 1 Skill | 无远端业务写入 | 独立安装 |

Marketplace 只负责发现和分发。Plugin 可独立安装、升级和卸载；Skill 提供按需领域方法；Agent 只在
用户明确选择时提供身份、隔离上下文或 fresh-eyes；MCP Server 负责模型不应自行解释的外部平台
不变量。

当前候选版本：

| 模块 | 版本 |
| --- | --- |
| Marketplace | `3.0.1` |
| Product | `3.0.2` |
| Engineering | `1.6.0` |
| E3 | `1.0.1` |
| Pipeline | `1.0.1` |
| Common | `0.2.1` |

## 按角色选择

| 角色 | 首选 | 可选 | 受控 |
| --- | --- | --- | --- |
| 产品 | `oec-product` | `oec-common` | 通过 Product 显式使用 E3 发布 |
| 研发 | `oec-engineering` | `oec-common`、Team Specs、可选 Agents | 按任务安装 `oec-e3` 或 `oec-pipeline` |
| 其他 | 有演示交付时使用 `oec-common` | 承担产品或工程责任时再选择对应 Plugin | 只有平台 Owner/授权操作人才使用 E3/Pipeline |

安装、首个使用场景、验证和回退命令见 [QUICKSTART](QUICKSTART.md)。每个 Plugin 的完整能力与边界见
[文档地图](docs/README.md)。

## 核心设计

1. **通用编码留给主 Session。** 不建立总控 Dev Agent、全局路由器或统一任务状态机。
2. **模型处理语义，代码处理不变量。** PRD/Spec 内容由模型与 Human 判断，schema、路径、身份和
   幂等由确定性代码验证。
3. **外部写入进入 typed MCP。** E3/Pipeline 写入必须经过明确目标、计划、Human confirmation 和
   status/read-back。
4. **三类事实分开。** 项目事实进入 Git，OAuth/plan/lock 等私有状态进入 Plugin Data，最终对象由
   远端平台拥有。
5. **按风险展开。** 小改动保持最短路径；高风险工作才增加 Specs、change、独立 review 和 evidence。
6. **证据等级不可互换。** 源码、静态测试、bundle、Connected、真实非生产验收和生产可用是不同声明。

## 安装边界

- user scope 安装不会要求业务仓库安装 npm 依赖，也不会手工复制 Plugin payload。
- 安装 `oec-engineering` 本身不会创建项目 `.claude`、`.codex` 或 `ai-docs`。
- Product 会由宿主解析 `oec-e3@~1.0.0` 依赖；普通 PRD 写作不会因此自动发布。
- E3 与 Pipeline 包含远端权限，只应由明确 Owner 在授权对象上使用。
- 团队需要共享 Plugin 启用声明时才选择 project scope，并让 Claude Code 管理项目 settings。

## 当前证据与限制

当前本地证据包括：

- `117/117` 自动测试通过；
- Marketplace 与五个 Plugin strict validation 通过；
- committed bundles 可在没有 Plugin 内 `node_modules` 的隔离环境运行；
- E3/Pipeline 的路径、身份、并发、幂等和失败恢复具有自动测试；
- Product、Engineering 与 Common 共有 28 个正负 eval cases。

仍不能声明：

- 当前候选版本已经正式发布；
- E3 `1.0.1` 的账号 Owner 逻辑已完成真实补丁复验；
- Pipeline `1.0.1` 已在授权非生产流水线上完成 single-POST 真实验收；
- 14 个 Skills 已通过真实 LLM outcome eval；当前 grader 只验证路由和抑制；
- MCP Connected 等于真实业务验收或生产可用；
- Codex Agents 已完成完整宿主验收。

LICENSE/notice 的组织 Owner 决策、E3/Pipeline 当前补丁的真实非生产证据，以及 LLM eval 或明确的
Owner gap 决策仍阻塞正式发布。

## 维护与验证

在 Marketplace 根执行：

```bash
npm ci --ignore-scripts
npm run verify
claude plugin validate --strict .
git diff --check
```

贡献规则见 [CLAUDE.md](CLAUDE.md)。不要创建或推送 release tag，除非发布门禁和 Owner 决策均已完成。

## 文档入口

- [QUICKSTART](QUICKSTART.md)：全部 Plugin 介绍、角色安装建议、首次使用和回退。
- [PlainOEC 文档地图](docs/README.md)：架构、策略、迁移、评审、审计和证据分类。
- [PlainOEC-infra 完整架构与能力管理报告](docs/strategy/plainoec-infra-management-report.md)：面向
  管理者的完整组件、协作、证据与发布状态。
- [Product 能力迁移分析](docs/migrations/product-capability-migration.md)：旧 PM 能力到当前 Product/E3
  分层的证据。
- [Engineering 能力迁移分析](docs/migrations/engineering-capability-migration.md)：旧 Dev/Test 能力到
  主 Session、Engineering 与平台 Plugin 的迁移证据。
