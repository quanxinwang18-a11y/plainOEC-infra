---
name: reviewing-prds-positive
description: Routes a real reviewing-prds request to the intended Skill.
tags: [routing, positive, reviewing-prds]
max_turns: 10
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Skill]
---

Review this product PRD as a red team. Challenge its strongest assumptions and decide whether it is ready, but do not edit it.
