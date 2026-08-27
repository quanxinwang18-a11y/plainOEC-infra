---
name: write-prd-negative
description: Keeps a near-neighbor request out of write-prd.
tags: [routing, negative, write-prd]
max_turns: 10
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Skill]
---

只读评审这份 PRD 是否已经可以提交，不要修改它。
