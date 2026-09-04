---
name: prd-publish-positive
description: Routes a real prd-publish request to the intended Skill.
tags: [routing, positive, prd-publish]
max_turns: 10
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Skill]
---

Publish the already finalized v2.1.0 PRD to E3. It has completed child PRDs and HANDOFF; first show me the plan and wait for my confirmation before any remote write.
