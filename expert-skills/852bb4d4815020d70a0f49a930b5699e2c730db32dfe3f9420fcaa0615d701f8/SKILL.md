---
name: hexagonal-4giant-architecture
description: Author zero-ambiguity system specifications, 4-Giant native AI anti-corruption layers (Claude, OpenAI, Gemini, Grok), KV-cache prefix architectures, TypeSpec/Spectral/Buf API contracts, and second-order resilience ledgers.
---

# Hexagonal 4-Giant Native Architecture & 10-Factor Spec Gate

Use this skill whenever designing system architecture, writing `SPEC.md` / `ADR`, integrating LLM/Agent capabilities across the Four AI Giants (Anthropic Claude, OpenAI, Google Gemini, xAI Grok), or performing Tier-0 / Tier-2 architectural rescue.

## 1. Pre-Flight & 10-Factor Architecture Gate (No Gate, No Prose)

Before writing any specification body, complete and verify all 10 gates:
1. **Cognitive Load Budget**: User-facing new toggles (`target = 0`), interaction steps (`≤ 3`), exposed jargon (`= 0`); specify exact auto-inference & P95 defaults.
2. **Input Contract & Denominated SLOs**: Upstream `Product Gate ADR` link + metrics with explicit denominators (e.g., `P99 ≤ 800ms @ 500 RPS`, `2xx / valid_requests ≥ 99.95%`).
3. **Non-Goals & Killed Scope**: Physically exclude CPO Killed Scope (zero dead tables, zero placeholder columns, zero `N < 2` premature interfaces).
4. **Deterministic State Machine**: Enumerate all states, events, guards, idempotent re-entry transitions, and terminal states (no boolean-flag spaghetti > 8 combinations).
5. **Hexagonal ACL & Harness Layering**: Enforce OpenAI Harness forward-only layering (`Types → Config → Repo → Service → Runtime → UI`) with outbound ports (`IModelGatewayPort`, `IRepositoryPort`) free of SDK/ORM imports.
6. **Orthogonal Alternative Rejected**: Quantified comparison against at least 1 simpler alternative (e.g., SQLite/Postgres single-node vs distributed queue).
7. **Inherent Limits & Breakpoints**: Honest throughput/row-count/bandwidth thresholds where this design saturates.
8. **Frozen Telemetry & Measurement**: Benchmark tool (`k6`/`hurl`), sampling window, exact SQL/PromQL formula, and normalized token ledger fields.
9. **Reversibility & 30-Second Rollback**: Classify Type-1 (one-way) vs Type-2 (two-way) door; guarantee ≤30s rollback via feature flag or immutable image revert without manual DB surgery.
10. **Confidence & Falsification Circuit Breaker**: Confidence interval + observable metric that triggers automatic halt/degradation.

## 2. Four AI Giants Native ACL Rules (Zero Wrapper Frameworks)

1. **Ban Heavy Wrappers**: Never introduce LangChain, LlamaIndex, or opaque prompt-hiding middleware in core runtime. Implement thin outbound adapters over official SDKs (`@anthropic-ai/sdk`, `openai`, `@google/genai`, `xai-sdk` / `@ai-sdk/xai`). See [references/four-giants-native-acl.md](references/four-giants-native-acl.md).
2. **Exact-Prefix KV Cache Topology**:
   - Render order is strictly immutable: `Sorted Tools` → `Static System Instructions` → `Append-Only History (with opaque reasoning signatures)` → `Dynamic Tail (current timestamp, trace context, user query)`.
   - Never mutate top-level `system`, reorder tools, toggle `thinking`/`effort` mid-session, or place `Current time` at the prompt head. Mid-session operator updates go into `messages[]` tail.
   - **TTL & Sticky Routing**: Use 5m TTL for sub-agents/tight loops; reserve 1h TTL only for main interactive sessions with 5–60m idle gaps (`N ≥ 3` turns). Always pass `x-grok-conv-id` (xAI) and `prompt_cache_key` (OpenAI/xAI) for sticky GPU routing; after >1h idle on 1M-context sessions, compact/elide stale history to prevent cold-cache rate-limit spikes.
3. **CFG Constrained Structured Outputs**: Always enable native grammar-constrained decoding (`output_config.format` json_schema on Claude, `text.format` strict json_schema on OpenAI/xAI, `responseJsonSchema` + `parametersJsonSchema` on Gemini). Never regex-scrape JSON from free text.
4. **Deterministic Fallback & Systems Dynamics**:
   - Timeout inequality: `T_Client > T_Gateway > (T_Attempt + T_Backoff) > T_Socket`.
   - Retries: Exponential backoff + full jitter + global retry budget `≤ 10%`; non-idempotent writes without `Idempotency-Key` get `0` retries.
   - Cross-provider fallback on `429 / 503 / 529 / timeout` preserves canonical Zod/Pydantic output contract.

## 3. Contract-as-Code & Artifact Delivery Checklist

1. Author HTTP/REST schemas in **TypeSpec** (`.tsp` → OpenAPI 3.1) gated by **Spectral**, or gRPC schemas gated by **Buf** (`buf breaking`). See [references/contract-and-harness-gates.md](references/contract-and-harness-gates.md).
2. Author architecture topologies in **D2** (`d2lang`) or **Structurizr DSL**, and complex workflows in **XState v5** / Mermaid `stateDiagram-v2`.
3. Deliver surgical implementation handoffs (`≤ 50` lines for rescue diffs) with exact file paths, function signatures, pre/post-conditions, and ADR archival path.
