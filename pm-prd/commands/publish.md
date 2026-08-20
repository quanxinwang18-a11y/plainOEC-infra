---
description: 发布需求——把已拆好的子 PRD 发布到 E3 系统需求
argument-hint: "[version]"
---

# /publish — Publish Requirements to E3

Publish already-split sub-PRDs to the E3 system. Does not re-split or re-review — only reads existing sub-PRDs and HANDOFF.yaml.

## Invocation

```
/publish
/publish v0.3.0
```

## Workflow

### Step 1: Detect Version

If PM specifies a version, use it. Otherwise scan `ai-docs/versions/` for the latest.

### Step 2: Pre-Publish Gate

Run `scripts/product-flow-gate.mjs --workspace . --version v{x.y.z} --stage pre-publish`. Errors: fix before continuing. Warnings: show PM.

### Step 3: Check UI Design Links

Check `ai-docs/versions/v{x.y.z}/ui/ui-v{x.y.z}-design-links.md`. If missing, remind PM once but don't block.

### Step 4: Read HANDOFF.yaml and Sub-PRDs

Read the HANDOFF.yaml for the target version. Read each referenced sub-PRD.

### Step 5: Publish to E3

One sub-PRD = one E3 system requirement. Each story = one requirement task.

### Step 6: Persist Mapping

Write to `ai-docs/integrations/e3/v{x.y.z}.yaml`. Each sub-PRD → `requirements[]` with E3 ID. Each story → `story_tasks[]` with E3 task ID.

### Step 7: Post-Publish Gate

Run `scripts/product-flow-gate.mjs --workspace . --version v{x.y.z} --stage post-publish`. Errors: mapping incomplete, warn PM.

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

- Publishing does NOT re-split or re-review. Reads existing sub-PRDs as-is.
- E3 granularity: one sub-PRD = one system requirement.
- Don't ask PM for spaceId, OAuth, or API config — handled by E3 integration layer.