---
name: web-develop-positive
description: Routes an explicit long-running Web application change to the experimental beta Skill.
tags: [routing, positive, web-develop]
max_turns: 10
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Skill]
---

使用 /oec-dev-beta:web-develop 继续现有的
change:2026-08-27-project-editor 任务。它是跨 UI、API 和持久状态的 Web 功能，请用持续实现和
Playwright 运行态验收完成，不要提交或关闭任务。
