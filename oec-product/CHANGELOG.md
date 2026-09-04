# Changelog

## Next

## 3.0.4

- Allow `prd-publish` to be discovered from clear natural-language requests.
- Keep PRD publication behind prepare, displayed plan, Human confirmation, execute, and independent status
  verification; natural-language discovery does not authorize a remote write.

**BREAKING RC CHANGE:** rename the public Product Skills to `prd-write`, `prd-review`, and `prd-publish`; expose the product manager Agent as `prd-manager`.

## 3.0.3

**BREAKING RC CHANGE:** normalize public capability names before the first stable release.

- Rename `writing-prds` to `write-prd`, `reviewing-prds` to `review-prd`, and
  `publishing-prds-to-e3` to `publish-prd-to-e3`.
- Rename the `oec-pm` Agent to `product-manager` and update its preloaded Skills.
- Simplify the Marketplace and Plugin descriptions, correct picker/CLI examples, and replace
  cross-Plugin README links with stable repository URLs.

## 3.0.2

- Replace per-Skill prose-only case lists with native executable routing evals.
- Cover positive and adjacent negative discovery for all three Product Skills without changing the
  `oec-e3@~1.0.0` platform dependency.

## 3.0.1

- Add explicit negative discovery boundaries to all three PRD Skills.
- Clarify that E3 publication requires a finalized version, child PRDs, and HANDOFF artifacts.
- Add bilingual positive and negative cases for adjacent Product, Engineering, and E3 intents.

## 3.0.0

- Move the E3 MCP Server into the independent `oec-e3@1.x` platform Plugin.
- Declare `oec-e3@~1.0.0` as a native Plugin dependency while retaining the three PRD Skills and
  explicit PM Agent.
- Keep the product-owned artifact checker bundle; Product installation no longer owns E3 tokens,
  workspace selection, plans, or runtime state.
- Verify dependency installation without `node_modules` and complete real PRD publication through the
  new E3 Plugin Data boundary.

## 2.2.1

- Agent、Skills、supporting references 和 E3 MCP tool titles 直接描述能力与触发边界，不再使用
  无定义的 `OEC` 限定词影响模型判断。
- 增加模型判断面回归测试；`oec-product`、`oec-pm` 等技术标识与 Marketplace 品牌保持不变。

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
