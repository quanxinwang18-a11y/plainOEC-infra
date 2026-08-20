---
description: 做需求——从想法到版本增量 PRD、评审修订、收口到根 SSOT、拆分子 PRD
argument-hint: "<feature idea or detailed brief>"
---

# /build — Build a Requirement

Create a version increment PRD from any input — a vague idea, a detailed business brief, or an existing PRD for a legacy system.

## Invocation

```
/build 下个版本给会员加幸运扭蛋抽奖
/build 业务方给了一份会员订阅详细稿，帮我整理成 PRD
/build 这套系统已经上线了，我手上有一份完整 PRD，帮我建成基线
```

## Workflow

### Step 1: Understand the Input

Accept input in any form. Determine version type: 大版本 (major direction), 中版本 (new feature/module), 小版本 (minor revision). Suggest to PM, let PM confirm.

### Step 2: Clarify (for vague ideas)

Ask conversationally: Who is this for? What's the current workaround? What's the minimum viable version? How do we measure success? What's explicitly out of scope? Why now? If input is a detailed brief, only ask about gaps.

### Step 3: Generate the Increment PRD

Apply the **prd-structure** skill. Write to `versions/v{x.y.z}/prd/prd-v{x.y.z}.md`. One file per version, even with multiple modules. Each module in 11-section structure. Product language throughout.

### Step 4: Review

Apply the **prd-review** skill. Find load-bearing assumptions, steelman then attack. Rate A/B/C/D. D→return to Step 3, C→get PM decisions, B→revise directly, A→proceed.

### Step 5: Revise

Edit `prd-v{x.y.z}.md` directly. No separate review copy. Address every kill-assumption. For items needing PM decision, ask now.

### Step 6: Finalize

Merge into `prd-all.md`: sub-section level merge. Append to `prd-all-changelog.md`. Run `scripts/product-flow-gate.mjs --stage finalize`. For legacy baseline (`prd-all.md` doesn't exist): initialize from increment PRD.

### Step 7: Split

One `## 模块:` = one sub-PRD `prd-v{x.y.z}-{featureName}.md`. Generate `HANDOFF.yaml`. Split is slice-only — no new content. Run `scripts/product-flow-gate.mjs --stage pre-publish`.

### Step 8: Offer Next Steps

```
PRD 已完成。

本版本主题：[theme]
版本建议：[大/中/小版本]
当前 PRD 已收口
子 PRD 已准备（[N] 个：[featureName list]）

要现在发布到 E3 吗？
- 是 → 我现在去发布
- 否 → 需要时说一句"发布需求"就行
```

## Notes

- If PM has an existing sub-PRD, merge it directly into `prd-all.md`. If `prd-all.md` doesn't exist, initialize from the sub-PRD.
- To adjust sub-PRD granularity after split: edit `## 模块:` in increment PRD, delete old sub-PRDs, re-run split.
- Commit PRD files only after PM confirmation.
- Version directory must be flat — no subdirectories, no process artifacts.