#!/usr/bin/env python3
"""Deterministic Unit Economics, MRR/NDR, and DiD Causal Lift calculator (DuckDB or stdlib SQLite)."""
from __future__ import annotations

import argparse
import json
import math
import sqlite3
import sys
from collections import defaultdict
from pathlib import Path


def run_margin(path: Path, strict_p95: bool = False) -> tuple[int, dict]:
    records = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(records, list) or not records:
        return 2, {"status": "SPEC_INVALID", "error": "input must be a non-empty JSON array"}

    # Load into DuckDB if available, else deterministic SQLite in-memory SQL ledger
    engine = "sqlite3"
    try:
        import duckdb  # type: ignore
        con = duckdb.connect(":memory:")
        engine = "duckdb"
    except ImportError:
        con = sqlite3.connect(":memory:")

    con.execute(
        "CREATE TABLE ledger (task_id TEXT, user_id TEXT, model TEXT, revenue DOUBLE, "
        "refund_loss DOUBLE, payment_fee DOUBLE, uncached_in DOUBLE, cached_in DOUBLE, "
        "out_tok DOUBLE, p_in DOUBLE, p_cache DOUBLE, p_out DOUBLE, infra DOUBLE, proxy DOUBLE)"
    )

    user_records: dict[str, list[dict]] = defaultdict(list)
    has_user_id = False
    missing_user_id_rows = 0
    invalid_user_id_rows = 0

    for r in records:
        raw_uid = r.get("user_id")
        if raw_uid is None:
            uid = ""
            missing_user_id_rows += 1
        elif isinstance(raw_uid, bool) or not isinstance(raw_uid, (str, int)):
            uid = ""
            invalid_user_id_rows += 1
        else:
            uid = str(raw_uid).strip()
            if not uid:
                missing_user_id_rows += 1
            else:
                has_user_id = True

        rev = float(r.get("revenue_usd", 0.0))
        ref_loss = float(r.get("refund_loss_usd", 0.0))

        if "payment_fee_usd" in r:
            p_fee = float(r["payment_fee_usd"])
        elif "payment_provider" in r:
            prov = str(r["payment_provider"]).strip().lower()
            if prov == "stripe":
                p_fee = rev * 0.029 + 0.30
            elif prov in ("mor", "polar", "lemon_squeezy"):
                p_fee = rev * 0.05 + 0.50
            else:
                p_fee = 0.0
        else:
            p_fee = 0.0

        con.execute(
            "INSERT INTO ledger VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (
                str(r.get("task_id", "")),
                uid,
                str(r.get("model", "unknown")),
                rev,
                ref_loss,
                p_fee,
                float(r.get("uncached_input_tokens", 0.0)),
                float(r.get("cached_input_tokens", 0.0)),
                float(r.get("output_tokens", 0.0)),
                float(r.get("price_in_per_1m", 0.0)),
                float(r.get("price_cache_per_1m", 0.0)),
                float(r.get("price_out_per_1m", 0.0)),
                float(r.get("infra_usd", 0.0)),
                float(r.get("proxy_usd", 0.0)),
            ),
        )

        if uid:
            user_records[uid].append({
                "rev": rev,
                "ref_loss": ref_loss,
                "p_fee": p_fee,
                "llm_cost": (
                    (float(r.get("uncached_input_tokens", 0.0)) / 1e6) * float(r.get("price_in_per_1m", 0.0))
                    + (float(r.get("cached_input_tokens", 0.0)) / 1e6) * float(r.get("price_cache_per_1m", 0.0))
                    + (float(r.get("output_tokens", 0.0)) / 1e6) * float(r.get("price_out_per_1m", 0.0))
                ),
                "other_cost": float(r.get("infra_usd", 0.0)) + float(r.get("proxy_usd", 0.0)),
            })

    if strict_p95 and (not has_user_id or not user_records or missing_user_id_rows > 0 or invalid_user_id_rows > 0):
        return 2, {
            "status": "SPEC_INVALID",
            "error": "strict_p95 requires valid non-empty scalar (str/int) user_id on all ledger rows",
            "missing_user_id_rows": missing_user_id_rows,
            "invalid_user_id_rows": invalid_user_id_rows,
            "total_rows": len(records),
        }

    row = con.execute(
        "SELECT COALESCE(SUM(revenue),0), "
        "COALESCE(SUM(refund_loss),0), "
        "COALESCE(SUM(payment_fee),0), "
        "COALESCE(SUM((uncached_in/1e6)*p_in + (cached_in/1e6)*p_cache + (out_tok/1e6)*p_out),0), "
        "COALESCE(SUM(infra + proxy),0) FROM ledger"
    ).fetchone()

    total_gross = float(row[0])
    total_refund = float(row[1])
    total_payment_fee = float(row[2])
    total_llm = float(row[3])
    total_other = float(row[4])

    if total_gross <= 0:
        return 2, {"status": "SPEC_INVALID", "error": "total revenue_usd must be > 0"}

    total_net = total_gross - total_refund
    total_cost = total_llm + total_other + total_payment_fee
    gross_margin = (total_net - total_cost) / total_net if total_net > 0 else 0.0

    if gross_margin >= 0.75:
        health, code = "GREEN", 0
    elif gross_margin >= 0.60:
        health, code = "YELLOW", 0
    else:
        health, code = "RED", 1

    by_model_rows = con.execute(
        "SELECT model, COUNT(*), SUM(revenue), SUM(refund_loss), "
        "SUM((uncached_in/1e6)*p_in + (cached_in/1e6)*p_cache + (out_tok/1e6)*p_out + infra + proxy + payment_fee) "
        "FROM ledger GROUP BY model ORDER BY 3 DESC"
    ).fetchall()
    by_model = [
        {
            "model": m,
            "tasks": int(cnt),
            "revenue_usd": round(float(rev), 4),
            "cost_usd": round(float(cost), 4),
            "gross_margin_pct": round(((float(rev) - float(ref) - float(cost)) / (float(rev) - float(ref))) * 100, 2)
            if (float(rev) - float(ref)) > 0 else 0.0,
        }
        for m, cnt, rev, ref, cost in by_model_rows
    ]

    user_stress_test = None
    p95_breach = False
    if has_user_id and user_records:
        user_margins: list[float] = []
        for uid, items in user_records.items():
            u_rev = sum(i["rev"] for i in items)
            u_ref = sum(i["ref_loss"] for i in items)
            u_net = u_rev - u_ref
            u_cost = sum(i["llm_cost"] + i["other_cost"] + i["p_fee"] for i in items)
            u_margin = (u_net - u_cost) / u_net if u_net > 0 else (0.0 if u_cost == 0 else -1.0)
            user_margins.append(u_margin * 100.0)

        user_margins.sort()
        n_users = len(user_margins)
        p5_idx = max(0, math.ceil(0.05 * n_users) - 1)
        p1_idx = max(0, math.ceil(0.01 * n_users) - 1)
        p95_val = user_margins[p5_idx]
        p99_val = user_margins[p1_idx]
        inverted = sum(1 for m in user_margins if m < 0.0)
        below_60 = sum(1 for m in user_margins if m < 60.0)

        user_stress_test = {
            "user_count": n_users,
            "p95_heavy_user_margin_pct": round(p95_val, 2),
            "p99_heavy_user_margin_pct": round(p99_val, 2),
            "inverted_users": inverted,
            "below_60_users": below_60,
        }

        if strict_p95:
            if p95_val < 60.0:
                health = "RED"
                code = 1
                p95_breach = True

    report = {
        "status": health,
        "sql_engine": engine,
        "gross_revenue_usd": round(total_gross, 4),
        "refund_loss_usd": round(total_refund, 4),
        "net_revenue_usd": round(total_net, 4),
        "payment_fee_usd": round(total_payment_fee, 4),
        "llm_cost_usd": round(total_llm, 4),
        "infra_proxy_cost_usd": round(total_other, 4),
        "total_cost_usd": round(total_cost, 4),
        "gross_margin_pct": round(gross_margin * 100, 2),
        "by_model": by_model,
    }
    if user_stress_test is not None:
        report["user_stress_test"] = user_stress_test
    if strict_p95:
        report["p95_breach"] = p95_breach

    return code, report


def run_mrr(path: Path) -> tuple[int, dict]:
    d = json.loads(path.read_text(encoding="utf-8"))
    beg = float(d.get("beginning_mrr", 0.0))
    new_mrr = float(d.get("new_mrr", 0.0))

    if beg < 0 or (beg == 0 and new_mrr <= 0):
        return 2, {"status": "SPEC_INVALID", "error": "beginning_mrr must be > 0 (or == 0 with new_mrr > 0 for cold start)"}

    exp = float(d.get("expansion_mrr", 0.0))
    con_mrr = float(d.get("contraction_mrr", 0.0))
    churn = float(d.get("churn_mrr", 0.0))
    ending = beg + new_mrr + exp - con_mrr - churn

    cac = float(d.get("cac", 0.0))
    arpu = float(d.get("arpu", 0.0))
    gm = float(d.get("gross_margin", 0.75))
    payback = (cac / (arpu * gm)) if (arpu > 0 and gm > 0) else None

    if beg == 0:
        ndr = None
        breach = (payback is not None and payback > 6.0)
        status = "RED" if breach else "COLD_START_M0"
    else:
        ndr = (beg + exp - con_mrr - churn) / beg
        breach = (ndr < 1.0) or (payback is not None and payback > 6.0)
        status = "RED" if breach else ("GREEN" if ndr >= 1.15 else "YELLOW")

    return (1 if breach else 0), {
        "status": status,
        "ending_mrr": round(ending, 2),
        "ndr_pct": round(ndr * 100, 2) if ndr is not None else None,
        "cac_payback_months": round(payback, 2) if payback is not None else None,
    }


def run_did(path: Path, paired: bool = False) -> tuple[int, dict]:
    d = json.loads(path.read_text(encoding="utf-8"))
    pre_c = [float(x) for x in d.get("pre_control", [])]
    post_c = [float(x) for x in d.get("post_control", [])]
    pre_t = [float(x) for x in d.get("pre_treat", [])]
    post_t = [float(x) for x in d.get("post_treat", [])]
    is_paired = paired or bool(d.get("paired", False))

    if min(len(pre_c), len(post_c), len(pre_t), len(post_t)) < 2:
        return 2, {"status": "SPEC_INVALID", "error": "each DiD group requires >= 2 samples"}

    mean = lambda xs: sum(xs) / len(xs)
    var = lambda xs: sum((x - mean(xs)) ** 2 for x in xs) / (len(xs) - 1)

    if is_paired:
        if len(pre_t) != len(post_t) or len(pre_c) != len(post_c):
            return 2, {"status": "SPEC_INVALID", "error": "paired DiD requires len(pre)==len(post) for treatment and control"}
        diff_t = [post - pre for pre, post in zip(pre_t, post_t)]
        diff_c = [post - pre for pre, post in zip(pre_c, post_c)]
        did = mean(diff_t) - mean(diff_c)
        se = math.sqrt(var(diff_t) / len(diff_t) + var(diff_c) / len(diff_c) + 1e-12)
    else:
        did = (mean(post_t) - mean(pre_t)) - (mean(post_c) - mean(pre_c))
        se = math.sqrt(
            var(post_t) / len(post_t)
            + var(pre_t) / len(pre_t)
            + var(post_c) / len(post_c)
            + var(pre_c) / len(pre_c)
            + 1e-12
        )

    z = abs(did) / se
    p_val = math.erfc(z / math.sqrt(2.0))
    return 0, {
        "status": "SIGNIFICANT" if p_val < 0.05 else "INSIGNIFICANT",
        "causal_lift": round(did, 6),
        "std_error": round(se, 6),
        "p_value": round(p_val, 6),
        "paired": is_paired,
    }


def main() -> None:
    p = argparse.ArgumentParser(description="Deterministic Unit Economics & SaaS Quant CLI")
    sub = p.add_subparsers(dest="mode", required=True)

    sp_margin = sub.add_parser("margin")
    sp_margin.add_argument("--input", required=True, type=Path)
    sp_margin.add_argument("--strict-p95", action="store_true", default=False)

    sp_mrr = sub.add_parser("mrr")
    sp_mrr.add_argument("--input", required=True, type=Path)

    sp_did = sub.add_parser("did")
    sp_did.add_argument("--input", required=True, type=Path)
    sp_did.add_argument("--paired", action="store_true", default=False)

    args = p.parse_args()
    if args.mode == "margin":
        code, report = run_margin(args.input, strict_p95=args.strict_p95)
    elif args.mode == "mrr":
        code, report = run_mrr(args.input)
    else:
        code, report = run_did(args.input, paired=args.paired)

    print(json.dumps(report, ensure_ascii=False, indent=2))
    sys.exit(code)


if __name__ == "__main__":
    main()
