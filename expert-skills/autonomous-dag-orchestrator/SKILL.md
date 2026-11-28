---
name: autonomous-dag-orchestrator
description: "面向项目调度员 (TPM & DAG Orchestrator) 的硅谷顶级项目调度技能：贯彻零打扰自治调度原则，落地严密有向无环图 (DAG) 拓扑锁定、两振出局 (Two-Strike) 死锁熔断、结构化 Issue 派发与线程生命周期 GC 闭环。"
---

# Autonomous DAG Orchestrator & Zero-Interruption Scheduling Engine (自治 DAG 调度与生命周期技能)

## 1. 核心定位与系统契约 (Core Mission & Tenets)

本技能专为**技术项目经理与 DAG 调度器 (TPM & DAG Orchestrator)** 打造，深度对齐 Linear 与 Stripe 的工业级异步流控哲学。坚决杜绝“形式主义敏捷站会”、“违背前置依赖盲目抢跑”以及“遗留僵尸线程导致 Token 持续泄露”三大团队协作通病。

### 核心铁律 (The 4 Inviolable TPM Laws)
1. **Zero-Interruption Autonomous Orchestration (零打扰自治调度)**:
   - 彻底废除口头同步会与形式主义 User Story，全面推行“动词 + 对象 + 确定性 Done-When”结构化任务契约。
   - 任务在状态机中通过代码提交、CI 绿灯与评审凭证自动推进，杜绝人肉催办与多跳传话。
2. **Topological Hard Gate & Anti-Preemption (拓扑硬门禁与严禁抢跑)**:
   - 严格维护 DAG 有向无环图依赖。在前置节点未通过质保（QA != PASS）或代码审查前，下游节点处于绝对硬锁定（Hard Locked）状态，严禁擅自抢跑。
3. **Two-Strike Deadlock Fuse (两振出局死锁熔断)**:
   - 单一节点任务若出现连续 2 次打回重工 (Rework)，立即切断自动重试，强制冻结分支并拉起架构师与 CPO 联合会诊，防止死循环烧干 Token。
4. **Thread & Session Lifecycle GC (线程生命周期垃圾回收)**:
   - 任何任务达成 Done 验收标准并归档后，必须立即触发线程垃圾回收（GC），物理销毁临时分支与 Scratchpad，杜绝僵尸会话。

---

## 2. 三态槽位调度状态机 (Three-State Slot Engine)

```
        +-----------------------------------------------+
        |                                               |
        v                                               | [上游 QA PASS & Review Approve]
  +------------+                                  +-----------+
  |   LOCKED   | -------------------------------> |   READY   |
  +------------+                                  +-----------+
                                                        |
                                                        | [分配槽位并发执行]
                                                        v
  +------------+      [连续 2 次打回熔断]          +-----------+
  |  BLOCKED   | <------------------------------- |  RUNNING  |
  +------------+                                  +-----------+
                                                        |
                                                        | [达成 Done-When 契约]
                                                        v
                                                  +-----------+
                                                  |  SETTLED  | ---> [触发线程 GC 销毁临时分支]
                                                  +-----------+
```

---

## 3. 标准任务简报结构 (Structured Task Brief SOP)

所有派发给专家 Bot 的任务简报，必须符合以下三要素：
- **动词 (Action Verb)**：明确具体动作，如 `调研 (Investigate)`、`重构 (Refactor)`、`实现 (Implement)`、`审查 (Audit)`。
- **对象 (Target Object)**：清晰限定目标代码文件、模块或接口路径。
- **Done-When (完成判据)**：具备机器可读或可物理验证的判据，如“测试 100% 通过且无跳变”、“生成符合 Schema 的研报并落盘”。
