# PlainOEC QUICKSTART

> 当前版本是 release candidate，尚未正式发布。先了解全部 Plugin，再按角色选择需要的能力；不要
> 一次性安装所有 Plugin，也不要把 mock、MCP Connected 或模型回复当作真实外部验收。

## 1. 先认识五个 Plugin

| Plugin | 作用 | 主要组件 | 外部副作用 | 依赖关系 |
| --- | --- | --- | --- | --- |
| `oec-product` | PRD 编写、需求评审和 E3 发布 | 1 Agent + 3 Skills | 发布时受控写 E3 | 自动依赖 `oec-e3` |
| `oec-engineering` | 团队工程知识、技术方案、诊断、代码评审、长时 Web/全栈开发和收口 | 11 Skills + 4 Agents + `oec-spec` | 无默认外部写入 | 无平台强依赖 |
| `oec-e3` | PRD 发布、研发任务和进度 | 10 MCP Tools | 受控写 E3 | 可独立安装，也被 Product 依赖 |
| `oec-pipeline` | 运行已有 dev/test 流水线 | 4 MCP Tools | 受控启动流水线 | 独立安装 |
| `oec-common` | HTML Slides | 1 Skill | 无远端业务写入 | 独立安装 |

组件分工：

- **Skill**：按场景提供领域方法、判断边界和产物契约。
- **Agent**：只在用户明确选择时提供持续身份、隔离上下文或 fresh-eyes。
- **MCP Server**：用确定性代码处理认证、远端身份、计划、幂等、恢复和状态回读。
- **Human**：确认产品取舍、风险接受和外部副作用。

使用 user scope 安装只会把能力加入 Claude Code，不会因为安装 `oec-engineering` 就在业务仓库创建
`.claude`、`.codex` 或 `ai-docs`。安装 `oec-product` 时，Claude Code 会自动解析并安装其
`oec-e3@~1.0.0` 依赖；这表示 E3 工具可用，不表示普通 PRD 写作会自动发布。

`oec-e3` 与 `oec-pipeline` 是受控平台能力：它们包含远端写入，必须有明确 Owner、授权对象、宿主
Human confirmation 和独立 status/read-back。首次使用不要从真实外部写入开始。

## 2. 添加 Marketplace

前提：

- Claude Code `2.1.110` 或更新版本；
- PATH 中存在 Node.js 20 或更新版本；
- 当前 Git 环境有权读取 Marketplace 仓库。

每个用户只需添加一次：

```bash
claude plugin marketplace add \
  quanxinwang18-a11y/plainOEC-infra \
  --scope user
```

## 3. 按角色选择安装

### 产品角色

#### 首选

```bash
claude plugin install \
  oec-product@plainOEC-infra \
  --scope user
```

Product 安装会自动带入 E3 依赖。第一次先做本地产品工作，例如：

```text
根据这份需求材料写一版 PRD，先不要发布到 E3。
```

或：

```text
只读评审当前 PRD，列出歧义、冲突和不可测试的验收条件。
```

#### 可选

需要产品汇报或 HTML 演示时安装：

```bash
claude plugin install \
  oec-common@plainOEC-infra \
  --scope user
```

#### 受控

E3 发布必须显式调用 Product 的 publishing Skill，并经过准备、计划展示、Human confirmation、远端写入
和 status 验证。QUICKSTART 不提供真实发布演练；权限、账号和证据边界见
[oec-product](oec-product/README.md) 与 [oec-e3](oec-e3/README.md)。

### 研发角色

#### 首选

```bash
claude plugin install \
  oec-engineering@plainOEC-infra \
  --scope user
```

普通编码仍由 Claude Code 主 Session 完成。第一次可以从只读评审开始：

```text
只读评审当前工作区 diff，优先报告会改变行为、兼容性或数据完整性的问题。
```

也可以直接描述非平凡技术方案或困难故障；相关 Skill 按场景发现。安装 Engineering 不要求所有任务
创建 change package、使用 Agent、执行 TDD 或 closing。

#### 可选

- 需要演示交付时安装 `oec-common`。
- 团队确实需要 repository-owned 工程事实时，再显式初始化 Team Specs。
- 需要隔离实现、fresh-eyes 或有边界研究时，再使用 `implementer`、`checker` 或
  `researcher` Agent。

#### 受控

只有任务需要平台状态时才安装：

```bash
claude plugin install oec-e3@plainOEC-infra --scope user
claude plugin install oec-pipeline@plainOEC-infra --scope user
```

E3 研发任务和 Pipeline 运行都不是 Engineering 完成的默认步骤。真实使用必须由平台 Owner 授权，且
只针对批准的非生产对象。详细边界见 [oec-e3](oec-e3/README.md) 与
[oec-pipeline](oec-pipeline/README.md)。

### 其他角色

面向管理、设计、内容协作者和临时参与者。

#### 首选

需要制作可演讲、概览和打印的 HTML Slides 时安装：

```bash
claude plugin install \
  oec-common@plainOEC-infra \
  --scope user
```

首次使用可以直接说：

```text
把这份材料做成一套 HTML 幻灯片。
```

没有明确任务时，不推荐安装全部 Plugin。

#### 可选

- 实际承担产品责任时选择 `oec-product`。
- 实际承担工程责任时选择 `oec-engineering`。

#### 受控

只有成为明确的平台 Owner 或授权操作人时才安装 `oec-e3` 或 `oec-pipeline`。不要因为需要查看文档或
参与讨论就扩大远端权限面。

## 4. 验证安装

```bash
claude plugin list
claude plugin details oec-product
claude plugin details oec-engineering
claude plugin details oec-common
```

只检查自己实际安装的 Plugin。Product 的详情和安装列表中应能看到 E3 依赖已经解析。

user scope 适合个人按需使用。只有团队希望在仓库中共享 Marketplace 与 Plugin 启用声明时才使用
project scope；Claude Code 会管理项目 `.claude/settings.json`，不要手工复制 Plugin payload。

## 5. 回退与卸载

普通能力可以按安装 scope 卸载：

```bash
claude plugin uninstall oec-engineering --scope user
claude plugin uninstall oec-common --scope user
```

卸载 Product：

```bash
claude plugin uninstall oec-product --scope user
```

`--prune` 会继续删除不再被其他 Plugin 需要的自动依赖；只有确认 E3 不再被使用并已经处理其数据后才
添加该选项。

卸载 E3 或 Pipeline 前先决定是否保留 Plugin Data。需要保留 OAuth、workspace 配置、selection、plan、
lock 或恢复线索时使用 `--keep-data`；不要在 unknown/partial 状态未核对前删除平台数据。

项目中由团队确认创建的 PRD、Specs、ADRs、change 和 mapping 是项目自己的 Git 资产，不会因为卸载
Plugin 自动删除。

## 6. 下一步

- 项目首页与当前发布状态：[README](README.md)
- 完整文档分类：[docs/README](docs/README.md)
- Product 详情：[oec-product/README](oec-product/README.md)
- Engineering 详情：[oec-engineering/README](oec-engineering/README.md)
- E3 权限与验收边界：[oec-e3/README](oec-e3/README.md)
- Pipeline 权限与恢复边界：[oec-pipeline/README](oec-pipeline/README.md)
- Common 输出契约：[oec-common/README](oec-common/README.md)
