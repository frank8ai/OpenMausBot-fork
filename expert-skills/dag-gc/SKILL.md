---
name: dag-gc
description: "MausBot首席幕僚长专属 DAG 依赖拓扑调度、超时与两振死锁熔断及线程生命周期 GC 规约。适用于多 Bot 派单校验、Ring 3 防误派与已结案线程回收。"
---

# DAG Dependency Gate, Two-Strike Fuse & Thread GC (`dag-gc`)

## When to Use
- 编排跨 Bot 多步骤任务、校验 `PLAN_DAG` 拓扑无环、验证前置 `done_when` 物理契约。
- 某执行节点连续 `2` 次失败/打回或运行超时（`elapsed_sec > timeout_sec`），触发熔断升级。
- 任务结案 (`SETTLED`) 或闲置超时，审计并回收僵尸线程（同时保护人工审批中与常驻线程）。

## Excluded When (DO NOT)
- **DO NOT** 由幕僚长下场直接编写业务代码或篡改冻结契约（写码仅限 `全栈开发` Single-Writer，防止多写者分支污染）。
- **DO NOT** 在工作流中自动派单或广播给 Ring 3 飞地 `首席科学家与基础理论架构师` (`90bfa817`)（防止破坏科研飞地零启动税）。
- **DO NOT** 在对话中直接读取 `> 40` 行的原始终端/CI 日志（防止上下文滚雪球膨胀；须重定向落盘仅读 `<= 600` tokens ErrorCapsule）。
- **DO NOT** 在线程 GC 中误杀 `WAITING_HUMAN`（等待 Leon 决策）或 `standing`（常驻协同）线程。

## 1. 状态机与结构化派单契约
- **FSM**：`LOCKED -> READY -> RUNNING -> WAITING_HUMAN -> SETTLED | BLOCKED`
  - `WAITING_HUMAN`：挂起等待人类签发，**豁免闲置 TTL 回收**；
  - `SETTLED`：`60s` 内回收临时线程；`BLOCKED`：触发两振/超时架构升级。
- **结构化 Brief 三要素**（缺一拒收，`EXIT 2`）：
  1. **Action Verb**（8 动词与脚本严格单源对齐）：`investigate | specify | implement | test | audit | deploy | document | reconcile`
  2. **Target Object**：精确目录、分支或契约路径
  3. **Done-When**：机器可校验退出条件（命令 + 预期退出码 + 落盘路径）

## 2. 两振/超时熔断与线程卫生铁律
1. **Two-Strike & Timeout Fuse (`EXIT 20`)**：同一节点 `rework_count >= 2` **或** `elapsed_sec > timeout_sec`（默认 `900s`），立即停止重试、冻结分支并升级 `@软件架构师`（技术根因）或 `@产品与商业官`（范围裁剪）。
2. **Thread Hygiene**：新独立任务开新线程（`thread="new"`）；同任务返工必须复用原线程；GC 仅回收非 `WAITING_HUMAN` 且非 `standing` 的 `SETTLED`/超 TTL 线程。
3. **边缘反例**：闲置 `48h` 但状态为 `WAITING_HUMAN` 或标记 `standing: true` 的线程 → GC 审计必须豁免（`exempted`），绝不可列入 `gc_candidates`。

## 3. 确定性门禁脚本与 Reasoning-First 输出契约
```bash
python scripts/dag_gate.py validate --dag <plan_dag.json>
python scripts/dag_gate.py gc-audit --threads <threads.json> --ttl-hours 24
```
- **退出码**：`0` (`PASS`)、`2` (`SPEC_INVALID`：成环/非法动词/缺 `done_when`/含 `90bfa817`)、`20` (`FREEZE_TWO_STRIKE`：两振或 `elapsed_sec > timeout_sec` 超时熔断)。
- **LLM 调度摘要**（`strict: true`, `additionalProperties: false`）：字段序 `reasoning -> dag_verdict -> blocked_or_gc_actions`。

## Verification
运行 `pytest tests/test_phase1_skills.py -k dag_gc` 全绿：验证 8 动词对齐、成环/`90bfa817` 拦截 `EXIT 2`、两振与超时 `EXIT 20` 及 `WAITING_HUMAN`/`standing` 线程 GC 豁免。详见 [references/brief-contract.md](references/brief-contract.md)。
