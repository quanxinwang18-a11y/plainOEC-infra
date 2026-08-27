---
name: publish-prd-to-e3-positive
description: Routes a real publish-prd-to-e3 request to the intended Skill.
tags: [routing, positive, publish-prd-to-e3]
max_turns: 10
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Skill]
---

Use /oec-product:publish-prd-to-e3 to publish the already finalized v2.1.0 PRD with completed child PRDs and HANDOFF.
