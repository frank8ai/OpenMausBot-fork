import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import * as os from "node:os";
import { createHash } from "node:crypto";
import { FrictionLedgerRepo } from "./repo/friction-ledger.repo.ts";
import {
  signFrictionEvent,
  type FrictionEventPayload,
} from "./contracts/friction-event.schema.ts";
import type { CompiledRuleDraft } from "./contracts/compiled-rule.schema.ts";
import type { MicroLoopConfig } from "./config/micro-loop.config.ts";

describe("Friction Ledger Repo", () => {
  let testDir: string;
  let config: MicroLoopConfig;
  let ledger: FrictionLedgerRepo;
  const secret = "ledger-test-secret-42";

  beforeEach(() => {
    testDir = join(os.tmpdir(), `test-ledger-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });

    config = {
      enabled: true,
      dataDir: testDir,
      microLoopDir: join(testDir, "micro_loop"),
      frictionEventsDir: join(testDir, "micro_loop", "friction_events"),
      compiledDraftsDir: join(testDir, "micro_loop", "compiled_drafts"),
      lkgManifestPath: join(testDir, "micro_loop", "lkg_active_manifest.json"),
      lkgPrevManifestPath: join(testDir, "micro_loop", "lkg_active_manifest.prev.json"),
      telemetryPath: join(testDir, "micro_loop", "bridge.telemetry.jsonl"),
      hrkRoot: testDir,
      oracleVaultDir: testDir,
      hmacSecret: secret,
    };

    ledger = new FrictionLedgerRepo(config);
  });

  afterEach(() => {
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  function createSampleEvent(id: string, fingerprint = "1234567890abcdef1234567890abcdef"): FrictionEventPayload {
    const eventIdHex = createHash("sha256").update(id).digest("hex");
    return {
      schema_version: "3.0",
      event_id: eventIdHex,
      fingerprint_id: fingerprint,
      context_hash: "c".repeat(64),
      correction_prompt: "always check before deploy",
      failed_output: "deploy failed: missing artifact",
      timestamp: new Date().toISOString(),
      repo_slug: "openmausbot/repo",
      signal_kind: "explicit_correction",
      bot_id: "bot-test",
      thread_id: "thread-test",
      domain: "Infra",
      producer_model: "gemini-3.8-flash",
      context_tags: ["deploy"],
    };
  }

  it("appends signed events atomically and deduplicates duplicate event_ids", async () => {
    const rawEvent = createSampleEvent("event-1");
    const signedEvent = signFrictionEvent(rawEvent, secret);

    const res1 = await ledger.appendEvent(signedEvent);
    expect(res1.written).toBe(true);
    expect(res1.deduplicated).toBe(false);
    expect(existsSync(res1.path)).toBe(true);

    // Second write of same event_id must be deduplicated
    const res2 = await ledger.appendEvent(signedEvent);
    expect(res2.written).toBe(false);
    expect(res2.deduplicated).toBe(true);

    const content = readFileSync(res1.path, "utf8");
    const lines = content.trim().split("\n");
    expect(lines.length).toBe(1);
    const parsed = JSON.parse(lines[0]!);
    expect(parsed.event_id).toBe(signedEvent.event_id);
    expect(parsed.hmac_sha256).toBe(signedEvent.hmac_sha256);
  });

  it("lists events filtered by fingerprint within time window", async () => {
    const fpA = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const fpB = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

    const ev1 = signFrictionEvent(createSampleEvent("event-alpha", fpA), secret);
    const ev2 = signFrictionEvent(createSampleEvent("event-beta", fpB), secret);
    const ev3 = signFrictionEvent(createSampleEvent("event-gamma", fpA), secret);

    await ledger.appendEvent(ev1);
    await ledger.appendEvent(ev2);
    await ledger.appendEvent(ev3);

    const listed = await ledger.listEventsByFingerprint(fpA, 7);
    expect(listed.length).toBe(2);
    expect(listed.map((e) => e.event_id)).toContain(ev1.event_id);
    expect(listed.map((e) => e.event_id)).toContain(ev3.event_id);
    expect(listed.map((e) => e.event_id)).not.toContain(ev2.event_id);
  });

  it("saves compiled drafts to designated directory atomically", async () => {
    const draft: CompiledRuleDraft = {
      schema_version: "3.0",
      slug: "ml-test-guard",
      fingerprint_id: "1234567890abcdef1234567890abcdef",
      domain: "Shared",
      compile_target: "SYMBOLIC_SCRIPT_0TOKEN",
      producer_model: "claude-3-7-sonnet",
      error_class: "TEST_ERROR",
      pre_conditions: ["Context is testing"],
      positive_directives: ["Ensure test passes"],
      exclusion_boundaries: ["Do not test in production"],
      inhibits_patterns: ["Never fail silently"],
      condition_tags: ["test"],
      script_language: "node",
      script_body: "console.log('OK'); process.exit(0);",
      contrastive_probes: [
        {
          case_id: "pos",
          kind: "positive_transfer",
          description: "Positive test",
          command: "bun -e \"process.exit(0)\"",
          expected_exit_code: 0,
        },
        {
          case_id: "neg",
          kind: "boundary_negative",
          description: "Negative test",
          command: "bun -e \"process.exit(1)\"",
          expected_exit_code: 1,
        },
      ],
      estimated_tokens: 0,
      created_at_iso: new Date().toISOString(),
    };

    const { draftDir } = await ledger.saveCompiledDraft(draft);
    expect(existsSync(draftDir)).toBe(true);

    const draftJsonPath = join(draftDir, "draft.json");
    expect(existsSync(draftJsonPath)).toBe(true);
    const draftJson = JSON.parse(readFileSync(draftJsonPath, "utf8"));
    expect(draftJson.slug).toBe(draft.slug);

    const guardPath = join(draftDir, "guard.mjs");
    expect(existsSync(guardPath)).toBe(true);
    expect(readFileSync(guardPath, "utf8")).toBe(draft.script_body);
  });
});
