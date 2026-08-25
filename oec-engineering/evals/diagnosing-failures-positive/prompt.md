---
name: diagnosing-failures-positive
description: Routes a real diagnosing-failures request to the intended Skill.
tags: [routing, positive, diagnosing-failures]
max_turns: 10
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Skill]
---

This CI failure is intermittent and three attempted fixes have not worked. Diagnose the root cause from a repeatable signal.
