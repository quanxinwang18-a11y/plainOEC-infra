---
name: code-finish-positive
description: Routes a real code-finish request to the intended Skill.
tags: [routing, positive, code-finish]
max_turns: 10
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Skill]
---

The versioned task is implemented. Verify its latest evidence and close the change without deploying or updating E3; ask before committing.
