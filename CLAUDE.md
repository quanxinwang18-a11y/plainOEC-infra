# plainOEC-infra 贡献约定

本仓库是 Claude Code Marketplace。运行期产品规则必须放在对应的 Agent、Skill
或 MCP 组件内；不要依赖仓库根 `CLAUDE.md` 向安装后的插件注入上下文。

- 使用 Claude Code 标准目录：Marketplace → Plugin → Agents / Skills / MCP。
- Skill 的 reference、asset、example 和 script 放在该 Skill 目录内。
- 不新增 legacy `commands/`，新用户入口使用 `skills/<name>/SKILL.md`。
- 不用提示词复刻 MCP 已确定性实现的认证、API、幂等或恢复逻辑。
- 每个提交保持单一目的并带对应验证；避免过度设计。
