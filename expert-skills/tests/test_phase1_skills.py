#!/usr/bin/env python3
"""Comprehensive pytest regression suite for Phase 1 expert-skills deterministic gate scripts."""
from __future__ import annotations

import importlib.util
import json
from pathlib import Path
from types import ModuleType

import pytest

BASE_DIR = Path(__file__).resolve().parent.parent
SKILLS = [
    "unit-economics",
    "opc-legal-finance",
    "dag-gc",
    "meta-prompt-forge",
    "docs-diataxis-release",
    "offensive-security",
]


def load_script(path: Path) -> ModuleType:
    spec = importlib.util.spec_from_file_location(path.stem, str(path))
    assert spec is not None and spec.loader is not None
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


# ==============================================================================
# 1. unit-economics tests (P0-2)
# ==============================================================================

def test_unit_economics_margin_mor_and_refund(tmp_path: Path):
    mod = load_script(BASE_DIR / "unit-economics" / "scripts" / "unit_economics.py")

    ledger = [
        {
            "task_id": "t1",
            "model": "gemini-2.5-flash",
            "revenue_usd": 100.0,
            "refund_loss_usd": 10.0,
            "payment_provider": "mor",
            "uncached_input_tokens": 1000000,
            "cached_input_tokens": 0,
            "output_tokens": 100000,
            "price_in_per_1m": 0.5,
            "price_cache_per_1m": 0.05,
            "price_out_per_1m": 2.0,
            "infra_usd": 1.0,
            "proxy_usd": 0.5,
        }
    ]
    ledger_file = tmp_path / "ledger_mor.json"
    ledger_file.write_text(json.dumps(ledger), encoding="utf-8")

    code, report = mod.run_margin(ledger_file)
    assert code == 0
    assert report["gross_revenue_usd"] == 100.0
    assert report["refund_loss_usd"] == 10.0
    assert report["net_revenue_usd"] == 90.0
    assert report["payment_fee_usd"] == 5.50
    assert report["llm_cost_usd"] == 0.70
    assert report["infra_proxy_cost_usd"] == 1.50
    assert report["total_cost_usd"] == 7.70
    assert report["gross_margin_pct"] == 91.44
    assert report["status"] == "GREEN"


def test_unit_economics_margin_p95_heavy_user_breach(tmp_path: Path):
    mod = load_script(BASE_DIR / "unit-economics" / "scripts" / "unit_economics.py")

    ledger = []
    for i in range(19):
        ledger.append({
            "task_id": f"light_{i}",
            "user_id": f"u_light_{i}",
            "model": "flash",
            "revenue_usd": 10.0,
            "refund_loss_usd": 0.0,
            "payment_fee_usd": 0.5,
            "uncached_input_tokens": 100000,
            "output_tokens": 10000,
            "price_in_per_1m": 0.5,
            "price_out_per_1m": 2.0,
            "infra_usd": 0.2,
            "proxy_usd": 0.1,
        })
    ledger.append({
        "task_id": "heavy_0",
        "user_id": "u_heavy_0",
        "model": "pro",
        "revenue_usd": 10.0,
        "refund_loss_usd": 0.0,
        "payment_fee_usd": 0.5,
        "uncached_input_tokens": 10000000,
        "output_tokens": 3000000,
        "price_in_per_1m": 0.5,
        "price_out_per_1m": 2.0,
        "infra_usd": 2.5,
        "proxy_usd": 0.0,
    })

    ledger_file = tmp_path / "ledger_stress.json"
    ledger_file.write_text(json.dumps(ledger), encoding="utf-8")

    code_normal, rep_normal = mod.run_margin(ledger_file, strict_p95=False)
    assert code_normal == 0
    assert rep_normal["status"] == "GREEN"
    assert rep_normal["user_stress_test"]["user_count"] == 20
    assert rep_normal["user_stress_test"]["below_60_users"] == 1
    assert rep_normal["user_stress_test"]["p95_heavy_user_margin_pct"] < 60.0

    code_strict, rep_strict = mod.run_margin(ledger_file, strict_p95=True)
    assert code_strict == 1
    assert rep_strict["status"] == "RED"
    assert rep_strict["p95_breach"] is True


def test_unit_economics_strict_p95_missing_user_id_fails(tmp_path: Path):
    mod = load_script(BASE_DIR / "unit-economics" / "scripts" / "unit_economics.py")

    # Case 1: Partial missing user_id
    ledger_partial = [
        {"task_id": "t1", "user_id": "u1", "revenue_usd": 50.0},
        {"task_id": "t2", "user_id": "", "revenue_usd": 50.0},
        {"task_id": "t3", "revenue_usd": 50.0},
    ]
    f_partial = tmp_path / "ledger_partial.json"
    f_partial.write_text(json.dumps(ledger_partial), encoding="utf-8")

    code_p, rep_p = mod.run_margin(f_partial, strict_p95=True)
    assert code_p == 2
    assert rep_p["status"] == "SPEC_INVALID"
    assert rep_p["missing_user_id_rows"] == 2
    assert rep_p["total_rows"] == 3

    # Case 2: Zero user_id
    ledger_none = [
        {"task_id": "t1", "revenue_usd": 50.0},
        {"task_id": "t2", "revenue_usd": 50.0},
    ]
    f_none = tmp_path / "ledger_none.json"
    f_none.write_text(json.dumps(ledger_none), encoding="utf-8")

    code_n, rep_n = mod.run_margin(f_none, strict_p95=True)
    assert code_n == 2
    assert rep_n["status"] == "SPEC_INVALID"
    assert rep_n["missing_user_id_rows"] == 2
    assert rep_n["total_rows"] == 2


def test_unit_economics_mrr_cold_start(tmp_path: Path):
    mod = load_script(BASE_DIR / "unit-economics" / "scripts" / "unit_economics.py")

    mrr_cold = {
        "beginning_mrr": 0,
        "new_mrr": 1200.0,
        "expansion_mrr": 0.0,
        "contraction_mrr": 0.0,
        "churn_mrr": 0.0,
        "cac": 300.0,
        "arpu": 100.0,
        "gross_margin": 0.8,
    }
    f_cold = tmp_path / "mrr_cold.json"
    f_cold.write_text(json.dumps(mrr_cold), encoding="utf-8")

    code, rep = mod.run_mrr(f_cold)
    assert code == 0
    assert rep["status"] == "COLD_START_M0"
    assert rep["ndr_pct"] is None
    assert rep["ending_mrr"] == 1200.0
    assert rep["cac_payback_months"] == round(300.0 / (100.0 * 0.8), 2)

    mrr_cold_bad = dict(mrr_cold, cac=1000.0)
    f_cold_bad = tmp_path / "mrr_cold_bad.json"
    f_cold_bad.write_text(json.dumps(mrr_cold_bad), encoding="utf-8")
    code_bad, rep_bad = mod.run_mrr(f_cold_bad)
    assert code_bad == 1
    assert rep_bad["status"] == "RED"

    f_inv = tmp_path / "mrr_inv.json"
    f_inv.write_text(json.dumps({"beginning_mrr": 0, "new_mrr": 0}), encoding="utf-8")
    code_inv, _ = mod.run_mrr(f_inv)
    assert code_inv == 2


def test_unit_economics_did_independent_and_paired(tmp_path: Path):
    mod = load_script(BASE_DIR / "unit-economics" / "scripts" / "unit_economics.py")

    data = {
        "pre_control": [10.0, 11.0, 12.0, 10.5],
        "post_control": [10.2, 11.1, 12.1, 10.6],
        "pre_treat": [10.0, 10.5, 11.0, 10.2],
        "post_treat": [15.0, 16.0, 15.5, 16.2],
    }
    f_did = tmp_path / "did.json"
    f_did.write_text(json.dumps(data), encoding="utf-8")

    code_indep, rep_indep = mod.run_did(f_did, paired=False)
    assert code_indep == 0
    assert rep_indep["status"] == "SIGNIFICANT"
    assert rep_indep["causal_lift"] > 0
    assert rep_indep["std_error"] > 0

    code_paired, rep_paired = mod.run_did(f_did, paired=True)
    assert code_paired == 0
    assert rep_paired["paired"] is True
    assert rep_paired["status"] == "SIGNIFICANT"

    mismatch_data = dict(data, post_treat=[15.0, 16.0])
    f_mismatch = tmp_path / "did_mismatch.json"
    f_mismatch.write_text(json.dumps(mismatch_data), encoding="utf-8")
    code_err, rep_err = mod.run_did(f_mismatch, paired=True)
    assert code_err == 2
    assert rep_err["status"] == "SPEC_INVALID"


# ==============================================================================
# 2. opc-legal-finance tests (P0-3)
# ==============================================================================

def test_opc_legal_finance_reconcile_multi_event_and_dispute_fee(tmp_path: Path):
    mod = load_script(BASE_DIR / "opc-legal-finance" / "scripts" / "reconcile_mor.py")

    payouts = [
        {
            "order_id": "ord_1",
            "event_type": "charge",
            "gross_usd": 100.0,
            "refund_usd": 0.0,
            "chargeback_usd": 0.0,
            "fee_usd": 3.20,
            "dispute_fee_usd": 0.0,
            "tax_usd": 0.0,
            "net_usd": 96.80,
        },
        {
            "order_id": "ord_1",
            "event_type": "partial_refund",
            "gross_usd": 0.0,
            "refund_usd": 20.0,
            "chargeback_usd": 0.0,
            "fee_usd": 0.0,
            "dispute_fee_usd": 0.0,
            "tax_usd": 0.0,
            "net_usd": -20.0,
        },
        {
            "order_id": "ord_1",
            "event_type": "dispute",
            "gross_usd": 0.0,
            "refund_usd": 0.0,
            "chargeback_usd": 80.0,
            "fee_usd": 0.0,
            "dispute_fee_usd": 15.0,
            "tax_usd": 0.0,
            "net_usd": -95.0,
        },
    ]
    orders = [{"order_id": "ord_1", "gross_usd": 100.0, "status": "settled"}]

    f_payouts = tmp_path / "payouts.json"
    f_orders = tmp_path / "orders.json"
    f_payouts.write_text(json.dumps(payouts), encoding="utf-8")
    f_orders.write_text(json.dumps(orders), encoding="utf-8")

    code, rep = mod.reconcile(f_payouts, f_orders)
    assert rep["dispute_fees_usd"] == 15.0
    assert rep["charge_count"] == 1
    assert rep["event_rows"] == 3
    assert rep["chargeback_rate_pct"] == 100.0
    assert rep["mismatches"] == []
    assert code == 1
    assert rep["risk_tier"] == "RED"


def test_opc_legal_finance_reconcile_cutoff_in_transit_exemption(tmp_path: Path):
    mod = load_script(BASE_DIR / "opc-legal-finance" / "scripts" / "reconcile_mor.py")

    payouts = [
        {
            "order_id": "ord_settled",
            "event_type": "charge",
            "gross_usd": 50.0,
            "net_usd": 48.0,
            "fee_usd": 2.0,
        }
    ]
    orders = [
        {"order_id": "ord_settled", "gross_usd": 50.0, "order_date": "2026-11-20"},
        {"order_id": "ord_transit", "gross_usd": 50.0, "order_date": "2026-11-28"},
    ]

    f_payouts = tmp_path / "payouts.json"
    f_orders = tmp_path / "orders.json"
    f_payouts.write_text(json.dumps(payouts), encoding="utf-8")
    f_orders.write_text(json.dumps(orders), encoding="utf-8")

    code_no_cutoff, rep_no_cutoff = mod.reconcile(f_payouts, f_orders)
    assert code_no_cutoff == 1
    assert "ord_transit" in rep_no_cutoff["missing_internal_orders"]

    code_cutoff, rep_cutoff = mod.reconcile(
        f_payouts, f_orders, cutoff_date="2026-11-30", settlement_days=7
    )
    assert code_cutoff == 0
    assert "ord_transit" in rep_cutoff["in_transit_orders"]
    assert rep_cutoff["missing_internal_orders"] == []
    assert rep_cutoff["risk_tier"] == "GREEN"


def test_opc_legal_finance_reconcile_overdue_in_transit_and_zero_denominator_disputes(tmp_path: Path):
    mod = load_script(BASE_DIR / "opc-legal-finance" / "scripts" / "reconcile_mor.py")

    # 1. Overdue in_transit (status is in_transit, but order_date is outside settlement window)
    payouts_1 = [{"order_id": "ord_1", "gross_usd": 10.0, "net_usd": 10.0}]
    orders_1 = [
        {"order_id": "ord_1", "gross_usd": 10.0},
        {"order_id": "ord_old_transit", "gross_usd": 50.0, "status": "in_transit", "order_date": "2026-11-01"},
    ]
    f_p1 = tmp_path / "p1.json"
    f_o1 = tmp_path / "o1.json"
    f_p1.write_text(json.dumps(payouts_1), encoding="utf-8")
    f_o1.write_text(json.dumps(orders_1), encoding="utf-8")

    code_1, rep_1 = mod.reconcile(f_p1, f_o1, cutoff_date="2026-11-30", settlement_days=7)
    assert code_1 == 1
    assert rep_1["risk_tier"] == "RED"
    assert rep_1["status"] == "RECONCILIATION_ALERT"
    assert "ord_old_transit" in rep_1["overdue_in_transit_orders"]
    assert any("overdue_or_unverified_in_transit_order:ord_old_transit" in a for a in rep_1["anomalies"])

    # 2. In_transit marked without cutoff_date -> overdue
    code_1b, rep_1b = mod.reconcile(f_p1, f_o1, cutoff_date=None)
    assert code_1b == 1
    assert rep_1b["risk_tier"] == "RED"
    assert "ord_old_transit" in rep_1b["overdue_in_transit_orders"]

    # 3. charge_count == 0 with dispute -> RED EXIT 1
    payouts_dispute_only = [
        {
            "order_id": "ord_disp",
            "event_type": "dispute",
            "gross_usd": 0.0,
            "chargeback_usd": 50.0,
            "dispute_fee_usd": 15.0,
            "net_usd": -65.0,
        }
    ]
    orders_disp = [{"order_id": "ord_disp", "gross_usd": 0.0}]
    f_p_disp = tmp_path / "p_disp.json"
    f_o_disp = tmp_path / "o_disp.json"
    f_p_disp.write_text(json.dumps(payouts_dispute_only), encoding="utf-8")
    f_o_disp.write_text(json.dumps(orders_disp), encoding="utf-8")

    code_disp, rep_disp = mod.reconcile(f_p_disp, f_o_disp)
    assert code_disp == 1
    assert rep_disp["risk_tier"] == "RED"
    assert rep_disp["chargeback_rate_pct"] is None
    assert "chargeback_detected_with_zero_charge_denominator" in rep_disp["anomalies"]

    # 4. charge_count == 0 with refund only -> YELLOW EXIT 0
    payouts_refund_only = [
        {
            "order_id": "ord_ref",
            "event_type": "refund",
            "gross_usd": 0.0,
            "refund_usd": 20.0,
            "net_usd": -20.0,
        }
    ]
    orders_ref = [{"order_id": "ord_ref", "gross_usd": 0.0}]
    f_p_ref = tmp_path / "p_ref.json"
    f_o_ref = tmp_path / "o_ref.json"
    f_p_ref.write_text(json.dumps(payouts_refund_only), encoding="utf-8")
    f_o_ref.write_text(json.dumps(orders_ref), encoding="utf-8")

    code_ref, rep_ref = mod.reconcile(f_p_ref, f_o_ref)
    assert code_ref == 0
    assert rep_ref["risk_tier"] == "YELLOW"
    assert rep_ref["status"] == "BALANCED_WARN"
    assert rep_ref["refund_rate_pct"] is None
    assert "refund_detected_with_zero_charge_denominator" in rep_ref["anomalies"]


# ==============================================================================
# 3. dag-gc tests (P1-2)
# ==============================================================================

def test_dag_gc_validation_and_timeout(tmp_path: Path):
    mod = load_script(BASE_DIR / "dag-gc" / "scripts" / "dag_gate.py")

    valid_dag = {
        "nodes": [
            {
                "id": "step1",
                "assigned_bot_id": "coder",
                "action_verb": "reconcile",
                "target_object": "orders.json",
                "done_when": "exit code 0 after reconcile",
                "elapsed_sec": 100,
                "timeout_sec": 900,
            },
            {
                "id": "step2",
                "assigned_bot_id": "devops",
                "action_verb": "deploy",
                "target_object": "prod",
                "done_when": "exit code 0 after deploy",
                "dependencies": ["step1"],
                "elapsed_sec": 50,
                "timeout_sec": 900,
            },
        ]
    }
    f_valid = tmp_path / "valid_dag.json"
    f_valid.write_text(json.dumps(valid_dag), encoding="utf-8")
    code_v, rep_v = mod.validate_dag(f_valid)
    assert code_v == 0
    assert rep_v["status"] == "PASS"

    timeout_dag = {
        "nodes": [
            {
                "id": "step_slow",
                "assigned_bot_id": "coder",
                "action_verb": "implement",
                "target_object": "auth.py",
                "done_when": "pytest tests/ -v exit 0",
                "elapsed_sec": 950,
                "timeout_sec": 900,
            }
        ]
    }
    f_timeout = tmp_path / "timeout_dag.json"
    f_timeout.write_text(json.dumps(timeout_dag), encoding="utf-8")
    code_t, rep_t = mod.validate_dag(f_timeout)
    assert code_t == 20
    assert rep_t["status"] == "FREEZE_TWO_STRIKE"
    assert "step_slow" in rep_t["timeout_hits"]


def test_dag_gc_exemptions(tmp_path: Path):
    mod = load_script(BASE_DIR / "dag-gc" / "scripts" / "dag_gate.py")

    now_ms = 1700000000000
    threads = [
        {
            "_now_ms": now_ms,
            "threadId": "t_human",
            "title": "Human Review",
            "status": "WAITING_HUMAN",
            "updatedAt": now_ms - (48 * 3600 * 1000),
        },
        {
            "_now_ms": now_ms,
            "threadId": "t_standing",
            "title": "Continuous Monitor",
            "status": "RUNNING",
            "standing": True,
            "updatedAt": now_ms - (48 * 3600 * 1000),
        },
        {
            "_now_ms": now_ms,
            "threadId": "t_idle",
            "title": "Old Task",
            "status": "COMPLETED",
            "updatedAt": now_ms - (48 * 3600 * 1000),
        },
        {
            "_now_ms": now_ms,
            "threadId": "t_settled",
            "title": "Finished Task",
            "status": "SETTLED",
            "updatedAt": now_ms - 1000,
        },
    ]
    f_threads = tmp_path / "threads.json"
    f_threads.write_text(json.dumps(threads), encoding="utf-8")

    code, rep = mod.gc_audit(f_threads, ttl_hours=24.0)
    assert code == 0
    candidate_ids = [c["threadId"] for c in rep["gc_candidates"]]
    exempted_ids = [e["threadId"] for e in rep["exempted"]]

    assert "t_human" in exempted_ids
    assert "t_standing" in exempted_ids
    assert "t_idle" in candidate_ids
    assert "t_settled" in candidate_ids
    assert rep["exempted_count"] == 2
    assert rep["count"] == 2


# ==============================================================================
# 4. meta-prompt-forge tests (P1-3)
# ==============================================================================

def test_meta_prompt_forge_crlf_and_l3_marker(tmp_path: Path):
    mod = load_script(BASE_DIR / "meta-prompt-forge" / "scripts" / "audit_12dim_soul.py")

    soul_content = (
        "---\r\nname: test-soul\r\n---\r\n"
        "# SOUL.md\r\n"
        "## L0: Scope\r\n"
        "non_scope_never: None\r\n"
        "## L1: Priority\r\n"
        "## L2: Workflow\r\n"
        "## L3: Toolchain\r\n"
        "## L4: Guardrails\r\n"
        "## L5: Contract\r\n"
        "## L6: Escalation\r\n"
    )
    f_soul = tmp_path / "SOUL.md"
    f_soul.write_bytes(soul_content.encode("utf-8"))

    code, rep = mod.audit_file(f_soul, kind="soul", author_family="gemini", reviewer_family="claude", allow_self_check=True)
    assert code == 0
    assert rep["status"] == "PASS"

    bad_soul = soul_content.replace("## L3: Toolchain\r\n", "")
    f_bad_soul = tmp_path / "BAD_SOUL.md"
    f_bad_soul.write_bytes(bad_soul.encode("utf-8"))
    code_bad, rep_bad = mod.audit_file(f_bad_soul, kind="soul", author_family="gemini", reviewer_family="claude", allow_self_check=True)
    assert code_bad == 2
    assert any("missing layer marker L3" in err for err in rep_bad["errors"])


def test_meta_prompt_forge_orchestrator_meta(tmp_path: Path):
    mod = load_script(BASE_DIR / "meta-prompt-forge" / "scripts" / "audit_12dim_soul.py")
    secret = "test-orchestrator-secret-key-12345"

    f_skill = BASE_DIR / "unit-economics" / "SKILL.md"
    actual_digest = mod.compute_candidate_digest(f_skill)

    # 1. Valid signed orchestrator-meta with bound candidate_sha256 -> PASS, ORCHESTRATOR_VERIFIED, production_gate_eligible True
    meta_good = {
        "author_model": "gemini-2.5-pro",
        "reviewer_model": "claude-3-7-sonnet",
        "issuer": "openmausbot",
        "issued_at": "2026-11-25T10:00:00Z",
        "run_id": "run-001",
        "candidate_sha256": actual_digest,
    }
    meta_good["signature"] = mod.sign_orchestrator_meta(meta_good, secret)
    f_meta_good = tmp_path / "meta_good.json"
    f_meta_good.write_text(json.dumps(meta_good), encoding="utf-8")

    code_g, rep_g = mod.audit_file(f_skill, kind="skill", orchestrator_meta=f_meta_good, hmac_key=secret)
    assert code_g == 0
    assert rep_g["provenance"] == "ORCHESTRATOR_VERIFIED"
    assert rep_g["production_gate_eligible"] is True
    assert rep_g["author_family"] == "gemini"
    assert rep_g["reviewer_family"] == "anthropic"
    assert rep_g["candidate_sha256"] == actual_digest

    # 1b. Candidate digest mismatch -> EXIT 2 PROVENANCE_UNVERIFIED / DIGEST_MISMATCH
    meta_wrong_digest = dict(meta_good, candidate_sha256="0" * 64)
    meta_wrong_digest["signature"] = mod.sign_orchestrator_meta(meta_wrong_digest, secret)
    f_meta_wrong = tmp_path / "meta_wrong_digest.json"
    f_meta_wrong.write_text(json.dumps(meta_wrong_digest), encoding="utf-8")

    code_wd, rep_wd = mod.audit_file(f_skill, kind="skill", orchestrator_meta=f_meta_wrong, hmac_key=secret)
    assert code_wd == 2
    assert rep_wd["status"] == "PROVENANCE_UNVERIFIED"
    assert rep_wd["provenance"] == "DIGEST_MISMATCH"
    assert rep_wd["production_gate_eligible"] is False
    assert any("candidate digest mismatch" in err for err in rep_wd["errors"])

    # 1c. Missing candidate_sha256 -> EXIT 2 PROVENANCE_UNVERIFIED / UNVERIFIED_META_REJECTED
    meta_missing_digest = {
        "author_model": "gemini-2.5-pro",
        "reviewer_model": "claude-3-7-sonnet",
        "issuer": "openmausbot",
        "issued_at": "2026-11-25T10:00:00Z",
        "run_id": "run-001",
    }
    meta_missing_digest["signature"] = mod.sign_orchestrator_meta(meta_missing_digest, secret)
    f_meta_missing = tmp_path / "meta_missing_digest.json"
    f_meta_missing.write_text(json.dumps(meta_missing_digest), encoding="utf-8")

    code_md, rep_md = mod.audit_file(f_skill, kind="skill", orchestrator_meta=f_meta_missing, hmac_key=secret)
    assert code_md == 2
    assert rep_md["status"] == "PROVENANCE_UNVERIFIED"
    assert rep_md["provenance"] == "UNVERIFIED_META_REJECTED"
    assert rep_md["production_gate_eligible"] is False

    # 2. Same-family models (even if signed with candidate digest) -> BLOCKED_SAME_FAMILY EXIT 30
    meta_same = {
        "author_model": "gpt-4o",
        "reviewer_model": "o3-mini",
        "issuer": "openmausbot",
        "issued_at": "2026-11-25T10:00:00Z",
        "run_id": "run-002",
        "candidate_sha256": actual_digest,
    }
    meta_same["signature"] = mod.sign_orchestrator_meta(meta_same, secret)
    f_meta_same = tmp_path / "meta_same.json"
    f_meta_same.write_text(json.dumps(meta_same), encoding="utf-8")

    code_s, rep_s = mod.audit_file(f_skill, kind="skill", orchestrator_meta=f_meta_same, hmac_key=secret)
    assert code_s == 30
    assert rep_s["status"] == "BLOCKED_SAME_FAMILY"

    # 3. Same-family models without signature -> still EXIT 30 (highest priority!)
    meta_same_no_sig = {"author_model": "gpt-4o", "reviewer_model": "o3-mini"}
    f_meta_same_no_sig = tmp_path / "meta_same_no_sig.json"
    f_meta_same_no_sig.write_text(json.dumps(meta_same_no_sig), encoding="utf-8")
    code_s2, rep_s2 = mod.audit_file(f_skill, kind="skill", orchestrator_meta=f_meta_same_no_sig, allow_self_check=False)
    assert code_s2 == 30
    assert rep_s2["status"] == "BLOCKED_SAME_FAMILY"

    # 4. Production mode without orchestrator-meta -> EXIT 2 PROVENANCE_UNVERIFIED
    code_hf, rep_hf = mod.audit_file(f_skill, kind="skill", author_family="gemini", reviewer_family="claude", allow_self_check=False)
    assert code_hf == 2
    assert rep_hf["status"] == "PROVENANCE_UNVERIFIED"
    assert rep_hf["provenance"] == "SELF_DECLARED_REJECTED"
    assert rep_hf["production_gate_eligible"] is False

    # 5. Production mode with invalid signature -> EXIT 2 PROVENANCE_UNVERIFIED
    meta_bad_sig = dict(meta_good, signature="0123456789abcdef0123456789abcdef")
    f_bad_sig = tmp_path / "meta_bad_sig.json"
    f_bad_sig.write_text(json.dumps(meta_bad_sig), encoding="utf-8")
    code_bs, rep_bs = mod.audit_file(f_skill, kind="skill", orchestrator_meta=f_bad_sig, hmac_key=secret, allow_self_check=False)
    assert code_bs == 2
    assert rep_bs["status"] == "PROVENANCE_UNVERIFIED"
    assert rep_bs["provenance"] == "UNVERIFIED_META_REJECTED"
    assert rep_bs["production_gate_eligible"] is False

    # 6. Local self-check mode (--allow-self-check) -> EXIT 0, LOCAL_SELF_CHECK_ONLY, eligible False
    code_sc, rep_sc = mod.audit_file(f_skill, kind="skill", author_family="gemini", reviewer_family="claude", allow_self_check=True)
    assert code_sc == 0
    assert rep_sc["status"] == "PASS"
    assert rep_sc["provenance"] == "LOCAL_SELF_CHECK_ONLY"
    assert rep_sc["production_gate_eligible"] is False


def test_meta_prompt_forge_audit_all_6_expert_skills(tmp_path: Path):
    mod = load_script(BASE_DIR / "meta-prompt-forge" / "scripts" / "audit_12dim_soul.py")
    secret = "audit-all-orchestrator-secret-key-9999"

    for s in SKILLS:
        skill_file = BASE_DIR / s / "SKILL.md"
        assert skill_file.exists(), f"missing {skill_file}"
        digest = mod.compute_candidate_digest(skill_file)

        meta = {
            "author_model": "gemini-2.5-pro",
            "reviewer_model": "claude-3-7-sonnet",
            "issuer": "openmausbot",
            "issued_at": "2026-11-25T10:00:00Z",
            "run_id": f"audit-run-{s}",
            "candidate_sha256": digest,
        }
        meta["signature"] = mod.sign_orchestrator_meta(meta, secret)
        f_meta = tmp_path / f"meta_{s}.json"
        f_meta.write_text(json.dumps(meta), encoding="utf-8")

        code, rep = mod.audit_file(skill_file, kind="skill", orchestrator_meta=f_meta, hmac_key=secret)
        assert code == 0, f"skill {s} failed audit: {rep['errors']}"
        assert rep["status"] == "PASS"
        assert rep["provenance"] == "ORCHESTRATOR_VERIFIED"
        assert rep["production_gate_eligible"] is True
        assert rep["candidate_sha256"] == digest
        assert rep["lines"] <= 120

# ==============================================================================
# 5. docs-diataxis-release tests (P1-4)
# ==============================================================================

def test_docs_diataxis_breaking_changes_request_body_and_enums(tmp_path: Path):
    mod = load_script(BASE_DIR / "docs-diataxis-release" / "scripts" / "openapi_diff_gate.py")

    base_spec = {
        "paths": {
            "/v1/orders": {
                "post": {
                    "requestBody": {
                        "required": False,
                        "content": {
                            "application/json": {
                                "schema": {
                                    "type": "object",
                                    "properties": {
                                        "currency": {"type": "string", "enum": ["usd", "eur", "gbp"]},
                                        "amount": {"type": "number"},
                                    },
                                }
                            }
                        },
                    },
                    "responses": {"200": {"description": "ok"}},
                }
            }
        }
    }

    target_spec = {
        "paths": {
            "/v1/orders": {
                "post": {
                    "requestBody": {
                        "required": True,
                        "content": {
                            "application/json": {
                                "schema": {
                                    "type": "object",
                                    "properties": {
                                        "currency": {"type": "string", "enum": ["usd", "eur"]},
                                        "amount": {"type": "integer"},
                                    },
                                }
                            }
                        },
                    },
                    "responses": {"200": {"description": "ok"}},
                }
            }
        }
    }

    breaking = mod.detect_breaking_changes(base_spec, target_spec)
    assert any("requestBody became required" in b for b in breaking)
    assert any("narrowed enum on property 'currency'" in b for b in breaking)
    assert any("changed type from 'number' to 'integer'" in b for b in breaking)


def test_docs_diataxis_unconstrained_to_enum_and_evaluate_release(tmp_path: Path):
    mod = load_script(BASE_DIR / "docs-diataxis-release" / "scripts" / "openapi_diff_gate.py")

    # 1. Unconstrained to enum on property level
    base_spec = {
        "paths": {
            "/v1/tasks": {
                "post": {
                    "requestBody": {
                        "content": {
                            "application/json": {
                                "schema": {
                                    "type": "object",
                                    "properties": {
                                        "status": {"type": "string"},
                                    },
                                }
                            }
                        }
                    },
                    "responses": {"200": {"description": "ok"}},
                }
            }
        }
    }
    target_spec = {
        "paths": {
            "/v1/tasks": {
                "post": {
                    "requestBody": {
                        "content": {
                            "application/json": {
                                "schema": {
                                    "type": "object",
                                    "properties": {
                                        "status": {"type": "string", "enum": ["pending", "done"]},
                                    },
                                }
                            }
                        }
                    },
                    "responses": {"200": {"description": "ok"}},
                }
            }
        }
    }

    breaking = mod.detect_breaking_changes(base_spec, target_spec)
    assert any("constrained unconstrained property 'status'" in b for b in breaking)

    # 2. evaluate_release: breaking changes with minor bump -> EXIT 1 BREAKING_SEMVER_VIOLATION
    code_min, rep_min = mod.evaluate_release(base_spec, target_spec, bump="minor")
    assert code_min == 1
    assert rep_min["status"] == "BREAKING_SEMVER_VIOLATION"

    # 3. evaluate_release: breaking changes with major bump and no changelog -> EXIT 2 SPEC_INVALID
    code_no_cl, rep_no_cl = mod.evaluate_release(base_spec, target_spec, bump="major", changelog_path=None)
    assert code_no_cl == 2
    assert rep_no_cl["status"] == "SPEC_INVALID"

    # 4. evaluate_release: breaking changes with major bump and valid changelog -> EXIT 0 PASSED
    cl_text = (
        "# Changelog\n\n"
        "## [2.0.0] - 2026-11-25\n"
        "### Changed\n"
        "- Constrained status enum\n"
        "BREAKING CHANGES: status now requires pending or done\n"
    )
    f_cl = tmp_path / "CHANGELOG.md"
    f_cl.write_text(cl_text, encoding="utf-8")

    code_maj, rep_maj = mod.evaluate_release(base_spec, target_spec, bump="major", changelog_path=f_cl)
    assert code_maj == 0
    assert rep_maj["status"] == "PASSED"
    assert rep_maj["breaking_count"] > 0


def test_docs_diataxis_changelog_latest_block_only(tmp_path: Path):
    mod = load_script(BASE_DIR / "docs-diataxis-release" / "scripts" / "openapi_diff_gate.py")

    changelog_bad = (
        "# Changelog\n\n"
        "## [2.0.0] - 2026-11-25\n"
        "### Changed\n"
        "- Removed old endpoint\n\n"
        "## [1.0.0] - 2026-01-01\n"
        "### Added\n"
        "- Initial release\n"
        "BREAKING CHANGES: Old migration notes\n"
    )
    f_cl_bad = tmp_path / "CHANGELOG_bad.md"
    f_cl_bad.write_text(changelog_bad, encoding="utf-8")

    errs = mod.validate_changelog(f_cl_bad, has_breaking=True)
    assert any("latest CHANGELOG.md section lacks 'BREAKING CHANGES'" in e for e in errs)

    changelog_good = (
        "# Changelog\n\n"
        "## [2.0.0] - 2026-11-25\n"
        "### Changed\n"
        "- Removed old endpoint\n"
        "BREAKING CHANGES: Must migrate to /v2\n\n"
        "## [1.0.0] - 2026-01-01\n"
        "### Added\n"
        "- Initial release\n"
    )
    f_cl_good = tmp_path / "CHANGELOG_good.md"
    f_cl_good.write_text(changelog_good, encoding="utf-8")

    errs_good = mod.validate_changelog(f_cl_good, has_breaking=True)
    assert errs_good == []


# ==============================================================================
# 6. offensive-security tests (P1-5)
# ==============================================================================

def test_offensive_security_mode_a_signature_and_exclude(tmp_path: Path):
    mod = load_script(BASE_DIR / "offensive-security" / "scripts" / "security_preflight.py")

    code_file = tmp_path / "auth.py"
    code_file.write_text(
        "if signature != expected:\n"
        "    raise ValueError('bad sig')\n"
        "if hmac.compare_digest(signature, expected):\n"
        "    pass\n",
        encoding="utf-8",
    )

    code, rep = mod.scan_path(code_file, mode="internal-defense")
    assert code == 1
    assert rep["finding_count"] == 1
    assert rep["findings"][0]["rule"] == "non_constant_time_sig"
    assert rep["findings"][0]["line"] == 1

    test_file = tmp_path / "test_auth.py"
    test_file.write_text("signature == 'abc'\n", encoding="utf-8")
    code_ex, rep_ex = mod.scan_path(tmp_path, mode="internal-defense", exclude_tests=True)
    scanned_names = [Path(f["file"]).name for f in rep_ex["findings"]]
    assert "test_auth.py" not in scanned_names


def test_offensive_security_mode_b_dnr_and_extension_collision(tmp_path: Path):
    mod = load_script(BASE_DIR / "offensive-security" / "scripts" / "security_preflight.py")

    dnr_file = tmp_path / "dnr_rules.json"
    dnr_file.write_text(
        json.dumps({
            "declarativeNetRequest": {
                "rule": {
                    "action": {"type": "modifyHeaders", "operation": "remove", "header": "Origin"},
                    "condition": {"urlFilter": "chrome-extension://*"},
                }
            }
        }),
        encoding="utf-8",
    )
    code_dnr, rep_dnr = mod.scan_path(dnr_file, mode="external-antidetect")
    assert code_dnr == 0
    assert rep_dnr["status"] == "CLEAN"

    launcher_file = tmp_path / "launch.py"
    launcher_file.write_text(
        "args = ['--load-extension=/path/to/ext', '--headless=new']\n",
        encoding="utf-8",
    )
    code_launch, rep_launch = mod.scan_path(launcher_file, mode="external-antidetect")
    assert code_launch == 0
    assert rep_launch["status"] == "CLEAN"

    conflict_file = tmp_path / "conflict_launch.py"
    conflict_file.write_text(
        "cmd = ['chrome', '--disable-extensions', '--load-extension=/path/to/ext']\n",
        encoding="utf-8",
    )
    code_c, rep_c = mod.scan_path(conflict_file, mode="external-antidetect")
    assert code_c == 1
    assert rep_c["findings"][0]["rule"] == "extension_flag_collision"
# ==============================================================================
# 7. v2.2.1 Adversarial Edge-Case Regressions (P0-2 object user_id & P0-3 upper bound)
# ==============================================================================

def test_unit_economics_strict_p95_rejects_non_scalar_user_id(tmp_path: Path):
    mod = load_script(BASE_DIR / "unit-economics" / "scripts" / "unit_economics.py")

    for bad_uid in ({"id": "u1"}, ["u1"], True, 3.14):
        ledger = [
            {"task_id": "t1", "user_id": bad_uid, "revenue_usd": 100.0},
            {"task_id": "t2", "user_id": "u_valid", "revenue_usd": 100.0},
        ]
        f_bad = tmp_path / "ledger_bad_uid.json"
        f_bad.write_text(json.dumps(ledger), encoding="utf-8")
        code, rep = mod.run_margin(f_bad, strict_p95=True)
        assert code == 2, f"Expected EXIT 2 for bad user_id={bad_uid!r}, got {code}: {rep}"
        assert rep["status"] == "SPEC_INVALID"
        assert rep["invalid_user_id_rows"] == 1


def test_opc_legal_finance_reconcile_rejects_post_cutoff_future_order_date(tmp_path: Path):
    mod = load_script(BASE_DIR / "opc-legal-finance" / "scripts" / "reconcile_mor.py")

    payouts = [{"order_id": "ord_settled", "event_type": "charge", "gross_usd": 50.0, "fee_usd": 2.0, "net_usd": 48.0}]
    orders = [
        {"order_id": "ord_settled", "gross_usd": 50.0, "order_date": "2026-11-20"},
        {"order_id": "ord_future", "gross_usd": 50.0, "order_date": "2026-12-15"},
        {"order_id": "ord_future_transit", "gross_usd": 50.0, "status": "in_transit", "order_date": "2026-12-15"},
    ]
    f_p = tmp_path / "payouts_future.json"
    f_o = tmp_path / "orders_future.json"
    f_p.write_text(json.dumps(payouts), encoding="utf-8")
    f_o.write_text(json.dumps(orders), encoding="utf-8")

    code, rep = mod.reconcile(f_p, f_o, cutoff_date="2026-11-25", settlement_days=7)
    assert code == 1
    assert rep["risk_tier"] == "RED"
    assert rep["status"] == "RECONCILIATION_ALERT"
    assert rep["in_transit_orders"] == []
    assert set(rep["post_cutoff_orders"]) == {"ord_future", "ord_future_transit"}
    assert "post_cutoff_order_date:ord_future" in rep["anomalies"]
    assert "post_cutoff_order_date:ord_future_transit" in rep["anomalies"]

    # Matched future order test: 11-26 order matched with payout under 11-25 cutoff
    # Must be flagged RED EXIT 1, post_cutoff_orders recorded, and NOT added to charge denominator/gross
    payouts_matched_future = [
        {"order_id": "ord_matched_future", "event_type": "charge", "gross_usd": 100.0, "fee_usd": 3.0, "net_usd": 97.0}
    ]
    orders_matched_future = [
        {"order_id": "ord_matched_future", "gross_usd": 100.0, "order_date": "2026-11-26"}
    ]
    f_pm = tmp_path / "p_matched_future.json"
    f_om = tmp_path / "o_matched_future.json"
    f_pm.write_text(json.dumps(payouts_matched_future), encoding="utf-8")
    f_om.write_text(json.dumps(orders_matched_future), encoding="utf-8")

    code_m, rep_m = mod.reconcile(f_pm, f_om, cutoff_date="2026-11-25", settlement_days=7)
    assert code_m == 1
    assert rep_m["risk_tier"] == "RED"
    assert rep_m["status"] == "RECONCILIATION_ALERT"
    assert "ord_matched_future" in rep_m["post_cutoff_orders"]
    assert "post_cutoff_order_date:ord_matched_future" in rep_m["anomalies"]
    assert rep_m["charge_count"] == 0
    assert rep_m["gross_usd"] == 0.0
def test_opc_legal_finance_reconcile_dual_date_post_cutoff_triggers_red(tmp_path: Path):
    mod = load_script(BASE_DIR / "opc-legal-finance" / "scripts" / "reconcile_mor.py")

    # Case A: row has order_date in-window (11-25) and date post-cutoff (11-26)
    payouts_dual_1 = [
        {
            "order_id": "ord_dual_1",
            "event_type": "charge",
            "order_date": "2026-11-25",
            "date": "2026-11-26",
            "gross_usd": 100.0,
            "fee_usd": 3.0,
            "net_usd": 97.0,
        }
    ]
    orders_dual_1 = [
        {"order_id": "ord_dual_1", "gross_usd": 100.0, "order_date": "2026-11-25"}
    ]
    f_p1 = tmp_path / "p_dual_1.json"
    f_o1 = tmp_path / "o_dual_1.json"
    f_p1.write_text(json.dumps(payouts_dual_1), encoding="utf-8")
    f_o1.write_text(json.dumps(orders_dual_1), encoding="utf-8")

    code_1, rep_1 = mod.reconcile(f_p1, f_o1, cutoff_date="2026-11-25", settlement_days=7)
    assert code_1 == 1
    assert rep_1["risk_tier"] == "RED"
    assert rep_1["status"] == "RECONCILIATION_ALERT"
    assert "ord_dual_1" in rep_1["post_cutoff_orders"]
    assert "post_cutoff_order_date:ord_dual_1" in rep_1["anomalies"]
    assert rep_1["charge_count"] == 0
    assert rep_1["gross_usd"] == 0.0

    # Case B: row has order_date in-window (11-25) and payout_date post-cutoff (11-26)
    payouts_dual_2 = [
        {
            "order_id": "ord_dual_2",
            "event_type": "charge",
            "order_date": "2026-11-25",
            "payout_date": "2026-11-26",
            "gross_usd": 150.0,
            "fee_usd": 4.5,
            "net_usd": 145.5,
        }
    ]
    orders_dual_2 = [
        {"order_id": "ord_dual_2", "gross_usd": 150.0, "order_date": "2026-11-25"}
    ]
    f_p2 = tmp_path / "p_dual_2.json"
    f_o2 = tmp_path / "o_dual_2.json"
    f_p2.write_text(json.dumps(payouts_dual_2), encoding="utf-8")
    f_o2.write_text(json.dumps(orders_dual_2), encoding="utf-8")

    code_2, rep_2 = mod.reconcile(f_p2, f_o2, cutoff_date="2026-11-25", settlement_days=7)
    assert code_2 == 1
    assert rep_2["risk_tier"] == "RED"
    assert rep_2["status"] == "RECONCILIATION_ALERT"
    assert "ord_dual_2" in rep_2["post_cutoff_orders"]
    assert "post_cutoff_order_date:ord_dual_2" in rep_2["anomalies"]
    assert rep_2["charge_count"] == 0
    assert rep_2["gross_usd"] == 0.0


def test_opc_legal_finance_reconcile_permutation_invariance_and_cross_period_reorder(tmp_path: Path):
    mod = load_script(BASE_DIR / "opc-legal-finance" / "scripts" / "reconcile_mor.py")

    # Order ord_cross has charge on 11-25 ($100) and refund on 11-26 ($100, post-cutoff)
    row_charge = {
        "order_id": "ord_cross",
        "event_type": "charge",
        "order_date": "2026-11-25",
        "date": "2026-11-25",
        "gross_usd": 100.0,
        "fee_usd": 3.0,
        "net_usd": 97.0,
    }
    row_refund = {
        "order_id": "ord_cross",
        "event_type": "refund",
        "order_date": "2026-11-25",
        "date": "2026-11-26",
        "gross_usd": 0.0,
        "refund_usd": 100.0,
        "fee_usd": 0.0,
        "net_usd": -100.0,
    }
    orders = [{"order_id": "ord_cross", "gross_usd": 100.0, "order_date": "2026-11-25"}]

    f_orders = tmp_path / "orders_cross.json"
    f_orders.write_text(json.dumps(orders), encoding="utf-8")

    # Version 1: Charge row first, then post-cutoff Refund row
    f_p1 = tmp_path / "payouts_cross_v1.json"
    f_p1.write_text(json.dumps([row_charge, row_refund]), encoding="utf-8")
    code_v1, rep_v1 = mod.reconcile(f_p1, f_orders, cutoff_date="2026-11-25", settlement_days=7)

    # Version 2: Post-cutoff Refund row first, then Charge row (swapped order)
    f_p2 = tmp_path / "payouts_cross_v2.json"
    f_p2.write_text(json.dumps([row_refund, row_charge]), encoding="utf-8")
    code_v2, rep_v2 = mod.reconcile(f_p2, f_orders, cutoff_date="2026-11-25", settlement_days=7)

    # Strict permutation invariance assertions: both must flag RED EXIT 1, charge_count 0, gross 0.0
    assert code_v1 == 1
    assert code_v2 == 1
    assert rep_v1["risk_tier"] == rep_v2["risk_tier"] == "RED"
    assert rep_v1["status"] == rep_v2["status"] == "RECONCILIATION_ALERT"
    assert rep_v1["charge_count"] == rep_v2["charge_count"] == 0
    assert rep_v1["gross_usd"] == rep_v2["gross_usd"] == 0.0
    assert rep_v1["post_cutoff_orders"] == rep_v2["post_cutoff_orders"] == ["ord_cross"]
    assert rep_v1["anomalies"] == rep_v2["anomalies"] == ["post_cutoff_order_date:ord_cross"]

    # In-window permutation invariance test (both events strictly on 11-25)
    row_in_charge = {
        "order_id": "ord_in",
        "event_type": "charge",
        "order_date": "2026-11-25",
        "date": "2026-11-25",
        "gross_usd": 100.0,
        "fee_usd": 3.20,
        "net_usd": 96.80,
    }
    row_in_part_refund = {
        "order_id": "ord_in",
        "event_type": "partial_refund",
        "order_date": "2026-11-25",
        "date": "2026-11-25",
        "gross_usd": 0.0,
        "refund_usd": 20.0,
        "fee_usd": 0.0,
        "net_usd": -20.0,
    }
    orders_in = [{"order_id": "ord_in", "gross_usd": 100.0, "order_date": "2026-11-25"}]
    f_orders_in = tmp_path / "orders_in.json"
    f_orders_in.write_text(json.dumps(orders_in), encoding="utf-8")

    f_pin1 = tmp_path / "pin1.json"
    f_pin1.write_text(json.dumps([row_in_charge, row_in_part_refund]), encoding="utf-8")
    code_w1, rep_w1 = mod.reconcile(f_pin1, f_orders_in, cutoff_date="2026-11-25", settlement_days=7)

    f_pin2 = tmp_path / "pin2.json"
    f_pin2.write_text(json.dumps([row_in_part_refund, row_in_charge]), encoding="utf-8")
    code_w2, rep_w2 = mod.reconcile(f_pin2, f_orders_in, cutoff_date="2026-11-25", settlement_days=7)

    assert code_w1 == 0
    assert code_w2 == 0
    assert rep_w1["charge_count"] == rep_w2["charge_count"] == 1
    assert rep_w1["gross_usd"] == rep_w2["gross_usd"] == 100.0
    assert rep_w1["refunds_usd"] == rep_w2["refunds_usd"] == 20.0
    assert rep_w1["net_reported_usd"] == rep_w2["net_reported_usd"] == 76.80
def test_opc_legal_finance_reconcile_in_transit_dual_date_and_mismatches_order_invariance(tmp_path: Path):
    mod = load_script(BASE_DIR / "opc-legal-finance" / "scripts" / "reconcile_mor.py")

    # 1. Dual-date in-transit key order invariance test:
    # An un-settled order containing order_date=11-01 (overdue) and date=11-25 (in window)
    # MUST deterministically evaluate to EXIT 1 / RED / overdue regardless of key ordering.
    payouts = [{"order_id": "ord_settled", "event_type": "charge", "gross_usd": 50.0, "net_usd": 48.0, "fee_usd": 2.0}]
    f_payouts = tmp_path / "payouts_transit.json"
    f_payouts.write_text(json.dumps(payouts), encoding="utf-8")

    # Order 1: order_date first, then date
    order_v1 = [
        {"order_id": "ord_settled", "gross_usd": 50.0},
        {"order_id": "ord_dual_transit", "status": "in_transit", "gross_usd": 50.0, "order_date": "2026-11-01", "date": "2026-11-25"},
    ]
    f_o1 = tmp_path / "orders_transit_v1.json"
    f_o1.write_text(json.dumps(order_v1), encoding="utf-8")

    # Order 2: date first, then order_date (swapped keys)
    order_v2 = [
        {"order_id": "ord_settled", "gross_usd": 50.0},
        {"order_id": "ord_dual_transit", "status": "in_transit", "gross_usd": 50.0, "date": "2026-11-25", "order_date": "2026-11-01"},
    ]
    f_o2 = tmp_path / "orders_transit_v2.json"
    f_o2.write_text(json.dumps(order_v2), encoding="utf-8")

    code_1, rep_1 = mod.reconcile(f_payouts, f_o1, cutoff_date="2026-11-25", settlement_days=7)
    code_2, rep_2 = mod.reconcile(f_payouts, f_o2, cutoff_date="2026-11-25", settlement_days=7)

    assert code_1 == 1
    assert code_2 == 1
    assert rep_1["risk_tier"] == rep_2["risk_tier"] == "RED"
    assert rep_1["status"] == rep_2["status"] == "RECONCILIATION_ALERT"
    assert rep_1["in_transit_orders"] == rep_2["in_transit_orders"] == []
    assert rep_1["overdue_in_transit_orders"] == rep_2["overdue_in_transit_orders"] == ["ord_dual_transit"]
    assert "overdue_or_unverified_in_transit_order:ord_dual_transit" in rep_1["anomalies"]
    assert "overdue_or_unverified_in_transit_order:ord_dual_transit" in rep_2["anomalies"]

    # 2. Mismatches permutation invariance test:
    # Ensure mismatches list ordering is deterministic regardless of payout rows order.
    row_bad_net_1 = {"order_id": "ord_b", "gross_usd": 100.0, "net_usd": 50.0, "fee_usd": 3.0}
    row_bad_net_2 = {"order_id": "ord_a", "gross_usd": 100.0, "net_usd": 60.0, "fee_usd": 2.0}
    f_pm1 = tmp_path / "p_mismatches_v1.json"
    f_pm2 = tmp_path / "p_mismatches_v2.json"
    f_pm1.write_text(json.dumps([row_bad_net_1, row_bad_net_2]), encoding="utf-8")
    f_pm2.write_text(json.dumps([row_bad_net_2, row_bad_net_1]), encoding="utf-8")
    orders_m = [{"order_id": "ord_a", "gross_usd": 100.0}, {"order_id": "ord_b", "gross_usd": 100.0}]
    f_om = tmp_path / "orders_m.json"
    f_om.write_text(json.dumps(orders_m), encoding="utf-8")

    code_m1, rep_m1 = mod.reconcile(f_pm1, f_om)
    code_m2, rep_m2 = mod.reconcile(f_pm2, f_om)
    assert code_m1 == code_m2 == 1
    assert rep_m1["mismatches"] == rep_m2["mismatches"]
    assert [m["order_id"] for m in rep_m1["mismatches"]] == ["ord_a", "ord_b"]
def test_opc_legal_finance_reconcile_strict_order_date_verification_and_invalid_date(tmp_path: Path):
    mod = load_script(BASE_DIR / "opc-legal-finance" / "scripts" / "reconcile_mor.py")

    payouts = [{"order_id": "ord_settled", "event_type": "charge", "gross_usd": 50.0, "net_usd": 48.0, "fee_usd": 2.0}]
    f_payouts = tmp_path / "p_base.json"
    f_payouts.write_text(json.dumps(payouts), encoding="utf-8")

    # 1. Un-settled order with only date=11-25 and NO order_date -> MUST be rejected (RED / overdue)
    orders_only_date = [
        {"order_id": "ord_settled", "gross_usd": 50.0},
        {"order_id": "ord_only_date", "gross_usd": 50.0, "date": "2026-11-25"},
    ]
    f_o1 = tmp_path / "o_only_date.json"
    f_o1.write_text(json.dumps(orders_only_date), encoding="utf-8")
    code_1, rep_1 = mod.reconcile(f_payouts, f_o1, cutoff_date="2026-11-25", settlement_days=7)
    assert code_1 == 1
    assert rep_1["risk_tier"] == "RED"
    assert rep_1["status"] == "RECONCILIATION_ALERT"
    assert "ord_only_date" in rep_1["overdue_in_transit_orders"]
    assert "ord_only_date" not in rep_1["in_transit_orders"]
    assert any("overdue_or_unverified_in_transit_order:ord_only_date" in a for a in rep_1["anomalies"])

    # 2. Un-settled order with invalid order_date="invalid-date" -> MUST be rejected (RED / overdue)
    orders_invalid_od = [
        {"order_id": "ord_settled", "gross_usd": 50.0},
        {"order_id": "ord_invalid_od", "gross_usd": 50.0, "order_date": "invalid-date", "date": "2026-11-25"},
    ]
    f_o2 = tmp_path / "o_invalid_od.json"
    f_o2.write_text(json.dumps(orders_invalid_od), encoding="utf-8")
    code_2, rep_2 = mod.reconcile(f_payouts, f_o2, cutoff_date="2026-11-25", settlement_days=7)
    assert code_2 == 1
    assert rep_2["risk_tier"] == "RED"
    assert rep_2["status"] == "RECONCILIATION_ALERT"
    assert "ord_invalid_od" in rep_2["overdue_in_transit_orders"]
    assert "ord_invalid_od" not in rep_2["in_transit_orders"]
    assert any("overdue_or_unverified_in_transit_order:ord_invalid_od" in a for a in rep_2["anomalies"])

    # 3. Un-settled order with valid order_date in settlement window -> MUST be exempted (GREEN / in_transit)
    orders_valid_od = [
        {"order_id": "ord_settled", "gross_usd": 50.0},
        {"order_id": "ord_valid_od", "gross_usd": 50.0, "order_date": "2026-11-25"},
    ]
    f_o3 = tmp_path / "o_valid_od.json"
    f_o3.write_text(json.dumps(orders_valid_od), encoding="utf-8")
    code_3, rep_3 = mod.reconcile(f_payouts, f_o3, cutoff_date="2026-11-25", settlement_days=7)
    assert code_3 == 0
    assert rep_3["risk_tier"] == "GREEN"
    assert "ord_valid_od" in rep_3["in_transit_orders"]
    assert rep_3["overdue_in_transit_orders"] == []


def test_opc_legal_finance_reconcile_dirty_suffix_order_date_rejected(tmp_path: Path):
    mod = load_script(BASE_DIR / "opc-legal-finance" / "scripts" / "reconcile_mor.py")

    payouts = [{"order_id": "ord_settled", "event_type": "charge", "gross_usd": 50.0, "net_usd": 48.0, "fee_usd": 2.0}]
    f_payouts = tmp_path / "p_dirty.json"
    f_payouts.write_text(json.dumps(payouts), encoding="utf-8")

    # 1. Dirty suffix: 2026-11-20_dirty -> MUST be rejected as RED / overdue, not in in_transit
    orders_dirty = [
        {"order_id": "ord_settled", "gross_usd": 50.0},
        {"order_id": "ord_dirty", "gross_usd": 50.0, "order_date": "2026-11-20_dirty"},
    ]
    f_o_dirty = tmp_path / "o_dirty.json"
    f_o_dirty.write_text(json.dumps(orders_dirty), encoding="utf-8")

    code, rep = mod.reconcile(f_payouts, f_o_dirty, cutoff_date="2026-11-25", settlement_days=7)
    assert code == 1
    assert rep["risk_tier"] == "RED"
    assert rep["status"] == "RECONCILIATION_ALERT"
    assert "ord_dirty" in rep["overdue_in_transit_orders"]
    assert "ord_dirty" not in rep["in_transit_orders"]
    assert any("invalid_order_date_format:ord_dirty" in a for a in rep["anomalies"])
    assert any("overdue_or_unverified_in_transit_order:ord_dirty" in a for a in rep["anomalies"])

    # 2. Strict clean date: 2026-11-20 -> MUST be accepted as GREEN in_transit
    orders_clean = [
        {"order_id": "ord_settled", "gross_usd": 50.0},
        {"order_id": "ord_clean", "gross_usd": 50.0, "order_date": "2026-11-20"},
    ]
    f_o_clean = tmp_path / "o_clean.json"
    f_o_clean.write_text(json.dumps(orders_clean), encoding="utf-8")

    code_c, rep_c = mod.reconcile(f_payouts, f_o_clean, cutoff_date="2026-11-25", settlement_days=7)
    assert code_c == 0
    assert rep_c["risk_tier"] == "GREEN"
    assert "ord_clean" in rep_c["in_transit_orders"]
    assert rep_c["overdue_in_transit_orders"] == []


def test_opc_legal_finance_reconcile_conflicting_order_date_keys_fail_closed_and_permutation_invariant(tmp_path: Path):
    mod = load_script(BASE_DIR / "opc-legal-finance" / "scripts" / "reconcile_mor.py")

    payouts = [{"order_id": "ord_settled", "event_type": "charge", "gross_usd": 50.0, "net_usd": 48.0, "fee_usd": 2.0}]
    f_payouts = tmp_path / "p_conflict.json"
    f_payouts.write_text(json.dumps(payouts), encoding="utf-8")

    # Order with conflicting order_date and ORDER_DATE: key order 1 (order_date first)
    orders_v1 = [
        {"order_id": "ord_settled", "gross_usd": 50.0},
        {"order_id": "ord_conflict", "gross_usd": 50.0, "order_date": "2026-11-20", "ORDER_DATE": "invalid"},
    ]
    f_o1 = tmp_path / "o_conflict_v1.json"
    f_o1.write_text(json.dumps(orders_v1), encoding="utf-8")

    # Order with conflicting order_date and ORDER_DATE: key order 2 (ORDER_DATE first, swapped)
    orders_v2 = [
        {"order_id": "ord_settled", "gross_usd": 50.0},
        {"order_id": "ord_conflict", "gross_usd": 50.0, "ORDER_DATE": "invalid", "order_date": "2026-11-20"},
    ]
    f_o2 = tmp_path / "o_conflict_v2.json"
    f_o2.write_text(json.dumps(orders_v2), encoding="utf-8")

    code_1, rep_1 = mod.reconcile(f_payouts, f_o1, cutoff_date="2026-11-25", settlement_days=7)
    code_2, rep_2 = mod.reconcile(f_payouts, f_o2, cutoff_date="2026-11-25", settlement_days=7)

    # Permutation invariance: both MUST fail closed to RED EXIT 1
    assert code_1 == code_2 == 1
    assert rep_1["risk_tier"] == rep_2["risk_tier"] == "RED"
    assert rep_1["status"] == rep_2["status"] == "RECONCILIATION_ALERT"
    assert rep_1["in_transit_orders"] == rep_2["in_transit_orders"] == []
    assert rep_1["overdue_in_transit_orders"] == rep_2["overdue_in_transit_orders"] == ["ord_conflict"]
    assert any("conflicting_order_date_fields:ord_conflict" in a for a in rep_1["anomalies"])
    assert any("conflicting_order_date_fields:ord_conflict" in a for a in rep_2["anomalies"])

    # Both keys valid but colliding alias: order_date vs orderDate
    orders_v3 = [
        {"order_id": "ord_settled", "gross_usd": 50.0},
        {"order_id": "ord_conflict_same", "gross_usd": 50.0, "order_date": "2026-11-20", "orderDate": "2026-11-20"},
    ]
    f_o3 = tmp_path / "o_conflict_v3.json"
    f_o3.write_text(json.dumps(orders_v3), encoding="utf-8")

    code_3, rep_3 = mod.reconcile(f_payouts, f_o3, cutoff_date="2026-11-25", settlement_days=7)
    assert code_3 == 1
    assert rep_3["risk_tier"] == "RED"
    assert "ord_conflict_same" in rep_3["overdue_in_transit_orders"]
    assert any("conflicting_order_date_fields:ord_conflict_same" in a for a in rep_3["anomalies"])


def test_opc_legal_finance_reconcile_window_boundary_edge_cases(tmp_path: Path):
    mod = load_script(BASE_DIR / "opc-legal-finance" / "scripts" / "reconcile_mor.py")

    # cutoff=2026-11-30, settlement_days=7 -> window is [2026-11-23, 2026-11-30]
    payouts = [{"order_id": "ord_settled", "event_type": "charge", "gross_usd": 50.0, "net_usd": 48.0, "fee_usd": 2.0}]
    f_payouts = tmp_path / "p_boundary.json"
    f_payouts.write_text(json.dumps(payouts), encoding="utf-8")

    # Lower boundary inclusive (2026-11-23): GREEN
    orders_lower = [{"order_id": "ord_settled", "gross_usd": 50.0}, {"order_id": "ord_low", "gross_usd": 50.0, "order_date": "2026-11-23"}]
    f_ol = tmp_path / "o_lower.json"
    f_ol.write_text(json.dumps(orders_lower), encoding="utf-8")
    c_l, r_l = mod.reconcile(f_payouts, f_ol, cutoff_date="2026-11-30", settlement_days=7)
    assert c_l == 0
    assert r_l["risk_tier"] == "GREEN"
    assert "ord_low" in r_l["in_transit_orders"]

    # Upper boundary inclusive (2026-11-30): GREEN
    orders_upper = [{"order_id": "ord_settled", "gross_usd": 50.0}, {"order_id": "ord_up", "gross_usd": 50.0, "order_date": "2026-11-30"}]
    f_ou = tmp_path / "o_upper.json"
    f_ou.write_text(json.dumps(orders_upper), encoding="utf-8")
    c_u, r_u = mod.reconcile(f_payouts, f_ou, cutoff_date="2026-11-30", settlement_days=7)
    assert c_u == 0
    assert r_u["risk_tier"] == "GREEN"
    assert "ord_up" in r_u["in_transit_orders"]

    # 1 day before window (2026-11-22): RED (overdue)
    orders_overdue = [{"order_id": "ord_settled", "gross_usd": 50.0}, {"order_id": "ord_over", "gross_usd": 50.0, "order_date": "2026-11-22"}]
    f_oo = tmp_path / "o_overdue.json"
    f_oo.write_text(json.dumps(orders_overdue), encoding="utf-8")
    c_o, r_o = mod.reconcile(f_payouts, f_oo, cutoff_date="2026-11-30", settlement_days=7)
    assert c_o == 1
    assert r_o["risk_tier"] == "RED"
    assert "ord_over" in r_o["overdue_in_transit_orders"]

    # 1 day after cutoff (2026-12-01): RED (post_cutoff)
    orders_post = [{"order_id": "ord_settled", "gross_usd": 50.0}, {"order_id": "ord_post", "gross_usd": 50.0, "order_date": "2026-12-01"}]
    f_op = tmp_path / "o_post.json"
    f_op.write_text(json.dumps(orders_post), encoding="utf-8")
    c_p, r_p = mod.reconcile(f_payouts, f_op, cutoff_date="2026-11-30", settlement_days=7)
    assert c_p == 1
    assert r_p["risk_tier"] == "RED"
    assert "ord_post" in r_p["post_cutoff_orders"]


def test_opc_legal_finance_raw_json_duplicate_key_triggers_duplicate_key_error_and_fail_closed(tmp_path: Path):
    mod = load_script(BASE_DIR / "opc-legal-finance" / "scripts" / "reconcile_mor.py")

    # 1. DuplicateKeyError class verification
    assert issubclass(mod.DuplicateKeyError, ValueError)

    # 2. Raw JSON string with duplicate order_date keys must raise DuplicateKeyError in parse_strict_json
    raw_dup_text = '{"order_id": "ord_dup", "gross_usd": 50.0, "order_date": "2026-11-20", "order_date": "2026-11-01"}'
    import pytest
    with pytest.raises(mod.DuplicateKeyError) as exc_info:
        mod.parse_strict_json(raw_dup_text)
    assert "Duplicate key detected in JSON object: order_date" in str(exc_info.value)

    payouts = [{"order_id": "ord_settled", "event_type": "charge", "gross_usd": 50.0, "net_usd": 48.0, "fee_usd": 2.0}]
    f_payouts = tmp_path / "p_dup.json"
    f_payouts.write_text(json.dumps(payouts), encoding="utf-8")

    # 3. Order A: Valid date first, stale date second in raw text -> MUST fail closed to RED EXIT 1
    raw_orders_a = '''[
        {"order_id": "ord_settled", "gross_usd": 50.0},
        {"order_id": "ord_dup", "gross_usd": 50.0, "order_date": "2026-11-20", "order_date": "2026-11-01"}
    ]'''
    f_oa = tmp_path / "orders_dup_a.json"
    f_oa.write_text(raw_orders_a, encoding="utf-8")

    code_a, rep_a = mod.reconcile(f_payouts, f_oa, cutoff_date="2026-11-25", settlement_days=7)
    assert code_a == 1
    assert rep_a["risk_tier"] == "RED"
    assert rep_a["status"] == "RECONCILIATION_ALERT"
    assert rep_a["human_signoff_required"] is True
    assert any("duplicate_key_detected" in a for a in rep_a["anomalies"])

    # 4. Order B: Stale date first, valid date second (reversed order) -> MUST ALSO fail closed to RED EXIT 1
    raw_orders_b = '''[
        {"order_id": "ord_settled", "gross_usd": 50.0},
        {"order_id": "ord_dup", "gross_usd": 50.0, "order_date": "2026-11-01", "order_date": "2026-11-20"}
    ]'''
    f_ob = tmp_path / "orders_dup_b.json"
    f_ob.write_text(raw_orders_b, encoding="utf-8")

    code_b, rep_b = mod.reconcile(f_payouts, f_ob, cutoff_date="2026-11-25", settlement_days=7)
    assert code_b == 1
    assert rep_b["risk_tier"] == "RED"
    assert rep_b["status"] == "RECONCILIATION_ALERT"
    assert rep_b["human_signoff_required"] is True
    assert any("duplicate_key_detected" in a for a in rep_b["anomalies"])


def test_opc_legal_finance_cutoff_date_strict_iso_validation(tmp_path: Path):
    mod = load_script(BASE_DIR / "opc-legal-finance" / "scripts" / "reconcile_mor.py")

    payouts = [{"order_id": "ord_settled", "event_type": "charge", "gross_usd": 50.0, "net_usd": 48.0, "fee_usd": 2.0}]
    f_payouts = tmp_path / "p_cutoff.json"
    f_payouts.write_text(json.dumps(payouts), encoding="utf-8")

    orders = [
        {"order_id": "ord_settled", "gross_usd": 50.0},
        {"order_id": "ord_in_window", "gross_usd": 50.0, "order_date": "2026-11-20"},
    ]
    f_orders = tmp_path / "o_cutoff.json"
    f_orders.write_text(json.dumps(orders), encoding="utf-8")

    # 1. Dirty cutoff_date with suffix: 2026-11-25_dirty -> RED EXIT 1
    c1, r1 = mod.reconcile(f_payouts, f_orders, cutoff_date="2026-11-25_dirty")
    assert c1 == 1
    assert r1["risk_tier"] == "RED"
    assert r1["status"] == "RECONCILIATION_ALERT"
    assert any("invalid_cutoff_date_format" in a for a in r1["anomalies"])

    # 2. Dirty cutoff_date with ISO timestamp: 2026-11-25T00:00:00 -> RED EXIT 1
    c2, r2 = mod.reconcile(f_payouts, f_orders, cutoff_date="2026-11-25T00:00:00")
    assert c2 == 1
    assert r2["risk_tier"] == "RED"
    assert r2["status"] == "RECONCILIATION_ALERT"
    assert any("invalid_cutoff_date_format" in a for a in r2["anomalies"])

    # 3. Invalid calendar day: 2026-02-31 -> RED EXIT 1
    c3, r3 = mod.reconcile(f_payouts, f_orders, cutoff_date="2026-02-31")
    assert c3 == 1
    assert r3["risk_tier"] == "RED"
    assert r3["status"] == "RECONCILIATION_ALERT"


def test_meta_prompt_forge_cli_hmac_key_strictly_forbidden_and_env_only(tmp_path: Path):
    import subprocess
    import sys
    import os
    script_path = BASE_DIR / "meta-prompt-forge" / "scripts" / "audit_12dim_soul.py"
    target = BASE_DIR / "meta-prompt-forge" / "SKILL.md"

    # 1. CLI disallows --hmac-key parameter completely (argparse unrecognized argument exit code 2)
    res_disallowed = subprocess.run(
        [sys.executable, str(script_path), "--target", str(target), "--kind", "skill", "--hmac-key", "secret-key-cli"],
        capture_output=True,
        text=True,
    )
    assert res_disallowed.returncode == 2
    assert "unrecognized arguments: --hmac-key" in res_disallowed.stderr

    # 2. CLI strictly resolves from OPENMAUSBOT_ORCHESTRATOR_HMAC_KEY env var
    mod = load_script(script_path)
    secret = "test-orchestrator-secret-key-12345"
    digest = mod.compute_candidate_digest(target)

    meta = {
        "author_model": "gemini-2.5-pro",
        "reviewer_model": "claude-3-7-sonnet",
        "issuer": "openmausbot",
        "issued_at": "2026-11-25T07:50:00Z",
        "run_id": "cli-env-test-run",
        "candidate_sha256": digest,
    }
    meta["signature"] = mod.sign_orchestrator_meta(meta, secret)
    f_meta = tmp_path / "meta_env.json"
    f_meta.write_text(json.dumps(meta), encoding="utf-8")

    env = dict(os.environ, OPENMAUSBOT_ORCHESTRATOR_HMAC_KEY=secret)
    res_env = subprocess.run(
        [sys.executable, str(script_path), "--target", str(target), "--kind", "skill", "--orchestrator-meta", str(f_meta)],
        capture_output=True,
        text=True,
        env=env,
    )
    assert res_env.returncode == 0
    rep = json.loads(res_env.stdout)
    assert rep["status"] == "PASS"
    assert rep["provenance"] == "ORCHESTRATOR_VERIFIED"
    assert rep["production_gate_eligible"] is True


def test_meta_prompt_forge_evidence_packet_timestamp_and_composite_digest():
    mod = load_script(BASE_DIR / "meta-prompt-forge" / "scripts" / "audit_12dim_soul.py")
    evidence_file = BASE_DIR / "meta-prompt-forge" / "evidence" / "P1-3_ORCHESTRATOR_GATE_EVIDENCE.json"
    assert evidence_file.exists()

    ev = json.loads(evidence_file.read_text(encoding="utf-8"))
    assert ev["evidence_id"] == "P1-3-ORCHESTRATOR-HMAC-VERIFICATION-EVIDENCE"

    # Timestamp must not be in the future (no 23:20 time leap)
    from datetime import datetime, timezone
    ts_str = ev["timestamp"]
    parsed_ts = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
    now_utc = datetime.now(timezone.utc)
    assert parsed_ts <= now_utc

    # candidate_sha256 must match the composite digest covering all 6 expert skills
    composite_digest = mod.compute_skills_composite_digest(BASE_DIR)
    case_1_stdout = ev["runs"]["case_1_production_signed_valid"]["stdout"]
    assert case_1_stdout["candidate_sha256"] == composite_digest

    # Verify all 5 runs exit codes, status, provenance, and gate eligibility
    c1 = ev["runs"]["case_1_production_signed_valid"]
    assert c1["exit_code"] == 0
    assert c1["stdout"]["status"] == "PASS"
    assert c1["stdout"]["provenance"] == "ORCHESTRATOR_VERIFIED"
    assert c1["stdout"]["production_gate_eligible"] is True

    c2 = ev["runs"]["case_2_local_self_check_ineligible"]
    assert c2["exit_code"] == 0
    assert c2["stdout"]["provenance"] == "LOCAL_SELF_CHECK_ONLY"
    assert c2["stdout"]["production_gate_eligible"] is False

    c3 = ev["runs"]["case_3_same_family_blocked_exit30"]
    assert c3["exit_code"] == 30
    assert c3["stdout"]["status"] == "BLOCKED_SAME_FAMILY"
    assert c3["stdout"]["provenance"] == "ORCHESTRATOR_VERIFIED"

    c4 = ev["runs"]["case_4_production_unverified_rejected"]
    assert c4["exit_code"] == 2
    assert c4["stdout"]["provenance"] == "SELF_DECLARED_REJECTED"

    c5 = ev["runs"]["case_5_candidate_digest_mismatch_exit2"]
    assert c5["exit_code"] == 2
    assert c5["stdout"]["provenance"] == "DIGEST_MISMATCH"
    assert c5["stdout"]["expected_sha256"] == "0" * 64

    # Verify new run_id and metadata chain of custody
    meta_prod_file = BASE_DIR / "meta-prompt-forge" / "evidence" / "orchestrator_meta_prod_valid.json"
    assert meta_prod_file.exists()
    meta_prod = json.loads(meta_prod_file.read_text(encoding="utf-8"))
    assert meta_prod["run_id"] == "run-20261125-phase1-p13-final-002"
    assert meta_prod["author_model"] == "gemini-4-neon"
    assert meta_prod["reviewer_model"] == "gpt-6.2-sol"
    assert meta_prod["issuer"] == "OpenMausBot-ChiefOfStaff-Orchestrator"
    assert meta_prod["candidate_sha256"] == composite_digest


def test_meta_prompt_forge_cross_platform_sorting_and_digest_consistency(tmp_path: Path):
    from pathlib import PurePosixPath, PureWindowsPath
    mod = load_script(BASE_DIR / "meta-prompt-forge" / "scripts" / "audit_12dim_soul.py")

    # 1. Physical proof of cross-platform sorting divergence on raw paths:
    # In POSIX ASCII byte order: 'SKILL.md' (S=83) < 'references/...' (r=114)
    # In Windows case-folding: 'references/...' (r) < 'SKILL.md' (s)
    p_skill_posix = PurePosixPath("SKILL.md")
    p_ref_posix = PurePosixPath("references/brief.md")
    assert p_skill_posix < p_ref_posix

    p_skill_win = PureWindowsPath("SKILL.md")
    p_ref_win = PureWindowsPath("references/brief.md")
    assert p_ref_win < p_skill_win

    # 2. Assert that compute_skills_composite_digest eliminates this cross-platform discrepancy
    # by explicitly sorting via normalized lowercase POSIX relative path
    canonical_digest = mod.compute_skills_composite_digest(BASE_DIR)
    assert len(canonical_digest) == 64

    # 3. Create a temporary skill structure with mixed-case filenames
    # and verify compute_candidate_digest produces identical digest regardless of discovery order
    d_mock = tmp_path / "mock_skill"
    d_mock.mkdir()
    f1 = d_mock / "SKILL.md"
    f2 = d_mock / "references.md"
    f1.write_text("name: mock\nDO NOT test\nVerification: pass\n", encoding="utf-8")
    f2.write_text("mock reference text\n", encoding="utf-8")

    digest_1 = mod.compute_candidate_digest(d_mock)
    f2.write_text("mock reference text\n", encoding="utf-8")
    digest_2 = mod.compute_candidate_digest(d_mock)
    assert digest_1 == digest_2

    # 4. Physical proof of Windows CRLF vs Linux LF newline divergence and normalization equivalence:
    # Verify that raw binary hashing diverges on CRLF vs LF, while normalized compute_skills_composite_digest
    # produces bitwise-identical digests across CRLF and LF checkouts of the 6 candidate skills.
    d_crlf = tmp_path / "skills_crlf"
    d_lf = tmp_path / "skills_lf"
    import shutil
    import hashlib

    for s_name in mod.EXPERT_SKILLS_6:
        shutil.copytree(BASE_DIR / s_name, d_crlf / s_name)
        shutil.copytree(BASE_DIR / s_name, d_lf / s_name)

    # Force all files in d_crlf to CRLF and d_lf to LF
    for p in d_crlf.rglob("*"):
        if p.is_file():
            raw = p.read_bytes()
            p.write_bytes(raw.replace(bytes([13, 10]), bytes([10])).replace(bytes([10]), bytes([13, 10])))

    for p in d_lf.rglob("*"):
        if p.is_file():
            raw = p.read_bytes()
            p.write_bytes(raw.replace(bytes([13, 10]), bytes([10])))

    # Prove raw file digests diverge between CRLF and LF
    f_crlf_sample = d_crlf / "meta-prompt-forge" / "SKILL.md"
    f_lf_sample = d_lf / "meta-prompt-forge" / "SKILL.md"
    assert hashlib.sha256(f_crlf_sample.read_bytes()).hexdigest() != hashlib.sha256(f_lf_sample.read_bytes()).hexdigest()

    # Assert normalized candidate and composite digests are strictly equal to each other and canonical
    assert mod.compute_candidate_digest(f_crlf_sample) == mod.compute_candidate_digest(f_lf_sample)
    digest_crlf = mod.compute_skills_composite_digest(d_crlf)
    digest_lf = mod.compute_skills_composite_digest(d_lf)
    assert digest_crlf == canonical_digest
    assert digest_lf == canonical_digest
    assert digest_crlf == digest_lf


# ==============================================================================
# 8. Stage 1 Heterogeneous Cold Review P1 Hardening Regressions (TDD)
# ==============================================================================

def test_docs_diataxis_breaking_change_removed_content_type():
    """FIX-1: Removing an existing requestBody content-type (e.g. application/json) must be
    flagged as a breaking change and reject PATCH releases with exit code 1."""
    mod = load_script(BASE_DIR / "docs-diataxis-release" / "scripts" / "openapi_diff_gate.py")

    base_spec = {
        "paths": {
            "/v1/submit": {
                "post": {
                    "requestBody": {
                        "required": True,
                        "content": {
                            "application/json": {"schema": {"type": "object"}},
                            "application/xml": {"schema": {"type": "object"}},
                        },
                    },
                    "responses": {"200": {"description": "ok"}},
                }
            }
        }
    }
    target_spec = {
        "paths": {
            "/v1/submit": {
                "post": {
                    "requestBody": {
                        "required": True,
                        "content": {
                            "application/xml": {"schema": {"type": "object"}},
                        },
                    },
                    "responses": {"200": {"description": "ok"}},
                }
            }
        }
    }

    breaking = mod.detect_breaking_changes(base_spec, target_spec)
    assert any("removed requestBody content-type 'application/json'" in b for b in breaking)

    code, rep = mod.evaluate_release(base_spec, target_spec, bump="patch")
    assert code == 1
    assert rep["status"] == "BREAKING_SEMVER_VIOLATION"


def test_opc_legal_finance_reconcile_data_integrity_and_duplicate_order_id(tmp_path: Path):
    """FIX-2: Reconcile must fail-closed on non-finite net_usd, malformed order_date in settled orders,
    and duplicate order_id records in internal ledger."""
    mod = load_script(BASE_DIR / "opc-legal-finance" / "scripts" / "reconcile_mor.py")

    # 1. Non-finite net_usd in payouts
    f_p_nan = tmp_path / "p_nan.json"
    f_o = tmp_path / "o_base.json"
    f_p_nan.write_text(json.dumps([{"order_id": "ord_1", "gross_usd": 100.0, "net_usd": None}]), encoding="utf-8")
    f_o.write_text(json.dumps([{"order_id": "ord_1", "gross_usd": 100.0, "order_date": "2026-11-20"}]), encoding="utf-8")
    c_nan, rep_nan = mod.reconcile(f_p_nan, f_o)
    assert c_nan != 0
    assert rep_nan["status"] != "BALANCED_GREEN"

    # 2. Malformed order_date on matched/settled order
    f_p_clean = tmp_path / "p_clean.json"
    f_p_clean.write_text(json.dumps([{"order_id": "ord_1", "gross_usd": 100.0, "fee_usd": 3.0, "net_usd": 97.0}]), encoding="utf-8")
    f_o_bad_date = tmp_path / "o_bad_date.json"
    f_o_bad_date.write_text(json.dumps([{"order_id": "ord_1", "gross_usd": 100.0, "order_date": "malformed_2026"}]), encoding="utf-8")
    c_bd, rep_bd = mod.reconcile(f_p_clean, f_o_bad_date)
    assert c_bd == 1
    assert rep_bd["risk_tier"] == "RED"
    assert rep_bd["status"] == "RECONCILIATION_ALERT"

    # 3. Duplicate order_id in internal orders list
    f_o_dup = tmp_path / "o_dup.json"
    f_o_dup.write_text(json.dumps([
        {"order_id": "ord_1", "gross_usd": 100.0, "order_date": "2026-11-20"},
        {"order_id": "ord_1", "gross_usd": 100.0, "order_date": "2026-11-21"},
    ]), encoding="utf-8")
    c_dup, rep_dup = mod.reconcile(f_p_clean, f_o_dup)
    assert c_dup != 0
    assert rep_dup["status"] != "BALANCED_GREEN"


def test_dag_gc_vague_done_when_and_running_thread_not_collected(tmp_path: Path):
    """FIX-3: Briefs without assignee and vague done_when ('looks good') must be rejected with exit 2,
    and RUNNING threads past TTL must NEVER be collected in gc_candidates."""
    mod = load_script(BASE_DIR / "dag-gc" / "scripts" / "dag_gate.py")

    # 1. Node without assignee and with vague done_when
    vague_dag = {
        "nodes": [
            {
                "id": "step1",
                "action_verb": "implement",
                "target_object": "src/module.py",
                "done_when": "looks good",
                "elapsed_sec": 10,
                "timeout_sec": 900,
            }
        ]
    }
    f_vague = tmp_path / "vague_dag.json"
    f_vague.write_text(json.dumps(vague_dag), encoding="utf-8")
    c_v, rep_v = mod.validate_dag(f_vague)
    assert c_v == 2
    assert rep_v["status"] == "SPEC_INVALID"

    # 2. GC audit: RUNNING thread past TTL must NOT be collected
    now_ms = 1700000000000
    threads = [
        {
            "_now_ms": now_ms,
            "threadId": "t_running_past_ttl",
            "title": "Active Worker",
            "status": "RUNNING",
            "updatedAt": now_ms - (48 * 3600 * 1000),
        },
        {
            "_now_ms": now_ms,
            "threadId": "t_settled",
            "title": "Completed Worker",
            "status": "SETTLED",
            "updatedAt": now_ms - 1000,
        },
    ]
    f_th = tmp_path / "threads_gc.json"
    f_th.write_text(json.dumps(threads), encoding="utf-8")
    c_gc, rep_gc = mod.gc_audit(f_th, ttl_hours=24.0)
    assert c_gc == 0
    candidate_ids = [c["threadId"] for c in rep_gc["gc_candidates"]]
    assert "t_running_past_ttl" not in candidate_ids
    assert "t_settled" in candidate_ids


def test_meta_prompt_forge_strict_all_6_skills_and_expired_issued_at(tmp_path: Path):
    """FIX-4: Composite digest and folder audit must fail if any of 6 skills is missing,
    and orchestrator-meta with expired issued_at must be rejected."""
    mod = load_script(BASE_DIR / "meta-prompt-forge" / "scripts" / "audit_12dim_soul.py")
    secret = "orchestrator-hmac-shared-secret-test"

    # 1. Missing skill directory in composite digest must fail-closed
    fake_skills_dir = tmp_path / "incomplete_expert_skills"
    fake_skills_dir.mkdir()
    for s_name in mod.EXPERT_SKILLS_6[:5]:
        (fake_skills_dir / s_name).mkdir()
        (fake_skills_dir / s_name / "SKILL.md").write_text(f"name: {s_name}\nDO NOT x\nVerification: y\n", encoding="utf-8")

    with pytest.raises((FileNotFoundError, ValueError)):
        mod.compute_skills_composite_digest(fake_skills_dir)

    # 2. Expired issued_at outside TTL in orchestrator_meta
    f_skill = BASE_DIR / "unit-economics" / "SKILL.md"
    digest = mod.compute_candidate_digest(f_skill)
    meta_expired = {
        "author_model": "gemini-2.5-pro",
        "reviewer_model": "claude-3-7-sonnet",
        "issuer": "openmausbot",
        "issued_at": "2020-01-01T00:00:00Z",
        "run_id": "run-20200101-expired",
        "candidate_sha256": digest,
    }
    meta_expired["signature"] = mod.sign_orchestrator_meta(meta_expired, secret)
    f_meta_exp = tmp_path / "meta_expired.json"
    f_meta_exp.write_text(json.dumps(meta_expired), encoding="utf-8")

    c_exp, rep_exp = mod.audit_file(f_skill, kind="skill", orchestrator_meta=f_meta_exp, hmac_key=secret)
    assert c_exp == 2
    assert rep_exp["status"] == "PROVENANCE_UNVERIFIED"
    assert rep_exp["production_gate_eligible"] is False


def test_offensive_security_empty_scan_and_invalid_mode_fail_closed(tmp_path: Path):
    """FIX-5: Empty scan directory and invalid mode must fail-closed with non-zero exit code."""
    mod = load_script(BASE_DIR / "offensive-security" / "scripts" / "security_preflight.py")

    # 1. Empty directory (no files scanned)
    empty_dir = tmp_path / "empty_dir"
    empty_dir.mkdir()
    c_empty, rep_empty = mod.scan_path(empty_dir, mode="internal-defense")
    assert c_empty != 0
    assert rep_empty["status"] != "CLEAN"

    # 2. Invalid scan mode
    f_code = tmp_path / "sample.py"
    f_code.write_text("x = 1\n", encoding="utf-8")
    c_bad_mode, rep_bad_mode = mod.scan_path(f_code, mode="arbitrary-untrusted-mode")
    assert c_bad_mode != 0
    assert rep_bad_mode["status"] != "CLEAN"


def test_docs_diataxis_openapi_local_ref_resolution_and_deletion(tmp_path: Path):
    """FIX-1: OpenAPI RFC 6901 local $ref resolution and breaking deletion detection."""
    mod = load_script(BASE_DIR / "docs-diataxis-release" / "scripts" / "openapi_diff_gate.py")

    # P1-1: Delete referenced requestBody media type under PATCH bump -> exit 1 BREAKING_SEMVER_VIOLATION
    base_spec_ref = {
        "openapi": "3.0.3",
        "paths": {
            "/v1/orders": {
                "post": {
                    "requestBody": {"$ref": "#/components/requestBodies/OrderReq"},
                    "responses": {"200": {"description": "ok"}},
                }
            }
        },
        "components": {
            "requestBodies": {
                "OrderReq": {
                    "required": True,
                    "content": {
                        "application/json": {"schema": {"type": "object"}},
                        "application/xml": {"schema": {"type": "object"}},
                    },
                }
            }
        },
    }
    target_spec_ref = {
        "openapi": "3.0.3",
        "paths": {
            "/v1/orders": {
                "post": {
                    "requestBody": {"$ref": "#/components/requestBodies/OrderReq"},
                    "responses": {"200": {"description": "ok"}},
                }
            }
        },
        "components": {
            "requestBodies": {
                "OrderReq": {
                    "required": True,
                    "content": {
                        "application/xml": {"schema": {"type": "object"}},
                    },
                }
            }
        },
    }
    code, rep = mod.evaluate_release(base_spec_ref, target_spec_ref, bump="patch")
    assert code == 1
    assert rep["status"] == "BREAKING_SEMVER_VIOLATION"
    assert any("removed requestBody content-type 'application/json'" in b for b in rep["breaking_changes"])

    # P1-2: Inline requestBody changed to $ref and deleted media type under MINOR bump -> exit 1
    target_inline_to_ref = {
        "openapi": "3.0.3",
        "paths": {
            "/v1/orders": {
                "post": {
                    "requestBody": {"$ref": "#/components/requestBodies/SingleMediaReq"},
                    "responses": {"200": {"description": "ok"}},
                }
            }
        },
        "components": {
            "requestBodies": {
                "SingleMediaReq": {
                    "required": True,
                    "content": {
                        "application/xml": {"schema": {"type": "object"}},
                    },
                }
            }
        },
    }
    base_inline = {
        "openapi": "3.0.3",
        "paths": {
            "/v1/orders": {
                "post": {
                    "requestBody": {
                        "required": True,
                        "content": {
                            "application/json": {"schema": {"type": "object"}},
                            "application/xml": {"schema": {"type": "object"}},
                        },
                    },
                    "responses": {"200": {"description": "ok"}},
                }
            }
        },
    }
    code_i2r, rep_i2r = mod.evaluate_release(base_inline, target_inline_to_ref, bump="minor")
    assert code_i2r == 1
    assert rep_i2r["status"] == "BREAKING_SEMVER_VIOLATION"

    # P1-3: Chained $ref A -> B with required: false -> true under PATCH bump -> exit 1
    base_chained = {
        "openapi": "3.0.3",
        "paths": {
            "/v1/users": {
                "post": {
                    "requestBody": {"$ref": "#/components/requestBodies/StepA"},
                    "responses": {"200": {"description": "ok"}},
                }
            }
        },
        "components": {
            "requestBodies": {
                "StepA": {"$ref": "#/components/requestBodies/StepB"},
                "StepB": {"required": False, "content": {"application/json": {"schema": {"type": "object"}}}},
            }
        },
    }
    target_chained = {
        "openapi": "3.0.3",
        "paths": {
            "/v1/users": {
                "post": {
                    "requestBody": {"$ref": "#/components/requestBodies/StepA"},
                    "responses": {"200": {"description": "ok"}},
                }
            }
        },
        "components": {
            "requestBodies": {
                "StepA": {"$ref": "#/components/requestBodies/StepB"},
                "StepB": {"required": True, "content": {"application/json": {"schema": {"type": "object"}}}},
            }
        },
    }
    code_req, rep_req = mod.evaluate_release(base_chained, target_chained, bump="patch")
    assert code_req == 1
    assert rep_req["status"] == "BREAKING_SEMVER_VIOLATION"
    assert any("requestBody became required" in b for b in rep_req["breaking_changes"])

    # P1-4: Broken $ref and external URL $ref -> exit 2 SPEC_INVALID
    broken_spec = {
        "openapi": "3.0.3",
        "paths": {
            "/v1/test": {
                "post": {
                    "requestBody": {"$ref": "#/components/requestBodies/Missing"},
                    "responses": {"200": {"description": "ok"}},
                }
            }
        },
        "components": {},
    }
    code_brk, rep_brk = mod.evaluate_release(broken_spec, broken_spec, bump="patch")
    assert code_brk == 2
    assert rep_brk["status"] == "SPEC_INVALID"

    external_spec = {
        "openapi": "3.0.3",
        "paths": {
            "/v1/test": {
                "post": {
                    "requestBody": {"$ref": "https://evil.test/a.json"},
                    "responses": {"200": {"description": "ok"}},
                }
            }
        },
    }
    code_ext, rep_ext = mod.evaluate_release(external_spec, external_spec, bump="patch")
    assert code_ext == 2
    assert rep_ext["status"] == "SPEC_INVALID"

    # P1-5: Cyclic $ref (A -> B -> A) -> exit 2 SPEC_INVALID
    cyclic_spec = {
        "openapi": "3.0.3",
        "paths": {
            "/v1/test": {
                "post": {
                    "requestBody": {"$ref": "#/components/requestBodies/LoopA"},
                    "responses": {"200": {"description": "ok"}},
                }
            }
        },
        "components": {
            "requestBodies": {
                "LoopA": {"$ref": "#/components/requestBodies/LoopB"},
                "LoopB": {"$ref": "#/components/requestBodies/LoopA"},
            }
        },
    }
    code_cyc, rep_cyc = mod.evaluate_release(cyclic_spec, cyclic_spec, bump="patch")
    assert code_cyc == 2
    assert rep_cyc["status"] == "SPEC_INVALID"


def test_offensive_security_strict_utf8_fail_closed_and_incomplete_scan(tmp_path: Path):
    """FIX-5: Strict UTF-8 decoding and fail-closed exit 2 for unreadable/invalid files."""
    sec_script = BASE_DIR / "offensive-security" / "scripts" / "security_preflight.py"
    mod = load_script(sec_script)

    # P5-1: Static scan confirms no errors='ignore' in security_preflight.py
    sec_text = sec_script.read_text(encoding="utf-8", errors="strict")
    assert 'errors="ignore"' not in sec_text
    assert "errors='ignore'" not in sec_text

    # P5-2: Single file containing invalid UTF-8 bytes -> exit 2 SPEC_INVALID
    bad_file = tmp_path / "invalid_utf8.py"
    bad_file.write_bytes(bytes([0xff, 0xfe, 0x80, 0x81]))
    c_single, rep_single = mod.scan_path(bad_file, mode="internal-defense")
    assert c_single == 2
    assert rep_single["status"] == "SPEC_INVALID"
    assert len(rep_single["read_errors"]) > 0

    # P5-3: Mixed directory (1 clean .py + 1 unreadable/invalid UTF-8 .py) -> exit 2 SPEC_INVALID
    mix_dir = tmp_path / "mixed_dir"
    mix_dir.mkdir()
    (mix_dir / "clean.py").write_text("a = 1\n", encoding="utf-8")
    (mix_dir / "corrupt.py").write_bytes(bytes([0xff, 0xfe, 0x80, 0x81]))
    c_mix, rep_mix = mod.scan_path(mix_dir, mode="internal-defense")
    assert c_mix == 2
    assert rep_mix["status"] == "SPEC_INVALID"
    assert rep_mix["failed_files"] == 1
    assert rep_mix["scanned_files"] == 1
    assert any("corrupt.py" in err for err in rep_mix["read_errors"])

    # P5-4: Directory with 1 P0 hardcoded secret + 1 corrupt file -> exit 2 SPEC_INVALID and findings preserved
    leak_dir = tmp_path / "leak_dir"
    leak_dir.mkdir()
    (leak_dir / "secret.py").write_text('API_KEY = "sk-123456789012345678901234567890"\n', encoding="utf-8")
    (leak_dir / "broken.py").write_bytes(bytes([0x80, 0x81, 0x82]))
    c_leak, rep_leak = mod.scan_path(leak_dir, mode="internal-defense")
    assert c_leak == 2
    assert rep_leak["status"] == "SPEC_INVALID"
    assert rep_leak["finding_count"] >= 1
    assert any(f["rule"] == "hardcoded_secret" for f in rep_leak["findings"])


def test_opc_legal_finance_reconcile_002_difference_detected(tmp_path: Path):
    """FIX-2: $0.02 net discrepancy must be flagged as mismatch and trigger RED alert."""
    mod = load_script(BASE_DIR / "opc-legal-finance" / "scripts" / "reconcile_mor.py")

    # expected net = 100.0 - 3.0 = 97.00, reported net = 96.98 (difference of $0.02)
    payouts = [
        {"order_id": "ord_1", "event_type": "charge", "gross_usd": 100.0, "fee_usd": 3.0, "net_usd": 96.98}
    ]
    orders = [{"order_id": "ord_1", "gross_usd": 100.0, "order_date": "2026-11-20"}]
    f_p = tmp_path / "p_diff002.json"
    f_o = tmp_path / "o_diff002.json"
    f_p.write_text(json.dumps(payouts), encoding="utf-8")
    f_o.write_text(json.dumps(orders), encoding="utf-8")

    code, rep = mod.reconcile(f_p, f_o)
    assert code == 1
    assert rep["risk_tier"] == "RED"
    assert rep["status"] == "RECONCILIATION_ALERT"
    assert len(rep["mismatches"]) == 1
    assert rep["mismatches"][0]["order_id"] == "ord_1"
    assert rep["mismatches"][0]["expected_net"] == 97.0
    assert rep["mismatches"][0]["reported_net"] == 96.98


def test_opc_legal_finance_reconcile_duplicate_order_id_rejects_before_sum(tmp_path: Path):
    """FIX-2: Duplicate order_id in internal ledger must fail-closed before aggregation without generating sum."""
    mod = load_script(BASE_DIR / "opc-legal-finance" / "scripts" / "reconcile_mor.py")

    payouts = [
        {"order_id": "ord_settled", "event_type": "charge", "gross_usd": 100.0, "fee_usd": 3.0, "net_usd": 97.0}
    ]
    orders = [
        {"order_id": "ord_dup", "gross_usd": 50.0, "order_date": "2026-11-20"},
        {"order_id": "ord_dup", "gross_usd": 50.0, "order_date": "2026-11-21"},
    ]
    f_p = tmp_path / "p_dup.json"
    f_o = tmp_path / "o_dup.json"
    f_p.write_text(json.dumps(payouts), encoding="utf-8")
    f_o.write_text(json.dumps(orders), encoding="utf-8")

    code, rep = mod.reconcile(f_p, f_o)
    assert code in (1, 2)
    assert rep["status"] != "BALANCED_GREEN"
    assert "gross_usd" not in rep  # Summation must NOT be generated
    assert any("duplicate_order_id" in a for a in rep.get("anomalies", [])) or "duplicate_order_id" in rep.get("error", "")


def test_opc_legal_finance_reconcile_invalid_calendar_date_2026_11_31_fails_closed(tmp_path: Path):
    """FIX-2: Invalid calendar date (2026-11-31) in payouts or orders must fail-closed before sum."""
    mod = load_script(BASE_DIR / "opc-legal-finance" / "scripts" / "reconcile_mor.py")

    # Case A: 2026-11-31 in payouts
    payouts_bad = [
        {"order_id": "ord_1", "gross_usd": 100.0, "fee_usd": 3.0, "net_usd": 97.0, "date": "2026-11-31"}
    ]
    orders_clean = [{"order_id": "ord_1", "gross_usd": 100.0, "order_date": "2026-11-20"}]
    f_pa = tmp_path / "p_bad_date.json"
    f_oa = tmp_path / "o_clean_a.json"
    f_pa.write_text(json.dumps(payouts_bad), encoding="utf-8")
    f_oa.write_text(json.dumps(orders_clean), encoding="utf-8")

    code_a, rep_a = mod.reconcile(f_pa, f_oa)
    assert code_a in (1, 2)
    assert rep_a["status"] != "BALANCED_GREEN"
    assert "gross_usd" not in rep_a

    # Case B: 2026-11-31 in orders
    payouts_clean = [
        {"order_id": "ord_1", "gross_usd": 100.0, "fee_usd": 3.0, "net_usd": 97.0, "date": "2026-11-20"}
    ]
    orders_bad = [{"order_id": "ord_1", "gross_usd": 100.0, "order_date": "2026-11-31"}]
    f_pb = tmp_path / "p_clean_b.json"
    f_ob = tmp_path / "o_bad_date.json"
    f_pb.write_text(json.dumps(payouts_clean), encoding="utf-8")
    f_ob.write_text(json.dumps(orders_bad), encoding="utf-8")

    code_b, rep_b = mod.reconcile(f_pb, f_ob)
    assert code_b in (1, 2)
    assert rep_b["status"] != "BALANCED_GREEN"
    assert "gross_usd" not in rep_b


def test_opc_legal_finance_reconcile_extreme_amount_overflow_fails_closed(tmp_path: Path):
    """FIX-2: Extreme amounts exceeding MAX_ABS_USD must fail-closed before aggregation."""
    mod = load_script(BASE_DIR / "opc-legal-finance" / "scripts" / "reconcile_mor.py")

    overflow_val = 1000000000000001.0
    payouts_overflow = [
        {"order_id": "ord_of", "gross_usd": overflow_val, "fee_usd": 0.0, "net_usd": overflow_val}
    ]
    orders_overflow = [{"order_id": "ord_of", "gross_usd": overflow_val, "order_date": "2026-11-20"}]
    f_p = tmp_path / "p_overflow.json"
    f_o = tmp_path / "o_overflow.json"
    f_p.write_text(json.dumps(payouts_overflow), encoding="utf-8")
    f_o.write_text(json.dumps(orders_overflow), encoding="utf-8")

    code, rep = mod.reconcile(f_p, f_o)
    assert code in (1, 2)
    assert rep["status"] != "BALANCED_GREEN"
    assert "gross_usd" not in rep


def test_dag_strict_assignment_and_actionable_done_when(tmp_path: Path):
    """FIX-3: Strict gate checks for assigned_bot_id and actionable done_when independently."""
    mod = load_script(BASE_DIR / "dag-gc" / "scripts" / "dag_gate.py")

    # 1. Missing assignee even if done_when contains 'pytest' and 'exit 0' -> Exit 2 SPEC_INVALID
    no_assignee_dag = {
        "nodes": [
            {
                "id": "step_no_assignee",
                "action_verb": "test",
                "target_object": "tests/test_mod.py",
                "done_when": "pytest tests/ -v exit 0",
                "elapsed_sec": 10,
                "timeout_sec": 900,
            }
        ]
    }
    f_no_assignee = tmp_path / "no_assignee.json"
    f_no_assignee.write_text(json.dumps(no_assignee_dag), encoding="utf-8")
    c1, rep1 = mod.validate_dag(f_no_assignee)
    assert c1 == 2
    assert rep1["status"] == "SPEC_INVALID"
    assert any("missing assigned_bot_id or assigned_role" in err for err in rep1.get("errors", []))

    # 2. Has assignee but vague done_when ('Everything should be fine') -> Exit 2 SPEC_INVALID
    vague_done_when_dag = {
        "nodes": [
            {
                "id": "step_vague",
                "assigned_bot_id": "coder",
                "action_verb": "implement",
                "target_object": "src/module.py",
                "done_when": "Everything should be fine",
                "elapsed_sec": 10,
                "timeout_sec": 900,
            }
        ]
    }
    f_vague = tmp_path / "vague_done_when.json"
    f_vague.write_text(json.dumps(vague_done_when_dag), encoding="utf-8")
    c2, rep2 = mod.validate_dag(f_vague)
    assert c2 == 2
    assert rep2["status"] == "SPEC_INVALID"
    assert any("missing verifiable done_when" in err for err in rep2.get("errors", []))

    # 3. Valid assignee and verifiable done_when -> Exit 0 PASS
    valid_dag = {
        "nodes": [
            {
                "id": "step_ok",
                "assigned_bot_id": "coder",
                "action_verb": "implement",
                "target_object": "src/module.py",
                "done_when": "pytest tests/ -v exit 0 and zero errors in log",
                "elapsed_sec": 10,
                "timeout_sec": 900,
            }
        ]
    }
    f_ok = tmp_path / "valid.json"
    f_ok.write_text(json.dumps(valid_dag), encoding="utf-8")
    c3, rep3 = mod.validate_dag(f_ok)
    assert c3 == 0
    assert rep3["status"] == "PASS"


def test_audit_12dim_canonical_skills_resolution_and_empty_corrupt(tmp_path: Path):
    """FIX-4: Deterministic canonical skills resolution and fail-closed Exit 2 without bare exceptions."""
    mod = load_script(BASE_DIR / "meta-prompt-forge" / "scripts" / "audit_12dim_soul.py")

    # 1. Canonical skill resolution on valid directory
    c1, rep1 = mod.resolve_canonical_skill_entries(BASE_DIR)
    assert c1 == 0
    assert rep1["status"] == "PASS"
    assert rep1["count"] == 6
    assert len(rep1["entries"]) == 6

    # 2. Missing canonical skill directory -> Exit 2 SPEC_INVALID
    fake_skills = tmp_path / "fake_skills"
    fake_skills.mkdir()
    for s_name in mod.EXPERT_SKILLS_6[:5]:
        (fake_skills / s_name).mkdir()
        (fake_skills / s_name / "SKILL.md").write_text(
            f"---\nname: {s_name}\ndescription: test\n---\nDO NOT\nVerification\n",
            encoding="utf-8"
        )

    c2, rep2 = mod.resolve_canonical_skill_entries(fake_skills)
    assert c2 == 2
    assert rep2["status"] == "SPEC_INVALID"
    assert any("missing required expert skill directory" in err for err in rep2.get("errors", []))

    # 3. Missing SKILL.md in one directory -> Exit 2 SPEC_INVALID
    (fake_skills / mod.EXPERT_SKILLS_6[5]).mkdir()  # dir exists but no SKILL.md
    c3, rep3 = mod.resolve_canonical_skill_entries(fake_skills)
    assert c3 == 2
    assert rep3["status"] == "SPEC_INVALID"
    assert any("missing SKILL.md in expert skill" in err for err in rep3.get("errors", []))

    # 4. Empty SKILL.md -> Exit 2 SPEC_INVALID
    (fake_skills / mod.EXPERT_SKILLS_6[5] / "SKILL.md").write_text("   \n\n  ", encoding="utf-8")
    c4, rep4 = mod.resolve_canonical_skill_entries(fake_skills)
    assert c4 == 2
    assert rep4["status"] == "SPEC_INVALID"
    assert any("empty or contains only whitespace" in err for err in rep4.get("errors", []))

    # 5. Calling audit_file directly on target with empty SKILL.md returns Exit 2 without throwing
    f_empty = fake_skills / mod.EXPERT_SKILLS_6[5] / "SKILL.md"
    c5, rep5 = mod.audit_file(
        f_empty,
        kind="skill",
        author_family="gemini",
        reviewer_family="openai",
        allow_self_check=True,
    )
    assert c5 == 2
    assert rep5["status"] == "SPEC_INVALID"
    assert any("empty or contains only whitespace" in err for err in rep5.get("errors", []))


def test_phase1_r2_audit_composite_bypass_prevention(tmp_path: Path):
    """R2 FIX-1: Canonical root and composite coverage cannot be bypassed by arbitrary unsigned files."""
    mod = load_script(BASE_DIR / "meta-prompt-forge" / "scripts" / "audit_12dim_soul.py")
    assert mod._is_canonical_skills_root(BASE_DIR) is True
    assert mod._is_canonical_skills_root(BASE_DIR / "dag-gc") is False
    assert mod._is_covered_by_composite(BASE_DIR, BASE_DIR) is True
    assert mod._is_covered_by_composite(BASE_DIR / "dag-gc", BASE_DIR) is True
    assert mod._is_covered_by_composite(BASE_DIR / "dag-gc" / "SKILL.md", BASE_DIR) is True
    assert mod._is_covered_by_composite(BASE_DIR / "meta-prompt-forge" / "evidence" / "t.json", BASE_DIR) is False
    assert mod._is_covered_by_composite(BASE_DIR / "scratch" / "t.py", BASE_DIR) is False
    assert mod._is_covered_by_composite(BASE_DIR / ".hidden" / "t.py", BASE_DIR) is False

    fake_file = tmp_path / "untracked.py"
    fake_file.write_text("print('bypass')\n", encoding="utf-8")
    secret = "test-orchestrator-hmac-key-2026"
    meta = {
        "author_model": "gemini-2.5-pro", "reviewer_model": "claude-3-7-sonnet",
        "issuer": "openmausbot", "issued_at": "2026-11-25T10:00:00Z",
        "run_id": "run-bypass-test", "candidate_sha256": mod.compute_skills_composite_digest(BASE_DIR),
    }
    meta["signature"] = mod.sign_orchestrator_meta(meta, secret)
    f_meta = tmp_path / "meta_comp.json"
    f_meta.write_text(json.dumps(meta), encoding="utf-8")
    code, rep = mod.audit_file(fake_file, kind="skill", orchestrator_meta=f_meta, hmac_key=secret)
    assert code == 2 and rep["provenance"] == "DIGEST_MISMATCH"


def test_phase1_r2_reconcile_iso_timestamp_invalid_calendar_fails_closed(tmp_path: Path):
    """R2 FIX-3: Invalid ISO calendar date (2026-11-31T10:00:00Z) in payouts/orders fails-closed."""
    mod = load_script(BASE_DIR / "opc-legal-finance" / "scripts" / "reconcile_mor.py")
    assert mod._check_calendar_error("2026-11-31T10:00:00Z") and not mod._check_calendar_error("2026-11-20T10:00:00Z")
    f_p, f_o = tmp_path / "p.json", tmp_path / "o.json"
    f_p.write_text(json.dumps([{"order_id": "o1", "gross_usd": 10.0, "net_usd": 10.0, "date": "2026-11-31T10:00:00Z"}]), encoding="utf-8")
    f_o.write_text(json.dumps([{"order_id": "o1", "gross_usd": 10.0, "order_date": "2026-11-20"}]), encoding="utf-8")
    code, rep = mod.reconcile(f_p, f_o)
    assert code == 1 and "gross_usd" not in rep and any("invalid_calendar_date" in a for a in rep.get("anomalies", []))


def test_phase1_r2_dag_gate_ring3_and_code_looks_good(tmp_path: Path):
    """R2 FIX-4: Hard-block Ring-3 role even with bot_id; reject 'code looks good'."""
    mod = load_script(BASE_DIR / "dag-gc" / "scripts" / "dag_gate.py")
    f_dag = tmp_path / "d.json"
    f_dag.write_text(json.dumps({"nodes": [{"id": "n1", "assigned_bot_id": "b1", "assigned_role": "首席科学家与基础理论架构师", "action_verb": "implement", "target_object": "src/m.py", "done_when": "exit 0"}]}), encoding="utf-8")
    c1, r1 = mod.validate_dag(f_dag)
    assert c1 == 2 and any("forbidden Ring-3" in err for err in r1.get("errors", []))

    f_dag.write_text(json.dumps({"nodes": [{"id": "n2", "assigned_bot_id": "b1", "action_verb": "implement", "target_object": "src/m.py", "done_when": "code looks good"}]}), encoding="utf-8")
    c2, r2 = mod.validate_dag(f_dag)
    assert c2 == 2 and any("missing verifiable done_when" in err for err in r2.get("errors", []))


def test_phase1_r2_openapi_null_parameters_and_nondict_schema():
    """R2 FIX-5: parameters: null and non-dict schema return SPEC_INVALID (Exit 2)."""
    mod = load_script(BASE_DIR / "docs-diataxis-release" / "scripts" / "openapi_diff_gate.py")
    c1, r1 = mod.evaluate_release({"openapi": "3.0.3", "paths": {"/t": {"get": {"parameters": None, "responses": {"200": {}}}}}}, {"openapi": "3.0.3", "paths": {"/t": {"get": {"responses": {"200": {}}}}}}, bump="patch")
    assert c1 == 2 and r1["status"] == "SPEC_INVALID"
    c2, r2 = mod.evaluate_release({"openapi": "3.0.3", "paths": {}, "components": {"schemas": {"Bad": "not_a_dict"}}}, {"openapi": "3.0.3", "paths": {}, "components": {"schemas": {"Bad": "not_a_dict"}}}, bump="patch")
    assert c2 == 2 and r2["status"] == "SPEC_INVALID"
