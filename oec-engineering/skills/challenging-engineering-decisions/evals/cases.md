# Evaluation cases

## Positive cases

- “显式调用 `/oec-engineering:challenging-engineering-decisions`，先 grill 这个微服务拆分方案，不要写代码。”
- “Use `$challenging-engineering-decisions` to pressure-test this migration design and expose the decisions that still depend on assumptions.”
- “Explicitly use the challenging-engineering-decisions Skill to argue against this caching architecture before we plan it.”

## Negative cases

- “为这个已经明确的跨模块需求写实施计划。”应使用 `planning-engineering-changes`。
- “按照已接受的 ADR 实现这个改动。”属于普通实现，不重新挑战既定决策。
- “Review 当前分支是否可以合并。”应使用 `reviewing-code-changes`。
- “这个函数为什么返回空数组？”是代码解释或诊断，不是工程决策压力测试。
- “你觉得这个架构合理吗？”没有显式调用本 Skill，不应自动进入完整 grilling 流程。
