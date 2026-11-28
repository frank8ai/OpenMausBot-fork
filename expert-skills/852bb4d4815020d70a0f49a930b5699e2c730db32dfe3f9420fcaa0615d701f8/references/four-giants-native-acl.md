# Reference 1: 4-Giant Native SDK Adapters & Strict Schema Reference (TS / Python)

## 1. Domain Outbound Port (`IModelGatewayPort` - Zero SDK Imports)

```typescript
// src/domain/ports/model-gateway.port.ts
import type { z } from "zod";

export type ProviderId = "anthropic" | "openai" | "google" | "xai";

export type CachePolicy =
  | { mode: "none" }
  | { mode: "ephemeral_5m"; stickySessionKey: string }
  | { mode: "ephemeral_1h"; stickySessionKey: string }
  | { mode: "explicit_handle"; handleId: string; ttlSeconds: number };

export interface ModelInvocationRequest<TSchema extends z.ZodTypeAny> {
  readonly traceId: string;
  readonly idempotencyKey: string;
  readonly routeClass: "interactive_main" | "ephemeral_subagent" | "batch_offline";
  /** Immutable static rules & role definition: NEVER interpolate timestamps or UUIDs here */
  readonly staticSystemBlocks: readonly string[];
  /** Deterministically sorted tool definitions (alphabetical by name) */
  readonly sortedTools?: readonly CanonicalToolSpec[];
  /** Append-only conversation history including opaque reasoning state tokens */
  readonly turns: readonly CanonicalTurn[];
  /** Dynamic per-turn suffix (timestamps, request IDs, fresh user query) */
  readonly dynamicUserSuffix: string;
  readonly outputSchema: TSchema;
  readonly schemaName: string;
  readonly cachePolicy: CachePolicy;
  readonly budget: {
    readonly maxOutputTokens: number;
    readonly timeoutMs: number;
    readonly maxCostUsd: number;
  };
}

export interface NormalizedUsageLedger {
  readonly provider: ProviderId;
  readonly model: string;
  /** Strictly normalized: uncached fresh input tokens ONLY */
  readonly freshInputTokens: number;
  readonly cacheWriteTokens: number;
  readonly cacheReadTokens: number;
  readonly outputTokens: number;
  readonly reasoningTokens: number;
  readonly ttftMs: number;
  readonly totalLatencyMs: number;
  readonly estimatedCostUsd: number;
  readonly cacheHitRatio: number;
}

export interface ModelInvocationResult<TOutput> {
  readonly data: TOutput;
  readonly usage: NormalizedUsageLedger;
  /** Opaque provider state (Claude thinking signature / Gemini thoughtSignature / Grok encrypted_content) */
  readonly opaqueReasoningState?: unknown;
}

export interface IModelGatewayPort {
  invokeStructured<TSchema extends z.ZodTypeAny>(
    req: ModelInvocationRequest<TSchema>
  ): Promise<ModelInvocationResult<z.infer<TSchema>>>;
}
```

---

## 2. Four Native Adapters — Exact Parameter Alignment Matrix

| Dimension | Claude (`@anthropic-ai/sdk`) | OpenAI (`openai` Responses API) | Gemini (`@google/genai`) | Grok (`xai-sdk` gRPC / `@ai-sdk/xai` / REST) |
| :--- | :--- | :--- | :--- | :--- |
| **Canonical Endpoint** | `client.messages.create` | `client.responses.create` | `ai.models.generateContent` | `client.chat.create` (gRPC) or `/v1/responses` |
| **Strict Structured Output** | `output_config: { format: { type: "json_schema", schema } }` (`additionalProperties: false` mandatory) + tool `strict: true` | `text: { format: { type: "json_schema", name, strict: true, schema } }` | `config: { responseMimeType: "application/json", responseJsonSchema }` + tool `parametersJsonSchema` | `chat.parse(PydanticModel)` (gRPC) or `text.format` `json_schema` `strict: true` |
| **Prompt Caching Trigger** | Explicit `cache_control: { type: "ephemeral" }` (5m, 1.25x write / 0.1x read) or `{ type: "ephemeral", ttl: "1h" }` (2.0x write / 0.1x read). Max 4 breakpoints. Hierarchy: `tools` → `system` → `messages`. | Automatic exact-prefix match (≥1024 tokens, 128-token increments) + `prompt_cache_key: stickySessionKey` + `prompt_cache_options: { ttl }` | Implicit automatic prefix caching + Explicit `ai.caches.create({ model, config: { contents, systemInstruction, ttl } })` referenced via `config.cachedContent` | Automatic prefix match + **Mandatory Sticky Routing**: `metadata=(("x-grok-conv-id", conv_id),)` (gRPC), header `x-grok-conv-id` (REST), or `prompt_cache_key` (Responses API) |
| **Multi-Turn Reasoning Continuity** | Pass back `thinking` / `redacted_thinking` blocks with `signature` unchanged; pin `thinking` & `output_config.effort` per route | Pass `previous_response_id` or preserve encrypted reasoning items in `input` | Preserve `thoughtSignature` byte-for-byte on function-calling turns | Preserve `reasoning.encrypted_content` items in `input` or chain `previous_response_id`; **never pass `stop`/`presencePenalty`/`frequencyPenalty` on reasoning models** |
| **Usage Normalization Trap** | `usage.input_tokens` **excludes** cached tokens! Total Input = `input_tokens + cache_creation_input_tokens + cache_read_input_tokens` | `usage.input_tokens` **includes** cached tokens! Fresh Input = `input_tokens - input_tokens_details.cached_tokens` | `usageMetadata.promptTokenCount` **includes** `cachedContentTokenCount`! Fresh Input = `promptTokenCount - cachedContentTokenCount` | `prompt_tokens` **includes** `cached_tokens` (REST) / inspect `cached_prompt_text_tokens` (gRPC) |

---

## 3. Token & Cost Normalization Equations (Physical Ledger)

To prevent 2x–10x billing miscalculations across providers (aligned with REA v5 & Architect v4.2 standards):

1. **Anthropic (Claude)**:
   - $T_{\text{fresh}} = \text{input\_tokens}$
   - $T_{\text{write\_5m}} = \text{cache\_creation.ephemeral\_5m\_input\_tokens}$
   - $T_{\text{write\_1h}} = \text{cache\_creation.ephemeral\_1h\_input\_tokens}$
   - $T_{\text{read}} = \text{cache\_read\_input\_tokens}$
   - $\text{Cost} = (T_{\text{fresh}} \cdot 1.0 + T_{\text{write\_5m}} \cdot 1.25 + T_{\text{write\_1h}} \cdot 2.0 + T_{\text{read}} \cdot r_{\text{read}}) \cdot P_{\text{in}} + \text{output\_tokens} \cdot P_{\text{out}}$ (where $r_{\text{read}} \in [0.025, 0.1]$ by model tier).
   - **Break-Even Law**: 5m TTL breaks even at **N ≥ 2** requests ($1.25 + 0.1 = 1.35 < 2.0$); 1h TTL requires **N ≥ 3** requests within 5–60 min gaps ($2.0 + 0.2 = 2.2 < 3.0$). **NEVER enable `ttl: "1h"` on one-shot Sub-agents!**

2. **OpenAI / xAI (Responses & Chat API)**:
   - $T_{\text{read}} = \text{cached\_tokens}$
   - $T_{\text{fresh}} = \text{input\_tokens} - T_{\text{read}}$
   - $\text{Cost} = (T_{\text{fresh}} \cdot 1.0 + T_{\text{read}} \cdot r_{\text{cached}}) \cdot P_{\text{in}} + \text{output\_tokens} \cdot P_{\text{out}}$ (note: `output_tokens` already bills `reasoning_tokens` at output rate).

3. **Google Gemini (`@google/genai`)**:
   - $T_{\text{read}} = \text{cachedContentTokenCount} ?? 0$
   - $T_{\text{fresh}} = \text{promptTokenCount} - T_{\text{read}}$
   - $\text{Cost} = (T_{\text{fresh}} \cdot P_{\text{in}} + T_{\text{read}} \cdot P_{\text{cache\_read}}) + (\text{candidatesTokenCount} + \text{thoughtsTokenCount}) \cdot P_{\text{out}} + T_{\text{explicit\_stored}} \cdot P_{\text{storage\_hr}} \cdot \Delta t_{\text{hr}}$.
