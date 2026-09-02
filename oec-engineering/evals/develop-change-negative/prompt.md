---
name: develop-change-negative
description: Keeps an ordinary small fix out of the task-bound development Skill.
tags: [routing, negative, develop-change]
max_turns: 10
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Bash, Edit, Write, Skill]
---

Fix this small null check in the current file and run the one relevant unit test. There is no task Spec or Design to follow.
