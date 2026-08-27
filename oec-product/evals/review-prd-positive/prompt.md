---
name: review-prd-positive
description: Routes a real review-prd request to the intended Skill.
tags: [routing, positive, review-prd]
max_turns: 10
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Skill]
---

Review this product PRD as a red team. Challenge its strongest assumptions and decide whether it is ready, but do not edit it.
