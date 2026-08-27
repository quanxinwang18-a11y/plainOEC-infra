---
name: migrate-legacy-ai-docs-positive
description: Routes a real migrate-legacy-ai-docs request to the intended Skill.
tags: [routing, positive, migrate-legacy-ai-docs]
max_turns: 10
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Skill]
---

Use /oec-engineering:migrate-legacy-ai-docs to migrate verified facts from the existing legacy ai-docs without deleting the originals.
