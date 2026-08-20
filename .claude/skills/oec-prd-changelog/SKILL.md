---
description: OEC PRD 变更日志格式——记录 prd-all.md 的每次修改。Use when updating prd-all-changelog.md, recording PRD amendments, or documenting changes to the root PRD.
---

# OEC PRD Changelog

## Purpose

Every change to `ai-docs/prd/prd-all.md` must leave a traceable record. This skill defines the format for changelog entries — whether the change comes from a version finalize or a small amendment.

## Context

OEC has two changelog scenarios:
- **Version finalize**: `oec-prd-finalize` writes its own changelog entry with version number, decision maker, and module-level summary.
- **Small amendment**: PM directly edits `prd-all.md` (typo, wording, clarification). This skill handles that case — parse git diff, draft a summary, get PM confirmation, append.

## Entry Format

```markdown
## {YYYY-MM-DD HH:MM:SS} — {修订 / 修正 / 补充} (decider: {name})

**摘要**: {1-3 sentences in product language describing what changed and why}

**涉及子段**:
- {module} → {subsection} ({modified / added / removed})

---
```

Latest entry goes at the top (newest first).

## Instructions

1. **Read the diff**: `git diff HEAD -- ai-docs/prd/prd-all.md`. If no changes, exit.

2. **Parse the diff**: For each hunk, find the nearest `###` heading. Group by module and subsection. Record change type: modified / added / removed.

3. **Draft the summary**: 1-3 sentences. Lead with what changed, not how. Use product language, not git terminology. "修订 §6 FR-013.5 扭蛋资格的续订宽限期（7天→14天）" beats "modified markdown list item in section 6."

4. **Get PM confirmation**: Show the draft summary and affected subsections. Let PM confirm, edit, or cancel. If `--decider` and `--summary` are both provided, skip confirmation.

5. **Append to changelog**: Write the entry to `ai-docs/prd/prd-all-changelog.md` at the top.

6. **Remind to commit**: The changelog entry includes a commit hash placeholder. Remind PM to stage and commit both `prd-all.md` and `prd-all-changelog.md`.

## Example

```markdown
## 2026-06-15 14:30:00 — 修订 (decider: 张三)

**摘要**: 修订 §6 FR-013.5 扭蛋资格的续订宽限期描述（7天→14天），并补充 §8.1.1 的网络异常处理说明。

**涉及子段**:
- 会员 → FR-013.5 扭蛋资格与频次 (modified)
- 会员 → 8.1.1 网络异常处理 (added)

---
```

## Notes

- This skill does NOT handle version finalize changelog entries — `oec-prd-finalize` writes its own.
- The commit hash is a placeholder; PM can fill it in after commit.
- Multiple amendments create multiple entries — no deduplication. Each change is traceable.
- If changelog doesn't exist yet, create it with a header before appending.