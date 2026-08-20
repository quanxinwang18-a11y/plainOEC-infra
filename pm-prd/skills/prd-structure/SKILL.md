---
description: 增量 PRD 的 11 章结构和多模块组织方式，含产品语言规范、用户故事格式、变更日志格式和目录模型。Use when writing a version increment PRD, generating prd-v{x.y.z}.md, organizing multi-module PRDs, or splitting into sub-PRDs.
---

Write version increment PRDs to `versions/v{x.y.z}/prd/prd-v{x.y.z}.md`. One file per version, even with multiple modules. Split later slices by `## 模块:` — the increment must be complete (split does not refine).

Version types: 大版本 (major direction/GA), 中版本 (new feature/module), 小版本 (minor revision). All are "做需求". "改需求" creates no version.

## Structure

### Version-level

```
# PRD v{x.y.z} 增量

## 本版本目标
[One paragraph: what problem, for whom, core value]

## 本版本范围
新增: [...]  修改: [...]  不改动: [...]

## 本版本验收（业务级）
[Version-level. Module-level GWT goes inside each module.]

## 不做什么
[Explicitly excluded scope]

## 待 PM 确认（版本级）
[Cross-module pending items]
```

### Per-module (11 sections)

Each `## 模块: {name}（featureName: {lowerCamelCase}）`:

```
### 1. 模块概述         | 定位/用户/价值/优先级(P0-P3)/工作量/影响模块
### 2. 用户故事         | As a [role], I want [action], so that [value]
### 3. 使用场景         | Pre-condition / Steps / Expected / Error path
### 4. 交互流程         | 4.1 页面结构 / 4.2 Mermaid flowchart / 4.3 ASCII wireframe / 4.4 表单约束
### 5. 验收标准(GWT)    | Each US: normal + ≥1 error + ≥1 edge case
### 6. 状态与生命周期    | Mermaid stateDiagram (only if stateful objects exist)
### 7. 跨模块关联       | Table: 关联模块/关联方式/用户感知. Must fill — hard gate: write "无" if none
### 8. 非功能性需求      | 异常/安全/外部依赖/性能感知(用户视角)
### 9. 数据变更          | Table: 用户行为/系统记录/用户感知
### 10. 补充发现         | From original PRD / gaps found / cross-module
### 11. 待人工确认项     | Table: 事项/默认假设/影响范围/决策方. Hard gate: all four columns required
```

See `templates/increment-prd.md` for the full template, `examples/daily-draw.md` for a worked example.

## Rules

- No invention: input doesn't mention → mark [待确认] + default assumption. Don't fabricate.
- No half-finished: chapters with TODO/待补充 cannot be reported complete.
- Split is slice-only: increment must be complete. Split adds nothing.

## Product Language

PRDs describe what the user sees and does, never how the system is implemented. Technical details belong in `oec-detail-design`.

Forbidden: API/REST/GraphQL/HTTP/JSON | VARCHAR/INT/主键/外键/索引 | localStorage/Redis/MySQL | `<Xxx/>`/el-/Vue./React. | `color:#`/px/font-size/z-index | 幂等/事务/消息队列/Kafka | P95/QPS/并发数 | 微服务/网关/部署/Docker | hash/JWT/OAuth

Rewrite: "接口返回 200"→"用户看到中奖弹窗" | "幂等键防重复"→"用户重复点击不会被扣两次" | "P95<500ms"→"点击到反馈<1秒"

Full list: `references/forbidden-terms.md`.

## User Story & GWT Format

See `references/user-story-gwt.md` for the full format specification. Quick reference:

- Story: `As a [role], I want [action], so that [value]`. Priority: P0(core)/P1(important)/P2(nice-to-have)/P3(future).
- GWT: Each US needs ≥3 scenarios — normal + error + edge case. Given/When/Then must be observable and testable.
- Cross-module: `| 关联模块 | 关联方式 | 用户感知 |`. Must fill (write "无" if none).
- Pending items: `| 序号 | 事项 | 默认假设 | 影响范围 | 决策方 |`. All four columns required.

## Changelog Format

See `references/changelog-format.md` for the full specification. Quick reference:

```
## {YYYY-MM-DD HH:MM:SS} — {修订/修正/补充} (decider: {name})
**摘要**: {1-3 sentences — what changed and why}
**涉及子段**: {module} → {subsection} ({modified/added/removed})
```

Parse `git diff HEAD -- ai-docs/prd/prd-all.md`. Draft summary. Get PM confirmation. Append at top.