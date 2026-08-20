---
description: OEC 增量 PRD 的 11 章结构和多模块组织方式。Use when writing a version increment PRD, generating prd-v{x.y.z}.md, organizing multi-module PRDs, or splitting into sub-PRDs.
---

# OEC PRD Structure

Write version increment PRDs to `versions/v{x.y.z}/prd/prd-v{x.y.z}.md`. One file per version, even with multiple modules. Split later slices by `## 模块:` — so the increment must be complete (split does not refine).

Version types: 大版本 (major direction/GA), 中版本 (new feature/module), 小版本 (minor revision). All are "做需求". "改需求" creates no version.

## Structure

### Version-level

```markdown
# PRD v{x.y.z} 增量

## 本版本目标
[One paragraph: what problem, for whom, core value]

## 本版本范围
新增: [...]  修改: [...]  不改动: [...]

## 本版本验收（业务级）
[Version-level acceptance. Module-level GWT goes inside each module.]

## 不做什么
[Explicitly excluded scope]

## 待 PM 确认（版本级）
[Cross-module pending items]
```

### Per-module (11 sections)

Each `## 模块: {name}（featureName: {lowerCamelCase}）`:

```
### 1. 模块概述         | 定位/用户/价值/优先级(P0-P3)/工作量/影响模块 |
### 2. 用户故事         | As a [role], I want [action], so that [value] |
### 3. 使用场景         | Pre-condition / Steps / Expected / Error path |
### 4. 交互流程         | 4.1 页面结构 / 4.2 Mermaid flowchart / 4.3 ASCII wireframe / 4.4 表单约束 |
### 5. 验收标准(GWT)    | Each US: normal + ≥1 error + ≥1 edge case |
### 6. 状态与生命周期    | Mermaid stateDiagram (only if stateful objects exist) |
### 7. 跨模块关联       | Table: 关联模块/关联方式/用户感知. Must fill — hard gate: write "无" if none |
### 8. 非功能性需求      | 异常/安全/外部依赖/性能感知(用户视角) |
### 9. 数据变更          | Table: 用户行为/系统记录/用户感知 |
### 10. 补充发现         | From original PRD / gaps found / cross-module |
### 11. 待人工确认项     | Table: 事项/默认假设/影响范围/决策方. Hard gate: all four columns required |
```

See `templates/increment-prd.md` for the full template, `examples/daily-draw.md` for a worked example.

## Rules

- No invention: input doesn't mention → mark [待确认] + default assumption. Don't fabricate.
- No tech leakage: product language only. See `oec-pm-language` skill.
- No half-finished: chapters with TODO/待补充 cannot be reported complete.
- Split is slice-only: increment must be complete. Split adds nothing.