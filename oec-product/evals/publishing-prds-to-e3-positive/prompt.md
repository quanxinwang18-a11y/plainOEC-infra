---
name: publishing-prds-to-e3-positive
description: Routes a real publishing-prds-to-e3 request to the intended Skill.
tags: [routing, positive, publishing-prds-to-e3]
max_turns: 10
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Skill]
---

Use /oec-product:publishing-prds-to-e3 to publish the already finalized v2.1.0 PRD with completed child PRDs and HANDOFF.
