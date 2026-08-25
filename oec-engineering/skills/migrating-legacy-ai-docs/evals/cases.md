# Evaluation cases

## Positive cases

- “Use the legacy migration Skill to audit this repository's old `ai-docs` and migrate verified architecture facts.”
- “显式执行旧 ai-docs 迁移，把仍然有效的工程事实和 ADR 转到新结构。”
- “运行 `/oec-engineering:migrating-legacy-ai-docs`，先给我逐文件迁移计划，不要删除旧文件。”

## Negative cases

- “初始化这个新仓库的团队 Specs。”应使用 `managing-team-specs`。
- “更新支付模块当前的不变量。”应使用 `managing-team-specs`。
- “采用旧 E3 PRD mapping。”应使用显式 Product 发布能力和 E3 MCP。
- “删除 `.oec-ai`、旧 Skills 和 Agents。”属于单独的显式清理操作。
- “把这个旧 PRD 改成新版本。”应使用 Product PRD 写作能力。
