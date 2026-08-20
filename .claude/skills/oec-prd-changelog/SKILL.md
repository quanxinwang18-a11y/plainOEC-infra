---
description: OEC PRD 变更日志格式——记录 prd-all.md 的每次修改。Use when updating prd-all-changelog.md, recording PRD amendments, or documenting changes to the root PRD.
---

# OEC PRD Changelog

Every change to `prd-all.md` must be traceable. Parse the git diff, draft a summary, get PM confirmation, append.

## Entry Format

```markdown
## {YYYY-MM-DD HH:MM:SS} — {修订/修正/补充} (decider: {name})

**摘要**: {1-3 sentences in product language — what changed and why}
**涉及子段**:
- {module} → {subsection} ({modified/added/removed})
---
```

Latest entry at the top. See `examples/changelog-entry.md` for a worked example.

## Method

1. `git diff HEAD -- ai-docs/prd/prd-all.md`. No changes → exit.
2. For each hunk, find nearest `###` heading. Group by module/section. Record change type.
3. Draft summary: 1-3 sentences. Lead with what changed, not how. "修订 §6 续订宽限期（7天→14天）" beats "modified markdown list item."
4. Show PM the summary. Confirm, edit, or cancel.
5. Append to `prd-all-changelog.md` at the top.
6. Remind PM to stage and commit both files.

## Notes

- Version finalize changelog entries are written by `oec-prd-finalize`, not this skill.
- Multiple amendments → multiple entries. No deduplication. Every change is traceable.
- Changelog doesn't exist yet → create it with a header, then append.