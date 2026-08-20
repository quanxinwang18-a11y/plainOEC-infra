# Changelog

## 2.0.0

- 将旧 `pm-prd` 重构为一个 Claude Code 原生 `oec-product` 插件。
- 新增显式 `oec-pm` Agent，以及写作、只读评审和手动 E3 发布三个 Skills。
- 新增 Node.js E3 MCP Server，包含 roots 限制、OAuth PKCE、不可变发布计划、幂等查询、
  原子 mapping 和 partial resume。
- 删除旧 Skill 文件索引、插件公共资源层，以及基于正则模拟 YAML parser 的 gate。
