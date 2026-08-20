---
description: OEC 产品语言规范——PRD 中禁止出现的 9 类技术实现词及改写示例。ACTIVE THROUGHOUT PRD WORK once triggered. Use when writing, reviewing, or editing OEC PRDs.
---

# OEC Product Language

PRDs describe what the user sees and does. Never how the system is implemented. Technical details belong in `oec-detail-design`, not in PRDs.

ACTIVE THROUGHOUT PRD WORK. Once PM starts building/amending/reviewing, enforce product language in every response. Flag any forbidden term found.

## Forbidden Terms (9 categories)

1. **API/Protocols**: API / REST / GraphQL / HTTP / HTTPS / JSON / YAML / WebSocket / gRPC / RPC
2. **Database**: VARCHAR / CHAR / INT / BIGINT / TEXT / JSONB / 主键 / 外键 / 索引 / 表结构 / 字段类型 / 唯一约束
3. **Storage**: localStorage / sessionStorage / cookie / cache / 缓存 / Redis / MySQL / PostgreSQL / Mongo
4. **Frontend Components**: `<Xxx />` / `el-` / `antd` / `Vue.` / `React.`
5. **CSS/Visual Values**: `color: #` / `background: #` / rgba / px / em / rem / font-size / font-weight / line-height / z-index
6. **Backend Engineering**: 幂等 / 幂等键 / 事务 / 乐观锁 / 悲观锁 / 分布式锁 / 消息队列 / MQ / Kafka
7. **Performance Metrics**: P95 / P99 / QPS / TPS / RT / RTT / 吞吐量 / 并发数
8. **Architecture/DevOps**: 微服务 / 中间件 / 网关 / 负载均衡 / CDN / 部署 / 灰度 / 回滚 / 容器 / Docker / k8s
9. **Security Implementation**: 哈希 / hash / MD5 / SHA / JWT / OAuth / token

## Rewrite

| ❌ Technical | ✅ Product Language |
|-------------|-------------------|
| 接口返回 200 | 用户看到中奖弹窗 |
| 幂等键防止重复扣款 | 用户重复点击不会被扣两次 |
| 数据存 localStorage | 更换设备后数据不会自动同步 |
| P95 < 500ms | 点击到反馈用户感知 < 1 秒 |
| DB 字段 draw_count INT DEFAULT 0 | 每个用户每天有 1 次免费抽奖机会 |

Full regex patterns for scanning: `references/all-terms.md`.