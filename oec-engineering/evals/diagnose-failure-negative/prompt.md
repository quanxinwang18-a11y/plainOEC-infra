---
name: diagnose-failure-negative
description: Keeps a near-neighbor request out of diagnose-failure.
tags: [routing, negative, diagnose-failure]
max_turns: 10
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Skill]
---

编译报错是少了一个明确的 import，直接修复即可。
