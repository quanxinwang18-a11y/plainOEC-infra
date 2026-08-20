---
description: PRD 全生命周期管理。Use when user mentions PRD, 需求, 版本, E3, or says "做个需求", "改需求", "发布需求", "上 E3", "评一下".
---

| PM says | Workflow |
|---------|----------|
| "做个 X", "老板要 Y", "业务方给了稿子", "下个版本加" | Build |
| "改个错别字", "文案 A 改成 B" | Amend |
| "发布需求", "上 E3", "提交需求" | Publish |
| "评一下", "这份能提交吗" | Review only |

If unclear, ask in product language. Don't expose workflow names.

## Build

### 1. Understand input
Accept any form: one-liner, detailed brief, existing PRD for legacy baseline. Determine version type (大版本/中版本/小版本), suggest, let PM confirm.

### 2. Clarify
For vague ideas, ask: who/what's the current workaround/minimum viable version/success metrics/explicitly out of scope. For detailed briefs, only ask about gaps.

### 3. Generate
Write `versions/v{x.y.z}/prd/prd-v{x.y.z}.md`. One file per version, multiple modules in one file. Use the 11-section structure below. Product language throughout — no API/DB/component names. No invention, no half-finished work.

### 4. Review
Apply the **prd-review** skill: extract load-bearing claims, steelman then attack, rate A/B/C/D. D→return to 3, C→get PM decisions, B→revise directly, A→proceed.

### 5. Revise
Edit `prd-v{x.y.z}.md` directly. No separate copy. Address every kill-assumption.

### 6. Finalize
Merge into `prd-all.md` (increment wins on conflict, keep base where silent, insert new). Append to changelog. Run `scripts/product-flow-gate.mjs --stage finalize`. For legacy baseline, initialize from increment.

### 7. Split
One `## 模块:` = one `prd-v{x.y.z}-{featureName}.md` + `HANDOFF.yaml`. Split is slice-only. Run `scripts/product-flow-gate.mjs --stage pre-publish`.

### 8. Ask
"PRD 已完成。要现在发布到 E3 吗？"

If PM has an existing sub-PRD, merge directly into `prd-all.md`. To adjust granularity after split: edit `## 模块:`, delete old sub-PRDs, re-run split. Commit only after PM confirmation.

## Amend

### 1. Confirm scope
If the change adds a feature/module or changes a business rule value → redirect to Build. Small fix → proceed.

### 2. Edit
Modify `prd-all.md` directly. Parse `git diff`, draft summary, get PM confirmation, append to changelog.

### 3. Remind to commit
Amend never creates a version. Changelog entry required even for single-character fixes.

## Publish

### 1. Detect version
PM-specified or latest in `ai-docs/versions/`.

### 2. Gate
Run `scripts/product-flow-gate.mjs --stage pre-publish`. Errors: fix. Warnings: show PM. Check UI design links, remind once if missing.

### 3. Publish
One sub-PRD = one E3 system requirement. Each story = one task. Write mapping to `ai-docs/integrations/e3/v{x.y.z}.yaml`. Run `scripts/product-flow-gate.mjs --stage post-publish`.

### 4. Report
"已发布需求。创建 [N] 条系统需求。E3 映射: ai-docs/integrations/e3/v{x.y.z}.yaml". Don't ask PM for spaceId/OAuth/API config.

## Review Only

Apply the **prd-review** skill. Output finding in session. Don't modify files.

## Version Types

大版本 (major direction/GA) / 中版本 (new feature/module) / 小版本 (minor revision). All are Build. Amend creates no version.

## 11-Section Module Structure

1. 模块概述 — 定位/用户/价值/优先级(P0-P3)/工作量/影响模块
2. 用户故事 — `As a [role], I want [action], so that [value]`. Priority P0(core)/P1/P2/P3. Each story independently valuable.
3. 使用场景 — Pre-condition / Steps / Expected / Error path
4. 交互流程 — 4.1 页面结构 / 4.2 Mermaid flowchart / 4.3 ASCII wireframe / 4.4 表单约束
5. 验收标准(GWT) — Each US: normal + ≥1 error + ≥1 edge case. Observable, testable, no "系统 validates".
6. 状态与生命周期 — Mermaid stateDiagram (only if stateful objects exist)
7. 跨模块关联 — `| 关联模块 | 关联方式 | 用户感知 |`. Must fill ("无" if none). Hard gate.
8. 非功能性需求 — 异常/安全/外部依赖/性能感知(用户视角)
9. 数据变更 — `| 用户行为 | 系统记录 | 用户感知 |`
10. 补充发现 — From original PRD / gaps / cross-module
11. 待人工确认项 — `| 事项 | 默认假设 | 影响范围 | 决策方 |`. All four columns. Hard gate.

Pending items format: `| 序号 | 事项 | 默认假设 | 影响范围 | 决策方 |`. All four columns required.

Example US+GWT:

```
| US-001 | 作为会员，我希望每天免费抽奖一次，以便获得额外权益 | P0 |

**US-001 每日免费抽奖**
- Given 已登录且今日未抽奖，When 点击"免费抽奖"，Then 播放动画并展示中奖结果弹窗
- Given 网络中断，When 抽奖中，Then 提示"网络异常，请重试"，不消耗次数
- Given 今日已抽过奖，When 再次点击，Then 按钮置灰，提示"今日已抽奖，明天再来"
```

## Changelog Format

```
## {YYYY-MM-DD HH:MM:SS} — {修订/修正/补充} (decider: {name})
**摘要**: {1-3 sentences — what changed and why}
**涉及子段**: {module} → {subsection} ({modified/added/removed})
```

Parse `git diff`, draft summary, get PM confirmation, append at top. Version finalize writes its own entry.

## Product Language

Forbidden: API/REST/GraphQL/HTTP/JSON | VARCHAR/INT/主键/外键/索引 | localStorage/Redis/MySQL | `<Xxx/>`/el-/Vue./React. | `color:#`/px/font-size/z-index | 幂等/事务/消息队列/Kafka | P95/QPS/并发数 | 微服务/网关/部署/Docker | hash/JWT/OAuth

Rewrite: "接口返回 200"→"用户看到中奖弹窗" | "幂等键防重复"→"用户重复点击不会被扣两次" | "P95<500ms"→"点击到反馈<1秒"

## Sub-PRD

Slice from increment PRD by `## 模块:`. Chapters: 一、模块概述 (add 所属版本/主属增量/E3同步粒度) → 二、用户故事 → 三、使用场景 → 四、交互流程 → 五、验收标准 → 六、状态与生命周期 → 七、跨模块关联 → 八、非功能性需求 → 九、数据变更 → 十、补充发现 → 十一、待人工确认项. Split is slice-only — no new content.