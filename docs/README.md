# PlainOEC 文档地图

本文档按读者目标和证据生命周期组织资料。当前功能以根 README、QUICKSTART、Plugin README 和源码
contract 为准；策略、迁移、评审和历史验收不能覆盖当前实现。

## 文档分类

| 分类 | 位置 | 定位 | 更新时机 |
| --- | --- | --- | --- |
| 项目入口 | [根 README](../README.md) | 当前定位、全部 Plugin、角色方向和发布状态 | 当前能力或版本变化 |
| 快速开始 | [QUICKSTART](../QUICKSTART.md) | 安装、角色建议、首次安全使用和回退 | 安装或用户入口变化 |
| Plugin README | 各 `oec-*/README.md` | 单个 Plugin 的权威能力、边界和验收状态 | Plugin 行为或证据变化 |
| 架构 | [`architecture/`](architecture/) | 当前稳定层级、依赖、权限和状态归属 | 架构 contract 变化 |
| 策略 | [`strategy/`](strategy/) | 管理决策、路线、讲解材料和候选方向 | 决策或路线变化 |
| 迁移 | [`migrations/`](migrations/) | 旧系统分发、问题、取舍与迁移证据 | 历史基线或迁移结论修订 |
| 评审 | [`reviews/`](reviews/) | 特定实现或时间点的审查 | 新评审形成时 |
| 审计 | [`audits/`](audits/) | 候选能力准入、风险与门禁 | 候选状态或门禁变化 |
| 证据 | [`evidence/`](evidence/) | 已观察验收、环境、结果和未覆盖边界 | 新的真实验收完成时 |

## 从哪里开始

- 第一次使用：阅读 [QUICKSTART](../QUICKSTART.md)。
- 了解当前五 Plugin 架构：阅读
  [平台 Plugin 层级与 MCP 迁移设计](architecture/platform-plugin-hierarchy.md)。
- 面向管理者了解完整能力、证据等级和发布阻塞：阅读
  [PlainOEC-infra 完整架构与能力管理报告](strategy/plainoec-infra-management-report.md)。
- 评估下一阶段能力：阅读
  [OEC-infra 下一步完整优化思路](strategy/oec-infra-next-optimization.md)。

## Plugin 权威入口

| Plugin | README | Changelog |
| --- | --- | --- |
| Product | [oec-product](../oec-product/README.md) | [版本](../oec-product/CHANGELOG.md) |
| Engineering | [oec-engineering](../oec-engineering/README.md) | [版本](../oec-engineering/CHANGELOG.md) |
| E3 | [oec-e3](../oec-e3/README.md) | [版本](../oec-e3/CHANGELOG.md) |
| Pipeline | [oec-pipeline](../oec-pipeline/README.md) | [版本](../oec-pipeline/CHANGELOG.md) |
| Common | [oec-common](../oec-common/README.md) | [版本](../oec-common/CHANGELOG.md) |

## 当前架构与策略

### Architecture

- [平台 Plugin 层级与 MCP 迁移设计](architecture/platform-plugin-hierarchy.md)：当前领域/平台分层、
  依赖、工具链和状态归属。

### Strategy

- [完整架构与能力管理报告](strategy/plainoec-infra-management-report.md)：当前五个模块、协作主链、
  证据总表和正式发布门禁。
- [下一步完整优化思路](strategy/oec-infra-next-optimization.md)：旧系统问题、能力处置、候选 Testing与
  平台准入路线。
- [优化核心讲解思路](strategy/oec-infra-next-optimization-talk-track.md)：面向讲解和汇报，不作为实现
  contract。

## 历史迁移、评审、审计与证据

### Migrations

- [Product 能力迁移分析](migrations/product-capability-migration.md)：旧 PM 分发、路由和 E3 发布如何迁移。
- [Engineering 能力迁移分析](migrations/engineering-capability-migration.md)：旧 Dev/Test 配置如何拆回
  主 Session、Engineering 与平台 Plugin。

### Reviews

- [PM 实现迁移 Review](reviews/pm-implementation-review.md)：特定迁移实现的对比评审。

### Audits

- [SAE 与 UTP 平台能力准入审计](audits/sae-utp-admission-audit.md)：尚未进入 Marketplace 的候选能力
  和证据门槛。

### Evidence

- [E3 平台 Plugin 3.0.0 真实验收](evidence/e3-platform-3.0.0-real-acceptance.md)：已授权非生产旅程的
  观察结果和未覆盖边界。

## 使用规则

- README 和 architecture 描述当前状态；migration、review 与 evidence 是历史或时间点证据。
- Strategy 可以提出目标，但不能替代当前 Plugin README、manifest、测试和源码。
- Connected 只证明 MCP 能启动；真实外部可用性必须由授权操作和 status/read-back 支持。
- 新资料先判断受众、时效和 Owner，再放入对应目录；不要把历史研究重新堆回仓库根目录。
