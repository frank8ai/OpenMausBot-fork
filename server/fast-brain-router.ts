/**
 * Fast Brain Router & Tail-Slot KV-Cache Optimization
 *
 * Implements:
 * 1. Subagent Dispatch ROI Equation (evaluateSubagentDispatchROI)
 *    - Eliminates 6,000 token cold-start waste for micro-tasks
 *    - Mandatory inline execution for diff <= 30 LOC, files <= 2, dirty_tokens <= 1500
 *    - Mandatory inline execution for single CLI invocations or single file slices
 *    - Batched subagents for batch_count >= 3
 *    - Subagent spawn for physical process/file tree isolation or asymmetric high-dirty tasks
 *
 * 2. Three-Pool Quota-Aware Anti-Autophagy Routing (resolveQuotaAwareRouting)
 *    - Pool A (Flash Pool): 85% daily volume, T1 routed 100% to gemini-3.8-flash with static zero-token gate
 *    - Pool B (Gemini-4 Independent Pool): Tier3 high-coupling tasks directly route to gemini-4-hydrogen
 *    - Pool C (3P Shared Claude/GPT Pool): Airbag after 2-strike circuit break. T4 Critical dual-review
 *      (Claude producer + Gemini-4-Hydrogen blind reviewer). Quota < 15% auto fallback to Pool B.
 *
 * 3. Tail-Slot Sparse Injection & KV-Cache Anti-Corruption (injectTailSlotContext)
 *    - Statically locks System Prompt prefix across turns
 *    - All dynamic skills & context injected exclusively in tail slots
 *    - Maintains Prompt Prefix Cache hit ratio target >= 88%
 */

export const SUBAGENT_COLD_START_TOKENS = 6000;

export const POOL_A_DEFAULT_MODEL = "gemini-3.8-flash";
export const POOL_B_DEFAULT_MODEL = "gemini-4-hydrogen";
export const POOL_C_DEFAULT_MODEL = "claude-3-7-sonnet";

export const POOL_C_CRITICAL_QUOTA_THRESHOLD = 0.15; // 15% quota floor
export const TARGET_CACHE_HIT_RATIO = 0.88; // 88% KV-cache prefix target

export type SubagentDispatchDecision =
  | "INLINE_EXECUTION"
  | "BATCHED_SUBAGENT"
  | "SUBAGENT_SPAWN";

export interface SubagentTaskProfile {
  diff_loc?: number;
  files?: number;
  dirty_tokens?: number;
  is_single_cli?: boolean;
  command_type?: "cli" | "batch" | "code" | "review";
  is_single_file_slice?: boolean;
  batch_count?: number;
  requires_physical_isolation?: boolean;
  quota_asymmetric?: boolean;
  subagent_cold_start_tokens?: number;
  description?: string;
}

export interface SubagentROIEvaluation {
  decision: SubagentDispatchDecision;
  reason: string;
  roi_score: number;
  cold_start_tokens_saved: number;
  estimated_token_cost: number;
  break_even_loc: number;
}

export type TaskTier = "T1" | "T2" | "TIER_3" | "Tier3" | "T4";

export type RoutingPool = "PoolA" | "PoolB" | "PoolC";

export interface TaskRoutingRequest {
  tier: TaskTier | number;
  critical?: boolean;
  strike_count?: number;
  pool_c_available_quota: number; // 0.0 - 1.0 or 0 - 100 percentage
  pool_c_quota_unit?: "ratio" | "percent";
  preferred_model?: string;
  pool_a_model?: string;
  pool_b_model?: string;
  pool_c_model?: string;
  task_name?: string;
}

export interface QuotaAwareRoutingResult {
  pool: RoutingPool;
  primary_model: string;
  review_model?: string;
  cross_family_dual_review: boolean;
  static_zero_token_gate: boolean;
  fallback_triggered: boolean;
  fallback_reason?: string;
  reason: string;
}

export interface TailSlotInjectionOptions {
  static_prefix: string;
  dynamic_skills?: string | string[] | Array<{ name: string; content: string }>;
  dynamic_context?: string | string[] | Record<string, unknown>;
  slot_marker?: string;
}

export interface TailSlotInjectionResult {
  full_prompt: string;
  prefix_bytes: number;
  tail_bytes: number;
  cache_hit_ratio_target: number;
  prefix_intact: boolean;
}

/**
 * Evaluate subagent dispatch ROI equation.
 * Prevents phantom subagent proliferation and amortizes startup costs.
 */
export function evaluateSubagentDispatchROI(task: SubagentTaskProfile): SubagentROIEvaluation {
  const coldStart = task.subagent_cold_start_tokens ?? SUBAGENT_COLD_START_TOKENS;
  const diffLoc = task.diff_loc ?? 0;
  const files = task.files ?? 0;
  const dirtyTokens = task.dirty_tokens ?? 0;
  const batchCount = task.batch_count ?? 1;

  if (task.requires_physical_isolation) {
    return {
      decision: "SUBAGENT_SPAWN",
      reason: "Physical process/file tree isolation explicitly required; spawning dedicated subagent.",
      roi_score: 2.5,
      cold_start_tokens_saved: 0,
      estimated_token_cost: coldStart + dirtyTokens,
      break_even_loc: 0,
    };
  }

  if (dirtyTokens > 10000 && task.quota_asymmetric) {
    return {
      decision: "SUBAGENT_SPAWN",
      reason: `Heavy dirty tokens (${dirtyTokens}) with asymmetric quota profile justifies isolated subagent spawn.`,
      roi_score: 3.2,
      cold_start_tokens_saved: 0,
      estimated_token_cost: coldStart + dirtyTokens,
      break_even_loc: 50,
    };
  }

  if (batchCount >= 3) {
    return {
      decision: "BATCHED_SUBAGENT",
      reason: `Microtask batch count (${batchCount}) >= 3; grouping into batched subagent to amortize cold-start cost across items.`,
      roi_score: Number((batchCount * 0.8).toFixed(2)),
      cold_start_tokens_saved: Math.max(0, (batchCount - 1) * coldStart),
      estimated_token_cost: coldStart + (dirtyTokens * batchCount * 0.4),
      break_even_loc: 60,
    };
  }

  if (diffLoc <= 30 && files <= 2 && dirtyTokens <= 1500) {
    return {
      decision: "INLINE_EXECUTION",
      reason: "Task matches micro-change threshold (diff_loc <= 30, files <= 2, dirty_tokens <= 1500); inline execution eliminates 6000t cold-start overhead.",
      roi_score: 0,
      cold_start_tokens_saved: coldStart,
      estimated_token_cost: dirtyTokens + (diffLoc * 15),
      break_even_loc: 120,
    };
  }

  const isSingleCli = task.is_single_cli || task.command_type === "cli";
  const isSingleFileSlice = task.is_single_file_slice || (files === 1 && diffLoc <= 100);
  if (isSingleCli || isSingleFileSlice) {
    const trigger = isSingleCli ? "Single CLI invocation" : "Single file slice";
    return {
      decision: "INLINE_EXECUTION",
      reason: `${trigger} detected; forced inline execution to prevent unnecessary subagent spawn overhead.`,
      roi_score: 0.1,
      cold_start_tokens_saved: coldStart,
      estimated_token_cost: dirtyTokens || 500,
      break_even_loc: 100,
    };
  }

  const estimatedInlineCost = (dirtyTokens * 1.5) + (diffLoc * 25);
  const estimatedSubagentCost = coldStart + (dirtyTokens * 0.3) + (diffLoc * 10);
  const roi = Number((estimatedInlineCost / Math.max(1, estimatedSubagentCost)).toFixed(2));

  if (roi >= 1.5 || dirtyTokens >= 6000 || diffLoc >= 150) {
    const triggerReason =
      roi >= 1.5
        ? `positive ROI (${roi} >= 1.5)`
        : `complexity threshold (diff_loc=${diffLoc}, dirty_tokens=${dirtyTokens}, ROI=${roi})`;
    return {
      decision: "SUBAGENT_SPAWN",
      reason: `Task exceeds inline capacity via ${triggerReason}.`,
      roi_score: roi,
      cold_start_tokens_saved: 0,
      estimated_token_cost: estimatedSubagentCost,
      break_even_loc: 100,
    };
  }

  return {
    decision: "INLINE_EXECUTION",
    reason: `Amortized subagent cost (${estimatedSubagentCost}t) exceeds inline cost (${estimatedInlineCost}t, ROI ${roi} < 1.5); keeping execution inline.`,
    roi_score: roi,
    cold_start_tokens_saved: coldStart,
    estimated_token_cost: estimatedInlineCost,
    break_even_loc: 120,
  };
}

/**
 * Three-pool quota-aware anti-autophagy routing.
 * Manages Pool A (Flash), Pool B (Gemini-4), and Pool C (3P Claude/GPT).
 */
export function resolveQuotaAwareRouting(request: TaskRoutingRequest): QuotaAwareRoutingResult {
  const poolAModel = request.pool_a_model || POOL_A_DEFAULT_MODEL;
  const poolBModel = request.pool_b_model || POOL_B_DEFAULT_MODEL;
  const poolCModel = request.pool_c_model || POOL_C_DEFAULT_MODEL;

  const rawQuota = request.pool_c_available_quota;
  const availablePoolCQuota = !Number.isFinite(rawQuota)
    ? 0
    : request.pool_c_quota_unit === "percent"
      ? rawQuota / 100
      : request.pool_c_quota_unit === "ratio"
        ? rawQuota
        : rawQuota > 1.0
          ? rawQuota / 100
          : rawQuota;
  const isPoolCDepleted =
    !Number.isFinite(rawQuota) || availablePoolCQuota < POOL_C_CRITICAL_QUOTA_THRESHOLD;

  const strikes = request.strike_count ?? 0;
  const tierStr = typeof request.tier === "number" ? (request.tier === 3 ? "TIER_3" : `T${request.tier}` as TaskTier) : request.tier;
  const isCritical = request.critical || tierStr === "T4";

  if (strikes >= 2) {
    if (isPoolCDepleted) {
      return {
        pool: "PoolB",
        primary_model: poolBModel,
        cross_family_dual_review: false,
        static_zero_token_gate: false,
        fallback_triggered: true,
        fallback_reason: `Pool C quota depleted (${(availablePoolCQuota * 100).toFixed(1)}% < ${(POOL_C_CRITICAL_QUOTA_THRESHOLD * 100).toFixed(0)}%); fallen back to Pool B high-capability model.`,
        reason: `Strike count ${strikes} triggered safety airbag, but Pool C quota is below safe floor; routed to Pool B (${poolBModel}) to preserve core availability.`,
      };
    }

    return {
      pool: "PoolC",
      primary_model: poolCModel,
      ...(isCritical ? { review_model: poolBModel } : {}),
      cross_family_dual_review: isCritical,
      static_zero_token_gate: false,
      fallback_triggered: false,
      reason: isCritical
        ? `Strike count ${strikes} exceeded two-strike limit on critical task; escalated to Pool C (${poolCModel}) with cross-family blind reviewer (${poolBModel}).`
        : `Strike count ${strikes} exceeded two-strike limit; escalated to Pool C safety airbag (${poolCModel}).`,
    };
  }

  if (isCritical) {
    if (isPoolCDepleted) {
      return {
        pool: "PoolB",
        primary_model: poolBModel,
        cross_family_dual_review: false,
        static_zero_token_gate: false,
        fallback_triggered: true,
        fallback_reason: `Pool C quota depleted (${(availablePoolCQuota * 100).toFixed(1)}% < ${(POOL_C_CRITICAL_QUOTA_THRESHOLD * 100).toFixed(0)}%); falling back to Pool B standalone critical mode.`,
        reason: `T4 Critical task required cross-pool dual review, but Pool C quota is depleted; fell back to Pool B (${poolBModel}) standalone execution.`,
      };
    }

    return {
      pool: "PoolC",
      primary_model: poolCModel,
      review_model: poolBModel,
      cross_family_dual_review: true,
      static_zero_token_gate: false,
      fallback_triggered: false,
      reason: `T4 Critical task routed to cross-pool cross-family peer review (Producer: ${poolCModel}, Blind Reviewer: ${poolBModel}).`,
    };
  }

  if (tierStr === "TIER_3" || tierStr === "Tier3") {
    return {
      pool: "PoolB",
      primary_model: poolBModel,
      cross_family_dual_review: false,
      static_zero_token_gate: false,
      fallback_triggered: false,
      reason: `Tier3 high-coupling/high-difficulty task: skipping Flash trial-and-error, directly routing to Pool B (${poolBModel}).`,
    };
  }

  if (tierStr === "T1") {
    return {
      pool: "PoolA",
      primary_model: poolAModel,
      cross_family_dual_review: false,
      static_zero_token_gate: true,
      fallback_triggered: false,
      reason: `T1 task 100% routed to Pool A (${poolAModel}) with static zero-token gate enabled.`,
    };
  }

  return {
    pool: "PoolA",
    primary_model: poolAModel,
    cross_family_dual_review: false,
    static_zero_token_gate: false,
    fallback_triggered: false,
    reason: `T2 standard task routed to Pool A (${poolAModel}) for cost-efficient execution.`,
  };
}

/**
 * Tail-Slot Sparse Injection & KV-Cache Anti-Corruption.
 * Locks the static system prompt prefix 100% in place to maximize KV-cache prefix hits (target >= 88%).
 */
export function injectTailSlotContext(options: TailSlotInjectionOptions): TailSlotInjectionResult {
  const { static_prefix, dynamic_skills, dynamic_context } = options;
  const marker = options.slot_marker || "\n\n<!-- DYNAMIC_TAIL_SLOT_BEGIN -->\n";

  const dynamicParts: string[] = [];

  if (dynamic_skills) {
    if (typeof dynamic_skills === "string") {
      dynamicParts.push(dynamic_skills.trim());
    } else if (Array.isArray(dynamic_skills)) {
      for (const skill of dynamic_skills) {
        if (typeof skill === "string") {
          dynamicParts.push(skill.trim());
        } else if (skill && typeof skill === "object") {
          dynamicParts.push(`### Dynamic Skill: ${skill.name}\n${skill.content.trim()}`);
        }
      }
    }
  }

  if (dynamic_context) {
    if (typeof dynamic_context === "string") {
      dynamicParts.push(dynamic_context.trim());
    } else if (Array.isArray(dynamic_context)) {
      dynamicParts.push(dynamic_context.join("\n\n").trim());
    } else if (typeof dynamic_context === "object") {
      dynamicParts.push(`\`\`\`json\n${JSON.stringify(dynamic_context, null, 2)}\n\`\`\``);
    }
  }

  const dynamicTail = dynamicParts.filter(Boolean).join("\n\n");
  const fullPrompt = dynamicTail.length > 0
    ? `${static_prefix}${marker}${dynamicTail}`
    : static_prefix;

  const prefixBytes = Buffer.byteLength(static_prefix, "utf8");
  const tailBytes = Buffer.byteLength(fullPrompt, "utf8") - prefixBytes;
  const prefixIntact = fullPrompt.startsWith(static_prefix);

  return {
    full_prompt: fullPrompt,
    prefix_bytes: prefixBytes,
    tail_bytes: Math.max(0, tailBytes),
    cache_hit_ratio_target: TARGET_CACHE_HIT_RATIO,
    prefix_intact: prefixIntact,
  };
}

/**
 * Validates that the full prompt preserves 100% byte-for-byte prefix invariance.
 */
export function validateTailSlotIntegrity(fullPrompt: string, expectedPrefix: string): boolean {
  if (!fullPrompt || !expectedPrefix) return false;
  return fullPrompt.startsWith(expectedPrefix);
}

/**
 * Calculates prefix cache hit potential based on static prefix bytes and dynamic tail bytes.
 */
export function calculatePrefixCacheHitPotential(prefixBytes: number, dynamicTailBytes: number): number {
  const total = prefixBytes + dynamicTailBytes;
  if (total <= 0) return 0;
  return Number((prefixBytes / total).toFixed(4));
}

export interface MicroLoopSkillCandidate {
  slug: string;
  domain: "Infra" | "Fulfill" | "App" | "Shared";
  rendered_tail_card?: string;
  content?: string;
  traffic_percent?: number;
}

export interface SelectAndInjectMicroLoopSkillsOptions {
  static_prefix: string;
  thread_id: string;
  active_skills?: MicroLoopSkillCandidate[];
  canary_skills?: MicroLoopSkillCandidate[];
  max_k?: number;
  max_tokens?: number;
  canary_router?: (threadId: string, slug: string, trafficPercent?: number) => boolean;
}

export interface MicroLoopTailInjectionResult {
  full_prompt: string;
  injected_skills_count: number;
  injected_slugs: string[];
  prefix_intact: boolean;
  prefix_bytes: number;
  tail_bytes: number;
}

/**
 * Selects eligible active & canary micro-loop skills and injects them strictly into the tail slot.
 * Ensures KV-cache prefix invariance (prefix_intact === true).
 */
export function selectAndInjectMicroLoopSkills(
  options: SelectAndInjectMicroLoopSkillsOptions,
): MicroLoopTailInjectionResult {
  const {
    static_prefix,
    thread_id,
    active_skills = [],
    canary_skills = [],
    max_k = 3,
    max_tokens = 1200,
    canary_router,
  } = options;

  const eligible: Array<{ slug: string; card: string }> = [];

  for (const skill of active_skills) {
    const card = skill.rendered_tail_card || skill.content;
    if (card) {
      eligible.push({ slug: skill.slug, card });
    }
  }

  for (const canary of canary_skills) {
    const card = canary.rendered_tail_card || canary.content;
    if (!card) continue;
    const isEnrolled = canary_router
      ? canary_router(thread_id, canary.slug, canary.traffic_percent)
      : true;
    if (isEnrolled) {
      eligible.push({ slug: canary.slug, card });
    }
  }

  // Enforce max_k <= 3 and max_tokens <= 1200 budget
  const effectiveMaxK = Math.min(typeof max_k === "number" && max_k > 0 ? max_k : 3, 3);
  const effectiveMaxTokens = Math.min(
    typeof max_tokens === "number" && max_tokens > 0 ? max_tokens : 1200,
    1200,
  );

  const selected: Array<{ slug: string; card: string }> = [];
  let accumulatedTokens = 0;

  for (const candidate of eligible) {
    if (selected.length >= effectiveMaxK) break;
    const estTokens = Math.ceil(candidate.card.length / 4);
    if (accumulatedTokens + estTokens > effectiveMaxTokens) {
      break;
    }
    selected.push(candidate);
    accumulatedTokens += estTokens;
  }

  const dynamicCards = selected.map((s) => s.card);

  const injection = injectTailSlotContext({
    static_prefix,
    dynamic_skills: dynamicCards,
  });

  const prefixIntact = validateTailSlotIntegrity(injection.full_prompt, static_prefix);

  return {
    full_prompt: injection.full_prompt,
    injected_skills_count: selected.length,
    injected_slugs: selected.map((s) => s.slug),
    prefix_intact: prefixIntact,
    prefix_bytes: injection.prefix_bytes,
    tail_bytes: injection.tail_bytes,
  };
}
