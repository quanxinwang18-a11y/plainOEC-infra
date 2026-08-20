# 产品语言禁词（完整清单 + 扫描正则）

## 1. 接口 / 协议
`API|REST|GraphQL|HTTP|HTTPS|JSON|YAML|WebSocket|gRPC|RPC`

## 2. 数据库
`VARCHAR|CHAR|INT\b|BIGINT|TEXT\b|JSONB|主键|外键|索引|表结构|字段类型|唯一约束`

## 3. 存储
`localStorage|sessionStorage|cookie|cache|缓存|Redis|MySQL|PostgreSQL|Mongo`

## 4. 前端组件
`<[A-Z][a-zA-Z]+/?>|el-|antd|Vue\.|React\.`

## 5. CSS / 视觉数值
`color:\s*#|background:\s*#|background-color:\s*#|rgba?\(|[0-9]+px\b|[0-9]+em\b|font-size|font-weight|line-height|z-index`

## 6. 后端工程
`幂等|幂等键|事务|乐观锁|悲观锁|分布式锁|消息队列|MQ\b|Kafka`

## 7. 性能技术指标
`P95|P99|QPS|TPS|RT\b|RTT|吞吐量|并发数`

## 8. 架构 / 运维
`微服务|中间件|网关|负载均衡|CDN|部署|灰度|回滚|容器|Docker|k8s`

## 9. 加密 / 安全实现
`哈希|hash|MD5|SHA|JWT|OAuth|token`

## 批量扫描命令

```bash
PRD_FILE=$1
BODY=$(awk '/^## 附录/{exit} 1' "$PRD_FILE")

scan() {
  local label="$1"; local pat="$2"
  local hits=$(echo "$BODY" | grep -cE "$pat")
  if [ "$hits" = "0" ]; then echo "  ✓ $label"; else echo "  ✗ $label 命中 $hits"; echo "$BODY" | grep -nE "$pat" | head -3; fi
}

echo "=== 产品语言禁词扫描 ==="
scan "1. 接口/协议"   'API|REST|GraphQL|HTTP|HTTPS|JSON|YAML|WebSocket|gRPC|RPC'
scan "2. 数据库"     'VARCHAR|CHAR|INT\b|BIGINT|TEXT\b|JSONB|主键|外键|索引|表结构|字段类型|唯一约束'
scan "3. 存储"       'localStorage|sessionStorage|cookie|cache|缓存|Redis|MySQL|PostgreSQL|Mongo'
scan "4. 前端组件"   '<[A-Z][a-zA-Z]+/?>|el-|antd|Vue\.|React\.'
scan "5. CSS数值"    'color:\s*#|background:\s*#|background-color:\s*#|rgba?\(|[0-9]+px\b|[0-9]+em\b|font-size|font-weight|line-height|z-index'
scan "6. 后端工程"   '幂等|幂等键|事务|乐观锁|悲观锁|分布式锁|消息队列|MQ\b|Kafka'
scan "7. 性能指标"   'P95|P99|QPS|TPS|RT\b|RTT|吞吐量|并发数'
scan "8. 架构/运维"  '微服务|中间件|网关|负载均衡|CDN|部署|灰度|回滚|容器|Docker|k8s'
scan "9. 加密安全"   '哈希|hash|MD5|SHA|JWT|OAuth|token'
```