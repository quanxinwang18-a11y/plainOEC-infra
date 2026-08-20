# Changelog

## 2.2.0

- Marketplace 直接从 Git 仓库分发自足 runtime bundles，产品经理安装时不再需要 npm registry、
  `npm login`、`npm install` 或插件缓存中的 `node_modules`。
- 产品空间、POMP 选择和配置按 canonical MCP root 隔离；selection token 绑定 workspace、阶段和
  候选集合。
- Status 以 schema v2 mapping 记录的空间为历史发布归属，workspace 配置缺失或不同不会改写
  mapping。
- E3 execute 增加宿主级人类确认，PRD评审和 Git checkpoint 使用稳定 ID 与精确文件边界。
- Writing Skill 增加根 PRD和 changelog 模板，bundled checker 在发布前执行确定性产物门禁。

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
