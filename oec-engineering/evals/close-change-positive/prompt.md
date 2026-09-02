---
name: close-change-positive
description: Routes a real close-change request to the intended Skill.
tags: [routing, positive, close-change]
max_turns: 10
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Skill]
---

Use /oec-engineering:close-change to verify and close the completed versioned task without deploying or updating E3.
