import { describe, expect, it } from "vitest";
import {
  evaluateSubagentDispatchROI,
  resolveQuotaAwareRouting,
  injectTailSlotContext,
  validateTailSlotIntegrity,
  calculatePrefixCacheHitPotential,
  selectAndInjectMicroLoopSkills,
  SUBAGENT_COLD_START_TOKENS,
  POOL_A_DEFAULT_MODEL,
  POOL_B_DEFAULT_MODEL,
  POOL_C_DEFAULT_MODEL,
  POOL_C_CRITICAL_QUOTA_THRESHOLD,
  TARGET_CACHE_HIT_RATIO,
} from "./fast-brain-router.ts";

describe("Fast Brain Router", () => {
  describe("Subagent Dispatch ROI Equation (evaluateSubagentDispatchROI)", () => {
    it("forces INLINE_EXECUTION for micro-tasks (diff <= 30, files <= 2, dirty_tokens <= 1500) to save 6000t cold start", () => {
      const evaluation = evaluateSubagentDispatchROI({
        diff_loc: 15,
        files: 1,
        dirty_tokens: 800,
      });

      expect(evaluation.decision).toBe("INLINE_EXECUTION");
      expect(evaluation.cold_start_tokens_saved).toBe(SUBAGENT_COLD_START_TOKENS);
      expect(evaluation.cold_start_tokens_saved).toBe(6000);
      expect(evaluation.reason).toContain("micro-change threshold");
    });

    it("forces INLINE_EXECUTION at the exact boundary of micro-tasks (diff=30, files=2, dirty_tokens=1500)", () => {
      const evaluation = evaluateSubagentDispatchROI({
        diff_loc: 30,
        files: 2,
        dirty_tokens: 1500,
      });

      expect(evaluation.decision).toBe("INLINE_EXECUTION");
      expect(evaluation.cold_start_tokens_saved).toBe(6000);
    });

    it("forces INLINE_EXECUTION for single CLI invocation", () => {
      const eval1 = evaluateSubagentDispatchROI({
        is_single_cli: true,
        diff_loc: 50,
        files: 3,
        dirty_tokens: 3000,
      });
      expect(eval1.decision).toBe("INLINE_EXECUTION");
      expect(eval1.reason).toContain("Single CLI invocation");

      const eval2 = evaluateSubagentDispatchROI({
        command_type: "cli",
        diff_loc: 40,
        files: 1,
      });
      expect(eval2.decision).toBe("INLINE_EXECUTION");
    });

    it("forces INLINE_EXECUTION for single file slice", () => {
      const eval1 = evaluateSubagentDispatchROI({
        is_single_file_slice: true,
        diff_loc: 80,
      });
      expect(eval1.decision).toBe("INLINE_EXECUTION");
      expect(eval1.reason).toContain("Single file slice");

      const eval2 = evaluateSubagentDispatchROI({
        files: 1,
        diff_loc: 90,
      });
      expect(eval2.decision).toBe("INLINE_EXECUTION");
    });

    it("forces SUBAGENT_SPAWN when physical process/filesystem isolation is explicitly required", () => {
      const evaluation = evaluateSubagentDispatchROI({
        requires_physical_isolation: true,
        diff_loc: 5,
        files: 1,
        dirty_tokens: 200,
      });

      expect(evaluation.decision).toBe("SUBAGENT_SPAWN");
      expect(evaluation.cold_start_tokens_saved).toBe(0);
      expect(evaluation.reason).toContain("Physical process/file tree isolation explicitly required");
    });

    it("forces SUBAGENT_SPAWN when dirty tokens exceed 10000 with quota asymmetry", () => {
      const evaluation = evaluateSubagentDispatchROI({
        dirty_tokens: 14000,
        quota_asymmetric: true,
        diff_loc: 60,
        files: 3,
      });

      expect(evaluation.decision).toBe("SUBAGENT_SPAWN");
      expect(evaluation.reason).toContain("asymmetric quota");
    });

    it("decides BATCHED_SUBAGENT when batch_count >= 3", () => {
      const eval3 = evaluateSubagentDispatchROI({
        batch_count: 3,
        diff_loc: 80,
        files: 4,
        dirty_tokens: 3000,
      });
      expect(eval3.decision).toBe("BATCHED_SUBAGENT");
      expect(eval3.cold_start_tokens_saved).toBeGreaterThan(0);
      expect(eval3.reason).toContain("Microtask batch count (3) >= 3");

      const eval5 = evaluateSubagentDispatchROI({
        batch_count: 5,
        diff_loc: 100,
        files: 5,
        dirty_tokens: 4000,
      });
      expect(eval5.decision).toBe("BATCHED_SUBAGENT");
      expect(eval5.cold_start_tokens_saved).toBe(4 * SUBAGENT_COLD_START_TOKENS);
    });

    it("evaluates general task complexity and returns SUBAGENT_SPAWN when ROI >= 1.5", () => {
      const evaluation = evaluateSubagentDispatchROI({
        diff_loc: 250,
        files: 5,
        dirty_tokens: 8000,
      });

      expect(evaluation.decision).toBe("SUBAGENT_SPAWN");
      expect(evaluation.roi_score).toBeGreaterThanOrEqual(1.5);
    });

    it("preserves genuine roi_score below 1.5 when spawned due to diffLoc complexity threshold", () => {
      const evaluation = evaluateSubagentDispatchROI({
        diff_loc: 160,
        dirty_tokens: 100,
        files: 3,
      });

      expect(evaluation.decision).toBe("SUBAGENT_SPAWN");
      expect(evaluation.roi_score).toBeLessThan(1.5);
      expect(evaluation.reason).toContain("complexity threshold");
      expect(evaluation.reason).toContain("diff_loc=160");
    });

    it("keeps moderate tasks inline when cold start overhead exceeds savings", () => {
      const evaluation = evaluateSubagentDispatchROI({
        diff_loc: 40,
        files: 3,
        dirty_tokens: 1800,
      });

      expect(evaluation.decision).toBe("INLINE_EXECUTION");
      expect(evaluation.cold_start_tokens_saved).toBe(6000);
    });
  });

  describe("Three-Pool Quota-Aware Anti-Autophagy Routing (resolveQuotaAwareRouting)", () => {
    it("exports standard threshold constants", () => {
      expect(POOL_C_CRITICAL_QUOTA_THRESHOLD).toBe(0.15);
      expect(TARGET_CACHE_HIT_RATIO).toBe(0.88);
      expect(SUBAGENT_COLD_START_TOKENS).toBe(6000);
    });

    it("routes T1 tasks 100% to Pool A (gemini-3.8-flash) with static zero-token gate enabled", () => {
      const result = resolveQuotaAwareRouting({
        tier: "T1",
        pool_c_available_quota: 0.8,
      });

      expect(result.pool).toBe("PoolA");
      expect(result.primary_model).toBe(POOL_A_DEFAULT_MODEL);
      expect(result.primary_model).toBe("gemini-3.8-flash");
      expect(result.static_zero_token_gate).toBe(true);
      expect(result.cross_family_dual_review).toBe(false);
      expect(result.fallback_triggered).toBe(false);
    });

    it("routes numeric tier 1 tasks to Pool A identically", () => {
      const result = resolveQuotaAwareRouting({
        tier: 1,
        pool_c_available_quota: 0.5,
      });

      expect(result.pool).toBe("PoolA");
      expect(result.primary_model).toBe("gemini-3.8-flash");
      expect(result.static_zero_token_gate).toBe(true);
    });

    it("routes Tier3 high-coupling tasks directly to Pool B (gemini-4-hydrogen), skipping Flash trial-and-error", () => {
      const result = resolveQuotaAwareRouting({
        tier: "TIER_3",
        pool_c_available_quota: 0.9,
      });

      expect(result.pool).toBe("PoolB");
      expect(result.primary_model).toBe(POOL_B_DEFAULT_MODEL);
      expect(result.primary_model).toBe("gemini-4-hydrogen");
      expect(result.static_zero_token_gate).toBe(false);
      expect(result.cross_family_dual_review).toBe(false);
      expect(result.fallback_triggered).toBe(false);
      expect(result.reason).toContain("skipping Flash trial-and-error");

      const resultVariant = resolveQuotaAwareRouting({
        tier: "Tier3",
        pool_c_available_quota: 0.9,
      });
      expect(resultVariant.pool).toBe("PoolB");

      const resultNumeric = resolveQuotaAwareRouting({
        tier: 3,
        pool_c_available_quota: 0.9,
      });
      expect(resultNumeric.pool).toBe("PoolB");
    });

    it("routes 2-strike circuit break to Pool C (claude-3-7-sonnet) safety airbag when quota is healthy", () => {
      const result = resolveQuotaAwareRouting({
        tier: "T1",
        strike_count: 2,
        pool_c_available_quota: 0.5, // 50% healthy
      });

      expect(result.pool).toBe("PoolC");
      expect(result.primary_model).toBe(POOL_C_DEFAULT_MODEL);
      expect(result.primary_model).toBe("claude-3-7-sonnet");
      expect(result.fallback_triggered).toBe(false);
      expect(result.reason).toContain("two-strike limit; escalated to Pool C safety airbag");
    });

    it("preserves cross-family dual review on 2-strike escalation for T4 Critical tasks", () => {
      const result = resolveQuotaAwareRouting({
        tier: "T4",
        strike_count: 2,
        pool_c_available_quota: 0.8,
      });

      expect(result.pool).toBe("PoolC");
      expect(result.primary_model).toBe(POOL_C_DEFAULT_MODEL);
      expect(result.review_model).toBe(POOL_B_DEFAULT_MODEL);
      expect(result.cross_family_dual_review).toBe(true);
      expect(result.fallback_triggered).toBe(false);
      expect(result.reason).toContain("Strike count 2 exceeded two-strike limit on critical task");
    });

    it("handles pool_c_quota_unit='percent' with 1 (1%) and falls back to Pool B when depleted", () => {
      const result = resolveQuotaAwareRouting({
        tier: "T4",
        pool_c_available_quota: 1, // 1%
        pool_c_quota_unit: "percent",
      });

      expect(result.pool).toBe("PoolB");
      expect(result.fallback_triggered).toBe(true);
      expect(result.fallback_reason).toContain("Pool C quota depleted (1.0% < 15%)");
    });

    it("fails safe when pool_c_available_quota is NaN and routes to Pool B", () => {
      const result = resolveQuotaAwareRouting({
        tier: "T4",
        pool_c_available_quota: NaN,
      });

      expect(result.pool).toBe("PoolB");
      expect(result.fallback_triggered).toBe(true);
      expect(result.fallback_reason).toContain("Pool C quota depleted");
    });

    it("falls back to Pool B (gemini-4-hydrogen) on 2-strike when Pool C quota < 15% (anti-autophagy protection)", () => {
      const result = resolveQuotaAwareRouting({
        tier: "T2",
        strike_count: 2,
        pool_c_available_quota: 0.12, // 12% < 15%
      });

      expect(result.pool).toBe("PoolB");
      expect(result.primary_model).toBe(POOL_B_DEFAULT_MODEL);
      expect(result.fallback_triggered).toBe(true);
      expect(result.fallback_reason).toContain("Pool C quota depleted");
      expect(result.reason).toContain("routed to Pool B (gemini-4-hydrogen) to preserve core availability");
    });

    it("handles percentage quota (e.g. 10%) correctly for 2-strike anti-autophagy fallback", () => {
      const result = resolveQuotaAwareRouting({
        tier: "T2",
        strike_count: 3,
        pool_c_available_quota: 10, // 10%
      });

      expect(result.pool).toBe("PoolB");
      expect(result.fallback_triggered).toBe(true);
    });

    it("routes T4 Critical tasks to cross-family dual review (Claude producer + Gemini-4-Hydrogen blind reviewer) when quota healthy", () => {
      const result = resolveQuotaAwareRouting({
        tier: "T4",
        critical: true,
        pool_c_available_quota: 0.75,
      });

      expect(result.pool).toBe("PoolC");
      expect(result.primary_model).toBe(POOL_C_DEFAULT_MODEL);
      expect(result.review_model).toBe(POOL_B_DEFAULT_MODEL);
      expect(result.cross_family_dual_review).toBe(true);
      expect(result.fallback_triggered).toBe(false);
      expect(result.reason).toContain("cross-pool cross-family peer review");
    });

    it("falls back to Pool B for T4 Critical tasks when Pool C quota < 15%", () => {
      const result = resolveQuotaAwareRouting({
        tier: "T4",
        critical: true,
        pool_c_available_quota: 0.14, // 14% < 15%
      });

      expect(result.pool).toBe("PoolB");
      expect(result.primary_model).toBe(POOL_B_DEFAULT_MODEL);
      expect(result.cross_family_dual_review).toBe(false);
      expect(result.fallback_triggered).toBe(true);
      expect(result.fallback_reason).toContain("Pool C quota depleted");
    });

    it("routes T2 standard tasks to Pool A", () => {
      const result = resolveQuotaAwareRouting({
        tier: "T2",
        pool_c_available_quota: 0.5,
      });

      expect(result.pool).toBe("PoolA");
      expect(result.primary_model).toBe(POOL_A_DEFAULT_MODEL);
      expect(result.static_zero_token_gate).toBe(false);
    });
  });

  describe("Tail-Slot Sparse Injection & KV-Cache Anti-Corruption (injectTailSlotContext)", () => {
    const staticBase = `# SYSTEM INSTRUCTIONS (IMMUTABLE PREFIX)\nRole: Apex Code Engine\nStrict Non-Interactive Terminal Policy.`;

    it("keeps static prefix 100% byte-for-byte intact when injecting dynamic skills and context", () => {
      const result = injectTailSlotContext({
        static_prefix: staticBase,
        dynamic_skills: ["Skill: git-atomic-commit", "Skill: vitest-fast-path"],
        dynamic_context: { current_ticket: "TICKET-101", status: "in_progress" },
      });

      expect(result.prefix_intact).toBe(true);
      expect(result.full_prompt.startsWith(staticBase)).toBe(true);
      expect(validateTailSlotIntegrity(result.full_prompt, staticBase)).toBe(true);
      expect(result.prefix_bytes).toBe(Buffer.byteLength(staticBase, "utf8"));
      expect(result.tail_bytes).toBeGreaterThan(0);
      expect(result.cache_hit_ratio_target).toBe(TARGET_CACHE_HIT_RATIO);
      expect(result.cache_hit_ratio_target).toBe(0.88);
    });

    it("handles object-shaped dynamic skills seamlessly in the tail slot", () => {
      const result = injectTailSlotContext({
        static_prefix: staticBase,
        dynamic_skills: [
          { name: "RustAnalyzer", content: "Use cargo clippy --all-targets" },
        ],
      });

      expect(result.prefix_intact).toBe(true);
      expect(result.full_prompt).toContain("### Dynamic Skill: RustAnalyzer");
      expect(result.full_prompt).toContain("Use cargo clippy --all-targets");
    });

    it("returns unmodified static prefix if dynamic parts are empty", () => {
      const result = injectTailSlotContext({
        static_prefix: staticBase,
      });

      expect(result.full_prompt).toBe(staticBase);
      expect(result.prefix_bytes).toBe(Buffer.byteLength(staticBase, "utf8"));
      expect(result.tail_bytes).toBe(0);
      expect(result.prefix_intact).toBe(true);
    });

    it("accurately calculates prefix cache hit potential", () => {
      // 880 bytes static, 120 bytes dynamic = 880 / 1000 = 0.88 (88%)
      const ratio = calculatePrefixCacheHitPotential(880, 120);
      expect(ratio).toBe(0.88);
      expect(ratio).toBeGreaterThanOrEqual(TARGET_CACHE_HIT_RATIO);

      // 950 bytes static, 50 bytes dynamic = 950 / 1000 = 0.95 (95%)
      const highRatio = calculatePrefixCacheHitPotential(950, 50);
      expect(highRatio).toBe(0.95);
    });

    it("validates tail slot integrity rejection when prefix is corrupted", () => {
      const corruptedPrompt = `PREFIX CORRUPTED!\n${staticBase}`;
      expect(validateTailSlotIntegrity(corruptedPrompt, staticBase)).toBe(false);
      expect(validateTailSlotIntegrity("", staticBase)).toBe(false);
    });

    it("selectAndInjectMicroLoopSkills injects active and canary skills into tail slot with prefix intact", () => {
      const activeSkills = [
        { slug: "git-rebase-guard", domain: "Infra" as const, rendered_tail_card: "### Skill: git-rebase-guard\nDo not force push to main" },
        { slug: "public-api-guard", domain: "Shared" as const, rendered_tail_card: "### Skill: public-api-guard\nNever break exported functions" },
      ];
      const canarySkills = [
        { slug: "canary-lint-guard", domain: "App" as const, rendered_tail_card: "### Skill: canary-lint-guard\nRun biome check", traffic_percent: 10 },
      ];

      const res = selectAndInjectMicroLoopSkills({
        static_prefix: staticBase,
        thread_id: "thread-123",
        active_skills: activeSkills,
        canary_skills: canarySkills,
        canary_router: () => true,
      });

      expect(res.prefix_intact).toBe(true);
      expect(res.injected_skills_count).toBe(3);
      expect(res.injected_slugs).toEqual(["git-rebase-guard", "public-api-guard", "canary-lint-guard"]);
      expect(res.full_prompt.startsWith(staticBase)).toBe(true);
      expect(res.full_prompt).toContain("<!-- DYNAMIC_TAIL_SLOT_BEGIN -->");
      expect(res.full_prompt).toContain("git-rebase-guard");
      expect(res.full_prompt).toContain("canary-lint-guard");
    });

    it("selectAndInjectMicroLoopSkills strictly enforces Top-K <= 3 and respects canary router exclusion", () => {
      const activeSkills = [
        { slug: "skill-1", domain: "Infra" as const, rendered_tail_card: "Card 1" },
        { slug: "skill-2", domain: "Infra" as const, rendered_tail_card: "Card 2" },
        { slug: "skill-3", domain: "Infra" as const, rendered_tail_card: "Card 3" },
        { slug: "skill-4", domain: "Infra" as const, rendered_tail_card: "Card 4" },
      ];
      const canarySkills = [
        { slug: "canary-5", domain: "Infra" as const, rendered_tail_card: "Card 5", traffic_percent: 10 },
      ];

      const res = selectAndInjectMicroLoopSkills({
        static_prefix: staticBase,
        thread_id: "thread-456",
        active_skills: activeSkills,
        canary_skills: canarySkills,
        max_k: 3,
        canary_router: () => false, // excluded by canary
      });

      expect(res.prefix_intact).toBe(true);
      expect(res.injected_skills_count).toBe(3);
      expect(res.injected_slugs).toEqual(["skill-1", "skill-2", "skill-3"]);
      expect(res.injected_slugs).not.toContain("canary-5");
    });
  });
});

