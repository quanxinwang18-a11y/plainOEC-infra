# 产品语言禁词

PRD 严禁出现以下技术实现词。涉及这些概念时改写成用户视角：

## 接口 / 协议
API / REST / GraphQL / HTTP / HTTPS / JSON / YAML / WebSocket / gRPC / RPC

## 数据库
VARCHAR / CHAR / INT / BIGINT / TEXT / JSONB / 主键 / 外键 / 索引 / 表结构 / 字段类型 / 唯一约束

## 存储
localStorage / sessionStorage / cookie / cache / 缓存 / Redis / MySQL / PostgreSQL / Mongo

## 前端组件
`<Xxx />` 组件名 / `el-` / `antd` / `Vue.` / `React.`

## CSS / 视觉数值
`color: #` / `background: #` / rgba / px / em / rem / font-size / font-weight / line-height / z-index

## 后端工程
幂等 / 幂等键 / 事务 / 乐观锁 / 悲观锁 / 分布式锁 / 消息队列 / MQ / Kafka

## 性能技术指标
P95 / P99 / QPS / TPS / RT / RTT / 吞吐量 / 并发数

## 架构 / 运维
微服务 / 中间件 / 网关 / 负载均衡 / CDN / 部署 / 灰度 / 回滚 / 容器 / Docker / k8s

## 改写示例
- ❌ "接口返回 200" → ✅ "用户看到中奖弹窗"
- ❌ "幂等键防止重复扣款" → ✅ "用户重复点击不会被扣两次"
- ❌ "P95 < 500ms" → ✅ "点击到反馈用户感知 < 1 秒"