---
description: 改需求——直接修改 prd-all.md 的小修订，不形成版本
argument-hint: "<description of the change>"
---

# /amend — Amend a Requirement

Make a small, targeted change to the root PRD without creating a new version. For typos, wording fixes, boundary clarifications.

## Invocation

```
/amend 3.5 章节有错别字，"会员立省 60%" 改成 "会员立省 30%"
/amend 会员权益卡片的提示文案从 A 改成 B
```

## Workflow

### Step 1: Confirm Scope

If the change adds a new feature/module, changes a business rule value (probability, price, limit), or modifies multiple modules → use `/build` instead. If it's truly a small fix, proceed.

### Step 2: Make the Change

Edit `ai-docs/prd/prd-all.md` directly. Minimal change.

### Step 3: Record the Change

Apply the changelog format from **prd-structure** skill (`references/changelog-format.md`): parse `git diff`, draft summary, get PM confirmation, append to `prd-all-changelog.md`.

### Step 4: Remind to Commit

```
✓ 已修改 prd-all.md 并追加 changelog

下一步:
  git add ai-docs/prd/prd-all.md ai-docs/prd/prd-all-changelog.md
  git commit -m "docs(prd): [decider] 修订 — [summary]"
```

## Notes

- Amend does NOT create a version. If the change needs a version, switch to `/build`.
- Changelog entry is required even for single-character fixes.
- Business rule value changes (probability 5%→3%) are 小版本 via `/build`, not `/amend`.