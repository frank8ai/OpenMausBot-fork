---
name: opc-legal-finance
description: "产品与商业官低频按需加载的一人公司 (OPC) 法务财务合规技能：ToS/隐私协议草拟、Stripe/MoR 按单聚合对账、超期在途拦截与零收款拒付风控。"
---

# OPC Legal Drafting, MoR Reconciliation & Dispute Pack (`opc-legal-finance`)

## When to Use
- 上线或改版 SaaS，草拟/更新 ToS、隐私政策 (GDPR/CCPA)、AUP 与退款条款。
- 按月对账 Stripe / Polar / Lemon Squeezy (MoR) **事件级流水**与内部账本，严格执行超期在途拦截与零收款分母风控。
- 收到 `charge.dispute.created` 拒付争议，按 `evidence_due_by` 硬截止期归集 CE3.0 申诉举证包。

## Excluded When (DO NOT)
- **DO NOT** 由 LLM 执行真实资金划转、代扣代退、申报税务或代签合同（交付物仅作草案，必须由 Leon 终审签字）。
- **DO NOT** 在无有效 `--cutoff-date` 结算窗或超期时将未入账订单放行（超期在途强制标记 `overdue_in_transit_orders` 触发 `EXIT 1 RED`）。
- **DO NOT** 在收款订单为零（`charge_count == 0`）时将拒付率计算为 `0.0` 假绿（存在拒付必须报 `RECONCILIATION_ALERT EXIT 1 RED`，存在退款至少 `YELLOW`）。
- **DO NOT** 暴露完整卡号、银行账号、私钥或未脱敏 PII。

## 1. 对账状态机与三大闭环工作流
- **S1 [ToS / Privacy / AUP 草案]**：明确运营主体/MoR 代理税务方、子处理器清单、数据删除 SLA (`<= 30d`) 与退款窗口。
- **S2 [事件级按单聚合对账]**：
  - 行级恒等式：`gross_usd - refund_usd - chargeback_usd - fee_usd - dispute_fee_usd - tax_usd == net_usd`（容差 `<= $0.01`，计入 `$15` `dispute_fee_usd`）。
  - 单级聚合：按 `order_id` 汇总 `charge` 事件 `gross_usd` 与账本比对；`charge_count` 仅计去重收款单数。
  - 月底在途严格验真：仅当传 `--cutoff-date` 且订单 `order_date` 为严格合法 ISO YYYY-MM-DD 且在 `cutoff - settlement_days` 窗口内才豁免为 `in_transit_orders`；字段别名冲突（如 `order_date` 与 `ORDER_DATE`）严格 Fail-Closed；超期/脏数据/格式不合规一律记入 `overdue_in_transit_orders` 阻断 `EXIT 1 RED`。
  - 零分母拒付拦截：`charge_count == 0` 且有 dispute 时 `chargeback_rate_pct = None` 且报 `RED EXIT 1`；仅有退款时报 `YELLOW`。
- **S3 [拒付申诉 SLA 与 CE3.0 举证]**：优先锁定 `evidence_due_by`；区分 Fraud（CE3.0 举证）与 Service 争议链。

## 2. 确定性脚本与 Reasoning-First 输出契约
```bash
python scripts/reconcile_mor.py --payouts <mor_events.json> --orders <internal_orders.json> [--cutoff-date YYYY-MM-DD] [--settlement-days 7]
```
- **退出码**：`0` (`BALANCED_GREEN`/`BALANCED_WARN`)、`1` (`RECONCILIATION_ALERT`)、`2` (`SPEC_INVALID`)。
- **LLM 交付结构**（`strict: true`, `additionalProperties: false`）：`reasoning -> reconciliation_summary -> risk_tier -> human_signoff_actions`。

## Verification
运行 `pytest tests/test_phase1_skills.py -k opc_legal_finance` 全绿：验证超期在途拦截、零收款拒付/退款阻断、多事件聚合与 `$15` 罚金扣减。
