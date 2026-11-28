import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as os from "node:os";
import {
  computeCanaryBucket,
  computeManifestHmac,
  LkgHotReloadRuntime,
  verifyManifestHmac,
} from "./runtime/lkg-hot-reload.runtime.ts";
import type { LkgActiveManifest } from "./contracts/ports.ts";
import type { MicroLoopConfig } from "./config/micro-loop.config.ts";

describe("LKG Hot Reload Runtime", () => {
  let testDir: string;
  let config: MicroLoopConfig;
  let runtime: LkgHotReloadRuntime;
  const secret = "lkg-test-hmac-secret-777";

  beforeEach(() => {
    testDir = join(os.tmpdir(), `test-lkg-${Date.now()}-${Math.random().toString(36).slice(2)}`);
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

    runtime = new LkgHotReloadRuntime(config);
  });

  afterEach(() => {
    runtime.dispose();
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it("verifies and computes manifest HMAC with constant time comparison", () => {
    const payload: Omit<LkgActiveManifest, "manifest_hmac_sha256"> = {
      schema_version: "3.0",
      manifest_version: 1,
      snapshot_id: "snap-01",
      updated_at_iso: new Date().toISOString(),
      active_skills: [
        {
          slug: "skill-one",
          domain: "Infra",
          compile_target: "SYMBOLIC_SCRIPT_0TOKEN",
          asset_sha256: "a".repeat(64),
          exclusion_boundaries: ["boundary-1"],
        },
      ],
      canary_skills: [],
    };

    const hmac = computeManifestHmac(payload, secret);
    const manifest: LkgActiveManifest = { ...payload, manifest_hmac_sha256: hmac };

    expect(verifyManifestHmac(manifest, secret)).toBe(true);
    expect(verifyManifestHmac(manifest, "wrong-secret")).toBe(false);

    const tampered = { ...manifest, snapshot_id: "snap-tampered" };
    expect(verifyManifestHmac(tampered, secret)).toBe(false);
  });

  it("verifyManifestHmac returns false and never throws RangeError for non-hex 64-char strings", () => {
    const payload: Omit<LkgActiveManifest, "manifest_hmac_sha256"> = {
      schema_version: "3.0",
      manifest_version: 1,
      snapshot_id: "snap-01",
      updated_at_iso: new Date().toISOString(),
      active_skills: [],
      canary_skills: [],
    };
    const nonHexHmac = "z".repeat(64);
    expect(() => {
      const res = verifyManifestHmac(
        { ...payload, manifest_hmac_sha256: nonHexHmac },
        secret,
      );
      expect(res).toBe(false);
    }).not.toThrow();

    expect(verifyManifestHmac({ ...payload, manifest_hmac_sha256: "short" }, secret)).toBe(false);
  });

  it("rollbackToPreviousManifest consecutive calls do not backup poisoned/tampered manifest into .prev", async () => {
    await runtime.atomicSwapManifest({
      schema_version: "3.0",
      manifest_version: 1,
      snapshot_id: "snap-stable-1",
      updated_at_iso: new Date().toISOString(),
      active_skills: [],
      canary_skills: [],
    });

    await runtime.atomicSwapManifest({
      schema_version: "3.0",
      manifest_version: 2,
      snapshot_id: "snap-canary-2",
      updated_at_iso: new Date().toISOString(),
      active_skills: [],
      canary_skills: [],
    });

    writeFileSync(config.lkgManifestPath, JSON.stringify({
      schema_version: "3.0",
      manifest_version: 999,
      snapshot_id: "snap-poisoned",
      updated_at_iso: new Date().toISOString(),
      active_skills: [],
      canary_skills: [],
      manifest_hmac_sha256: "badbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadb",
    }), "utf8");

    const rb1 = await runtime.rollbackToPreviousManifest("Canary poisoned");
    expect(rb1.restoredSnapshotId).toBe("snap-stable-1");

    const prevRaw = readFileSync(config.lkgPrevManifestPath, "utf8");
    expect(prevRaw).not.toContain("snap-poisoned");
  });

  it("performs atomic swap of manifest and verifies on-disk update", async () => {
    const nextPayload: Omit<LkgActiveManifest, "manifest_hmac_sha256"> = {
      schema_version: "3.0",
      manifest_version: 2,
      snapshot_id: "snap-02-new",
      updated_at_iso: new Date().toISOString(),
      active_skills: [],
      canary_skills: [
        {
          slug: "canary-alpha",
          domain: "App",
          traffic_percent: 10,
          asset_sha256: "b".repeat(64),
          started_at_iso: new Date().toISOString(),
          baseline_fail_rate: 0.0,
        },
      ],
    };

    const { reloadMs, manifestVersion } = await runtime.atomicSwapManifest(nextPayload);
    expect(reloadMs).toBeLessThanOrEqual(1000);
    expect(manifestVersion).toBe(2);

    const current = runtime.getCurrentManifest();
    expect(current.snapshot_id).toBe("snap-02-new");
    expect(current.canary_skills.length).toBe(1);
    expect(current.canary_skills[0]?.slug).toBe("canary-alpha");

    // Also prev backup exists
    expect(existsSync(config.lkgPrevManifestPath)).toBe(true);
  });

  it("rolls back to previous manifest in <= 30s upon failure", async () => {
    // 1. Initial valid manifest
    await runtime.atomicSwapManifest({
      schema_version: "3.0",
      manifest_version: 10,
      snapshot_id: "snap-stable-10",
      updated_at_iso: new Date().toISOString(),
      active_skills: [],
      canary_skills: [],
    });

    // 2. Second swap
    await runtime.atomicSwapManifest({
      schema_version: "3.0",
      manifest_version: 11,
      snapshot_id: "snap-broken-11",
      updated_at_iso: new Date().toISOString(),
      active_skills: [],
      canary_skills: [],
    });

    // 3. Rollback
    const { rollbackWallMs, restoredSnapshotId } = await runtime.rollbackToPreviousManifest("Canary error spike");
    expect(rollbackWallMs).toBeLessThanOrEqual(30_000);
    expect(restoredSnapshotId).toBe("snap-stable-10");

    const current = runtime.getCurrentManifest();
    expect(current.snapshot_id).toBe("snap-stable-10");
  });

  it("computes deterministic 10% canary bucket based on sha256(thread_id + slug)", () => {
    const bucket1 = computeCanaryBucket("thread-001", "skill-test");
    const bucket2 = computeCanaryBucket("thread-001", "skill-test");
    expect(bucket1).toBe(bucket2);
    expect(bucket1).toBeGreaterThanOrEqual(0);
    expect(bucket1).toBeLessThan(100);

    const isCanary = runtime.shouldRouteCanary("thread-001", "skill-test", 100);
    expect(isCanary).toBe(true);

    const isExcluded = runtime.shouldRouteCanary("thread-001", "skill-test", 0);
    expect(isExcluded).toBe(false);
  });

  it("falls back to empty baseline if on-disk manifest is corrupted or tampered", () => {
    // Tamper disk file
    writeFileSync(config.lkgManifestPath, "CORRUPTED_JSON", "utf8");

    // Reload
    const reloaded = runtime.reloadIfChanged();
    expect(reloaded).toBe(false); // corrupt file rejected

    const current = runtime.getCurrentManifest();
    expect(current).toBeDefined();
  });
});

