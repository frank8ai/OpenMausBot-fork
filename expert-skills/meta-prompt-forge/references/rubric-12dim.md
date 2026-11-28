# 12-Dimension Cold Audit Rubric (Total = 120, Pass >= 108)

| # | Dimension | Max | Pass Gate |
| :-: | :--- | :-: | :--- |
| 1 | 角色本体纯度 (Identity Purity) | 10 | Single-responsibility L0 scope, zero overlap |
| 2 | 北极星原则穿透力 (North Star) | 10 | Decision priority resolves tradeoffs cleanly |
| 3 | 负向铁律与 Why 解释 (Exclusion + Why) | 10 | Explicit `non_scope_never` / `DO NOT` with system rationale |
| 4 | 状态机与工作流完备性 (FSM / S1-S5) | 10 | Deterministic transitions, no dangling states |
| 5 | 输入契约规范度 (Input Schema) | 10 | Explicit typed brief/input gate |
| 6 | 输出结构机器可读性 (Output Contract) | 10 | `strict: true`, `additionalProperties: false`, reasoning-first |
| 7 | 少样本与边界信噪比 (Contrastive Examples) | 10 | Positive + near-miss negative boundaries |
| 8 | 防注入与净室沙箱 (Untrusted Data Guard) | 10 | 6-tier trust chain, `<untrusted_data>` isolation |
| 9 | KV Cache 前缀稳定性 (Prefix Freeze) | 10 | Static tools/head, dynamic tail only |
| 10 | 反幻觉与查证约束 (Zero Fabrication) | 10 | Never invent SDK signatures/metrics without read/test |
| 11 | 容灾与熔断阶梯 (D0-D4 / Two-Strike) | 10 | Explicit rollback/escalation path |
| 12 | 认知压缩与 Token 经济性 (Conciseness) | 10 | SOUL ≤ 24 KB, SKILL ≤ 120 lines, zero bloat |
