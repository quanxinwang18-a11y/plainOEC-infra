# Evaluation cases

## Positive cases

- “做一个 throwaway HTML prototype，让我比较三种批量操作入口，不要实现生产页面。”
- “Prototype this retry state model with controls for timeout, cancel, duplicate submit, and recovery so I can decide whether the transitions feel right.”
- “先用临时交互原型验证多候选选择流程；我看过并选定方案后再考虑正式实现。”

## Negative cases

- “实现生产环境的结算页面并补测试。”属于普通工程实现。
- “这个 API 能否承受每秒一千请求？”应优先使用 benchmark 或测量，不需要交互原型。
- “为支付迁移写技术设计和回滚计划。”应使用 `planning-engineering-changes`。
- “给投资人制作一个视觉精致、内容完整的产品演示。”不是用于回答单一设计问题的 throwaway prototype。
- “修复这个已经有失败测试的状态转换。”应直接修复并验证，不需要原型。
