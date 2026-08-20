---
description: PRD 对抗式评审——steelman 后攻击，找出 load-bearing assumptions 并给出验证方法。Use when reviewing a PRD, assessing quality before finalize, or stress-testing requirements.
---

Find the load-bearing assumptions that would make this PRD fail. Steelman each claim, then attack honestly. Return — for each — the evidence to get, the kill criterion, and the cheapest test. Five real kill-assumptions with tests beat twenty generic concerns.

A PRD review is not a checklist. It doesn't ask "does section 3 exist." It asks: "if this claim is wrong, does the product still work?"

## Method

1. Extract every claim. Separate **load-bearing** (if false, product fails) from cosmetic. Only load-bearing claims matter.
2. Steelman, then attack. State the strongest version of why it might be true, then attack *that*. "Fails if users don't actually check in daily" beats "execution risk."
3. Rank by impact × likelihood. Most dangerous: plausible, high-impact, no evidence.
4. Self-refute. If a claim is well-reasoned, say so. Don't fabricate doubt.
5. For each kill-assumption: **Claim** / **Fails if** / **Evidence to get** / **Kill criterion** / **Cheapest test**.

## Output

```
## PRD Review: v{x.y.z} — [theme]

### Top Kill-Assumptions (ranked, 3-5 max)

**Claim:** [load-bearing assertion]
**Fails if:** [concrete, falsifiable condition]
**Evidence to get:** [specific data or conversation]
**Kill criterion:** [threshold to stop/change course]
**Cheapest test:** [smallest experiment this week]

### What's Well-Reasoned
[What holds up — and why. Don't manufacture doubt.]

### What I Couldn't Assess
[Gaps without enough info to judge.]

### Product Language Issues
[Forbidden terms found. See prd-structure skill for the product language rules.]

### Health Rating
**Grade**: A(85-100)/B(70-84)/C(50-69)/D(<50)
**Decision**: ready to finalize / needs revision / return to generate
```

## Example

**Claim:** 会员会为了免费抽奖每天打开 App
**Fails if:** 当前日活 >80%，免费抽奖无法带来增量；或抽奖吸引力不足以改变行为
**Evidence to get:** 查看日活数据，访谈 5 个会员
**Kill criterion:** 日活 >80% 或 3/5 会员表示"不会改变使用频率"
**Cheapest test:** 在会员群发消息"明天上线每日免费抽奖"，观察期待反馈

## Notes

- No strawmanning. No generic risks. No fabrication.
- Don't check if sections exist — check if claims hold up.