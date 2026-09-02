---
name: close-change-positive
description: Routes a real close-change request to the intended Skill.
tags: [routing, positive, close-change]
max_turns: 10
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Skill]
---

The versioned task is implemented. Verify its latest evidence and close the change without deploying or updating E3; ask before committing.
