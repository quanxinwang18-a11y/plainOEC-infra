---
description: OEC 增量 PRD 的 11 章结构和多模块组织方式。Use when writing a version increment PRD, generating prd-v{x.y.z}.md, organizing multi-module PRDs, or splitting PRDs into sub-PRDs.
---

# OEC PRD Structure

## Purpose

You are writing an OEC version increment PRD. Each version has exactly one increment file: `versions/v{x.y.z}/prd/prd-v{x.y.z}.md`. A version may contain multiple modules, all organized within this single file.

## Context

The increment PRD is the formal specification for the current version. Each `## 模块:` section is later split into a standalone sub-PRD by `oec-prd-split` — so the increment PRD must be complete. Split does not refine; it only slices.

Version types: 大版本 (major direction/GA), 中版本 (new feature/module), 小版本 (minor revision). All three belong to "做需求" (build). "改需求" (amend) does not create versions.

Output paths: `ai-docs/versions/v{x.y.z}/prd/prd-v{x.y.z}.md`. See `oec-pm-directory` skill for the full directory model.

## Structure

### Version-level sections

```markdown
# PRD v{x.y.z} 增量

## 本版本目标
[One paragraph: what problem, for whom, core value, relationship to previous version]

## 本版本范围
新增: [list modules]
修改: [list modules]
不改动: [list modules]

## 本版本验收（业务级）
[Version-level acceptance points. Module-level GWT goes inside each module section.]

## 不做什么
[Explicitly excluded scope]

## 待 PM 确认（版本级）
[Version-level, cross-module pending items. Module-level pending items go inside each module.]
```

### Module sections

Each `## 模块:` follows an 11-section structure. Feature name is declared in the heading in lowerCamelCase:

```markdown
## 模块: {module name in Chinese}（featureName: {lowerCamelCase}）

### 1. 模块概述
| 字段 | 值 |
|------|----|
| 产品定位 | ... |
| 目标用户 | ... |
| 核心价值 | ... |
| 优先级 | P0 / P1 / P2 / P3 |
| 预估工作量 | S / M / L / XL |
| 影响模块 | ... |

### 2. 用户故事
As a [role], I want [action], so that [value]. Each with priority. See `oec-user-story` skill for format.

### 3. 使用场景
Pre-condition / Steps / Expected result / Error path

### 4. 交互流程
4.1 页面结构 (product language: regions, component types, entry points)
4.2 操作流程图 (Mermaid flowchart — required)
4.3 页面布局线框图 (ASCII wireframe — required for UI modules)
4.4 表单与输入约束 (if applicable)

### 5. 验收标准（GWT，按 US 分组）
Given/When/Then per US. Each US: normal path + ≥1 error + ≥1 edge case.

### 6. 状态与生命周期
Mermaid stateDiagram (only when stateful objects exist)

### 7. 跨模块关联
| 关联模块 | 关联方式 | 用户感知 |
Must be filled (write "无" if none). This is a hard gate.

### 8. 非功能性需求与边界场景
8.1 异常场景 / 8.2 安全与隐私 / 8.3 外部依赖影响 / 8.4 性能感知（用户视角）

### 9. 数据变更（产品视角）
| 用户行为 | 系统记录 | 用户感知 |

### 10. 补充发现
10.1 来自原 PRD 的要点 / 10.2 细化过程发现的遗漏 / 10.3 跨模块关联需求

### 11. 待人工确认项
| 序号 | 事项 | 默认假设 | 影响范围 | 决策方 |
Each [待确认 N] must include 默认假设 + 影响范围 + 决策方. This is a hard gate.
```

## Example

A simplified module example for a "daily free draw" feature:

```markdown
## 模块: 每日免费抽（featureName: dailyDraw）

### 1. 模块概述
| 字段 | 值 |
|------|----|
| 产品定位 | 会员每日可免费抽奖一次，提升日活和留存 |
| 目标用户 | 所有已登录会员 |
| 核心价值 | 通过免费抽奖激励每日访问，增加会员权益感知 |
| 优先级 | P0 |
| 预估工作量 | M |
| 影响模块 | 会员中心、奖池配置 |

### 2. 用户故事
| ID | 用户故事 | 优先级 |
|----|---------|--------|
| US-001 | 作为会员，我希望每天可以免费抽奖一次，以便获得额外权益 | P0 |
| US-002 | 作为会员，我希望查看我的中奖记录，以便知道获得了什么 | P1 |

### 3. 使用场景
**场景 1: 每日免费抽奖**
- 前置条件: 用户已登录，今日未抽奖
- 操作步骤: 进入会员中心 → 点击"免费抽奖"按钮 → 观看抽奖动画 → 查看结果
- 期望结果: 展示中奖结果弹窗，奖品自动发放到账户
- 异常路径: 网络中断 → 提示"网络异常，请重试"，不消耗抽奖次数

### 4. 交互流程
[ASCII wireframe + Mermaid flowchart]

### 5. 验收标准（GWT，按 US 分组）
**US-001 每日免费抽奖**
- Given 用户已登录且今日未抽奖，When 点击"免费抽奖"，Then 播放抽奖动画并展示结果
- Given 用户今日已抽奖，When 再次点击，Then 提示"今日已抽奖，明天再来"
- Given 网络中断，When 抽奖过程中断网，Then 不消耗抽奖次数，提示重试

### 7. 跨模块关联
| 关联模块 | 关联方式 | 用户感知 |
|---------|---------|---------|
| 奖池配置 | 读取奖品概率和库存 | 无感知 |
| 会员中心 | 展示抽奖入口和中奖记录 | 在会员中心看到抽奖入口 |

### 11. 待人工确认项
| 序号 | 事项 | 默认假设 | 影响范围 | 决策方 |
|------|------|---------|---------|--------|
| 1 | 未登录用户是否可见抽奖入口 | 不可见，需先登录 | 会员中心入口展示 | PM |
```

## Notes

- **No over-refinement**: If the input already describes something clearly, quote it verbatim. Only expand what's missing.
- **No invention**: If the input doesn't mention a probability/price/rule, mark it [待确认] with a default assumption. Don't fabricate.
- **No tech leakage**: Use product language throughout. See `oec-pm-language` skill for forbidden terms.
- **No half-finished work**: Chapters with TODO/待补充 cannot be reported as complete.
- **Multi-module same version**: Put all modules in one `prd-v{x.y.z}.md`. The split step later slices by `## 模块:`.
- **Split is slice-only**: The increment PRD must be complete. Split does not add US/GWT/wireframes — it only repackages.