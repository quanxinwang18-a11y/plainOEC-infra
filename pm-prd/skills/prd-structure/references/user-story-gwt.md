# User Story & GWT Format

## Story Format

```
| ID | 用户故事 | 优先级 | 来源 |
|----|---------|--------|------|
| US-001 | 作为 [role]，我希望 [action]，以便 [value] | P0 | §模块·功能 |
```

- **Role**: a specific user, not "the user"
- **Action**: a single, concrete action
- **Value**: the benefit or outcome, not the feature description

## Priority

- **P0**: Core — the feature cannot ship without this
- **P1**: Important — should ship in the same version
- **P2**: Nice-to-have — can defer to next version
- **P3**: Future — keep in mind, no current commitment

## GWT Template

Each US needs ≥3 scenarios: 1 normal + 1 error + 1 edge case.

```
**US-001 [story title]**

- Given [pre-condition], When [action], Then [expected result]
- Given [error condition], When [action], Then [error handling visible to user]
- Given [boundary condition], When [action], Then [boundary behavior]
```

GWT must be:
- **Observable**: describes what the user sees, not what the system does internally
- **Testable**: QA can verify without additional interpretation
- **Product language**: no API/DB/component names

## Cross-Module Reference

```
| 关联模块 | 关联方式 | 用户感知 |
|---------|---------|---------|
| 奖池配置 | 读取奖品概率和库存 | 无感知 |
```

Must be filled even if "无" (no relation). Hard gate.

## Pending Items

```
| 序号 | 事项 | 默认假设 | 影响范围 | 决策方 |
|------|------|---------|---------|--------|
| 1 | 未登录用户是否可见 | 不可见，需先登录 | 入口展示 | PM |
```

All four columns required. Hard gate.

## Example

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
- Stories must be small enough to be a single E3 requirement task.