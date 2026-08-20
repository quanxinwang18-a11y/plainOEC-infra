# Changelog Format

Every change to `prd-all.md` must be traceable.

## Entry Format

```markdown
## {YYYY-MM-DD HH:MM:SS} — {修订/修正/补充} (decider: {name})

**摘要**: {1-3 sentences in product language — what changed and why}
**涉及子段**:
- {module} → {subsection} ({modified/added/removed})
---
```

Latest entry at the top.

## Method

1. `git diff HEAD -- ai-docs/prd/prd-all.md`. No changes → exit.
2. For each hunk, find nearest `###` heading. Group by module/section. Record change type.
3. Draft summary: 1-3 sentences. Lead with what changed, not how. "修订 §6 续订宽限期（7天→14天）" beats "modified markdown list item."
4. Show PM the summary. Confirm, edit, or cancel.
5. Append to `prd-all-changelog.md` at the top.
6. Remind PM to stage and commit both files.

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

- Version finalize changelog entries are written by the finalize step, not this format.
- Multiple amendments → multiple entries. No deduplication. Every change is traceable.
- Changelog doesn't exist yet → create it with a header, then append.