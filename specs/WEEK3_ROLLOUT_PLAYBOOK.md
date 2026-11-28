# OpenMausBot Micro-Loop v2.0 Week 3 全军三波灰度与运维手册 (WEEK3_ROLLOUT_PLAYBOOK)

> **单真源对齐**：本文档严格对齐冻结契约 `Harness-Runner-Kit/contracts/fleet-governance.schema.ts`、`config/fleet-registry.yaml` 与 `SPEC_WEEK3_FLEET_ROLLOUT.md`。
> **执行套件**：`C:\Users\frank\Documents\frank\Projects\Research\Harness-Runner-Kit`（统一入口 `bun run src/cli.ts <subcommand>`）
> **全军演进仓根路径**：`C:\Users\frank\Documents\frank\Projects\Research\OpenMausBot-Evolution-Store\<bot_id>`
> **单 Bot 隔离仓标准布局（6 目录 + 2 JSONL 账本）**：`candidates/`、`active/`、`deprecated/`、`evicted/`、`rolled_back/`、`snapshots/`（含 `lkg.latest.json`）+ `playbook.jsonl`、`telemetry.jsonl`。

---

## 1. 14-Bot 全军三波灰度清单与跨模型族盲审矩阵

所有 Bot 严格遵循异构跨模型族盲审硬红线（`producer_family !== reviewer_family`），同族或未知模型族在 `fleet-init` 阶段触发 `EXIT 2`、在 `blind-review` 阶段触发 `EXIT 30`（`BLOCKED_SAME_FAMILY`）物理拦截。

| 波次 (`rollout_wave`) | `bot_id` | 角色名称 | 领域 (`domain`) | 默认执行模型 (`default_model`) | Tier 2 跨族盲审模型 (`tier2_reviewer_model`) | 跨族校验路径 |
| :--- | :--- | :--- | :---: | :--- | :--- | :--- |
| **`wave1_canary`** | `software-architect` | 软件架构师 | Shared | `gemini-4-neon` | `claude-opus-5-5` | Google → Anthropic |
| **`wave1_canary`** | `fullstack-dev` | 全栈开发 | Shared | `gemini-3.8-flash` | `claude-sonnet-5-5` | Google → Anthropic |
| **`wave1_canary`** | `qa-engineer` | 测试质保员 | Shared | `gemini-3.8-flash` | `gpt-6.1-sol` | Google → OpenAI |
| **`wave1_canary`** | `code-reviewer` | 代码评审员 | Shared | `gemini-3.8-flash` | `claude-opus-5-5` | Google → Anthropic |
| **`wave2_core`** | `prompt-architect` | 提示词架构师 | Shared | `gemini-3.8-flash` | `claude-opus-5-5` | Google → Anthropic |
| **`wave2_core`** | `sre-devops` | 运维工程师 | Infra | `gemini-3.8-flash` | `claude-sonnet-5-5` | Google → Anthropic |
| **`wave2_core`** | `tpm-scheduler` | 项目调度员 | Shared | `gemini-3.8-flash` | `gpt-6.1-sol` | Google → OpenAI |
| **`wave2_core`** | `mausbot-chief` | MausBot | Shared | `gemini-3.8-flash` | `claude-opus-5-5` | Google → Anthropic |
| **`wave2_core`** | `docs-release` | 文档版本员 | Shared | `gemini-3.8-flash` | `gpt-6-luna` | Google → OpenAI |
| **`wave3_full`** | `cpo-strategist` | 产品战略师 | Shared | `gemini-4-hydrogen` | `claude-opus-5-5` | Google → Anthropic |
| **`wave3_full`** | `design-engineer` | 体验设计师 | App | `gemini-4-hydrogen` | `claude-sonnet-5-5` | Google → Anthropic |
| **`wave3_full`** | `intel-officer` | 技术与竞品情报官 | Shared | `gemini-3.8-flash` | `gpt-6.1-sol` | Google → OpenAI |
| **`wave3_full`** | `growth-ops` | 社媒运营官 | App | `gemini-3.8-flash` | `claude-sonnet-5-5` | Google → Anthropic |
| **`wave3_full`** | `reverse-analyst` | 逆向分析师 | Fulfill | `gemini-3.8-flash` | `claude-opus-5-5` | Google → Anthropic |

---

## 2. 三波灰度上线 SOP 与晋级门禁

统一在 `C:\Users\frank\Documents\frank\Projects\Research\Harness-Runner-Kit` 下执行：

### Phase 1: Wave 1 Canary Pilot（核心研发闭环 4 Bot）
```powershell
bun run src/cli.ts fleet-init --registry config/fleet-registry.yaml --wave wave1_canary
bun run src/cli.ts fleet-patrol --registry config/fleet-registry.yaml --wave wave1_canary
```
- **放量晋级门槛**：连续 72 小时零 `EXIT 99`（防篡改违纪）、零 `EXIT 30`（盲审同族穿透）、`fleet-patrol` 退出码为 `0` 且 7 天首通率回撤 `< 5%`。

### Phase 2: Wave 2 Core Governance（治理与调度中枢 5 Bot）
```powershell
bun run src/cli.ts fleet-init --registry config/fleet-registry.yaml --wave wave2_core
bun run src/cli.ts fleet-patrol --registry config/fleet-registry.yaml --wave wave2_core
```
- **放量晋级门槛**：连续 7 天零 `CRITICAL_ROLLBACK_OR_ERROR`（`EXIT 1`），`@运维工程师` 周度自动巡检成功产出报告且无未隔离故障。

### Phase 3: Wave 3 Full Rollout（全军 14 Bot 全量封板）
```powershell
bun run src/cli.ts fleet-init --registry config/fleet-registry.yaml
bun run src/cli.ts fleet-patrol --registry config/fleet-registry.yaml --out C:\Users\frank\Documents\frank\Projects\Research\OpenMausBot-Evolution-Store\patrol-latest.json
```
- **幂等保障**：重复执行 `fleet-init` 绝不覆盖已有的 `playbook.jsonl`、`telemetry.jsonl`、`active/` 技能或 `snapshots/lkg.latest.json`。

---

## 3. Tier 2 跨族盲审门禁操作规程 (`blind-review`)

当某 Bot 的 `candidates/<slug>/` 通过 `canary` 沙箱探针后，晋升 `active/` 前必须通过 Tier 2 跨族盲审：

```powershell
bun run src/cli.ts blind-review --input <review-input.json> [--out <result.json>]
```

- **同族与未知族硬拦截**：`detectModelFamily(producer_model)` 与 `detectModelFamily(reviewer_model)` 若任一为 `unknown` 或二者相等，直接输出 `verdict: "BLOCKED_SAME_FAMILY"` 并返回 **`EXIT 30`**（`SAME_FAMILY_BIAS_BLOCKED`）。
- **零身份泄露脱敏**：未提供 `reviewer_scores` 时输出 `verdict: "PACKET_READY_FOR_REVIEW"`（`EXIT 0`）与脱敏后的 `BlindReviewPacket`（剥离 `producer_bot_id` / `producer_model`，并将正文中残留标识替换为 `[REDACTED]`）。
- **四维确定性裁决门槛**：提供 `reviewer_scores`（字段严格为 `safety`、`generalizability`、`non_overfitting`、`cognitive_load` 与 `blocking_issues`）时：
  - `canary_exit_code === 0`；
  - `safety >= 4`（安全一票否决）；
  - `average(safety, generalizability, non_overfitting, cognitive_load) >= 4.0`；
  - `blocking_issues.length === 0`。
  - 全部满足输出 `verdict: "APPROVE"`（`EXIT 0`）；任一不满足输出 `verdict: "REJECT"`（`EXIT 1`）。

---

## 4. 周度自动巡检与 ≤30 秒应急止血回滚 SOP

### 4.1 自动化巡检调度（已配置生效）
- **调度任务**：`OpenMausBot 全军微循环每周回归巡检与自愈`（责任 Bot：`@运维工程师`）
- **执行周期**：每周日北京时间 `03:00`（`0 3 * * 0`）
- **输出报告**：`C:\Users\frank\Documents\frank\Projects\Research\OpenMausBot-Evolution-Store\patrol-latest.json`
- **健康态与告警路由**：
  - `HEALTHY`（`EXIT 0`）：全军 14 Bot 正常，静默落盘零打扰。
  - `DEGRADED_ACTION_TAKEN`（`EXIT 0`）：存在 30 天闲置淘汰（`evicted/`）或单技能 Canary 二振降级（`deprecated/`），系统已自动自愈，附简要摘要。
  - `CRITICAL_ROLLBACK_OR_ERROR`（`EXIT 1`）：发生 7 天窗口回归自动回滚（`rolled_back/`）或仓读写异常，立即推送高优告警并抄送 `@软件架构师`。

### 4.2 单 Bot 人工紧急回滚与 GC 执行
当需对单个异常 Bot 立即执行资产清理或回滚至 LKG 快照（SLA ≤ 30 秒）时：
```powershell
bun run src/cli.ts gc `
  --ledger C:\Users\frank\Documents\frank\Projects\Research\OpenMausBot-Evolution-Store\<bot_id>\telemetry.jsonl `
  --store C:\Users\frank\Documents\frank\Projects\Research\OpenMausBot-Evolution-Store\<bot_id> `
  --playbook C:\Users\frank\Documents\frank\Projects\Research\OpenMausBot-Evolution-Store\<bot_id>\playbook.jsonl
```
- **回滚触发条件**：7 天窗口内样本数 `>= 5` 且首通率较基线下降 `>= 5%`，或归一化单任务 Token 涨幅 `>= 25%`。
- **回滚效果**：自动对照 `snapshots/lkg.latest.json`，将所有非 LKG 新增技能原子移出 `active/` 并归档至 `rolled_back/`，确保生产态秒级恢复至已知最佳基线。

### 4.3 灾难熔断（EXIT 99 / 全军隔离）
1. **触发 `EXIT 99`（防篡改红线）**：立即冻结涉事分支，保留现场哈希比对证据，升级 `@软件架构师` 与 `@代码评审员` 审计。
2. **故障隔离保障**：`fleet-patrol` 对 14 个 Bot 实行逐仓异常隔离，单个 Bot 演进仓损坏仅记录该 Bot `errors[]` 并将全局 verdict 置为 `CRITICAL_ROLLBACK_OR_ERROR`（`EXIT 1`），绝不中断其余 13 个 Bot 的正常巡检与自愈。