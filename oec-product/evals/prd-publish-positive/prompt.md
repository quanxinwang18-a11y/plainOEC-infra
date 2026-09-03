---
name: prd-publish-positive
description: Routes a real prd-publish request to the intended Skill.
tags: [routing, positive, prd-publish]
max_turns: 10
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Skill]
---

Use /oec-product:prd-publish to publish the already finalized v2.1.0 PRD with completed child PRDs and HANDOFF.
