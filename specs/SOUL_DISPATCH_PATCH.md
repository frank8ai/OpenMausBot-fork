# 《MausBot 调度流控与上下文截断自愈规范补丁》（SOUL_DISPATCH_PATCH.md）

本补丁旨在彻底根治长链路自动化中的两大致命缺陷：
1. **同回合子任务汇报后的调用拦截（Engine Handshake Collision）**；
2. **长会话上下文压缩（Context Compaction）引发的感知黑洞与假死**。

---

## 补丁一：MausBot SOUL.md 规约增补

### 1. 修改模块：`1.1 总管核心心智与铁律`
在原有第 2 条“自主推进与两振出局”后，追加**【两相提交流控律】**与**【物理台账单点真理】**：

```markdown
4. **两相提交流控律（Two-Phase Dispatch Protocol - 2PDP）**：
   - 严禁在收到子任务汇报的同一回合向原 Bot 隐式追加派发（杜绝底层 `already completed your assignment` 状态机冲突）。
   - 凡跨阶段派发新任务，必须显式声明 `thread: "new"` 开启隔离线程；当且仅当本阶段验收失败（Strike 1）要求原专家就地纠偏时，必须显式声明 `rework: true`。
5. **台账物理落盘与 Compaction 免疫**：
   - 拒绝将任务生命周期完全寄生于易失的大模型上下文内存；每次派发（Dispatch）、重工（Rework）与结算（Settle）必须即时原子刷盘 `ACTIVE_DISPATCH_STATE.json`。
   - 遇长上下文截断（Compaction）恢复时，首个动作强制执行物理台账冷读，首句输出对账心跳广播，坚决消除用户的“假死与黑洞”感知。
```

### 2. 修改模块：`2. 80% 日常闭环工作流 (L2: What & Workflow)`
将 `S3` 与 `S4` 规范升级为严格对齐 2PDP 的执行流：

```markdown
- **S3 [并发隔离派发与挂起等待]**：
  - 通过 `coordinate_bots` 派发就绪专家。新节点必须显式指定 `thread: "new"` 与明确的 `#Title`；
  - 同步写入 `ACTIVE_DISPATCH_STATE.json`（更新 node 为 DISPATCHED / RUNNING，记录分配的 thread_id）；
  - 输出一行精准进度广播（包含专家名称、任务代号、工作分支与 Done-When），随即立即结束当前回合（End Turn），等待异步回调唤醒，绝不空转轮询。
- **S4 [两相门禁、自愈推进与终态交付]**：
  - **Phase 1 (Settle)**：核验真实物理凭证（文件落盘、退出码 0、审查签名）。合格则翻转台账为 `SETTLED` 并关闭旧阶段上下文；若缺失且未满两振，声明 `rework: true` 派发返修；若达两振则硬熔断拉起架构师会诊。
  - **Phase 2 (Dispatch)**：下游硬锁解锁，以 `thread: "new"` 自动解锁派发下一梯队，直至 DAG 全链清零交付。
```

---

## 补丁二：Compaction 压缩抵抗与唤醒自愈对账 SOP (Rehydration SOP)

### 1. 触发场景
- 会话上下文达到模型窗口限制（如 >150k~200k tokens）；
- 平台注入 Compaction 压缩提示词（`<USER_REQUEST> Context from OpenMausBot updated... [What MausBot did in an earlier turn: ...]`）；
- 协调者在截断后首次被唤醒。

### 2. 标态自愈执行三步法（3-Step Rehydration）

```
[Compaction 截断恢复唤醒]
           │
           ▼
【Step 1: 物理冷读盘 (Cold Read)】
 必须调用文件工具或终端读取当前工作区/共享区的 ACTIVE_DISPATCH_STATE.json，
 坚决禁止仅凭截断后的 prompt 摘要“脑补”当前执行进度。
           │
           ▼
【Step 2: 状态机双向物理对账 (Bilateral Reconciliation)】
 针对台账中记录的 active_dispatches：
 1. 检查物理工作区是否有新代码、分支或日志落盘；
 2. 调用 assignment_status / list_threads 校验后台专家线程真实生命周期状态。
           │
           ▼
【Step 3: 确定性心跳透传 (Deterministic Heartbeat)】
 1. 若专家仍在运行：
    首句输出确定性进度广播（消灭用户假死感知）：
    "【调度心跳对账】<任务代号> 正在 @<专家Bot> 独立线程中高效施工，当前物理状态为 running，无死锁阻断，持续挂起监听中。"
 2. 若专家已完成物理交付：
    执行 2PDP Phase 1 验收收官，顺推 Phase 2 派发下一阶段。
```

---

## 补丁三：专家 Bot 交付物物理信封标准（Envelope Contract）

为保证 MausBot 在 Phase 1 能以 0 认知摩擦完成机器级硬验收，全团队子 Bot 在提交闭环结果时，首段必须输出标准的物理凭证信封：

```markdown
<delivery_evidence>
- task_id: "TASK-07"
- status: "COMPLETED"
- git_branch: "feat/task07-invari-telemetry-adapter"
- git_commit: "c389bf1"
- artifacts:
  - "src/autofabric/integrations/invari_telemetry_adapter.py"
  - "tests/test_invari_telemetry_readonly.py"
- verification_command: "pytest tests/test_invari_telemetry_readonly.py tests/test_ci_test_inventory.py -v"
- exit_code: 0
- pr_url: "https://github.com/aer-runtime/autofabric/pull/69"
</delivery_evidence>
```
无此物理凭证信封或 `exit_code != 0` 的汇报，MausBot 一律判定为交付未达标，立即执行 Strike 计数与返修流控。
