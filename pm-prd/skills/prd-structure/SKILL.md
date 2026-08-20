---
description: PRD 全生命周期——PM 用自然语言表达目标，Claude 自动识别意图并执行。Use when user mentions PRD, 需求, 版本, E3, or says "做个需求", "改需求", "发布需求", "上 E3", "评一下".
---

You are the PM's entry point for PRD work. PM speaks in natural language. Identify intent, execute the matching workflow.

| PM says | Intent |
|---------|--------|
| "做个 X", "老板要 Y", "业务方给了稿子", "下个版本加" | Build |
| "改个错别字", "文案 A 改成 B" | Amend |
| "发布需求", "上 E3", "提交需求" | Publish |
| "评一下", "这份能提交吗" | Review only |

If unclear, ask in product language. Don't expose workflow names.

## Build

When PM wants to create a version PRD.

**1. Understand input.** Accept any form: one-liner, detailed brief, existing PRD for legacy baseline. Determine version type (大版本/中版本/小版本), suggest, let PM confirm.

**2. Clarify.** For vague ideas, ask: who/what's the current workaround/minimum viable version/success metrics/explicitly out of scope. For detailed briefs, only ask about gaps.

**3. Generate.** Write `versions/v{x.y.z}/prd/prd-v{x.y.z}.md`. One file per version, multiple modules in one file. 11-section structure per module (see `templates/increment-prd.md`). Product language throughout (see `references/forbidden-terms.md`). User stories in GWT format (see `references/user-story-gwt.md`). No invention, no half-finished work.

**4. Review.** Apply the **prd-review** skill: extract load-bearing claims, steelman then attack, rate A/B/C/D. D→return to Step 3, C→get PM decisions, B→revise directly, A→proceed.

**5. Revise.** Edit `prd-v{x.y.z}.md` directly. No separate copy. Address every kill-assumption.

**6. Finalize.** Merge into `prd-all.md` (increment wins on conflict, keep base where silent, insert new). Append to changelog (see `references/changelog-format.md`). Run `scripts/product-flow-gate.mjs --stage finalize`. For legacy baseline, initialize from increment.

**7. Split.** One `## 模块:` = one `prd-v{x.y.z}-{featureName}.md` + `HANDOFF.yaml`. Split is slice-only. Run `scripts/product-flow-gate.mjs --stage pre-publish`.

**8. Ask.** "PRD 已完成。要现在发布到 E3 吗？"

If PM has an existing sub-PRD, merge directly into `prd-all.md`. To adjust granularity after split: edit `## 模块:`, delete old sub-PRDs, re-run split. Commit only after PM confirmation.

## Amend

When PM wants a small fix to `prd-all.md` without a new version.

**1. Confirm scope.** If the change adds a feature/module or changes a business rule value → redirect to Build. Small fix → proceed.

**2. Edit.** Modify `prd-all.md` directly. Parse `git diff`, draft summary, get PM confirmation, append to changelog (see `references/changelog-format.md`).

**3. Remind to commit.** Amend never creates a version. Changelog entry required even for single-character fixes.

## Publish

When PM wants to publish sub-PRDs to E3. Reads existing sub-PRDs, does not re-split.

**1. Detect version.** PM-specified or latest in `ai-docs/versions/`.

**2. Gate.** Run `scripts/product-flow-gate.mjs --stage pre-publish`. Errors: fix. Warnings: show PM. Check UI design links, remind once if missing.

**3. Publish.** One sub-PRD = one E3 system requirement. Each story = one task. Write mapping to `ai-docs/integrations/e3/v{x.y.z}.yaml`. Run `scripts/product-flow-gate.mjs --stage post-publish`.

**4. Report.** "已发布需求。创建 [N] 条系统需求。E3 映射: ai-docs/integrations/e3/v{x.y.z}.yaml". Don't ask PM for spaceId/OAuth/API config.

## Review Only

When PM says "评一下". Apply the **prd-review** skill. Output finding in session. Don't modify files.

## Version Types

大版本 (major direction/GA) / 中版本 (new feature/module) / 小版本 (minor revision). All are Build. Amend creates no version.