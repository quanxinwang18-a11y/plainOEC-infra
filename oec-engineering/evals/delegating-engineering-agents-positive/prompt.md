---
name: delegating-engineering-agents-positive
description: Routes an explicit full engineering Agent delegation request to the intended Skill.
tags: [routing, positive, delegating-engineering-agents]
max_turns: 10
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Skill]
---

使用 /oec-engineering:delegating-engineering-agents 2026-08-26-cache-race full，先研究“共享状态下是否存在跨实例竞态”，再严格串行实现和独立检查。
