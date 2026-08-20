---
description: 改需求——直接修改 prd-all.md 的小修订，不形成版本
argument-hint: "<description of the change>"
---

# /oec-amend — Amend a Requirement

Make a small, targeted change to the root PRD without creating a new version. For typos, wording fixes, boundary clarifications.

## Invocation

```
/oec-amend 3.5 章节有错别字，"会员立省 60%" 改成 "会员立省 30%"
/oec-amend 会员权益卡片的提示文案从 A 改成 B
```

## Workflow

### Step 1: Confirm Scope

This is for small changes to `prd-all.md` only. If the change would:
- Add a new feature or module → use `/oec-build`
- Change a business rule value (probability, price, limit) → use `/oec-build` as a 小版本
- Modify multiple modules → suggest `/oec-build`

If it's truly a small fix (typo, wording, clarification), proceed.

### Step 2: Make the Change

Edit `ai-docs/prd/prd-all.md` directly. Make the minimal change.

### Step 3: Record the Change

Apply the **oec-prd-changelog** skill:
- Parse `git diff HEAD -- ai-docs/prd/prd-all.md`
- Draft a 1-3 sentence summary in product language
- Show PM the summary for confirmation
- Append to `prd-all-changelog.md`

### Step 4: Remind to Commit

```
✓ 已修改 prd-all.md 并追加 changelog

下一步:
  git add ai-docs/prd/prd-all.md ai-docs/prd/prd-all-changelog.md
  git commit -m "docs(prd): [decider] 修订 — [summary]"
```

## Notes

- Amend does NOT create a version. If the change needs a version, switch to `/oec-build`.
- Changelog entry is required even for single-character fixes — every change to `prd-all.md` is traceable.
- If PM wants to change a business rule value (probability 5%→3%), that's a 小版本 via `/oec-build`, not an amend.