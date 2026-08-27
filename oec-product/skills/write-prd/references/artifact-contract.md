# PRD artifact contract

## Paths

```text
ai-docs/prd/prd-all.md
ai-docs/prd/prd-all-changelog.md
ai-docs/versions/vX.Y.Z/prd/prd-vX.Y.Z.md
ai-docs/versions/vX.Y.Z/prd/prd-vX.Y.Z-{featureName}.md
ai-docs/versions/vX.Y.Z/prd/HANDOFF.yaml
```

`prd-all.md` is the current product SSOT. A version increment describes only the version delta.
Child PRDs and HANDOFF are delivery views generated from that increment.

## Module contract

Start every module with `## 模块: {featureName} — {title}`. `featureName` is lower camel case and
is the stable key shared by the increment, child PRD, and HANDOFF.

Every module has these core sections:

1. `### 模块概述`: problem, user, value, scope, priority, and impact.
2. `### 用户故事`: unique `US-NNN` IDs, user action, value, and priority.
3. `### 验收标准`: observable Given/When/Then behavior for every story ID.
4. `### 待确认事项`: only unresolved decisions that materially affect behavior or scope.

Add a conditional section only when the condition is real:

- `### 使用场景`: a multi-step or cross-role journey exists.
- `### 交互流程`: the user sees or manipulates UI.
- `### 状态与生命周期`: a business object changes state.
- `### 跨模块影响`: another product module changes or depends on the result.
- `### 非功能要求`: a user-visible security, availability, performance, or external dependency exists.
- `### 数据变化`: a user action creates, changes, retains, or exposes a business record.
- `### 补充发现`: source material contains useful facts outside the normal sections.

Do not add an empty section or fill it with “无”.

## Finalize and split

Merge the confirmed version delta into `prd-all.md`; the version wins where it explicitly changes
behavior and the root remains unchanged where the increment is silent. Add one changelog entry that
states what changed, why, affected modules, and the confirmed decision owner.

Generate exactly one sibling child PRD for each `## 模块:` block. Copy content without inventing
new stories or rules. Generate HANDOFF schema v4 from those children. The sets of feature names,
child paths, and story IDs must agree exactly.

## Git boundary

Before commit, show the summary and exact paths and obtain PM confirmation. Stage only those files:

```bash
git add -- <explicit PRD and HANDOFF paths>
git commit -m "docs(prd): ..." -- <same explicit paths>
```

Never use `git add -A`, reset unrelated changes, or include code files in a PRD commit.
