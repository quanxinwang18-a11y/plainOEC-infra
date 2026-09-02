---
name: prd-write-negative
description: Keeps a near-neighbor request out of prd-write.
tags: [routing, negative, prd-write]
max_turns: 10
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Skill]
---

只读评审这份 PRD 是否已经可以提交，不要修改它。
