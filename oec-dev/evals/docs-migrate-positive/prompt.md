---
name: docs-migrate-positive
description: Routes a real docs-migrate request to the intended Skill.
tags: [routing, positive, docs-migrate]
max_turns: 10
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Skill]
---

Migrate the verified engineering facts from this legacy ai-docs tree into the current structure, but preserve every original file and do not clean up managed configuration.
