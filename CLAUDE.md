# plainOEC-infra 贡献约定

本仓库是 Claude Code Marketplace。运行期产品规则必须放在对应的 Agent、Skill
或 MCP 组件内；不要依赖仓库根 `CLAUDE.md` 向安装后的插件注入上下文。

- 使用 Claude Code 标准目录：Marketplace → Plugin → Agents / Skills / MCP。
- Skill 的 reference、asset、example 和 script 放在该 Skill 目录内。
- 不新增 legacy `commands/`，新用户入口使用 `skills/<name>/SKILL.md`。
- 不用提示词复刻 MCP 已确定性实现的认证、API、幂等或恢复逻辑。
- 每个提交保持单一目的并带对应验证；避免过度设计。

## 语言与用户入口

- Marketplace、Plugin description 和面向 OEC 用户的 README 使用中文。
- Skill/Agent frontmatter、正文、代码标识和 schema 使用英文。
- eval corpus 有意覆盖中文和英文真实请求，不为形式统一改成单一语言。
- 工具名、状态值、版本、文件路径和命令保持原始标识，不翻译或另造别名。
- 用户文档优先描述自然语言入口；只有真实 Skill/Command 才使用 `/plugin:name`，Agent 使用宿主原生
  派发或 `@` picker。
