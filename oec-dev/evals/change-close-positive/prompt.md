---
name: change-close-positive
description: Routes a real change-close request to the intended Skill.
tags: [routing, positive, change-close]
max_turns: 10
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Skill]
---

The versioned task is implemented. Verify its latest evidence and close the change without deploying or updating E3; ask before committing.
