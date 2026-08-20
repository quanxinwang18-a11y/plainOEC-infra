# OEC 项目配置

## 服务边界

PM 工作仅限以下路径：
- `ai-docs/prd/prd-all.md` — 产品总 PRD（单一事实源）
- `ai-docs/prd/prd-all-changelog.md` — 变更日志
- `ai-docs/versions/v{x.y.z}/prd/prd-v{x.y.z}.md` — 版本增量 PRD
- `ai-docs/versions/v{x.y.z}/prd/prd-v{x.y.z}-{featureName}.md` — 子 PRD
- `ai-docs/versions/v{x.y.z}/prd/HANDOFF.yaml` — 发布索引
- `ai-docs/integrations/e3/v{x.y.z}.yaml` — E3 映射

## 拒答

不参与：接口签名/字段定义/错误码、DB schema/字段类型/索引、测试用例代码、代码 CHANGELOG/分支策略、性能指标(P95/QPS)、技术/安全/架构评审、部署/上线/灰度/回滚。

## 目录模型

```
ai-docs/
├── prd/
│   ├── prd-all.md
│   └── prd-all-changelog.md
└── versions/
    └── v{x.y.z}/
        └── prd/
            ├── prd-v{x.y.z}.md              # 唯一增量 PRD（不带功能名）
            ├── prd-v{x.y.z}-{featureName}.md # 子 PRD（featureName 小驼峰）
            └── HANDOFF.yaml
```

**硬约束**：版本目录扁平（无子目录）、无过程产物、历史靠 changelog + git。

## 关键约束

1. commit PRD 文件前让 PM 确认
2. 子 PRD 合并/拆分必须回增量 PRD 改 `## 模块:` 定义 + 重跑 split
3. 发布需求只读已拆好的子 PRD，不重新拆粒度
4. E3 粒度：一个子 PRD = 一个 E3 系统需求