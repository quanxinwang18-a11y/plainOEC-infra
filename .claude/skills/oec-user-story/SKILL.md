---
description: OEC 用户故事（As a/I want/So that）和 GWT 验收标准（Given/When/Then）的格式规范，含优先级 P0-P3 和待确认项格式。Use when writing user stories, defining acceptance criteria, or creating sub-PRDs.
---

# OEC User Story & GWT

## Purpose

Write user stories and GWT acceptance criteria for OEC PRDs and sub-PRDs. Each story must be independently valuable, testable, and written in product language.

## Context

OEC PRDs use the standard "As a [role], I want [action], So that [value]" format. Each story is assigned a priority (P0-P3) and paired with GWT (Given/When/Then) acceptance criteria. Stories are the unit of split — one story maps to one E3 requirement task.

**Priority levels:**
- **P0**: Core — the feature cannot ship without this
- **P1**: Important — should ship in the same version
- **P2**: Nice-to-have — can defer to next version
- **P3**: Future — keep in mind, no current commitment

## Story Format

```
| ID | 用户故事 | 优先级 | 来源 |
|----|---------|--------|------|
| US-001 | 作为 [role]，我希望 [action]，以便 [value] | P0 | §模块·功能 |
```

Each story must include:
- **Role**: a specific user, not "the user"
- **Action**: a single, concrete action
- **Value**: the benefit or outcome, not the feature description

## GWT Template

Each user story must have at least 3 GWT scenarios: 1 normal path + 1 error + 1 edge case.

```
**US-001 [story title]**

- Given [pre-condition], When [action], Then [expected result]
- Given [error condition], When [action], Then [error handling visible to user]
- Given [boundary condition], When [action], Then [boundary behavior]
```

GWT must be:
- **Observable**: describes what the user sees, not what the system does internally
- **Testable**: QA can verify without additional interpretation
- **Product language**: no API/DB/component names (see `oec-pm-language` skill)

## Cross-Module Reference

When a story involves multiple modules, document the relationship:

```
| 关联模块 | 关联方式 | 用户感知 |
|---------|---------|---------|
| 奖池配置 | 读取奖品概率和库存 | 无感知 |
| 会员中心 | 展示抽奖入口 | 在会员中心看到抽奖入口 |
```

Must be filled even if "无" (no relation). This is a hard gate.

## Pending Items Format

When the PRD cannot resolve an item, mark it clearly:

```
| 序号 | 事项 | 默认假设 | 影响范围 | 决策方 |
|------|------|---------|---------|--------|
| 1 | 未登录用户是否可见 | 不可见，需先登录 | 入口展示 | PM |
```

Each [待确认 N] must include all four columns. This is a hard gate.

## Example

A complete user story from a "daily free draw" module:

```
| ID | 用户故事 | 优先级 | 来源 |
|----|---------|--------|------|
| US-001 | 作为会员，我希望每天可以免费抽奖一次，以便获得额外权益 | P0 | §会员中心·每日免费抽 |

**US-001 每日免费抽奖**

- Given 用户已登录且今日未抽奖，When 点击"免费抽奖"按钮，Then 播放抽奖动画并展示中奖结果弹窗
- Given 网络中断，When 抽奖过程中断网，Then 提示"网络异常，请重试"，不消耗今日抽奖次数
- Given 用户今日已抽过奖，When 再次点击抽奖按钮，Then 按钮置灰，提示"今日已抽奖，明天再来"
```

## Notes

- One story = one independently valuable unit. If a story needs another story to be useful, combine them.
- Don't write "the system validates" — write what the user sees.
- Error handling and edge cases are stories in their own right, not bullet points within a happy-path story.
- Stories must be small enough to be a single E3 requirement task.
- No tech language: "接口返回 200" → "用户看到中奖弹窗".