# Changelog

## 2.1.0

- E3 prepare 和 execute 现在强制执行完整的 pre-publish artifact contract。
- 已映射版本绑定 artifact fingerprint 和产品空间，内容变化需要创建新的 PRD 版本。
- 发布和 status 验证远端 ID、标题与任务父子关系，并为任务持久化 E3 详情链接。
- POMP 和系统需求元数据仅在唯一候选或唯一默认值时自动选择，pending POMP 可恢复。
- Schema v1 mapping 支持只读诊断和经确认的 v2 adoption；远端漂移会阻断发布。

## 2.0.0

- 将旧 `pm-prd` 重构为一个 Claude Code 原生 `oec-product` 插件。
- 新增显式 `oec-pm` Agent，以及写作、只读评审和手动 E3 发布三个 Skills。
- 新增 Node.js E3 MCP Server，包含 roots 限制、OAuth PKCE、不可变发布计划、幂等查询、
  原子 mapping 和 partial resume。
- 删除旧 Skill 文件索引、插件公共资源层，以及基于正则模拟 YAML parser 的 gate。
