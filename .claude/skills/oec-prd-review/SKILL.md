---
description: OEC PRD 对抗式评审方法——steelman 后攻击，找出能让 PRD 失败的 load-bearing assumptions 并给出验证方法。Use when reviewing a PRD, assessing PRD quality before finalize, or stress-testing product requirements.
---

# OEC PRD Review — Steelman Then Attack

## Purpose

You are a sharp, fair adversary reviewing an OEC PRD. Find the load-bearing assumptions that would make this PRD fail, attack them honestly, and return — for each — the evidence to get, the kill criterion, and the cheapest test. A sharper decision beats a longer risk list.

## Context

A PRD review is not a checklist. It doesn't ask "does section 3 exist." It asks: "if this claim is wrong, does the product still work?" The goal is to find the 3-5 kill-assumptions before the PRD is finalized — when there's still time to fix them.

## Instructions

1. **Read the PRD thoroughly.** Understand the product, target users, core value proposition, and how modules interact.

2. **Extract every claim.** List what the PRD asserts as true — about the user, the pain point, the solution mechanism, the scope boundary, the cross-module dependency. Separate **load-bearing** claims (if false, the product fails) from cosmetic ones. Only load-bearing claims are worth attacking.

3. **Steelman, then attack.** For each load-bearing claim, first state the strongest version of why it might be true. Then attack *that* — not a strawman. An attack on a weak version of the claim is worthless. "Fails if users don't actually check in daily" beats "execution risk."

4. **Write each failure mode as "Fails if ___."** Be concrete and falsifiable. The condition must be specific enough that someone could test it this week.

5. **Rank by impact × likelihood.** Surface the top of the list. The most dangerous assumptions are the ones that are plausible, high-impact, and nobody has evidence for.

6. **Self-refute, don't fabricate.** If a claim is genuinely well-reasoned, say so plainly. Never invent a weakness the PRD doesn't have. A review that manufactures doubt is as useless as one that rubber-stamps.

7. **For each kill-assumption, give actionable next steps:**
   - **Claim:** the load-bearing assertion
   - **Fails if:** the precise condition that breaks the PRD
   - **Evidence to get:** the specific data, query, or conversation that would confirm or kill it
   - **Kill criterion:** the threshold at which you'd stop or change course
   - **Cheapest test:** the smallest experiment that moves the belief

8. **Rate overall health** on the OEC scale:
   - **A** (85-100): No kill-assumptions found. Ready to finalize.
   - **B** (70-84): Minor concerns. Can proceed after addressing.
   - **C** (50-69): Significant gaps. Needs PM decision before proceeding.
   - **D** (<50): Structural issues. Return to ideate/generate.

## Output Structure

```
## PRD Review: v{x.y.z} — [version theme]

### Top Kill-Assumptions (ranked)
For each (3–5 max):

**Claim:** [the load-bearing assertion]
**Fails if:** [concrete, falsifiable condition]
**Evidence to get:** [specific data, conversation, or analysis]
**Kill criterion:** [threshold — what would make you stop]
**Cheapest test:** [smallest experiment to run this week]

### What's Well-Reasoned
[What holds up — and why. Don't manufacture doubt.]

### What I Couldn't Assess
[Gaps where the PRD didn't give enough to judge.]

### Product Language Issues
[Terms from the forbidden list that appeared in the PRD. See oec-pm-language skill.]

### Health Rating
**Grade**: [A/B/C/D] ([score])
**Decision**: [ready to finalize / needs revision / return to generate]
```

## Example

**Claim:** 会员会为了免费抽奖每天打开 App
**Fails if:** 当前会员的日活已经很高（>80%），免费抽奖无法带来增量；或者抽奖吸引力不足以改变行为
**Evidence to get:** 查看当前会员日活数据，访谈 5 个会员问"免费抽奖会让你更频繁打开 App 吗"
**Kill criterion:** 如果当前日活 > 80% 或 3/5 会员表示"不会改变使用频率"
**Cheapest test:** 在会员群发一条消息"明天上线每日免费抽奖"，观察点击率和期待反馈

## Notes

- No strawmanning — attack the steelman or don't attack.
- No generic risk lists — every item must be specific to *this* PRD.
- No fabrication — if it's sound, say so.
- Rank ruthlessly — the cheapest high-impact test is the whole point.
- Five real kill-assumptions with tests beat twenty generic concerns.
- Don't just check if sections exist — check if the claims within them hold up.