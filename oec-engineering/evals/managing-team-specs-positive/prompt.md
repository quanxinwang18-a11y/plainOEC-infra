---
name: managing-team-specs-positive
description: Routes a real managing-team-specs request to the intended Skill.
tags: [routing, positive, managing-team-specs]
max_turns: 10
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Skill]
---

根据当前代码和测试证据，初始化团队工程 Specs，只记录可以验证的职责和不变量。
