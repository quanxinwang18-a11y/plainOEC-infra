---
name: publish-prd-to-e3-negative
description: Keeps a near-neighbor request out of publish-prd-to-e3.
tags: [routing, negative, publish-prd-to-e3]
max_turns: 10
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Skill]
---

先补完并拆分这个尚未 finalized 的 PRD，然后考虑发布。
