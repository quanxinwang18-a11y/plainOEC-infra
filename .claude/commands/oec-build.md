---
description: 做需求——从想法到版本增量 PRD、评审修订、收口到根 SSOT、拆分子 PRD
argument-hint: "<feature idea or detailed brief>"
---

# /oec-build — Build a Requirement

Create a version increment PRD from any input — a vague idea, a detailed business brief, or an existing PRD for a legacy system.

## Invocation

```
/oec-build 下个版本给会员加幸运扭蛋抽奖
/oec-build 业务方给了一份会员订阅详细稿，帮我整理成 PRD
/oec-build 这套系统已经上线了，我手上有一份完整 PRD，帮我建成基线
```

## Workflow

### Step 1: Understand the Input

Accept input in any form:
- A one-liner idea ("给会员加幸运扭蛋")
- A detailed business brief (document, Slack thread, meeting notes)
- An existing complete PRD (for legacy system baseline)

Determine the version type: 大版本 (major direction), 中版本 (new feature/module), 小版本 (minor revision). Suggest to PM, let PM confirm.

### Step 2: Clarify (for vague ideas)

If the input is a one-liner, ask conversationally:

1. **Who** is this for? Specific role/scenario?
2. **What's the current workaround?** How painful is it?
3. **What's the minimum viable version?** What's the smallest thing we can ship?
4. **How do we measure success?** What metric moves if we nail this?
5. **What's explicitly out of scope?** What are we not doing?
6. **Is this more important now than a year ago?** Why now?

If the input is a detailed brief, extract what's available and only ask about gaps.

### Step 3: Generate the Increment PRD

Apply the **oec-prd-structure** skill. Write to `versions/v{x.y.z}/prd/prd-v{x.y.z}.md`.

- One file per version, even with multiple modules
- Each module in 11-section structure
- Product language throughout (see **oec-pm-language** skill)
- User stories in the format from **oec-user-story** skill

### Step 4: Review

Apply the **oec-prd-review** skill. Find the load-bearing assumptions, steelman then attack each one. Rate overall health A/B/C/D.

- D: structural issues → return to Step 3
- C: significant gaps → show PM, get decisions, then revise
- B: minor concerns → revise directly
- A: clean → proceed to Step 5

### Step 5: Revise

Edit `prd-v{x.y.z}.md` directly. No separate review copy. Address every kill-assumption. For items needing PM decision, ask now.

### Step 6: Finalize

Merge the increment PRD into the root `prd-all.md`:
- Sub-section level merge: base has it + increment changes it → increment wins; base has it + increment doesn't mention → keep base; increment adds new → insert
- Append to `prd-all-changelog.md` with version number, decision maker, and module summary
- Run `{SKILL_DIR}/scripts/product-flow-gate.mjs --stage finalize` to verify

For legacy system baseline (`prd-all.md` doesn't exist yet): use the increment PRD to initialize. Gate checks are soft for content, hard for structure.

### Step 7: Split

Split the increment PRD into sub-PRDs:
- One `## 模块:` = one sub-PRD `prd-v{x.y.z}-{featureName}.md`
- Feature name in lowerCamelCase from the module heading
- Generate `HANDOFF.yaml` with feature names, files, priorities, stories
- Split is slice-only — no new US/GWT/wireframes
- Run `{SKILL_DIR}/scripts/product-flow-gate.mjs --stage pre-publish` to verify

### Step 8: Offer Next Steps

After split completes:

```
PRD 已完成。

本版本主题：[version theme]
版本建议：[大/中/小版本]
当前 PRD 已收口
子 PRD 已准备（[N] 个：[featureName list]）

要现在把这些子 PRD 发布到 E3（创建系统需求和任务）吗？
- 是 → 我现在去发布
- 否 → 先放着，你想发布时说一句"发布需求"或"上 E3"就行
```

## Notes

- If PM has an existing sub-PRD (from split or external), merge it directly into `prd-all.md`. If `prd-all.md` doesn't exist, initialize it from the sub-PRD.
- If PM wants to adjust sub-PRD granularity after split: edit the `## 模块:` definitions in the increment PRD, delete old sub-PRDs, re-run split. Never merge/split sub-PRDs directly.
- Commit PRD files only after PM confirmation.
- Version directory must be flat — no subdirectories, no process artifacts.