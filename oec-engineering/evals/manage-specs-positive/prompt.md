---
name: manage-specs-positive
description: Routes a real manage-specs request to the intended Skill.
tags: [routing, positive, manage-specs]
max_turns: 10
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Skill]
---

根据当前代码和测试证据，初始化团队工程 Specs，只记录可以验证的职责和不变量。
