# PRD 目录模型

```text
ai-docs/
├── prd/
│   ├── prd-all.md              # 唯一产品总 PRD（单一事实源）
│   └── prd-all-changelog.md    # 变更日志
└── versions/
    └── v{x.y.z}/
        └── prd/
            ├── prd-v{x.y.z}.md              # 版本增量 PRD（唯一，不带功能名）
            ├── prd-v{x.y.z}-{featureName}.md # 子 PRD（featureName 小驼峰）
            └── HANDOFF.yaml                  # 发布索引
```

## 硬约束

1. 只有根目录有 `prd-all.md`
2. 每个版本只有一份增量 PRD，文件名精确为 `prd-v{x.y.z}.md`，不带功能名
3. 子 PRD 与增量 PRD 平级，`versions/v{x.y.z}/prd/` 下严禁任何子目录
4. 版本 PRD 目录内不存过程产物（review 副本、final 副本、snapshot、matrix 等）
5. 历史靠 `prd-all-changelog.md` + git history，不在版本目录存快照