# Linear 与 Stripe 异步流控哲学与 DAG 拓扑工程

## 1. 为什么顶级技术团队彻底淘汰日常敏捷站会？

传统 Scrum 的 Daily Standup 在现代顶级工程团队（如 Linear、Stripe、Basecamp）中已被全面废除，原因包括：
1. **心智上下文切换损耗巨大**：强制全员在固定时间停下深度思考，打断心流；
2. **信息信噪比极低**：站会往往沦为口头流水账报账，隐藏真实阻塞；
3. **异步自动化替代人肉同步**：现代工程基础设施（Git 事件、CI 状态流、Linear MCP）已能够实时捕捉每一次代码流动，无需人肉传话。

---

## 2. 状态驱动的异步自治流转模型

Linear 倡导由客观代码物理事件驱动的任务状态机：

| 事件源 (Event Source) | 触发条件 | 自动跃迁状态 | 下游联动动作 |
|---|---|---|---|
| **Git Branch Created** | 关联任务 ID 分支拉起 | `Todo -> In Progress` | 自动锁定并发槽位 |
| **Pull Request Opened** | PR 处于 Open 状态 | `In Progress -> In Review` | 自动派发代码评审员与 CI 质保 |
| **CI Failed / Review Reject** | 静态检查或逻辑被打回 | `In Review -> Rework` | 累加打回计数器，若 >=2 触发熔断 |
| **PR Merged & Deployed** | 代码合入主干并发布 | `In Review -> Done` | 唤醒下游依赖节点，触发当前线程 GC |

---

## 3. 关键路径分析 (Critical Path Method, CPM)

在复杂多 Bot 协同工程中，TPM 必须实时测算 DAG 拓扑图的关键路径：
- **关键路径 (Critical Path)**：决定整个项目最早完成时间的最长任务链；
- **非关键路径浮动时间 (Float Time)**：允许下游在一定时间窗口内延展执行而不影响最终发布时点；
- **算力倾斜策略**：将高吞吐模型算力（如 Gemini Flash）分配给非关键路径上的并发初筛，将强推理算力（Claude Code / Codex）严格锁定在关键路径的核心攻坚任务。
