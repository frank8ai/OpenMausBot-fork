import type { SignedFrictionEvent } from "./friction-event.schema.ts";
import type { CompiledRuleDraft } from "./compiled-rule.schema.ts";

/** 与 Harness-Runner-Kit contracts/oracle-isolation.schema.ts V22_EXIT_CODES 1:1 对齐 */
export const HARNESS_EXIT_CODES = {
  PASS: 0,
  FAIL_RETRYABLE: 1,
  SPEC_INVALID_OR_MISSING_HOLDOUT: 2,
  FREEZE_TWO_STRIKE: 20,
  FREEZE_BUDGET_EXCEEDED: 21,
  IDEMPOTENCY_CONFLICT: 22,
  LEASE_FENCING_VIOLATION: 23,
  BLOCKED_SAME_FAMILY: 30,
  TAUTOLOGY_CHEAT_DETECTED: 31,
  COOLDOWN_ACTIVE: 32,
  FREEZE_CHEAT_DETECTED: 99,
} as const;
export type HarnessExitCode = (typeof HARNESS_EXIT_CODES)[keyof typeof HARNESS_EXIT_CODES];

export interface HarnessInvocationResult<T = unknown> {
  exitCode: HarnessExitCode;
  stdoutJson: T | null;
  stderrSnippet: string;
  durationMs: number;
}

export interface IHarnessBridgePort {
  distill(params: {
    storeDir: string;
    inputFilePath: string;
    playbookPath?: string;
    timeoutMs?: number; // default 15_000
  }): Promise<HarnessInvocationResult>;

  oracleJudge(params: {
    slug: string;
    storeDir: string;
    vaultDir: string;
    timeoutMs?: number; // default 90_000
  }): Promise<HarnessInvocationResult>;

  blindReview(params: {
    inputFilePath: string;
    storeDir: string;
    vaultDir: string;
    outFilePath?: string;
    timeoutMs?: number; // default 30_000
  }): Promise<HarnessInvocationResult>;

  promote(params: {
    slug: string;
    storeDir: string;
    vaultDir: string;
    stage: "shadow" | "canary" | "active";
    timeoutMs?: number; // default 60_000
  }): Promise<HarnessInvocationResult>;

  rollback(params: {
    slug: string;
    storeDir: string;
    vaultDir: string;
    timeoutMs?: number; // default 15_000
  }): Promise<HarnessInvocationResult>;

  selectSkills(params: {
    storeDir: string;
    domain: "Infra" | "Fulfill" | "App" | "Shared";
    tags: readonly string[];
    maxK?: number; // <= 3
    maxTokens?: number; // <= 1200
    timeoutMs?: number; // default 5_000
  }): Promise<HarnessInvocationResult>;
}

export interface IFrictionLedgerPort {
  appendEvent(event: SignedFrictionEvent): Promise<{ written: boolean; deduplicated: boolean; path: string }>;
  listEventsByFingerprint(fingerprintId: string, windowDays?: number): Promise<SignedFrictionEvent[]>;
  saveCompiledDraft(draft: CompiledRuleDraft): Promise<{ draftDir: string }>;
}

export interface LkgActiveSkillEntry {
  slug: string;
  domain: "Infra" | "Fulfill" | "App" | "Shared";
  compile_target: "SYMBOLIC_SCRIPT_0TOKEN" | "PROMPT_SKILL_BOUNDED";
  asset_sha256: string;
  script_path?: string;
  rendered_tail_card?: string;
  exclusion_boundaries: string[];
}

export interface LkgCanarySkillEntry {
  slug: string;
  domain: "Infra" | "Fulfill" | "App" | "Shared";
  traffic_percent: number; // default 10
  asset_sha256: string;
  started_at_iso: string;
  baseline_fail_rate: number;
  rendered_tail_card?: string;
  exclusion_boundaries?: string[];
}

export interface LkgActiveManifest {
  schema_version: "3.0";
  manifest_version: number;
  snapshot_id: string;
  updated_at_iso: string;
  active_skills: LkgActiveSkillEntry[];
  canary_skills: LkgCanarySkillEntry[];
  /** 仅允许通过环境变量秘钥验证，禁止 CLI 注入 */
  manifest_hmac_sha256: string;
}

export interface ILkgHotReloadPort {
  getCurrentManifest(): LkgActiveManifest;
  atomicSwapManifest(next: Omit<LkgActiveManifest, "manifest_hmac_sha256">): Promise<{ reloadMs: number; manifestVersion: number }>;
  rollbackToPreviousManifest(reason: string): Promise<{ rollbackWallMs: number; restoredSnapshotId: string }>;
  shouldRouteCanary(threadId: string, slug: string, trafficPercent?: number): boolean;
}
