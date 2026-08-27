---
name: create-slides-positive
description: Routes a real create-slides request to the intended Skill.
tags: [routing, positive, create-slides]
max_turns: 10
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Skill]
---

Create a five-slide browser-based HTML deck from these source notes. HTML is an acceptable final deliverable.
