---
name: closing-engineering-changes-positive
description: Routes a real closing-engineering-changes request to the intended Skill.
tags: [routing, positive, closing-engineering-changes]
max_turns: 10
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Skill]
---

Use /oec-engineering:closing-engineering-changes to verify and close the completed change without deploying it.
