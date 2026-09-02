---
name: change-plan-positive
description: Routes a real change-plan request to the intended Skill.
tags: [routing, positive, change-plan]
max_turns: 10
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Skill]
---

基于 v1.2.3 的 Product HANDOFF 为这个跨模块缓存变更创建任务 Spec 和 Design，明确接口兼容、迁移、回滚和验证方式。
