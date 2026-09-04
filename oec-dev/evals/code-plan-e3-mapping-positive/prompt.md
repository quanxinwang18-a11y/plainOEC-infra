---
name: code-plan-e3-mapping-positive
description: Routes an explicit E3 requirement mapping request to planning and a safe evidence-based outcome.
tags: [routing, outcome, positive, code-plan, e3]
max_turns: 12
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Bash, Skill]
---

我有一个明确的 E3 requirement/Story（product space `space-202330`，requirement `900101`）。请先只读查看需求详情，再根据当前 Dev Root 的 `CLAUDE.md`、相关 `ai-docs/Spec/` 和代码路径判断 backend 是否 `required`，并说明一个我明确授权的 frontend Root 是否 `possibly-related`。请列出 concrete evidence、matched Specs/paths、assumptions、`not-indicated` 或 `unknown`，让我确认仓库集合后再为每个仓库单独规划；不要扫描其他目录、不要创建 E3 对象、不要写任何仓库。

Expected outcome: use the planning gate, preserve the E3 identity as source evidence rather than a local taskRef, use the read-only E3 detail tool, and stop at the repository-set confirmation boundary.
