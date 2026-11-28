import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  detectModelFamily,
  MicroLoopBridgeService,
  selectCrossFamilyReviewer,
} from "./service/micro-loop-bridge.service.ts";
import {
  HARNESS_EXIT_CODES,
  type IFrictionLedgerPort,
  type IHarnessBridgePort,
  type ILkgHotReloadPort,
  type LkgActiveManifest,
} from "./contracts/ports.ts";
import type { SignedFrictionEvent } from "./contracts/friction-event.schema.ts";
import type { CompiledRuleDraft } from "./contracts/compiled-rule.schema.ts";
import * as os from "node:os";

describe("Micro-Loop Bridge Service", () => {
  it("detects model family accurately and pairs heterogeneous reviewers", () => {
    expect(detectModelFamily("claude-3-7-sonnet")).toBe("anthropic");
    expect(detectModelFamily("gpt-4o")).toBe("openai");
    expect(detectModelFamily("o3-mini")).toBe("openai");
    expect(detectModelFamily("gemini-3.8-flash")).toBe("google");
    expect(detectModelFamily("grok-3")).toBe("xai");
    expect(detectModelFamily("deepseek-v3")).toBe("deepseek");
    expect(detectModelFamily("unknown-engine")).toBe("unknown");

    // Anthropic / OpenAI -> Gemini
    expect(selectCrossFamilyReviewer("claude-3-7-sonnet")).toBe("gemini-4-hydrogen");
    expect(selectCrossFamilyReviewer("gpt-4o")).toBe("gemini-4-hydrogen");

    // Gemini -> Claude
    expect(selectCrossFamilyReviewer("gemini-3.8-flash")).toBe("claude-3-7-sonnet");
  });

  describe("End-to-end evolution pipeline execution", () => {
    let mockHarness: IHarnessBridgePort;
    let mockLedger: IFrictionLedgerPort;
    let mockHotReload: ILkgHotReloadPort;
    let service: MicroLoopBridgeService;

    const sampleEvent: SignedFrictionEvent = {
      schema_version: "3.0",
      event_id: "1".repeat(64),
      fingerprint_id: "fp-bridge-test-1",
      context_hash: "2".repeat(64),
      correction_prompt: "always check branch status",
      failed_output: "commit error",
      timestamp: new Date().toISOString(),
      repo_slug: "test-repo",
      signal_kind: "explicit_correction",
      bot_id: "bot-dev",
      thread_id: "thread-10",
      domain: "Infra",
      producer_model: "claude-3-7-sonnet",
      context_tags: ["git"],
      hmac_sha256: "3".repeat(64),
    };

    const sampleDraft: CompiledRuleDraft = {
      schema_version: "3.0",
      slug: "ml-bridge-test-1",
      fingerprint_id: "fp-bridge-test-1",
      domain: "Infra",
      compile_target: "SYMBOLIC_SCRIPT_0TOKEN",
      producer_model: "claude-3-7-sonnet",
      error_class: "ERR_GIT",
      pre_conditions: ["On feature branch"],
      positive_directives: ["Run git status first"],
      exclusion_boundaries: ["Do not check on detached head"],
      inhibits_patterns: ["Never commit blindly"],
      condition_tags: ["git"],
      script_language: "node",
      script_body: "process.exit(0);",
      contrastive_probes: [
        {
          case_id: "pos",
          kind: "positive_transfer",
          description: "pos",
          command: "bun -e \"process.exit(0)\"",
          expected_exit_code: 0,
        },
        {
          case_id: "neg",
          kind: "boundary_negative",
          description: "neg",
          command: "bun -e \"process.exit(1)\"",
          expected_exit_code: 1,
        },
      ],
      estimated_tokens: 0,
      created_at_iso: new Date().toISOString(),
    };

    const dummyManifest: LkgActiveManifest = {
      schema_version: "3.0",
      manifest_version: 1,
      snapshot_id: "snap-01",
      updated_at_iso: new Date().toISOString(),
      active_skills: [],
      canary_skills: [],
      manifest_hmac_sha256: "hmac-01",
    };

    beforeEach(() => {
      mockHarness = {
        distill: vi.fn().mockResolvedValue({
          exitCode: HARNESS_EXIT_CODES.PASS,
          stdoutJson: { status: "PROMOTED_TO_CANDIDATE", skill_slug: sampleDraft.slug },
          stderrSnippet: "",
          durationMs: 100,
        }),
        oracleJudge: vi.fn().mockResolvedValue({
          exitCode: HARNESS_EXIT_CODES.PASS,
          stdoutJson: { mutation_kill_rate: 1.0, passed: true },
          stderrSnippet: "",
          durationMs: 200,
        }),
        blindReview: vi.fn().mockResolvedValue({
          exitCode: HARNESS_EXIT_CODES.PASS,
          stdoutJson: { verdict: "APPROVE", rubric_score_avg: 4.8 },
          stderrSnippet: "",
          durationMs: 150,
        }),
        promote: vi.fn().mockResolvedValue({
          exitCode: HARNESS_EXIT_CODES.PASS,
          stdoutJson: { status: "PROMOTED" },
          stderrSnippet: "",
          durationMs: 120,
        }),
        rollback: vi.fn().mockResolvedValue({
          exitCode: HARNESS_EXIT_CODES.PASS,
          stdoutJson: { executed: true },
          stderrSnippet: "",
          durationMs: 90,
        }),
        selectSkills: vi.fn().mockResolvedValue({
          exitCode: HARNESS_EXIT_CODES.PASS,
          stdoutJson: { selected: [] },
          stderrSnippet: "",
          durationMs: 50,
        }),
      };

      mockLedger = {
        appendEvent: vi.fn().mockResolvedValue({ written: true, deduplicated: false, path: "" }),
        listEventsByFingerprint: vi.fn().mockResolvedValue([sampleEvent]),
        saveCompiledDraft: vi.fn().mockResolvedValue({ draftDir: "/tmp/drafts" }),
      };

      mockHotReload = {
        getCurrentManifest: vi.fn().mockReturnValue(dummyManifest),
        atomicSwapManifest: vi.fn().mockResolvedValue({ reloadMs: 15, manifestVersion: 2 }),
        rollbackToPreviousManifest: vi.fn().mockResolvedValue({ rollbackWallMs: 25, restoredSnapshotId: "snap-01" }),
        shouldRouteCanary: vi.fn().mockReturnValue(true),
      };

      service = new MicroLoopBridgeService({
        harnessPort: mockHarness,
        ledgerPort: mockLedger,
        hotReloadPort: mockHotReload,
      });
    });

    it("runs complete happy path pipeline (distill -> oracle -> blind -> promote canary -> manifest swap)", async () => {
      const res = await service.runEvolutionPipeline({
        event: sampleEvent,
        draft: sampleDraft,
        storeDir: os.tmpdir(),
        vaultDir: os.tmpdir(),
      });

      expect(res.ok).toBe(true);
      expect(res.stage).toBe("completed");
      expect(res.verdict).toBe("PROMOTED_TO_CANARY_ACTIVE");
      expect(mockHarness.distill).toHaveBeenCalledTimes(1);
      expect(mockHarness.oracleJudge).toHaveBeenCalledTimes(1);
      expect(mockHarness.blindReview).toHaveBeenCalledTimes(1);
      expect(mockHarness.promote).toHaveBeenCalledTimes(2); // shadow + canary
      expect(mockHotReload.atomicSwapManifest).toHaveBeenCalledTimes(1);
    });

    it("halts pipeline at distill when strike 1 records memory without candidate", async () => {
      mockHarness.distill = vi.fn().mockResolvedValue({
        exitCode: HARNESS_EXIT_CODES.PASS,
        stdoutJson: { status: "RECORDED_OBSERVED_MEMORY" },
        stderrSnippet: "",
        durationMs: 50,
      });

      const res = await service.runEvolutionPipeline({
        event: sampleEvent,
        draft: sampleDraft,
        storeDir: os.tmpdir(),
        vaultDir: os.tmpdir(),
      });

      expect(res.ok).toBe(true);
      expect(res.stage).toBe("distill");
      expect(res.verdict).toBe("RECORDED_OBSERVED_MEMORY_STRIKE_1");
      expect(mockHarness.oracleJudge).not.toHaveBeenCalled();
    });

    it("intercepts same-family blind review attempt with EXIT 30", async () => {
      mockHarness.blindReview = vi.fn().mockResolvedValue({
        exitCode: HARNESS_EXIT_CODES.BLOCKED_SAME_FAMILY,
        stdoutJson: null,
        stderrSnippet: "SAME_FAMILY_BIAS_BLOCKED",
        durationMs: 60,
      });

      const res = await service.runEvolutionPipeline({
        event: sampleEvent,
        draft: sampleDraft,
        storeDir: os.tmpdir(),
        vaultDir: os.tmpdir(),
      });

      expect(res.ok).toBe(false);
      expect(res.stage).toBe("blindReview");
      expect(res.exitCode).toBe(30);
      expect(res.verdict).toBe("BLOCKED_SAME_FAMILY");
      expect(mockHarness.promote).not.toHaveBeenCalled();
    });

    it("triggers fast-trip rollback on EXIT 99 tamper detection during oracle judge", async () => {
      mockHarness.oracleJudge = vi.fn().mockResolvedValue({
        exitCode: HARNESS_EXIT_CODES.FREEZE_CHEAT_DETECTED,
        stdoutJson: null,
        stderrSnippet: "FREEZE_CHEAT_DETECTED",
        durationMs: 80,
      });

      const res = await service.runEvolutionPipeline({
        event: sampleEvent,
        draft: sampleDraft,
        storeDir: os.tmpdir(),
        vaultDir: os.tmpdir(),
      });

      expect(res.ok).toBe(false);
      expect(res.stage).toBe("oracleJudge");
      expect(res.exitCode).toBe(99);
      expect(mockHotReload.rollbackToPreviousManifest).toHaveBeenCalledTimes(1);
    });

    it("freezes into MANUAL_REVIEW_NEEDED upon 2 consecutive blind review disagreements", async () => {
      mockHarness.blindReview = vi.fn().mockResolvedValue({
        exitCode: HARNESS_EXIT_CODES.FAIL_RETRYABLE,
        stdoutJson: null,
        stderrSnippet: "Reviewer rejected rubric scores",
        durationMs: 50,
      });

      // 1st disagreement
      const res1 = await service.runEvolutionPipeline({
        event: sampleEvent,
        draft: sampleDraft,
        storeDir: os.tmpdir(),
        vaultDir: os.tmpdir(),
      });
      expect(res1.ok).toBe(false);
      expect(res1.verdict).not.toBe("MANUAL_REVIEW_NEEDED");

      // 2nd disagreement
      const res2 = await service.runEvolutionPipeline({
        event: sampleEvent,
        draft: sampleDraft,
        storeDir: os.tmpdir(),
        vaultDir: os.tmpdir(),
      });
      expect(res2.ok).toBe(false);
      expect(res2.verdict).toBe("MANUAL_REVIEW_NEEDED");
    });
  });
});
