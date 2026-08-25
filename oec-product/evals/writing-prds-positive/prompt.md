---
name: writing-prds-positive
description: Routes a real writing-prds request to the intended Skill.
tags: [routing, positive, writing-prds]
max_turns: 10
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Skill]
---

根据这些已确认的业务事实写一份 v2.1.0 增量 PRD，并拆分 child PRD 与 HANDOFF。不要设计数据库或 API。
