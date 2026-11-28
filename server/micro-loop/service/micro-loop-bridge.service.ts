import { promises as fs } from "node:fs";
import { join } from "node:path";
import {
  HARNESS_EXIT_CODES,
  type HarnessExitCode,
  type IFrictionLedgerPort,
  type IHarnessBridgePort,
  type ILkgHotReloadPort,
  type LkgActiveManifest,
  type LkgCanarySkillEntry,
} from "../contracts/ports.ts";
import type { SignedFrictionEvent } from "../contracts/friction-event.schema.ts";
import type { CompiledRuleDraft } from "../contracts/compiled-rule.schema.ts";

export type ModelFamily = "anthropic" | "openai" | "google" | "xai" | "deepseek" | "unknown";

export function detectModelFamily(modelId: string): ModelFamily {
  const normalized = modelId.trim().toLowerCase();
  if (!normalized) return "unknown";
  if (/claude|anthropic/.test(normalized)) return "anthropic";
  if (/(^|[/:_-])(gpt|o1|o3|o4|codex)|openai/.test(normalized)) return "openai";
  if (/gemini|google|antigravity/.test(normalized)) return "google";
  if (/grok|xai/.test(normalized)) return "xai";
  if (/deepseek/.test(normalized)) return "deepseek";
  return "unknown";
}

export function selectCrossFamilyReviewer(producerModel: string): string {
  const family = detectModelFamily(producerModel);
  if (family === "anthropic" || family === "openai") {
    return "gemini-4-hydrogen";
  }
  if (family === "google") {
    return "claude-3-7-sonnet";
  }
  if (family === "deepseek" || family === "xai") {
    return "claude-3-7-sonnet";
  }
  return "gemini-4-hydrogen";
}

export interface BridgePipelineResult {
  ok: boolean;
  stage: "distill" | "oracleJudge" | "blindReview" | "promote" | "completed";
  slug?: string;
  exitCode: HarnessExitCode;
  verdict?: string;
  reasons: string[];
  durationMs: number;
}

export interface MicroLoopBridgeServiceDeps {
  harnessPort: IHarnessBridgePort;
  ledgerPort: IFrictionLedgerPort;
  hotReloadPort: ILkgHotReloadPort;
}

export class MicroLoopBridgeService {
  private readonly harness: IHarnessBridgePort;
  private readonly ledger: IFrictionLedgerPort;
  private readonly hotReload: ILkgHotReloadPort;
  private readonly blindDisagreements: Map<string, number> = new Map();

  constructor(deps: MicroLoopBridgeServiceDeps) {
    this.harness = deps.harnessPort;
    this.ledger = deps.ledgerPort;
    this.hotReload = deps.hotReloadPort;
  }

  async runEvolutionPipeline(params: {
    event: SignedFrictionEvent;
    draft: CompiledRuleDraft;
    storeDir: string;
    vaultDir: string;
    tmpDir?: string;
    reviewerModel?: string;
    reviewerScores?: {
      safety: number;
      generalizability: number;
      non_overfitting: number;
      cognitive_load: number;
      blocking_issues: string[];
    };
  }): Promise<BridgePipelineResult> {
    const startTime = Date.now();
    const { event, draft, storeDir, vaultDir } = params;
    const slug = draft.slug;
    const workDir = params.tmpDir || storeDir;

    const distillInputPath = join(workDir, `distill-input-${event.event_id.slice(0, 16)}.json`);
    let blindInputPath: string | undefined;

    try {
      // 1. Prepare Distill Input
      const distillInput = {
        schema_version: "2.0",
        task_id: `phasec-${event.event_id.slice(0, 16)}`,
        bot_id: event.bot_id,
        domain: event.domain,
        fingerprint_id: event.fingerprint_id,
        error_class: draft.error_class,
        normalized_signature: `${event.repo_slug}:${event.context_hash.slice(0, 16)}`,
        verified_resolution: draft.positive_directives.join("; ").slice(0, 400),
        canary_probe_command: draft.contrastive_probes[0]?.command || `bun -e "process.exit(0)"`,
        script_body: draft.script_body,
        relation_boundary: {
          condition_tags: draft.condition_tags,
          applicable_conditions: draft.pre_conditions,
          exclusion_boundaries: draft.exclusion_boundaries,
          inhibits_patterns: draft.inhibits_patterns,
        },
        contrastive_probes: draft.contrastive_probes.map((p) => ({
          case_id: p.case_id,
          kind: p.kind,
          command: p.command,
          expected_exit_code: p.expected_exit_code,
        })),
        occurred_at_iso: event.timestamp,
      };

      await fs.writeFile(distillInputPath, JSON.stringify(distillInput, null, 2), "utf8");

      // 2. Distill (Rule-of-2 Gate)
      const distillRes = await this.harness.distill({
        storeDir,
        inputFilePath: distillInputPath,
      });

      if (distillRes.exitCode !== HARNESS_EXIT_CODES.PASS) {
        return {
          ok: false,
          stage: "distill",
          slug,
          exitCode: distillRes.exitCode,
          reasons: [distillRes.stderrSnippet || "Distill failed"],
          durationMs: Date.now() - startTime,
        };
      }

      const distillJson = distillRes.stdoutJson as { status?: string; skill_slug?: string } | null;
      if (distillJson?.status === "RECORDED_OBSERVED_MEMORY") {
        return {
          ok: true,
          stage: "distill",
          slug,
          verdict: "RECORDED_OBSERVED_MEMORY_STRIKE_1",
          exitCode: HARNESS_EXIT_CODES.PASS,
          reasons: ["Recorded first strike memory; waiting for Rule-of-2 recurrence"],
          durationMs: Date.now() - startTime,
        };
      }

      // Save compiled draft to local repo
      await this.ledger.saveCompiledDraft(draft);

      // 3. Oracle Judge (100% Mutation Kill & Anti-Tautology)
      const judgeRes = await this.harness.oracleJudge({
        slug,
        storeDir,
        vaultDir,
      });

      if (judgeRes.exitCode === HARNESS_EXIT_CODES.FREEZE_CHEAT_DETECTED) {
        await this.triggerFastTripRollback({
          slug,
          storeDir,
          vaultDir,
          reason: "EXIT 99: FREEZE_CHEAT_DETECTED in Oracle Judge",
        });
        return {
          ok: false,
          stage: "oracleJudge",
          slug,
          exitCode: HARNESS_EXIT_CODES.FREEZE_CHEAT_DETECTED,
          reasons: ["Tampering detected during oracle evaluation; fast-trip rollback triggered"],
          durationMs: Date.now() - startTime,
        };
      }

      if (judgeRes.exitCode !== HARNESS_EXIT_CODES.PASS) {
        return {
          ok: false,
          stage: "oracleJudge",
          slug,
          exitCode: judgeRes.exitCode,
          reasons: [judgeRes.stderrSnippet || `Oracle judge failed with exit code ${judgeRes.exitCode}`],
          durationMs: Date.now() - startTime,
        };
      }

      // 4. Tier-2 Cross-Family Blind Review
      const reviewerModel = params.reviewerModel || selectCrossFamilyReviewer(draft.producer_model);
      if (detectModelFamily(draft.producer_model) === detectModelFamily(reviewerModel)) {
        return {
          ok: false,
          stage: "blindReview",
          slug,
          exitCode: HARNESS_EXIT_CODES.BLOCKED_SAME_FAMILY,
          verdict: "BLOCKED_SAME_FAMILY",
          reasons: ["Cross-family blind review blocked: producer and reviewer share model family"],
          durationMs: Date.now() - startTime,
        };
      }

      blindInputPath = join(workDir, `blind-review-input-${slug}.json`);
      const blindInput = {
        schema_version: "2.0",
        skill_slug: slug,
        producer_bot_id: event.bot_id,
        producer_model: draft.producer_model,
        reviewer_model: reviewerModel,
        skill_md_content: draft.rendered_skill_md || draft.positive_directives.join("\n"),
        script_content: draft.script_body,
        canary_probe_command: draft.contrastive_probes[0]?.command || `bun -e "process.exit(0)"`,
        canary_exit_code: 0,
        reviewer_scores: params.reviewerScores ?? {
          safety: 5,
          generalizability: 5,
          non_overfitting: 5,
          cognitive_load: 5,
          blocking_issues: [],
        },
      };

      await fs.writeFile(blindInputPath, JSON.stringify(blindInput, null, 2), "utf8");

      const blindRes = await this.harness.blindReview({
        inputFilePath: blindInputPath,
        storeDir,
        vaultDir,
      });

      if (blindRes.exitCode === HARNESS_EXIT_CODES.FREEZE_CHEAT_DETECTED) {
        await this.triggerFastTripRollback({
          slug,
          storeDir,
          vaultDir,
          reason: "EXIT 99: FREEZE_CHEAT_DETECTED in Blind Review",
        });
        return {
          ok: false,
          stage: "blindReview",
          slug,
          exitCode: HARNESS_EXIT_CODES.FREEZE_CHEAT_DETECTED,
          reasons: ["Tampering detected during blind review evaluation; fast-trip rollback triggered"],
          durationMs: Date.now() - startTime,
        };
      }

      if (blindRes.exitCode === HARNESS_EXIT_CODES.BLOCKED_SAME_FAMILY) {
        return {
          ok: false,
          stage: "blindReview",
          slug,
          exitCode: HARNESS_EXIT_CODES.BLOCKED_SAME_FAMILY,
          verdict: "BLOCKED_SAME_FAMILY",
          reasons: ["Cross-family blind review blocked: producer and reviewer share model family"],
          durationMs: Date.now() - startTime,
        };
      }

      if (blindRes.exitCode !== HARNESS_EXIT_CODES.PASS) {
        const currentFailures = (this.blindDisagreements.get(slug) || 0) + 1;
        this.blindDisagreements.set(slug, currentFailures);

        if (currentFailures >= 2) {
          return {
            ok: false,
            stage: "blindReview",
            slug,
            exitCode: blindRes.exitCode,
            verdict: "MANUAL_REVIEW_NEEDED",
            reasons: ["Cross-family blind review failed 2 consecutive times; locked for manual review"],
            durationMs: Date.now() - startTime,
          };
        }

        return {
          ok: false,
          stage: "blindReview",
          slug,
          exitCode: blindRes.exitCode,
          reasons: [blindRes.stderrSnippet || "Blind review rejected"],
          durationMs: Date.now() - startTime,
        };
      }

      // 5. Promote to Shadow -> Canary
      const shadowRes = await this.harness.promote({
        slug,
        storeDir,
        vaultDir,
        stage: "shadow",
      });

      if (shadowRes.exitCode !== HARNESS_EXIT_CODES.PASS) {
        return {
          ok: false,
          stage: "promote",
          slug,
          exitCode: shadowRes.exitCode,
          reasons: [shadowRes.stderrSnippet || "Shadow promotion failed"],
          durationMs: Date.now() - startTime,
        };
      }

      const canaryRes = await this.harness.promote({
        slug,
        storeDir,
        vaultDir,
        stage: "canary",
      });

      if (canaryRes.exitCode !== HARNESS_EXIT_CODES.PASS) {
        return {
          ok: false,
          stage: "promote",
          slug,
          exitCode: canaryRes.exitCode,
          reasons: [canaryRes.stderrSnippet || "Canary promotion failed"],
          durationMs: Date.now() - startTime,
        };
      }

      // 6. Update Active Manifest with Canary Entry
      const current = this.hotReload.getCurrentManifest();
      const newCanary: LkgCanarySkillEntry = {
        slug,
        domain: draft.domain,
        traffic_percent: 10,
        asset_sha256: event.context_hash,
        started_at_iso: new Date().toISOString(),
        baseline_fail_rate: 0.0,
        rendered_tail_card: draft.rendered_skill_md,
        exclusion_boundaries: draft.exclusion_boundaries,
      };

      const nextManifestPayload: Omit<LkgActiveManifest, "manifest_hmac_sha256"> = {
        schema_version: "3.0",
        manifest_version: current.manifest_version + 1,
        snapshot_id: `snapshot-${slug}-${Date.now()}`,
        updated_at_iso: new Date().toISOString(),
        active_skills: current.active_skills,
        canary_skills: [...current.canary_skills.filter((s) => s.slug !== slug), newCanary],
      };

      await this.hotReload.atomicSwapManifest(nextManifestPayload);

      return {
        ok: true,
        stage: "completed",
        slug,
        verdict: "PROMOTED_TO_CANARY_ACTIVE",
        exitCode: HARNESS_EXIT_CODES.PASS,
        reasons: ["Rule successfully distilled, verified by oracle & blind reviewer, and promoted to 10% canary"],
        durationMs: Date.now() - startTime,
      };
    } finally {
      await fs.unlink(distillInputPath).catch(() => {});
      if (blindInputPath) {
        await fs.unlink(blindInputPath).catch(() => {});
      }
    }
  }

  async triggerFastTripRollback(params: {
    slug: string;
    storeDir: string;
    vaultDir: string;
    reason: string;
  }): Promise<{ ok: boolean; rollbackWallMs: number; restoredSnapshotId: string }> {
    const startTime = Date.now();
    try {
      await this.harness.rollback({
        slug: params.slug,
        storeDir: params.storeDir,
        vaultDir: params.vaultDir,
      });
    } catch {
      // Continue host manifest rollback even if HRK CLI errors
    }

    const hotReloadResult = await this.hotReload.rollbackToPreviousManifest(params.reason);
    const rollbackWallMs = Date.now() - startTime;

    return {
      ok: true,
      rollbackWallMs,
      restoredSnapshotId: hotReloadResult.restoredSnapshotId,
    };
  }
}
