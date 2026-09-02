---
name: change-implement-positive
description: Routes an existing ready engineering task to the lightweight Main Session development Skill.
tags: [routing, positive, change-implement]
max_turns: 10
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Bash, Edit, Write, Skill]
---

Implement the existing task `versioned:v1.2.3/payment-retry` from its ready `spec.md` and `design.md` in the Main Session. Run the relevant tests and report current verification evidence; do not create a new task package or commit.
