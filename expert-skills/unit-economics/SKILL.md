---
name: unit-economics
description: "产品与商业官按需加载的确定性 Token+MoR 边际成本核算、严格全量 user_id P95 重度客压测、DuckDB/SQL 量化与 DiD 因果增量工具。"
---

# Deterministic Unit Economics & DuckDB Quant (`unit-economics`)

## When to Use
- 核算单次任务/单用户 LLM Token + 基础设施 + 代理 + 支付/MoR 抽佣 + 退款损耗的真实毛利率，并对无限量/买断定价执行 P95/P99 重度用户倒挂压测。
- 复盘 MRR 四拆解（含 OPC `0->1` 首月 `beginning_mrr=0` 冷启动）、`NDR` 与 `CAC Payback`。
- 用双重差分 (DiD) 检验功能/定价变更的因果增量（支持配对差值与四项独立方差标准误）。

## Excluded When (DO NOT)
- **DO NOT** 由大模型心算或估算收入、抽佣、Token 成本与毛利率（避免浮点幻觉与口径漂移；一律运行 `data_sql` 或 `scripts/unit_economics.py`）。
- **DO NOT** 在启用 `--strict-p95` 时允许缺漏 `user_id` 行（只要有 1 行缺失或无用户记录，必须 fail-closed 拦截 `EXIT 2 SPEC_INVALID`，严禁回退全局毛利）。
- **DO NOT** 在未通过 `by_user` P95 重度客毛利压测（`p95_heavy_user_margin_pct >= 60%`）前批准“无限量包月”或“一次性终身买断”（避免亏损倒挂）。
- **DO NOT** 漏计 Stripe（`2.9%+$0.30`）或 MoR（`5%+$0.50`）通道费与退款净损。

## 1. 核心公式与三级毛利熔断阈值
- **Net Revenue**：`Revenue - Refund_Loss`
- **Total Cost**：`Cost_LLM + Cost_Infra + Cost_Proxy + Payment_Fee`（支持显式 `payment_fee_usd` 或按 `payment_provider: stripe|mor` 自动核算）
- **Task / User Gross Margin**：`(Net_Revenue - Total_Cost) / Net_Revenue`
  - `GREEN (>= 75%)`：标态放行；`YELLOW (60%–75%)`：路由降档 + KV Cache 优化；`RED (< 60%)`：商业熔断（`EXIT 1`）。
- **严格 P95 重度客压测 (`--strict-p95`)**：要求输入所有行均具有有效 `user_id`；若存在缺失行或无用户记录直接 `EXIT 2`；若有效用户 P95 毛利 `< 60%` 触发 `EXIT 1 RED`。
- **OPC 首月冷启动 (`mrr`)**：`beginning_mrr == 0` 且 `new_mrr > 0` 返回 `COLD_START_M0`（`ndr_pct: null`，`EXIT 0`，除非 `Payback > 6m` 触发 `EXIT 1`）。
- **DiD 标准误**：默认四方差；传 `"paired": true` / `--paired` 时使用配对差值方差。

## 2. 确定性脚本与 Reasoning-First 输出契约
```bash
python scripts/unit_economics.py margin --input <ledger.json> [--strict-p95]
python scripts/unit_economics.py mrr --input <saas_metrics.json>
python scripts/unit_economics.py did --input <ab_cohort.json> [--paired]
```
- **退出码**：`0` (`GREEN`/`YELLOW`/`COLD_START_M0`/`PASS`)、`1` (`RED_BREACH`：全局或 P95 毛利 `< 60%` / `Payback > 6m` / `NDR < 100%`)、`2` (`SPEC_INVALID`)。
- **LLM 商业汇报结构**（`strict: true`, `additionalProperties: false`）：`reasoning -> metrics -> verdict -> action`。

## Verification
运行 `pytest tests/test_phase1_skills.py -k unit_economics` 全绿：验证 MoR 抽佣扣减、`--strict-p95` 缺 `user_id` 拦截 `EXIT 2`、重度客倒挂拦截 `EXIT 1` 与冷启动。
