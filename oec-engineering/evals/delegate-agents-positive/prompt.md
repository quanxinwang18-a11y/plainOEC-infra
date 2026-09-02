---
name: delegate-agents-positive
description: Routes an explicit one-pass engineering Agent sequence to the intended Skill.
tags: [routing, positive, delegate-agents]
max_turns: 10
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Skill]
---

使用 /oec-engineering:delegate-agents change:2026-08-26-cache-race sequence，先研究“共享状态下是否存在跨实例竞态”，再严格串行实现和独立检查。
