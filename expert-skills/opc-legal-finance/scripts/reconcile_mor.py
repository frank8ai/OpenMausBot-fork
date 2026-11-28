#!/usr/bin/env python3
"""Deterministic Stripe / MoR monthly reconciliation and chargeback-risk gate."""
from __future__ import annotations

import argparse
from collections import defaultdict
from datetime import date, datetime, timedelta
from decimal import Decimal, InvalidOperation
import json
from pathlib import Path
import re
import sys

MAX_ABS_USD = Decimal("1000000000000000")


class StrictDecimal(Decimal):
    def __eq__(self, other: object) -> bool:
        if isinstance(other, (float, int)):
            try:
                return super().__eq__(Decimal(str(other)))
            except Exception:
                return False
        return super().__eq__(other)

    def __add__(self, other: object) -> StrictDecimal:
        return StrictDecimal(str(super().__add__(Decimal(str(other)))))

    def __radd__(self, other: object) -> StrictDecimal:
        return StrictDecimal(str(super().__radd__(Decimal(str(other)))))

    def __sub__(self, other: object) -> StrictDecimal:
        return StrictDecimal(str(super().__sub__(Decimal(str(other)))))

    def __rsub__(self, other: object) -> StrictDecimal:
        return StrictDecimal(str(super().__rsub__(Decimal(str(other)))))

    def __neg__(self) -> StrictDecimal:
        return StrictDecimal(str(super().__neg__()))

    def __abs__(self) -> StrictDecimal:
        return StrictDecimal(str(super().__abs__()))

    def __round__(self, n: int = 0) -> StrictDecimal:
        return StrictDecimal(str(super().__round__(n)))

class DuplicateKeyError(ValueError):
    """Raised when duplicate keys are detected in raw JSON object during parsing."""
    pass


def strict_json_pairs_hook(pairs: list[tuple[str, any]]) -> dict:
    """Detect duplicate keys in JSON objects and fail-closed immediately."""
    result: dict = {}
    for k, v in pairs:
        if k in result:
            raise DuplicateKeyError(f"Duplicate key detected in JSON object: {k}")
        result[k] = v
    return result


def parse_strict_json(text: str) -> any:
    """Parse JSON string with strict duplicate key detection."""
    return json.loads(text, object_pairs_hook=strict_json_pairs_hook, parse_float=StrictDecimal)


def _check_calendar_error(s: any) -> bool:
    if isinstance(s, str):
        m = re.search(r"^(\d{4}-\d{2}-\d{2})(?:$|[T\s])", s.strip())
        if m:
            try:
                datetime.strptime(m.group(1), "%Y-%m-%d")
            except ValueError:
                return True
    return False



def _extract_dates(item: dict) -> list[date]:
    """Extract all valid date objects from date-related fields in item."""
    dates: list[date] = []
    for k, v in item.items():
        if not v or not isinstance(v, (str, datetime, date)):
            continue
        k_lower = k.lower()
        if k_lower in ("date", "payout_date", "settlement_date", "event_date", "order_date") or k_lower.endswith("_date"):
            if isinstance(v, datetime):
                dates.append(v.date())
            elif isinstance(v, date):
                dates.append(v)
            elif isinstance(v, str):
                s = v.strip()
                if re.fullmatch(r"\d{4}-\d{2}-\d{2}", s):
                    try:
                        dates.append(datetime.strptime(s, "%Y-%m-%d").date())
                    except Exception:
                        pass
                elif "T" in s or " " in s:
                    try:
                        dates.append(datetime.fromisoformat(s.replace("Z", "+00:00")).date())
                    except Exception:
                        pass
    return dates


def _find_order_date_keys(item: dict) -> list[str]:
    """Find all keys representing the business order date (case- and delimiter-insensitive)."""
    return [
        k for k in item.keys()
        if isinstance(k, str) and k.strip().lower().replace("_", "").replace("-", "") == "orderdate"
    ]


def _extract_order_date_info(item: dict) -> tuple[date | None, bool, bool, bool]:
    """Deterministically extract the business order date.
    Strictly and exclusively validates 'order_date'.
    Detects key case/alias conflicts (e.g. order_date vs ORDER_DATE vs orderDate).
    Returns: (parsed_date, has_conflict, is_invalid_format, has_key)
    """
    keys = _find_order_date_keys(item)
    if not keys:
        return None, False, False, False

    if len(keys) > 1:
        # Conflict / ambiguous order_date fields -> Fail-Closed
        return None, True, False, True

    key = keys[0]
    val = item[key]
    if val is None or val == "":
        return None, False, True, True

    if isinstance(val, datetime):
        return val.date(), False, False, True
    elif isinstance(val, date):
        return val, False, False, True
    elif isinstance(val, str):
        s = val.strip()
        # Strictly require ISO YYYY-MM-DD: exactly 4 digits, hyphen, 2 digits, hyphen, 2 digits
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", s):
            return None, False, True, True
        try:
            dt = datetime.strptime(s, "%Y-%m-%d").date()
            return dt, False, False, True
        except Exception:
            return None, False, True, True

    return None, False, True, True


def _extract_order_date(item: dict) -> date | None:
    """Deterministically extract the business order date.
    Strictly and exclusively validates 'order_date'.
    Returns None if absent, conflicting, or fails strict YYYY-MM-DD format.
    """
    dt, has_conflict, is_invalid, _ = _extract_order_date_info(item)
    if has_conflict or is_invalid:
        return None
    return dt


def reconcile(
    payouts_path: Path,
    orders_path: Path,
    cutoff_date: str | None = None,
    settlement_days: int = 7,
) -> tuple[int, dict]:
    try:
        payouts = parse_strict_json(payouts_path.read_text(encoding="utf-8"))
        orders = parse_strict_json(orders_path.read_text(encoding="utf-8"))
    except DuplicateKeyError as exc:
        return 1, {
            "status": "RECONCILIATION_ALERT",
            "risk_tier": "RED",
            "error": str(exc),
            "anomalies": [f"duplicate_key_detected:{exc}"],
            "human_signoff_required": True,
        }
    except Exception as exc:
        return 2, {"status": "SPEC_INVALID", "error": str(exc)}

    if not isinstance(payouts, list) or not isinstance(orders, list) or not payouts:
        return 2, {"status": "SPEC_INVALID", "error": "payouts (non-empty) and orders must be JSON arrays"}

    def _parse_finite(val: any, field: str, oid: str) -> StrictDecimal | None:
        if val is None or isinstance(val, bool):
            return None
        try:
            d = Decimal(str(val))
            if not d.is_finite() or abs(d) > MAX_ABS_USD:
                return None
            return StrictDecimal(str(d))
        except (InvalidOperation, ValueError, TypeError):
            return None

    order_map: dict[str, dict] = {}
    seen_internal_order_ids: set[str] = set()

    for o in orders:
        if not isinstance(o, dict):
            return 2, {"status": "SPEC_INVALID", "error": "order row must be a JSON object"}
        raw_oid = o.get("order_id")
        if raw_oid is None or str(raw_oid).strip() == "":
            return 2, {"status": "SPEC_INVALID", "error": "order row missing order_id"}
        oid = str(raw_oid).strip()
        if oid in seen_internal_order_ids:
            return 1, {
                "status": "RECONCILIATION_ALERT",
                "risk_tier": "RED",
                "error": f"duplicate_order_id_in_orders:{oid}",
                "anomalies": [f"duplicate_order_id:{oid}"],
                "mismatches": [{"order_id": oid, "reason": "duplicate_order_id_in_orders"}],
                "human_signoff_required": True,
            }
        seen_internal_order_ids.add(oid)
        raw_int_g = o.get("gross_usd", Decimal("0.00"))
        int_g = _parse_finite(raw_int_g, "gross_usd", oid)
        if int_g is None:
            return 1, {
                "status": "RECONCILIATION_ALERT",
                "risk_tier": "RED",
                "error": f"invalid_internal_order_numeric_data:{oid}:gross_usd",
                "anomalies": [f"invalid_numeric_data:{oid}"],
                "mismatches": [{"order_id": oid, "reason": "non_finite_or_overflow_gross_usd_in_internal_order"}],
                "human_signoff_required": True,
            }
        for k, v in o.items():
            if _check_calendar_error(v):
                return 1, {
                    "status": "RECONCILIATION_ALERT",
                    "risk_tier": "RED",
                    "error": f"invalid_calendar_date:{oid}:{k}={v}",
                    "anomalies": [f"invalid_calendar_date:{oid}"],
                    "mismatches": [{"order_id": oid, "reason": "invalid_calendar_date"}],
                    "human_signoff_required": True,
                }
        order_map[oid] = o

    seen_orders: set[str] = set()
    charge_orders: set[str] = set()
    disputed_orders: set[str] = set()
    refunded_orders: set[str] = set()
    orphans: list[str] = []
    mismatches: list[dict] = []
    payout_order_gross: dict[str, StrictDecimal] = defaultdict(lambda: StrictDecimal("0.00"))

    cutoff_dt = None
    if cutoff_date is not None:
        if not isinstance(cutoff_date, str) or not re.fullmatch(r"^\d{4}-\d{2}-\d{2}$", cutoff_date.strip()):
            return 1, {
                "status": "RECONCILIATION_ALERT",
                "risk_tier": "RED",
                "error": f"invalid cutoff_date format: {cutoff_date}",
                "anomalies": [f"invalid_cutoff_date_format:{cutoff_date}"],
                "human_signoff_required": True,
            }
        try:
            cutoff_dt = datetime.strptime(cutoff_date.strip(), "%Y-%m-%d").date()
        except Exception as e:
            return 1, {
                "status": "RECONCILIATION_ALERT",
                "risk_tier": "RED",
                "error": f"invalid cutoff_date: {e}",
                "anomalies": [f"invalid_cutoff_date:{cutoff_date}"],
                "human_signoff_required": True,
            }

    post_cutoff_orders_set: set[str] = set()
    anomalies: list[str] = []

    # 1. Pre-scan internal orders for post-cutoff dates
    for oid, ord_data in sorted(order_map.items()):
        ord_dts = _extract_dates(ord_data)
        if cutoff_dt and any(d > cutoff_dt for d in ord_dts):
            post_cutoff_orders_set.add(oid)

    for row in payouts:
        if not isinstance(row, dict):
            return 2, {"status": "SPEC_INVALID", "error": "payout row must be a JSON object"}
        oid = str(row.get("order_id", "")).strip()
        if not oid:
            return 2, {"status": "SPEC_INVALID", "error": "payout row missing order_id"}
        seen_orders.add(oid)

        for field in ("gross_usd", "refund_usd", "chargeback_usd", "fee_usd", "dispute_fee_usd", "tax_usd", "net_usd"):
            raw_v = row.get(field, Decimal("0.00"))
            if _parse_finite(raw_v, field, oid) is None:
                return 1, {
                    "status": "RECONCILIATION_ALERT",
                    "risk_tier": "RED",
                    "error": f"invalid_numeric_data_or_overflow:{oid}:{field}",
                    "anomalies": [f"invalid_numeric_data:{oid}"],
                    "mismatches": [{"order_id": oid, "reason": "non_finite_or_missing_numeric_field"}],
                    "human_signoff_required": True,
                }
        for k, v in row.items():
            if _check_calendar_error(v):
                return 1, {
                    "status": "RECONCILIATION_ALERT",
                    "risk_tier": "RED",
                    "error": f"invalid_calendar_date:{oid}:{k}={v}",
                    "anomalies": [f"invalid_calendar_date:{oid}"],
                    "mismatches": [{"order_id": oid, "reason": "invalid_calendar_date"}],
                    "human_signoff_required": True,
                }

        g = _parse_finite(row.get("gross_usd", Decimal("0.00")), "gross_usd", oid) or StrictDecimal("0.00")
        r = _parse_finite(row.get("refund_usd", Decimal("0.00")), "refund_usd", oid) or StrictDecimal("0.00")
        cb = _parse_finite(row.get("chargeback_usd", Decimal("0.00")), "chargeback_usd", oid) or StrictDecimal("0.00")
        f = _parse_finite(row.get("fee_usd", Decimal("0.00")), "fee_usd", oid) or StrictDecimal("0.00")
        df = _parse_finite(row.get("dispute_fee_usd", Decimal("0.00")), "dispute_fee_usd", oid) or StrictDecimal("0.00")
        t = _parse_finite(row.get("tax_usd", Decimal("0.00")), "tax_usd", oid) or StrictDecimal("0.00")
        n = _parse_finite(row.get("net_usd", Decimal("0.00")), "net_usd", oid) or StrictDecimal("0.00")

        payout_order_gross[oid] += g

        expected_net = StrictDecimal(str((g - r - cb - f - df - t).quantize(Decimal("0.01"))))
        if abs(expected_net - n) > Decimal("0.01"):
            mismatches.append({"order_id": oid, "expected_net": round(expected_net, 2), "reported_net": round(n, 2)})

        row_dts = _extract_dates(row)
        if cutoff_dt and any(d > cutoff_dt for d in row_dts):
            post_cutoff_orders_set.add(oid)

    # Deterministic sorted order for post_cutoff_orders and their anomalies
    post_cutoff_orders = sorted(post_cutoff_orders_set)
    for oid in post_cutoff_orders:
        anom = f"post_cutoff_order_date:{oid}"
        if anom not in anomalies:
            anomalies.append(anom)

    # 3. Aggregate in-window payouts (guaranteed permutation-invariant and decoupled from row order)
    gross = refunds = chargebacks = fees = dispute_fees = tax = net_reported = StrictDecimal("0.00")

    for row in payouts:
        oid = str(row.get("order_id", "")).strip()
        if oid in post_cutoff_orders_set:
            continue

        event_type = str(row.get("event_type", "charge")).strip().lower()
        g = _parse_finite(row.get("gross_usd", Decimal("0.00")), "gross_usd", oid) or StrictDecimal("0.00")
        r = _parse_finite(row.get("refund_usd", Decimal("0.00")), "refund_usd", oid) or StrictDecimal("0.00")
        cb = _parse_finite(row.get("chargeback_usd", Decimal("0.00")), "chargeback_usd", oid) or StrictDecimal("0.00")
        f = _parse_finite(row.get("fee_usd", Decimal("0.00")), "fee_usd", oid) or StrictDecimal("0.00")
        df = _parse_finite(row.get("dispute_fee_usd", Decimal("0.00")), "dispute_fee_usd", oid) or StrictDecimal("0.00")
        t = _parse_finite(row.get("tax_usd", Decimal("0.00")), "tax_usd", oid) or StrictDecimal("0.00")
        n = _parse_finite(row.get("net_usd", Decimal("0.00")), "net_usd", oid) or StrictDecimal("0.00")

        if g > 0 or event_type == "charge":
            charge_orders.add(oid)
        if cb > 0 or event_type == "dispute":
            disputed_orders.add(oid)
        if r > 0 or event_type in ("refund", "partial_refund"):
            refunded_orders.add(oid)

        gross += g
        refunds += r
        chargebacks += cb
        fees += f
        dispute_fees += df
        tax += t
        net_reported += n

    # Order-level gross comparison and order_date validation vs internal order
    for oid in sorted(seen_orders):
        if oid not in order_map:
            orphans.append(oid)
        else:
            ord_item = order_map[oid]
            _, has_conflict, is_invalid_format, has_key = _extract_order_date_info(ord_item)
            if has_conflict or is_invalid_format:
                anom = "conflicting_order_date_fields" if has_conflict else "invalid_order_date_format"
                return 1, {
                    "status": "RECONCILIATION_ALERT",
                    "risk_tier": "RED",
                    "error": f"{anom}:{oid}",
                    "anomalies": [f"{anom}:{oid}"],
                    "mismatches": [{"order_id": oid, "reason": "invalid_order_date_format"}],
                    "human_signoff_required": True,
                }

            internal_gross = _parse_finite(ord_item.get("gross_usd", Decimal("0.00")), "gross_usd", oid) or StrictDecimal("0.00")
            p_gross = payout_order_gross[oid]
            if abs(p_gross - internal_gross) > Decimal("0.01"):
                mismatches.append({
                    "order_id": oid,
                    "reason": "gross_mismatch_vs_internal_order",
                    "payout_gross": round(p_gross, 2),
                    "order_gross": round(internal_gross, 2),
                })

    missing_candidates = sorted(set(order_map) - seen_orders)
    in_transit_orders: list[str] = []
    missing_internal_orders: list[str] = []
    overdue_in_transit_orders: list[str] = []

    for oid in missing_candidates:
        if oid in post_cutoff_orders_set:
            continue
        ord_data = order_map[oid]
        is_marked_transit = (str(ord_data.get("status", "")).strip().lower() == "in_transit")

        ord_dts = _extract_dates(ord_data)
        ord_dt, has_conflict, is_invalid_format, has_od_key = _extract_order_date_info(ord_data)

        window_start = (cutoff_dt - timedelta(days=settlement_days)) if cutoff_dt else None

        # In-transit evaluation: strictly anchored to order_date; if any critical date is overdue, it triggers overdue
        is_overdue = False
        if cutoff_dt and window_start and ord_dts:
            if (ord_dt and ord_dt < window_start) or any(d < window_start for d in ord_dts):
                is_overdue = True

        if (
            cutoff_dt
            and window_start
            and ord_dt
            and not has_conflict
            and not is_invalid_format
            and not is_overdue
            and window_start <= ord_dt <= cutoff_dt
        ):
            in_transit_orders.append(oid)
        elif is_marked_transit or (
            cutoff_dt and (ord_dts or has_od_key or is_overdue or has_conflict or is_invalid_format)
        ):
            overdue_in_transit_orders.append(oid)
            if has_conflict:
                anom_conflict = f"conflicting_order_date_fields:{oid}"
                if anom_conflict not in anomalies:
                    anomalies.append(anom_conflict)
            if is_invalid_format:
                anom_format = f"invalid_order_date_format:{oid}"
                if anom_format not in anomalies:
                    anomalies.append(anom_format)
            anom_unverified = f"overdue_or_unverified_in_transit_order:{oid}"
            if anom_unverified not in anomalies:
                anomalies.append(anom_unverified)
        else:
            missing_internal_orders.append(oid)

    # Guarantee deterministic permutation-invariance for mismatches
    mismatches.sort(key=lambda m: (str(m.get("order_id", "")), json.dumps(m, sort_keys=True, default=str)))

    charge_count = len(charge_orders)
    cb_rate: float | None = None
    refund_rate: float | None = None

    if charge_count > 0:
        cb_rate = len(disputed_orders) / charge_count
        refund_rate = len(refunded_orders) / charge_count
    else:
        if len(disputed_orders) > 0:
            cb_rate = None
            anomalies.append("chargeback_detected_with_zero_charge_denominator")
        else:
            cb_rate = 0.0

        if len(refunded_orders) > 0:
            refund_rate = None
            anomalies.append("refund_detected_with_zero_charge_denominator")
        else:
            refund_rate = 0.0

    forced_red = bool(overdue_in_transit_orders or post_cutoff_orders or (charge_count == 0 and len(disputed_orders) > 0))
    forced_yellow = bool(charge_count == 0 and len(refunded_orders) > 0)

    standard_red = bool(
        orphans
        or mismatches
        or missing_internal_orders
        or (cb_rate is not None and cb_rate >= 0.0075)
    )

    if forced_red or standard_red:
        breach = True
        risk = "RED"
    elif forced_yellow or (cb_rate is not None and cb_rate >= 0.005) or (refund_rate is not None and refund_rate >= 0.05):
        breach = False
        risk = "YELLOW"
    else:
        breach = False
        risk = "GREEN"

    status = "RECONCILIATION_ALERT" if breach else ("BALANCED_WARN" if risk == "YELLOW" else "BALANCED_GREEN")

    report = {
        "status": status,
        "risk_tier": risk,
        "transactions": charge_count,
        "charge_count": charge_count,
        "event_rows": len(payouts),
        "gross_usd": round(gross, 2),
        "refunds_usd": round(refunds, 2),
        "chargebacks_usd": round(chargebacks, 2),
        "fees_usd": round(fees, 2),
        "dispute_fees_usd": round(dispute_fees, 2),
        "tax_usd": round(tax, 2),
        "net_reported_usd": round(net_reported, 2),
        "chargeback_rate_pct": round(cb_rate * 100, 3) if cb_rate is not None else None,
        "refund_rate_pct": round(refund_rate * 100, 2) if refund_rate is not None else None,
        "orphan_payout_orders": orphans,
        "missing_internal_orders": missing_internal_orders,
        "in_transit_orders": in_transit_orders,
        "overdue_in_transit_orders": overdue_in_transit_orders,
        "post_cutoff_orders": post_cutoff_orders,
        "anomalies": anomalies,
        "mismatches": mismatches,
        "human_signoff_required": True,
    }
    return (1 if breach else 0), report


def main() -> None:
    p = argparse.ArgumentParser(description="Stripe/MoR Monthly Reconciliation CLI")
    p.add_argument("--payouts", required=True, type=Path)
    p.add_argument("--orders", required=True, type=Path)
    p.add_argument("--cutoff-date", type=str, default=None)
    p.add_argument("--settlement-days", type=int, default=7)
    args = p.parse_args()

    code, report = reconcile(
        args.payouts,
        args.orders,
        cutoff_date=args.cutoff_date,
        settlement_days=args.settlement_days,
    )
    print(json.dumps(report, ensure_ascii=False, indent=2, default=str))
    sys.exit(code)


if __name__ == "__main__":
    main()
