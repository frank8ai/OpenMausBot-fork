# OPC Legal Drafting, SLA & Chargeback Evidence Templates (v2.0)

## 1. ToS / Privacy / Refund Mandatory Checklist (Human Final Sign-Off Required)
- **Contracting Entity & MoR Disclosure**: Legal entity or MoR provider (`Polar` / `Lemon Squeezy` / `Stripe`) handling VAT/GST.
- **Subprocessors**: List LLM providers, hosting DB, error telemetry, and payment processor.
- **Data Retention & Deletion**: Explicit retention TTL and self-serve/email deletion SLA (`<= 30 days`).
- **Cancellation & Refund Window**: One-click cancellation; clear refund eligibility window (e.g., 7/14-day unused or defect refund).

## 2. Dispute Hard-Deadline SLA (`evidence_due_by`)
- **Mandatory SLA Field**: Every dispute packet MUST capture `evidence_due_by` (UTC ISO-8601 from Stripe/MoR webhook `charge.dispute.created`). Missing `evidence_due_by` results in **automatic loss** plus non-refundable `$15.00` dispute fee.
- **Escalation Ladder**: Draft evidence pack within `24h` of receipt; alert Leon at **`T-72h`** and hard-escalate at **`T-24h`**.

## 3. Bifurcated Evidence Strategy (Fraud vs Service Dispute)

### 3A. Fraudulent / Unrecognized Charge (`reason: fraudulent`) — Visa CE3.0 Mandatory Package
To qualify for **Visa Compelling Evidence 3.0 (CE3.0)** liability shift, submit:
1. **At least 2 prior undisputed historical transactions** from the same customer aged **`120–365 days`** before the disputed charge (`historical_tx_1`, `historical_tx_2` with `tx_id`, `date_utc`, `amount_usd`, `status: undisputed`).
2. **At least 2 matching core elements** across the disputed charge and BOTH historical transactions (at least one of IP or Device ID/Fingerprint required by Visa CE3.0):
   - `access_ip_prefix` / `ip_address_hash`
   - `device_fingerprint_id`
   - `customer_account_id` (plus `customer_account_age_days`)
   - `billing_address_hash` / `shipping_address_hash`
3. Redacted login & API activity timeline proving account continuity.

### 3B. Service / Product Dispute (`product_not_received` / `product_unacceptable` / `subscription_canceled`)
1. `dispute_id`, `order_id`, `invoice_number`, `evidence_due_by`.
2. **Consent & Policy Proof**: `tos_accepted_at_utc`, `tos_version_hash`, explicit cancellation/refund policy screenshot & link shown at checkout.
3. **Delivery & Usage Proof**: Provisioning timestamps, API run IDs / feature usage counts post-purchase, export/download logs.
4. **Support Timeline**: Full summary of prior customer support interactions (or verified `none` if customer bypassed support).
5. **Cancellation Log** (for `subscription_canceled`): Billing cycle dates, renewal reminder email timestamp, and absence of cancellation request prior to billing cutoff.

## 4. Event-Level Payouts JSON Input Schema Example (`reconcile_mor.py`)
```json
[
  {"order_id": "ord_101", "event_type": "charge", "gross_usd": 49.0, "fee_usd": 1.72, "tax_usd": 0.0, "net_usd": 47.28},
  {"order_id": "ord_101", "event_type": "partial_refund", "refund_usd": 10.0, "fee_usd": 0.0, "net_usd": -10.0},
  {"order_id": "ord_102", "event_type": "charge", "gross_usd": 49.0, "fee_usd": 1.72, "net_usd": 47.28},
  {"order_id": "ord_102", "event_type": "dispute", "chargeback_usd": 49.0, "dispute_fee_usd": 15.0, "net_usd": -64.0}
]
```
