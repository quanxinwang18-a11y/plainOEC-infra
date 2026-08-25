---
name: reviewing-code-changes-positive
description: Routes a real reviewing-code-changes request to the intended Skill.
tags: [routing, positive, reviewing-code-changes]
max_turns: 10
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Skill]
---

Review the current branch diff for material correctness and compatibility findings. Remain read-only.
