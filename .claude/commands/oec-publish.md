---
description: 发布需求——把已拆好的子 PRD 发布到 E3 系统需求
argument-hint: "[version]"
---

# /oec-publish — Publish Requirements to E3

Publish already-split sub-PRDs to the E3 system as requirements and tasks. Does not re-split or re-review — only reads existing sub-PRDs and HANDOFF.yaml.

## Invocation

```
/oec-publish
/oec-publish v0.3.0
```

## Workflow

### Step 1: Detect Version

If PM specifies a version, use it. Otherwise scan `ai-docs/versions/` for the latest version.

### Step 2: Pre-Publish Gate

Run `{SKILL_DIR}/scripts/product-flow-gate.mjs --workspace . --version v{x.y.z} --stage pre-publish`:
- HANDOFF.yaml exists and is valid
- All `sub_prds[].file` paths are readable
- Each sub-PRD has at least 1 story

If errors: fix before continuing. If warnings: show PM, let PM decide.

### Step 3: Check UI Design Links

Check if `ai-docs/versions/v{x.y.z}/ui/ui-v{x.y.z}-design-links.md` exists and is non-empty. If missing, remind PM once but don't block.

### Step 4: Read HANDOFF.yaml and Sub-PRDs

Read the HANDOFF.yaml for the target version. Read each referenced sub-PRD.

### Step 5: Publish to E3

One sub-PRD = one E3 system requirement. Each story in the sub-PRD = one requirement task under that system requirement.

### Step 6: Persist Mapping

Write the mapping to `ai-docs/integrations/e3/v{x.y.z}.yaml`:
- Each sub-PRD → one `requirements[]` entry with E3 system requirement ID
- Each story → one `story_tasks[]` entry with E3 task ID

### Step 7: Post-Publish Gate

Run `{SKILL_DIR}/scripts/product-flow-gate.mjs --workspace . --version v{x.y.z} --stage post-publish`:
- E3 mapping file exists
- Each sub-PRD has an E3 system requirement ID
- Each story has a story_tasks mapping

If errors: mapping is incomplete, warn PM. Don't claim "已发布需求" until errors are resolved.

### Step 8: Report

```
已发布需求。

创建系统需求：[N] 条
- [featureName] → REQ-XXX
  - 需求任务：US-001 / US-002
- [featureName] → REQ-XXX
  - 需求任务：US-003 / US-004

E3 映射：ai-docs/integrations/e3/v{x.y.z}.yaml
```

## Notes

- Publishing does NOT re-split or re-review. It reads existing sub-PRDs as-is.
- E3 system requirement granularity must match sub-PRD granularity: one sub-PRD = one system requirement.
- Don't ask PM for spaceId, OAuth, or API configuration — these are handled by the E3 integration layer.
- If a sub-PRD has no stories, the pre-publish gate will catch it.