# Product language

Describe what a user attempts, sees, can decide, and what business record or state changes.
Technical source material is evidence, not the wording of the PRD.

Prefer:

- “重复点击只产生一次扣减” over implementation terms about idempotency.
- “点击后 1 秒内看到结果” over percentile or throughput metrics.
- “登录失效后提示重新登录，未提交内容保留” over protocol status codes.
- “仅被授权的角色能查看” over token or gateway implementation.

API shapes, database types, caches, queues, framework components, deployment topology, and source
code design belong in engineering artifacts. Keep a technical term only when users or the business
already use it as a product concept. The artifact checker reports suspicious terms as warnings, not proof of
an invalid requirement.
