---
name: failure-debug-positive
description: Routes a real failure-debug request to the intended Skill.
tags: [routing, positive, failure-debug]
max_turns: 10
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Skill]
---

This CI failure is intermittent and three attempted fixes have not worked. Diagnose the root cause from a repeatable signal.
