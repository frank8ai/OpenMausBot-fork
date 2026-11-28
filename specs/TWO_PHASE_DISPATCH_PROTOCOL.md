# 《单回合状态收敛与双回合推进流控协议》（Two-Phase Dispatch Protocol - 2PDP）

## 1. 协议背景与底层状态机原理

### 1.1 根因分析：引擎握手冲突（Engine Handshake Collision）
在 OpenMausBot 多智能体协同网络中，主控协调者（MausBot）与各垂直专家（全栈开发、测试质保、代码评审、架构师等）之间通过 `coordinate_bots` 建立异步任务派发链路。底层协作引擎对每个 Assignment（任务工单）维系着严格的确定性有限状态机（FSM）：

```
[IDLE / UNASSIGNED] 
       │ coordinate_bots (thread="standing" / "new")
       ▼
   [RUNNING] (子 Bot 异步施工执行中)
       │ 子 Bot 产出交付物并结束回合
       ▼
  [COMPLETED] (任务结算态，触发主控 MausBot 异步唤醒)
       │
       ├─► 允许路径 1: [Verdict & Settle] 主控审查完成，给出最终裁决，生命周期终结
       └─► 允许路径 2: [Rework] 仅当显式设置 rework=true 时，状态机回退至 RUNNING
```

当主控 Bot 收到子 Bot 成果汇报被系统唤醒时，当前上下文中的 Assignment 严格处于 `[COMPLETED]` 状态。
此时，若协调者试图在**同一个回合**内向同一个 Bot 派发下一个阶段的任务，且未显式指定 `thread: "new"` 时（默认复用 `standing` 线程），底层中间件会将该动作判定为**“对已完成的任务工单进行未经声明的非法追加”**，从而硬阻断抛出异常：
> `Encountered error: This agent already completed your assignment. Finish with your decision; Only use rework=true for concrete additional work.`

### 1.2 核心破局点：解耦“工单结算”与“下阶段派发”
解决此冲突的关键在于**状态机生命周期的显式切分**：
1. **结算相（Phase 1: Settle）**：针对已完成的上一阶段任务，核查物理凭证，给出仲裁收尾（Verdict），并将结果原子记录到本地调度台账；
2. **派发相（Phase 2: Dispatch）**：开启新阶段任务时，**强制显式声明 `thread: "new"`**，在底层开辟全新的独立线程生命周期，从根本上隔离上一个任务的 `COMPLETED` 状态机约束。

---

## 2. 双相提交流控规范（Two-Phase Dispatch Protocol）

```
                         [子 Bot 成果汇报唤醒]
                                  │
                                  ▼
      ┌────────────────────────────────────────────────────────┐
      │            【Phase 1: Settle & Gate 结算门禁相】         │
      │  1. 真实物理凭证核验（代码落盘、测试 Exit 0、PR 绿标）    │
      │  2. 仲裁收官（PASS / FAIL）                            │
      │  3. 调度台账物理落盘 (ACTIVE_DISPATCH_STATE.json)      │
      └───────────────────────────┬────────────────────────────┘
                                  │
                ┌─────────────────┴─────────────────┐
                ▼ (PASS: 验收通过)                   ▼ (FAIL: 验收未通过)
   ┌───────────────────────────────┐     ┌───────────────────────────────┐
   │ 【Phase 2: Unlock & Dispatch】│     │ 【Phase 1-R: Rework 返修相】   │
   │ 1. 拓扑下游就绪 (LOCKED->READY)│     │ 1. Strike 计数累加 (+1)        │
   │ 2. 强制指定 thread: "new"      │     │ 2. Strike < 2:                │
   │ 3. 派发自包含 5 要素 Brief     │     │    显式声明 rework=true 派发  │
   │ 4. 更新台账并挂起等待唤醒       │     │ 3. Strike >= 2: 两振硬熔断     │
   └───────────────────────────────┘     └───────────────────────────────┘
```

### 2.1 Phase 1：结算门禁相（Settle & Gate Phase）
- **触发条件**：收到子 Bot 的汇报报文（`[From <Bot> · report on assignment <id>]`）。
- **执行动作**：
  1. **物理三要素验收**：
     - 文件落盘证据（真实文件路径与 Git Diff，严禁口头声明）；
     - 命令退出码实证（`pytest` / 构建脚本 Exit Code 为 `0`）；
     - 门禁评审签字（测试质保员 `QA PASS` / 代码评审员 `APPROVE`）。
  2. **台账更新（Settle）**：
     - 将当前节点状态从 `RUNNING` 翻转为 `SETTLED`；
     - 记录关联交付凭证（PR 链接、Git Commit Hash、测试日志摘要）。
  3. **异常处理分支（Fail）**：
     - 若物理凭证缺失或验收失败，检查 `strike_count`：
       - `strike_count == 0`：累计为 Strike 1，进入 **Phase 1-R 返修相**，调用 `coordinate_bots(..., rework=true)` 派发就地返修；
       - `strike_count >= 1`：累计达 Strike 2，触发**两振硬熔断**，标记节点为 `FROZEN_BY_STRIKE_2`，向软件架构师发起会诊单并向用户直报精确阻塞点。

### 2.2 Phase 2：解锁派发相（Unlock & Dispatch Phase）
- **触发条件**：Phase 1 验收合格，DAG 拓扑中下游依赖节点解锁（由 `LOCKED` 变为 `READY`）。
- **执行动作**：
  1. **强制线程隔离（Thread Isolation）**：
     - 调用 `coordinate_bots` 派发新任务时，**必须显式传递参数 `thread: "new"`** 与高辨识度标题 `title: "#<任务代号> <任务简述>"`；
     - **严禁**省略 `thread` 参数（避免默认回落到冲突的 `standing` 线程）。
  2. **自包含 5 要素 Brief 标准化下发**：
     - **[1. 目标专家与角色]**：明确 Bot ID 与责任边界；
     - **[2. 物理工作区与分支]**：明确仓库绝对路径与特性分支规范（如 `feat/task08-soak-telemetry`，严禁直推 `main`）；
     - **[3. 前序交付输入]**：注入上游 Phase 1 沉淀的接口契约、落盘文件路径与 PR 编号；
     - **[4. 边界约束与红线]**：明确禁止旁路篡改、生产零 Mock 等架构硬约束；
     - **[5. 物理 Done-When 凭证]**：定义可自动机判的退出码、测试套件清单与落盘文件。
  3. **台账同步与挂起（Durable Suspension）**：
     - 写入 `ACTIVE_DISPATCH_STATE.json`：将新节点状态置为 `DISPATCHED / RUNNING`，记录生成的子 `thread_id`；
     - 输出单行可视化进度广播，立即结束当前回合（End Turn），等待异步回调唤醒。

---

## 3. 防御性派发参数对账矩阵

| 场景 | `coordinate_bots` 参数组合 | 底层状态机响应 | 规范评级 |
| :--- | :--- | :--- | :---: |
| 上一任务刚完成，派发下游新任务 | `thread: "new"`, `rework: false` | 在全新隔离线程创建新 Assignment，无状态冲突 | **合规（推荐）** |
| 上一任务刚完成，直接调用默认线程 | `thread: "standing"` (默认), `rework: false` | 触发底层硬拦截 `already completed your assignment` | **违规（严禁）** |
| 上一任务验收不合格，要求原 Bot 修改 | `thread` 不变, `rework: true` | 原 Assignment 恢复为 RUNNING，就地纠偏 | **合规（重工）** |
| 上一任务完成，同回合对两人并行派发 | 对 Bot A 与 Bot B 均使用 `thread: "new"` | 双线程并发启动，拓扑分支并行展开 | **合规（并发）** |
