# plainOEC-infra 务实优化方案

**制定日期**: 2026-09-04
**状态**: Proposed
**证据等级**: Route eval + 架构审查
**批准状态**: 待审批
**代码基线**:
- HEAD: a97ecc0
- Marketplace: 3.1.0
- oec-product: 3.0.4
- oec-dev: 1.9.6
- oec-dev-beta: 0.1.0
- oec-e3: 1.0.3
- oec-pipeline: 1.0.2
- oec-common: 0.3.0
- Repository tests: 159 passed

---

## 状态说明

### 当前事实

1. **发布状态**: Release candidate，尚未正式发布
2. **验收缺口**:
   - E3 账号 Owner 真实复验
   - Pipeline single-POST 真实非生产验收
   - Dev Beta Agent/Playwright outcome
   - Codex 完整宿主验收
   - LICENSE/notice Owner 决策

3. **当前设计原则**（来自 CLAUDE.md 和代码）:
   - 不是固定 Dev workflow engine
   - 不创建状态文件
   - 不维护统一任务状态机
   - 不默认创建 progress/implementation-plan
   - 不 per-turn 项目上下文注入
   - 不 active task 自动注入

4. **当前任务事实源**:
   ```
   ai-docs/versions/<version>/dev-task/<task-slug>/
   ├── spec.md      # 需求、范围、AC
   ├── design.md    # 技术设计、变更边界
   └── research/    # 可选：研究产物
   ```

5. **当前 Engineering knowledge 事实源**:
   ```
   ai-docs/Spec/
   ├── README.md
   ├── module-index.yaml
   ├── specs/       # 当前状态事实
   ├── decisions/   # ADRs 和长期决策
   └── changes/     # 非版本化变更上下文与证据
   ```

### 已识别的真实问题

**已知限制但暂不解决**（等真实痛点再评估）:
- ⚠️ **未提交对话上下文不可恢复** - Git history 和 task artifacts 只保存已写入内容，不保存未提交的推理、未确认的决定、临时失败原因。这是已知限制，但当前没有证据证明需要通用跨会话 Journal。
- ⚠️ **Team Spec 导航** - 已有 `module-index.yaml` 和路径选择，如果真实项目证明不够，再考虑增强。
- ⚠️ **按需任务恢复** - 用户说"继续"时可按需解析已有产物，如果真实场景证明困难，再考虑优化。

**真实问题**（需要优化）:
1. Skill 协作不清晰 - 返回格式不统一，下一步不明确
2. 验证证据不标准 - 有时没执行就声称通过
3. 用户确认流程需要通过 outcome eval 验证 - 历史上不同入口的确认语义和验证证据不一致，当前 code-plan/prd-publish 已完成主要安全修正，仍需通过宿主 outcome eval 验证
4. 自然语言目标到 Skill 的判断可以更准确（基于风险而非文件数量）
5. 外部操作（E3, Pipeline）的真实验收未完成
6. Skill 协作前置条件不清晰（researcher, code-review, checker）

---

## 一、核心优化方向（保持当前架构）

### 1.1 强化自然语言路由和 Skill 协作

#### 问题

当前 `guide` bootstrap 提供路由逻辑，但：
- 判断标准不够清晰（何时是小修改 vs 需要规划）
- Skill 返回格式不统一（有时只返回文本，有时返回结构化信息）
- 下一步建议模糊（"你可以..."vs "建议..."vs 直接继续）

#### 解决方案

**不做**:
- ❌ 创建任务状态机
- ❌ SessionStart 注入项目上下文
- ❌ Active task 指针

**只做**:

1. **标准化 Skill 返回契约**（最小必需字段，Status 枚举按能力领域定义）
   ```markdown
   # 所有相关 Skill 使用最小结果字段（字段可为空或按能力裁剪）

   ## Internal Handoff Metadata（用于 Skill 间协作）
   - taskRef: [canonical 任务引用]
   - canonical_paths: [spec.md, design.md 路径]
   - source_identity: [PRD, Story, HANDOFF, etc.]

   这些 metadata 只存在于当前调用结果或对话上下文；不生成 handoff 文件，
   不写入 Plugin Data，也不形成新的持久状态。E3/Pipeline MCP 保留各自的协议 schema，
   不强制套用 Skill 返回契约。

   ## User-Facing Report（用户可见输出）

   ### Original Goal
   [用户原始目标的理解，用自然语言而非技术术语]

   ### Status
   [按能力领域使用适当的状态值，不强制统一所有 Skill]

   示例（按能力领域）：
   - code-implement: complete | partial | failed | blocked
   - prd-review: ready | needs-decisions | blocked
   - evaluator: pass | fail | incomplete | blocked
   - prd-publish: 基于 E3 MCP 结果报告 ready | published | partial | blocked

   E3/Pipeline MCP 使用各自的协议状态，不纳入 Skill Status 枚举。

   ### Work Done
   - Created: [文件列表]
   - Modified: [文件列表]
   - Verified: [验证命令和结果]

   ### Evidence
   [验证证据：命令、输出、exit code]

   ### Unresolved
   [未决策项或阻塞原因]

   ### Suggested Next Action
   [明确、可操作的下一步，或"已完成，无需进一步操作"]
   ```

2. **增强 guide bootstrap 的判断清单**（基于风险而非文件数量）
   ```markdown
   ## 目标判断流程

   1. 风险评估（而非文件数量）
      局部、可逆、边界明确、无公共契约变化
      → 主会话直接处理

      跨模块、破坏性、公共接口、数据迁移、边界不明确
      → 展示范围和验证，等待确认

      即使单文件也需要确认的情况：
      - 公共 API
      - 数据库迁移
      - 权限配置
      - 安全策略
      - 关键部署文件

   2. 是否需要规划？
      - 目标模糊或范围不明确
      - 涉及多个模块或破坏性变更
      - 可能影响现有公共契约
      → code-plan 先规划

   3. 是否已有明确任务产物？
      - 存在 spec.md + design.md
      - 用户说"继续"/"实现"
      → code-implement 按现有设计

   4. 是否需要研究？
      - 必须已有 canonical taskRef 或 legacy change ID
      - 技术方案不明确需要调研
      - 非平凡研发目标需先规划再研究
      → code-plan → 确认 → researcher

      普通探索或技术咨询由 Main Session 处理

   5. 是否需要质量检查？
      - 用户明确要求 Review → code-review
      - 用户允许修复机械问题 → checker
      - 高风险任务且原始目标包含独立检查 → 实现后协作检查

      普通代码修改不自动触发 Review/Checker
   ```

3. **按需解析任务上下文**（而非注入）
   ```markdown
   # 当用户说:
   "继续这个任务"
   "继续 payment 相关的工作"

   # Skill 行为:
   1. 检查当前对话已有 canonical taskRef
      - 对话中明确提到的 versioned:v1.2.3/payment-retry
      - 或 change:2026-09-02-cache-fix

   2. 如果当前对话没有，检查当前工作目录:
      - 是否在 ai-docs/versions/*/dev-task/<slug>/ 下
      - 从路径推断 version + slug 构建 taskRef

   3. 如果用户提供了裸 slug（如 "payment-retry"）:
      - 不直接调用 oec-spec task resolve（会失败）
      - 而是询问用户澄清版本或提供完整路径
      - 或检查当前目录是否在对应任务目录

   4. 如果有唯一安全候选:
      - 调用 oec-spec task resolve <canonical-taskRef>
      - 读取 spec.md, design.md
      - 继续工作

   5. 如果无法确定或有多个候选:
      - 询问用户澄清具体任务
      - 让用户明确指定 canonical taskRef 或路径

   # 不做:
   - 不创建 task.json 状态文件
   - 不维护 active task 指针
   - 不在 SessionStart 预注入
   - 不假设一定有活跃任务
   - 不扫描所有任务目录
   - 不按修改时间猜任务
   - 不自动选择 latest taskRef
   - 不用裸 slug 调用 task resolve
   ```

**实施**:
- 在 `guide/SKILL.md` 中保留极简协作原则
- 在各高风险 Skill 内部保留自己的输出契约（不创建根级 references/）
- 增强 `guide` bootstrap 判断清单（基于风险而非文件数量）
- 更新所有 Skills 遵循最小报告字段（但 Status 枚举可按能力不同）
- 工作量: 1周
- 风险: 低（提示词优化，不改变架构）

---

### 1.2 标准化验证证据契约

#### 问题

当前验证逻辑重复，且 Model 可能：
- 没执行测试就声称通过
- 猜测命令而非使用项目真实入口
- 把静态检查当运行时验收

#### 解决方案

**不做**:
- ❌ 创建通用 VerificationRunner
- ❌ 自动检测测试命令
- ❌ 统一运行 test/typecheck/lint

**只做**:

1. **标准化验证证据契约**（不强制统一所有能力的 Status 枚举）
   ````markdown
   ## 验证证据标准（在各 Skill 内部文档化）

   ### Status（按能力领域使用不同值）
   - code-implement: complete | partial | failed | blocked
   - prd-review: ready | needs-decisions | blocked
   - evaluator: pass | fail | incomplete | blocked
   - prd-publish: 基于 E3 MCP 结果报告 ready | published | partial | blocked

   E3/Pipeline MCP 使用各自的协议状态，不纳入 Skill Status 枚举。

   ### Required Fields

   #### 1. Commands Executed
   ```bash
   npm test
   npm run typecheck
   npm run lint
   ```

   #### 2. Exit Codes
   - npm test: 0
   - npm run typecheck: 1 (found 3 errors)
   - npm run lint: 0

   #### 3. Evidence
   [命令输出摘要，失败时包含关键错误]

   #### 4. Unexecuted Checks
   [如果某些检查未执行，说明原因]
   - Performance test: 需要外部服务，未在本地环境运行

   #### 5. Residual Risks
   [已知未覆盖的风险]
   - 并发场景未测试
   - 数据库迁移未在真实环境验证
   ````

2. **从 Design 或 Team Spec 获取验证命令**
   ```markdown
   # design.md 中可选指定:

   ## Verification

   Commands:
   - `npm test -- payment.test.ts`
   - `npm run typecheck`

   Expected:
   - All tests pass
   - No type errors

   # 或在 Team Spec 中统一（符合 ai-docs/Spec/ 契约）:

   ---
   id: SPEC-payment-domain
   module_id: payment
   applies_to:
     - services/payment/**
   ---

   # Payment Domain Spec

   ## Verification

   Commands:
   - Test: `./gradlew :payments:test`
   - Integration: `./gradlew :payments:integrationTest`

   Environment:
   - Java 17 required
   - Test database: project-provided in-memory database
   - Required variables: documented names only; values supplied by the environment

   Expected:
   - All tests pass
   - Integration tests connect to H2 in-memory DB

   **Note**: Commands reference project-provided tools; secrets and absolute paths
   are supplied by the runtime environment, not hardcoded in Team Spec.
   ```

3. **Skill 明确报告未执行的检查**
   ```markdown
   # code-implement 示例返回:

   ## Verification

   Executed:
   - npm test -- payment.test.ts: ✓ 12 passed
   - npm run typecheck: ✓ No errors

   Not Executed:
   - Lint: Project does not have ESLint configured
   - E2E: Requires staging environment

   Status: partial

   Residual Risks:
   - Linting not verified (no configuration)
   - E2E behavior not verified (manual testing recommended)
   ```

**实施**:
- 在各 Skill 内部文档化验证证据标准（不创建根级 references/）
- 更新所有涉及验证的 Skills/Agents 遵循最小字段契约
- 允许不同能力使用适合其领域的 Status 值
- 工作量: 5天
- 风险: 低（标准化报告格式，不改变能力语义）

---

### 1.3 统一确认流程时机

#### 问题

历史上不同入口的确认语义和验证证据不一致。当前主要流程已经采用相同的安全边界：
- `prd-publish`: 准备 → 显示计划 → 确认 → 执行
- `code-plan`: 准备范围和精确路径 → 显示 → 确认 → 写入 spec.md/design.md
- `code-finish`: 显示精确提交范围 → 确认 → git commit

剩余工作是通过宿主 outcome eval 验证这些行为，而不是重新实现确认流程。

#### 解决方案

**统一模式**: 准备 → 显示计划 → 确认 → 执行

```markdown
## 标准确认流程（在各 Skill 内部遵循）

### Phase 1: Prepare (内部)
- 收集所有必要信息
- 验证前置条件
- 构建完整计划
- **不写入业务仓库，不创建远端业务对象**
- 允许在 Plugin Data 中保存短期 plan、selection 和恢复信息

### Phase 2: Display (向用户)
- 显示完整计划（清晰、结构化）
- 说明影响范围
- 标注风险点
- 提供明确的确认提示

### Phase 3: Confirm (等待用户)
- 用户明确同意后继续
- 用户拒绝或要求修改则返回 Phase 1

### Phase 4: Execute (执行)
- 按计划执行操作
- 报告执行结果
- 如有错误，明确报告并建议下一步

## 适用场景

### 必须确认:
- Git 操作（commit, push）
- 外部系统调用（E3 publish, Pipeline execute）
- 删除文件
- 以下类型的变更（即使局部）:
  * 公共契约变化
  * 数据语义或迁移
  * 安全/权限变化
  * 不可逆操作
  * 跨边界副作用
  * 范围不明确
  * 需要用户选择的方案

**注意**: 确认的是新的用户决策、范围扩展或不可逆副作用，不是每一个技术实现判断。用户已经明确授权的局部跨文件实现不应过度阻断。

### 可以不确认:
- 局部、可逆、边界明确的修改
- 读取操作
- 操作系统临时目录中的 throwaway 文件（不是业务仓库中的临时文件）
```

**实施**:
- 在各 Skill 内部遵循标准确认流程（不创建根级 references/）
- 增加 outcome eval 验证 `code-plan` 确认前没有任务文件或业务代码写入
- 增加 outcome eval 验证 `code-finish` 遵循标准流程
- 验证 `prd-publish` 已遵循（应该已经正确）
- 明确区分业务仓库写入 vs Plugin Data 写入
- 工作量: 3天（主要是增加 outcome eval）
- 风险: 低（验证已有行为，不改变权限模型）

**已有基线**:
- ✅ code-plan 已要求用户确认后才写 spec.md/design.md
- ✅ prd-publish 已实现 prepare → confirm → execute

**Phase 重点**: 增加 outcome eval 验证确认流程正确性

---

### 1.4 完成外部操作真实验收

#### 问题

当前验收缺口：
- E3 账号 Owner 真实复验
- Pipeline single-POST 真实非生产验收
- Dev Beta Agent/Playwright outcome
- Codex 完整宿主验收

#### 解决方案

**按优先级逐个完成验收**:

1. **P0: E3 真实流程验收**
   ```
   目标:
   - 真实 E3 账号
   - 端到端 prd-publish 流程
   - 验证 prepare → confirm → execute → status

   验收标准:
   - PRD 成功发布
   - 状态查询返回正确
   - 错误处理正确（如权限不足）

   Owner: [TBD]
   时间: 2天
   ```

2. **P0: Pipeline single-POST 验收**
   ```
   目标:
   - 真实 Pipeline 配置
   - single-POST 执行和状态查询
   - 验证 prepare → confirm → execute → status

   验收标准:
   - Pipeline 成功触发
   - 状态查询返回正确
   - 错误处理正确（如 Pipeline 失败）

   Owner: [TBD]
   时间: 2天
   ```

3. **P1: Dev Beta + Playwright 验收**
   ```
   目标:
   - web-develop 完整流程
   - implementer → evaluator → checker 协作
   - Playwright MCP 集成

   验收标准:
   - 实现 → 评估 → 修复循环工作
   - Playwright 评估正确
   - 最终 checker 给出准确判断

   Owner: [TBD]
   时间: 3天
   ```

4. **P2: Codex 宿主验收**
   ```
   目标:
   - Codex 环境安装和加载
   - 主要 Skills 可用
   - Agents 可派发

   验收标准:
   - 插件成功加载
   - code-plan/implement/finish 流程工作
   - Agent .toml 与 .md 一致

   Owner: [TBD]
   时间: 2天
   ```

**实施**:
- 创建验收测试计划文档
- 安排 Owner 和真实环境
- 记录验收结果
- 修复发现的问题
- 工作量: 9天（可并行，不阻塞 Phase 1 本地优化）
- 风险: 中（需要真实环境和账号）

**注意**: Phase 0 是 Release Gate，但不阻塞 Phase 1 的本地优化（Bootstrap 文案修正、Skill 协作 eval、证据契约、自然语言路由测试）

---

## 二、条件性优化（有真实痛点后再做）

### 2.1 按需任务上下文恢复

#### 触发条件

收集到多个真实失败案例：
- >= 5 个独立用户反馈（通用跨项目能力）
- 或 >= 3 个不同项目反馈（单一导航或命令配置问题）
- 反馈需要可复现
- 需要影响同一类目标
- 需要说明何种结果会让优化停止

#### 如果确认需要，才考虑

**最小化方案**（仍不创建状态机）:

```markdown
# 仅增强 guide bootstrap 的上下文解析能力

## 当用户说:
- "继续"
- "恢复工作"
- "刚才的任务"

## Skill 行为:
1. 检查当前对话已有 taskRef:
   - 对话中明确提到的任务
   - 当前工作目录是否在 dev-task/ 下
   - 不自动选择 latest 或扫描所有任务

2. 如果有唯一安全候选:
   - 调用 oec-spec task resolve
   - 读取 spec.md, design.md
   - 继续工作

3. 如果无法确定或有多个候选:
   - 询问用户澄清具体任务
   - 让用户明确指定 taskRef

## 不做:
- 不创建 task.json 状态文件
- 不维护 active task 指针
- 不在 SessionStart 预注入
- 不假设一定有活跃任务
- 不扫描最近任务
- 不按修改时间猜任务
- 不自动选择 latest taskRef
```

**实施条件**:
- 收集 >= 5 个独立真实用户反馈（通用跨会话能力）
- 证明当前按需解析不够
- Owner: [TBD]
- 工作量: 3天

---

### 2.2 Team Spec 导航增强

#### 触发条件

多个真实项目报告 Spec 难以导航：
- module-index.yaml 不够清晰
- oec-spec select 选择不准确
- 新成员找不到相关 Spec

#### 如果确认需要，才考虑

**最小化方案**（不迁移路径）:

```markdown
# 仅增强现有 ai-docs/Spec/ 的导航能力

1. 改进 module-index.yaml schema:
   - 增加 category 字段
   - 增加 applies_to 路径模式示例
   - 增加 related_specs 链接

2. 增强 oec-spec select:
   - 更好的路径模式匹配
   - 返回结果包含:
     * 匹配路径
     * 匹配 glob
     * module_id
     * related_specs
     * 未覆盖路径
   - 不使用难以解释的 relevance score
   - 缓存索引以提升性能

3. 改进 ai-docs/Spec/README.md:
   - 清晰的目录结构说明
   - 常见查询示例
   - 新增 Spec 的指导

## 不做:
- 不迁移到 Plugin Data
- 不创建新的 guides/ 目录
- 不自动推断 Spec 分类
- 不改变 canonical 路径
- 不引入模型难以解释的评分
```

**实施条件**:
- 收集 >= 3 个不同真实项目反馈（导航问题）
- 证明当前导航确实困难
- Owner: [TBD]
- 工作量: 5天

---

### 2.3 验证命令配置

#### 触发条件

多个项目无法自动找到验证入口：
- 非标准构建工具
- 多个 build root
- 需要特定环境变量

#### 如果确认需要，才考虑

**最小化方案**（不创建通用 Runner）:

````markdown
# 在 design.md 或 Team Spec 中记录验证命令

## design.md 示例:

### Verification

Environment:
- Java 17 required
- Test database supplied by the project
- Required variable names documented; values supplied at runtime

Commands:
```bash
cd services/payment
./gradlew test
./gradlew integrationTest
```

Expected:
- All tests pass
- Coverage > 80%

## Team Spec 示例:

## Module: backend/payment

Verification:
- Unit: `./gradlew :payment:test`
- Integration: `./gradlew :payment:integrationTest`
- Smoke: `./scripts/smoke-test.sh payment`

## 不做:
- 不创建通用 VerificationRunner
- 不自动检测命令
- 不替项目决定验证策略
- 维护责任仍在项目团队
````

**实施条件**:
- 收集 >= 3 个不同真实项目反馈（验证命令配置问题）
- 证明当前验证确实困难
- Owner: [TBD]
- 工作量: 2天

---

## 三、明确不做（从路线图移除）

以下功能与 plainOEC 定位冲突，明确不实施：

### 3.1 任务生命周期系统

**原因**:
- 引入新的状态文件（task.json）
- 创建第二个事实源（与 ai-docs 冲突）
- 需要 active task 状态机
- 需要 CRUD、activate、archive 操作
- SessionStart 注入会污染普通开发
- 与"不维护统一任务状态机"原则冲突

**替代方案**:
- 按需解析已有任务产物（spec.md, design.md）
- 用户明确表达"继续"时再恢复上下文
- 不假设一定有活跃任务

---

### 3.2 跨会话通用日志

**原因**:
- 事件日志不等于当前事实
- 与 current-state Spec 理念冲突
- 隐私和敏感路径问题
- 日志轮换和清理增加复杂度
- 团队需要维护事实，不是堆积事件

**替代方案**:
- 关键结果写入对应 artifact（research/, evidence.md, Spec, ADR）
- Git history 已经是操作日志
- 不需要额外的活动记录系统

---

### 3.3 Plugin Data 中的 Team Spec

**原因**:
- Team Spec 是团队共享的工程事实
- 不应该在用户本地 Plugin Data
- 会产生团队无法访问的知识孤岛
- canonical 位置应该是 Git 仓库

**替代方案**:
- 保持 ai-docs/Spec/ 为 canonical 位置
- 如有导航问题，增强现有结构
- 不迁移路径

---

### 3.4 统一任务标识符改名

**原因**:
- 当前 canonical taskRef 区分了版本化任务和非版本化 change
- 区分了 Product 来源和工程变更
- 与 E3 identity 关系清晰
- oec-spec task resolve 已经可以兼容多种输入

**替代方案**:
- 保持当前 canonical 格式
- 继续通过 oec-spec 归一化兼容输入
- 不引入破坏性简化

---

### 3.5 通用 VerificationRunner

**原因**:
- 不同项目构建入口差异极大
- 自动检测可能误执行错误命令
- oec-dev 不是项目构建系统
- 与"不替项目决定验证策略"原则冲突

**替代方案**:
- 标准化验证证据契约（报告语义）
- 从 design.md 或 Team Spec 获取命令
- 明确报告未执行的检查

---

### 3.6 其他不做的功能

- ❌ 全局 pre-commit hook（项目自己决定）
- ❌ 自动 Product Root 检测（容易误判）
- ❌ 自动 Spec 迁移（启发式不可靠）
- ❌ 父子任务树（过度设计）
- ❌ 任务时间追踪（非核心）
- ❌ 多工具适配层（专注 Claude Code）

---

## 四、实施路线图

### Phase 0: 完成真实验收 (2周)

**目标**: 补全当前验收缺口，确认基线能力

**包含**:
1. [ ] E3 真实流程验收（2天）
   - 仅非生产账号、空间
   - 使用唯一可识别的测试名称或 marker
   - 记录 prepare/confirm/execute/status 完整证据
   - 验证权限不足、计划过期、远端漂移、部分成功
   - 验证测试对象清理或明确保留策略
   - 不把 token、账号敏感信息写入 Git 或报告

2. [ ] Pipeline single-POST 验收（2天）
   - 仅非生产 Pipeline 和空间
   - 使用唯一可识别的测试名称或 marker
   - **验证首次 execute 只发送一次 POST**
   - **验证未知结果时通过 marker/status 恢复，而不是再次盲目 POST**
   - 验证网络超时或未知结果时不会重复 POST
   - 记录 prepare/confirm/execute/status 完整证据
   - 验证测试对象清理或明确保留策略

3. [ ] Dev Beta + Playwright 验收（3天）
4. [ ] Codex 宿主验收（2天）
5. [ ] 修复发现的问题（3天 buffer）

**Owner**: [TBD]
**状态**: Release Gate，但不阻塞 Phase 1 本地优化

**可并行进行的工作**:
- Bootstrap 文案修正
- Skill 协作 eval
- 本地证据契约
- 自然语言路由测试

**已完成的基线能力**（不需要重新实现）:
- ✅ Bootstrap 风险确认和 Skill 协作规则
- ✅ guide Hook-only（SessionStart 注入，不做 per-turn）
- ✅ diagnosis-only Debug 只读
- ✅ prd-publish Model discovery
- ✅ E3 account binding
- ✅ E3 create/reuse plan drift 检查
- ✅ POMP ready 输出
- ✅ 159 项测试通过
- ✅ E3 bundle 重新生成

**Phase 0 重点**: 真实环境验收，而非重新开发已有能力

---

### Phase 1: 强化协作与证据 (2周)

**目标**: 提升 Skill 协作清晰度和验证可信度

**拆分为三个可并行的子阶段**:

#### Phase 1A: 自然语言和协作（1周）
1. [ ] 增强 Bootstrap 路由优先级（基于风险而非文件数量）
2. [ ] 明确强相关能力的继续条件
3. [ ] 验证新的用户决策、范围扩展、commit 和外部操作确认流程
4. [ ] 验证 code-plan → code-implement 原始目标连续性
5. [ ] 明确 Review 和 Checker 分离及前置条件
6. [ ] 增加 outcome eval 验证 Debug diagnosis-only 只读
7. [ ] 增加 outcome eval 验证 Researcher 需要 canonical taskRef

**已完成基线**:
- ✅ Debug 只读模式已实现
- ✅ 基本协作规则已在 guide 中

**Phase 1A 重点**: 增加 outcome eval 验证行为正确性，补充协作前置条件文档

#### Phase 1B: 证据表达（1周）
1. [ ] 统一最小报告字段（Status 可按能力不同）
2. [ ] 在各 Skill 内明确命令和 exit code 要求
3. [ ] 文档化"区分未执行、阻塞、失败和通过"标准
4. [ ] 增加 eval 禁止未经执行的完成声明
5. [ ] 明确不创建通用验证 Runner

**Phase 1B 重点**: 标准化证据报告语义，不改变执行逻辑

#### Phase 1C: 真实宿主验收（与 Phase 0 部分重叠）
1. [ ] 自然语言触发 prd-publish 验收
2. [ ] 验证未确认前不能 execute
3. [ ] Pipeline 同样验证
4. [ ] Main Session Hook 行为验收
5. [ ] User P 和专家用户的 outcome eval

**已完成基线**:
- ✅ prd-publish Model discovery 已实现
- ✅ E3 prepare/execute 分离已实现

**Phase 1C 重点**: 真实环境验收，发现并修复问题

**注意**:
- 不在 oec-dev 根目录创建 references/
- 在各 Skill 内部保留输出契约
- 在 guide/SKILL.md 保留极简协作原则

**Owner**: [TBD]
**破坏性变更**: 无
**风险**: 低

---

### Phase 2: 根据反馈迭代 (条件性)

**触发条件**: Phase 1 发布后收集真实用户反馈

**可选优化**（按需启动）:
- 按需任务上下文恢复（如果确实是痛点）
- Team Spec 导航增强（如果确实困难）
- 验证命令配置（如果项目需要）

**原则**:
- 只做有证据的优化
- 保持架构简单
- 不引入状态系统

---

## 五、成功标准

### 定量指标（需要先建立测量基线）

**性能**（待建立测量脚本和基线）:
- [ ] 插件加载时间（目标: < 500ms）
- [ ] oec-spec 命令响应（目标: < 200ms）

**质量**（需要区分不同类型）:
- Route correctness: Skill 调用正确性
  * 当前 corpus: 30 个正向/负向 cases
  * 当前结构和组件验证: Repository tests 159 passed
  * 最新真实模型结果: 必须引用具体 run artifact；不能由组件测试推导
  * 目标: 在固定 corpus 的真实模型运行中保持通过

- Outcome correctness: 调用后结果正确性
  * 当前基线: 部分 outcome eval 存在
  * 目标: 主要流程覆盖（code-plan, code-implement, code-finish, prd-publish, pipeline-execute）

- Confirmation safety: 权限边界确认正确性
  * 当前基线: 待建立
  * 目标: 对契约规定必须确认的流程，在取得对应确认前不写入计划范围内的业务仓库文件、不创建远端对象、不执行 commit/push，也不扩大用户已授权范围
  * 例外: 用户已明确授权的局部、可逆 Direct Coding 不需要额外确认

- Evidence truthfulness: 验证证据真实性
  * 当前基线: 待建立
  * 目标: 禁止未执行声称通过

- User effort: 用户完成目标的效率
  * 当前基线: 待测量
  * 目标: 需要真实用户反馈

**验收**（Release Gate）:
- [ ] E3 真实流程验收通过
- [ ] Pipeline single-POST 验收通过
- [ ] Dev Beta + Playwright 验收通过
- [ ] Codex 宿主验收通过

### 定性指标（通过用户访谈）

**Phase 1 后询问**:
1. "Skill 返回的下一步建议是否清晰？"
2. "验证证据是否让你相信测试确实运行了？"
3. "确认流程是否一致且可预测？"
4. "自然语言目标的判断是否准确（基于风险而非文件数量）？"
5. "还有哪些痛点未解决？"

**不问的问题**（避免引导）:
- ❌ "任务系统是否有帮助？"（我们没有做任务系统）
- ❌ "Spec 组织是否更好？"（我们没有迁移 Spec）
- ❌ "跨会话恢复是否方便？"（等真实反馈再评估）

**条件性优化的触发条件**:
- 通用跨项目能力需要 >= 5 个独立的真实用户反馈
- 单一导航或命令配置问题需要 >= 3 个不同项目反馈
- 反馈需要可复现
- 需要影响同一类目标
- 需要说明何种结果会让优化停止

### 失败/停止条件

**如果出现以下情况，停止并重新评估**:
1. Phase 1 优化后用户反馈没有改善
2. Route eval 通过率下降
3. 性能显著退化（>20%）
4. 出现数据丢失或破坏性 bug
5. 真实验收发现架构性问题

---

## 六、不确定性和需要决策的事项

### Owner 待确定

所有任务的 Owner 标记为 [TBD]，需要：
- 指定负责人
- 确认时间预算
- 建立沟通机制

### 环境和账号

真实验收需要：
- E3 测试账号和权限
- Pipeline 测试环境
- Playwright MCP 配置
- Codex 安装环境

### 发布策略

未明确：
- Phase 0 完成后各 Plugin 的版本策略
- Phase 1 完成后的发布计划
- 当前各 Plugin 独立版本（oec-dev 1.9.6, oec-product 3.0.4, oec-e3 1.0.3, oec-pipeline 1.0.2），不能用单一版本号描述

### Codex 支持决策

当前生成 .toml 但未完全验收，需要决定：
- 是否继续支持 Codex？
- 如果支持，何时完成验收？
- 如果不支持，何时废弃？

---

## 七、与原优化计划的主要差异

### 移除的内容

1. ❌ **任务生命周期系统** - 会创建状态机，与定位冲突
2. ❌ **跨会话日志** - 事件日志不等于事实
3. ❌ **Plugin Data 中的 Team Spec** - 团队知识不应在用户本地
4. ❌ **统一 taskRef 改名** - 当前设计有明确理由
5. ❌ **通用 VerificationRunner** - 项目差异太大
6. ❌ **SessionStart 注入任务** - 会污染普通开发
7. ❌ **所有破坏性变更** - RC 阶段不适合

### 保留但调整的内容

1. ✅ **Skill 协作** - 但通过契约而非状态机
2. ✅ **验证标准化** - 但标准化报告而非执行
3. ✅ **确认流程** - 统一时机而非创建新系统
4. ✅ **任务上下文** - 按需解析而非持久化指针

### 新增的内容

1. ✅ **完成真实验收** - 补全当前缺口
2. ✅ **条件性优化** - 有证据再做
3. ✅ **明确不做列表** - 避免范围蔓延

---

## 八、总结

### 核心原则

plainOEC 应该是：
- ✅ 目标驱动的判断和路由系统
- ✅ 基于现有 canonical artifacts 的协作
- ✅ 真实验证证据的收集和报告
- ✅ 用户在权限边界处的明确确认

plainOEC 不应该是：
- ❌ 任务状态机或工作流引擎
- ❌ 事件日志系统
- ❌ 通用构建系统
- ❌ 自动化项目扫描器

### 最重要的修正

```
从: 建立任务生命周期、日志、Spec 迁移系统
到: 强化判断、协作、证据、确认的清晰度

从: 创建新的状态和 Runtime
到: 优化现有 artifacts 的使用方式

从: SessionStart 注入和 active task
到: 按需解析和用户明确表达

从: 自动化一切
到: 在关键点确认，在明确点自动
```

### 下一步

1. **立即**: 审批此方案
2. **2周内**: 完成 Phase 0 真实验收
3. **1个月内**: 完成 Phase 1 协作和证据优化
4. **持续**: 收集反馈，条件性启动 Phase 2

---

**制定者**: 基于架构审查反馈
**审批者**: [待指定]
**生效日期**: [待批准]
**下次审查**: Phase 0 完成后
