---
name: prd-publish-negative
description: Keeps a near-neighbor request out of prd-publish.
tags: [routing, negative, prd-publish]
max_turns: 10
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Skill]
---

先补完并拆分这个尚未 finalized 的 PRD，然后考虑发布。
