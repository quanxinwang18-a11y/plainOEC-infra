---
name: prd-write-positive
description: Routes a real prd-write request to the intended Skill.
tags: [routing, positive, prd-write]
max_turns: 10
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Skill]
---

根据这些已确认的业务事实写一份 v2.1.0 增量 PRD，并拆分 child PRD 与 HANDOFF。不要设计数据库或 API。
