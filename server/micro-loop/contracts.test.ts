import { describe, expect, it } from "vitest";
import {
  computeContextHash,
  computeFrictionFingerprint,
  signFrictionEvent,
  verifyFrictionEventHmac,
  type FrictionEventPayload,
} from "./contracts/friction-event.schema.ts";
import {
  CompiledRuleDraftSchema,
  type CompiledRuleDraft,
} from "./contracts/compiled-rule.schema.ts";
import { HARNESS_EXIT_CODES } from "./contracts/ports.ts";

describe("Phase C Contracts & Ports Layer", () => {
  const secret = "test-secret-key-12345";

  it("computes deterministic context hash and fingerprint", () => {
    const hash1 = computeContextHash({
      repo_slug: "org/repo",
      domain: "Infra",
      failed_output_normalized: "git rebase failed: conflict",
      context_tags: ["git", "rebase"],
    });
    const hash2 = computeContextHash({
      repo_slug: "org/repo",
      domain: "Infra",
      failed_output_normalized: "git rebase failed: conflict",
      context_tags: ["rebase", "git"], // order shouldn't matter
    });
    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^[a-f0-9]{64}$/);

    const fp = computeFrictionFingerprint({
      repo_slug: "org/repo",
      domain: "Infra",
      normalized_intent_key: "never force push to main",
    });
    expect(fp).toMatch(/^[a-f0-9]{32}$/);
  });

  it("signs and verifies friction event with constant-time HMAC", () => {
    const payload: FrictionEventPayload = {
      schema_version: "3.0",
      event_id: "a".repeat(64),
      fingerprint_id: "b".repeat(32),
      context_hash: "c".repeat(64),
      correction_prompt: "do not delete dist before build",
      failed_output: "build error: dist directory missing",
      timestamp: new Date().toISOString(),
      repo_slug: "openmausbot/core",
      signal_kind: "explicit_correction",
      bot_id: "bot-dev-01",
      thread_id: "thread-101",
      domain: "Infra",
      producer_model: "gemini-3.8-flash",
      context_tags: ["build", "dist"],
    };

    const signed = signFrictionEvent(payload, secret);
    expect(signed.hmac_sha256).toMatch(/^[a-f0-9]{64}$/);

    const valid = verifyFrictionEventHmac(signed, secret);
    expect(valid).toBe(true);

    const invalid = verifyFrictionEventHmac(signed, "wrong-secret");
    expect(invalid).toBe(false);

    // Tampered payload
    const tampered = { ...signed, correction_prompt: "tampered prompt" };
    expect(verifyFrictionEventHmac(tampered, secret)).toBe(false);
  });

  it("verifyFrictionEventHmac returns false and never throws RangeError for non-hex 64-char strings", () => {
    const payload: FrictionEventPayload = {
      schema_version: "3.0",
      event_id: "a".repeat(64),
      fingerprint_id: "b".repeat(32),
      context_hash: "c".repeat(64),
      correction_prompt: "do not delete dist before build",
      failed_output: "build error: dist directory missing",
      timestamp: new Date().toISOString(),
      repo_slug: "openmausbot/core",
      signal_kind: "explicit_correction",
      bot_id: "bot-dev-01",
      thread_id: "thread-101",
      domain: "Infra",
      producer_model: "gemini-3.8-flash",
      context_tags: ["build", "dist"],
    };

    const nonHexHmac = "z".repeat(64);
    expect(() => {
      const res = verifyFrictionEventHmac(
        { ...payload, hmac_sha256: nonHexHmac } as any,
        secret,
      );
      expect(res).toBe(false);
    }).not.toThrow();

    expect(verifyFrictionEventHmac({ ...payload, hmac_sha256: "short" } as any, secret)).toBe(false);
    expect(verifyFrictionEventHmac({ ...payload, hmac_sha256: "" } as any, secret)).toBe(false);
  });

  it("CompiledRuleDraftSchema enforces exclusion_boundaries >= 1 and contrastive probes", () => {
    const validDraft: CompiledRuleDraft = {
      schema_version: "3.0",
      slug: "ml-git-push-guard",
      fingerprint_id: "1234567890abcdef",
      domain: "Infra",
      compile_target: "SYMBOLIC_SCRIPT_0TOKEN",
      producer_model: "claude-3-7-sonnet",
      error_class: "GIT_FORCE_PUSH_ERROR",
      pre_conditions: ["Git remote branch is main"],
      positive_directives: ["Use git push --force-with-lease instead of -f"],
      exclusion_boundaries: ["Do not block force push on personal feature branches"],
      inhibits_patterns: ["Never run git push -f origin main"],
      condition_tags: ["git", "push"],
      script_language: "node",
      script_body: "console.log('OK'); process.exit(0);",
      contrastive_probes: [
        {
          case_id: "pos-1",
          kind: "positive_transfer",
          description: "Allows normal push on feature branch",
          command: "bun -e \"console.log('PASS')\"",
          expected_exit_code: 0,
        },
        {
          case_id: "neg-1",
          kind: "boundary_negative",
          description: "Blocks force push on main",
          command: "bun -e \"process.exit(1)\"",
          expected_exit_code: 1,
        },
      ],
      estimated_tokens: 0,
      created_at_iso: new Date().toISOString(),
    };

    const parsed = CompiledRuleDraftSchema.safeParse(validDraft);
    expect(parsed.success).toBe(true);

    // Missing exclusion_boundaries (< 1)
    const missingExclusion = {
      ...validDraft,
      exclusion_boundaries: [],
    };
    const invalidExclusion = CompiledRuleDraftSchema.safeParse(missingExclusion);
    expect(invalidExclusion.success).toBe(false);

    // Missing negative contrastive probe
    const missingNegProbe = {
      ...validDraft,
      contrastive_probes: [
        {
          case_id: "pos-1",
          kind: "positive_transfer" as const,
          description: "Allows normal push",
          command: "bun -e \"console.log('PASS')\"",
          expected_exit_code: 0,
        },
      ],
    };
    const invalidProbe = CompiledRuleDraftSchema.safeParse(missingNegProbe);
    expect(invalidProbe.success).toBe(false);

    // Symbolic script must have estimated_tokens === 0
    const nonZeroToken = {
      ...validDraft,
      estimated_tokens: 50,
    };
    const invalidToken = CompiledRuleDraftSchema.safeParse(nonZeroToken);
    expect(invalidToken.success).toBe(false);
  });

  it("verifies HARNESS_EXIT_CODES 11 items consistency", () => {
    expect(HARNESS_EXIT_CODES.PASS).toBe(0);
    expect(HARNESS_EXIT_CODES.FAIL_RETRYABLE).toBe(1);
    expect(HARNESS_EXIT_CODES.SPEC_INVALID_OR_MISSING_HOLDOUT).toBe(2);
    expect(HARNESS_EXIT_CODES.FREEZE_TWO_STRIKE).toBe(20);
    expect(HARNESS_EXIT_CODES.FREEZE_BUDGET_EXCEEDED).toBe(21);
    expect(HARNESS_EXIT_CODES.IDEMPOTENCY_CONFLICT).toBe(22);
    expect(HARNESS_EXIT_CODES.LEASE_FENCING_VIOLATION).toBe(23);
    expect(HARNESS_EXIT_CODES.BLOCKED_SAME_FAMILY).toBe(30);
    expect(HARNESS_EXIT_CODES.TAUTOLOGY_CHEAT_DETECTED).toBe(31);
    expect(HARNESS_EXIT_CODES.COOLDOWN_ACTIVE).toBe(32);
    expect(HARNESS_EXIT_CODES.FREEZE_CHEAT_DETECTED).toBe(99);
  });
});

