-- DuckDB SQL Queries for OpenMausBot `data_sql` & CLI (v2.0: MoR Fees + Refund Loss + P95 Heavy-User Stress Test)

-- 1. True Net Gross Margin by Bot & Model (including Payment/MoR Fees & Refund Loss)
SELECT
  bot_name,
  model,
  COUNT(*) AS tasks,
  ROUND(SUM(revenue_usd - COALESCE(refund_loss_usd, 0)), 2) AS net_revenue_usd,
  ROUND(SUM((uncached_input_tokens / 1e6) * price_in_per_1m
          + (cached_input_tokens / 1e6) * price_cache_per_1m
          + (output_tokens / 1e6) * price_out_per_1m
          + COALESCE(infra_usd, 0) + COALESCE(proxy_usd, 0)
          + COALESCE(payment_fee_usd, 0)), 2) AS total_cost_usd,
  ROUND(100.0 * (
    SUM(revenue_usd - COALESCE(refund_loss_usd, 0))
    - SUM((uncached_input_tokens / 1e6) * price_in_per_1m
        + (cached_input_tokens / 1e6) * price_cache_per_1m
        + (output_tokens / 1e6) * price_out_per_1m
        + COALESCE(infra_usd, 0) + COALESCE(proxy_usd, 0)
        + COALESCE(payment_fee_usd, 0))
  ) / NULLIF(SUM(revenue_usd - COALESCE(refund_loss_usd, 0)), 0), 2) AS gross_margin_pct
FROM usage_ledger
GROUP BY 1, 2
ORDER BY total_cost_usd DESC;

-- 2. Heavy-User P95 / P99 Margin Inversion Stress Test (Required before Unlimited/Lifetime Pricing)
WITH user_rollup AS (
  SELECT
    user_id,
    SUM(revenue_usd - COALESCE(refund_loss_usd, 0)) AS net_rev,
    SUM((uncached_input_tokens / 1e6) * price_in_per_1m
      + (cached_input_tokens / 1e6) * price_cache_per_1m
      + (output_tokens / 1e6) * price_out_per_1m
      + COALESCE(infra_usd, 0) + COALESCE(proxy_usd, 0)
      + COALESCE(payment_fee_usd, 0)) AS total_cost
  FROM usage_ledger
  WHERE user_id IS NOT NULL
  GROUP BY user_id
),
user_margins AS (
  SELECT
    user_id,
    net_rev,
    total_cost,
    CASE WHEN net_rev > 0 THEN 100.0 * (net_rev - total_cost) / net_rev ELSE -100.0 END AS margin_pct
  FROM user_rollup
)
SELECT
  COUNT(*) AS user_count,
  ROUND(QUANTILE_CONT(margin_pct, 0.05), 2) AS p95_heavy_user_margin_pct,
  ROUND(QUANTILE_CONT(margin_pct, 0.01), 2) AS p99_heavy_user_margin_pct,
  SUM(CASE WHEN margin_pct < 60.0 THEN 1 ELSE 0 END) AS below_60_users,
  SUM(CASE WHEN margin_pct < 0.0 THEN 1 ELSE 0 END) AS negative_margin_users
FROM user_margins;
