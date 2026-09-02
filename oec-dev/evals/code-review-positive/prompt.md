---
name: code-review-positive
description: Routes a real code-review request to the intended Skill.
tags: [routing, positive, code-review]
max_turns: 10
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Skill]
---

Review the current branch diff for material correctness and compatibility findings. Remain read-only.
