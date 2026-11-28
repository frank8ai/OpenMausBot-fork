---
name: micro-loop-v2-governance
description: OpenMausBot 全军 14 Bot 挂载的确定性双阶四环微循环 v2.0 操作协议与退出码治理契约。
---

# Micro-Loop v2 Governance (双阶四环确定性微循环协议)

## 1. 核心拓扑与演进仓标准布局
- **Kit 执行套件**：`C:\Users\frank\Documents\frank\Projects\Research\Harness-Runner-Kit`（统一通过 `bun run src/cli.ts <subcommand>` 执行）
- **演进仓隔离根路径**：`C:\Users\frank\Documents\frank\Projects\Research\OpenMausBot-Evolution-Store\<bot_id>`
- **标准物理布局（6 子目录 + 2 JSONL 账本）**：
  - 目录：`candidates/`（候选规则）、`active/`（生产生效）、`deprecated/`（探针失败降级）、`evicted/`（30 天闲置淘汰）、`rolled_back/`（7 天回归回滚）、`snapshots/`（快照基线，含 `lkg.latest.json` 与历史快照）。
  - 账本：`playbook.jsonl`（摩擦结晶账本）、`telemetry.jsonl`（执行遥测明细）。严禁私设虚构目录。

## 2. 四步确定性微循环协议 (FSM: LOCK -> RUN -> DISTILL -> CANARY)

### Step 1: `lock`（契约与测试物理冻结）
- **命令**：`bun run src/cli.ts lock --spec <task-spec.yaml>`
- **动作**：计算 `immutable_paths` 与测试清单 SHA-256 并回填 spec，生成不可变防篡改基线。

### Step 2: `run`（三级阶梯验证 + 假绿防御 + ≤600 Token ErrorCapsule）
- **命令**：`bun run src/cli.ts run --spec <task-spec.yaml> --attempt <1|2> [--model-tier fast_executor|strong_reasoner]`
- **阶梯**：`L0（语法/Schema）→ L1（类型/单测）→ L2（集成/E2E）` 严格 Fail-Fast，任一阶梯失败立即阻断。
- **假绿防御**：严格校验命令退出码 `0`、命中 `required_stdout_patterns` 且不命中 `forbidden_output_patterns`；禁止伪绿。
- **报错胶囊**：失败提取 ≤600 tokens 关键上下文（堆栈、触发文件与行号、最小差异），严禁倾倒全量日志。

### Step 3: `distill`（Rule of 2 热结晶状态机）
- **命令**：`bun run src/cli.ts distill --input <friction.json> --store <bot-store-dir> [--playbook <path>]`
- **Strike 1**：根因首次出现仅追加至 `playbook.jsonl`（`OBSERVED_MEMORY`），不变更生产规则。
- **Strike 2**：`playbook.jsonl` 30 天 TTL 内同指纹累计 `occurrences >= 2` 晋升为 `CANDIDATE`，原子写入 `candidates/<slug>/`。

### Step 4: `canary` + `blind-review`（沙箱探针、跨族盲审与 LKG 锚定）
- **探针命令**：`bun run src/cli.ts canary --slug <slug> --store <bot-store-dir> [--snapshot-lkg]`
- **准入动作**：独立沙箱重放探针（Exit 0）并通过跨族盲审后迁入 `active/`（同时留存 `snapshots/lkg.latest.json`）；`active/` 探针连续 2 次失败降级至 `deprecated/`。

## 3. 全军盲审、巡检与治理指令
- **Tier 2 跨模型族盲审**：`bun run src/cli.ts blind-review --input <review-input.json> [--out <out.json>]`
  - 严禁同模型族自审或未知模型族（直接返回 `EXIT 30` 物理拦截）；盲审包零身份泄露；裁决门槛：`canary_exit_code === 0`、`safety >= 4`、`avg(safety, generalizability, non_overfitting, cognitive_load) >= 4.0` 且 `blocking_issues.length === 0` 时返回 `APPROVE`（`EXIT 0`），否则 `REJECT`（`EXIT 1`）。
- **全军仓幂等初始化**：`bun run src/cli.ts fleet-init --registry config/fleet-registry.yaml [--root <dir>] [--wave <wave>]`
- **周期巡检与自动自愈**：`bun run src/cli.ts fleet-patrol --registry config/fleet-registry.yaml [--root <dir>] [--wave <wave>] [--out <report.json>]`
- **资产淘汰与 LKG 回滚**：`bun run src/cli.ts gc --ledger <telemetry.jsonl> --store <bot-store-dir> [--playbook <path>]`
  - 统一执行 30 天闲置淘汰（迁入 `evicted/`），并在 7 天窗口首通率下跌 ≥5%（样本 ≥5）或归一化 Token 飙升 ≥25% 时 ≤30s 自动回滚至 LKG（非 LKG 资产迁入 `rolled_back/`）。

## 4. 全军统一 7 大退出码硬纪律
| 退出码 | 常量定义 | 触发语义 | 处置动作 |
| :---: | :--- | :--- | :--- |
| `0` | `PASS / APPROVE` | 全阶测试绿灯、Canary 晋升、盲审 `APPROVE`、巡检 `HEALTHY` 或 `DEGRADED_ACTION_TAKEN` | 准予合入或进入下游调度 |
| `1` | `FAIL_RETRYABLE / REJECT` | 单测失败、Canary 首败、盲审 `REJECT`、巡检 `CRITICAL_ROLLBACK_OR_ERROR` | 提取 ErrorCapsule 升档重试或触发告警 |
| `2` | `SPEC_INVALID` | `task-spec.yaml` / 注册表 Schema 破损或同族配置非法 | 拒收任务，退回签发方修正契约 |
| `20` | `FREEZE_TWO_STRIKE` | 连续 2 次执行失败（两振熔断） | 立即硬冻结分支，向 `@软件架构师` 提交现场包 |
| `21` | `FREEZE_BUDGET_EXCEEDED` | 单阶段耗时超 300s 阈值或超出 Token 预算 | 立即终止子进程并汇报资源瓶颈 |
| `30` | `BLOCKED_SAME_FAMILY` | Tier 2 盲审同模型族偏见或未知模型族 | 物理拦截，调度器重新路由异构跨族模型 |
| `99` | `FREEZE_CHEAT_DETECTED` | 篡改只读测试、契约哈希不匹配、注入未跟踪篡改文件 | 绝对红线！立即停机、废弃分支、升级架构师 |