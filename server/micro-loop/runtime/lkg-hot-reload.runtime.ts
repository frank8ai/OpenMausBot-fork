import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import {
  existsSync,
  readFileSync,
  statSync,
  watch,
  type FSWatcher,
} from "node:fs";
import { writeFileAtomic } from "../../atomic.ts";
import {
  ensureMicroLoopDirs,
  loadMicroLoopConfig,
  type MicroLoopConfig,
} from "../config/micro-loop.config.ts";
import type {
  ILkgHotReloadPort,
  LkgActiveManifest,
} from "../contracts/ports.ts";

export function canonicalizeManifestPayload(
  manifest: Omit<LkgActiveManifest, "manifest_hmac_sha256">,
): string {
  const keys = Object.keys(manifest).sort() as Array<
    keyof Omit<LkgActiveManifest, "manifest_hmac_sha256">
  >;
  const ordered: Record<string, unknown> = {};
  for (const k of keys) {
    ordered[k] = manifest[k];
  }
  return JSON.stringify(ordered);
}

export function computeManifestHmac(
  manifest: Omit<LkgActiveManifest, "manifest_hmac_sha256">,
  secret: string,
): string {
  const canonical = canonicalizeManifestPayload(manifest);
  return createHmac("sha256", secret).update(canonical).digest("hex");
}

export function verifyManifestHmac(
  manifest: LkgActiveManifest,
  secret: string,
): boolean {
  const { manifest_hmac_sha256, ...payload } = manifest;
  const expectedHmac = computeManifestHmac(payload, secret);
  if (!manifest_hmac_sha256 || manifest_hmac_sha256.length !== expectedHmac.length) {
    return false;
  }
  return timingSafeEqual(
    Buffer.from(manifest_hmac_sha256, "hex"),
    Buffer.from(expectedHmac, "hex"),
  );
}

export function computeCanaryBucket(threadId: string, slug: string): number {
  const hashHex = createHash("sha256").update(`${threadId}|${slug}`).digest("hex").slice(0, 8);
  const intVal = parseInt(hashHex, 16);
  return intVal % 100;
}

export class LkgHotReloadRuntime implements ILkgHotReloadPort {
  private readonly config: MicroLoopConfig;
  private readonly secret: string;
  private currentManifest: LkgActiveManifest;
  private lastMtimeMs = 0;
  private fileWatcher: FSWatcher | null = null;
  private debounceTimer: NodeJS.Timeout | null = null;

  constructor(customConfig?: MicroLoopConfig) {
    this.config = customConfig ?? loadMicroLoopConfig();
    this.secret = this.config.hmacSecret;
    ensureMicroLoopDirs(this.config);

    const initial = this.loadManifestFromDisk();
    if (initial) {
      this.currentManifest = initial;
    } else {
      const emptyPayload: Omit<LkgActiveManifest, "manifest_hmac_sha256"> = {
        schema_version: "3.0",
        manifest_version: 1,
        snapshot_id: "snapshot-baseline",
        updated_at_iso: new Date().toISOString(),
        active_skills: [],
        canary_skills: [],
      };
      const hmac = computeManifestHmac(emptyPayload, this.secret);
      this.currentManifest = {
        ...emptyPayload,
        manifest_hmac_sha256: hmac,
      };
      this.saveManifestToDisk(this.currentManifest);
    }

    this.startWatcher();
  }

  private loadManifestFromDisk(): LkgActiveManifest | null {
    if (!existsSync(this.config.lkgManifestPath)) return null;
    try {
      const raw = readFileSync(this.config.lkgManifestPath, "utf8");
      const parsed: LkgActiveManifest = JSON.parse(raw);
      if (!verifyManifestHmac(parsed, this.secret)) {
        return null;
      }
      const st = statSync(this.config.lkgManifestPath);
      this.lastMtimeMs = st.mtimeMs;
      return parsed;
    } catch {
      return null;
    }
  }

  private saveManifestToDisk(manifest: LkgActiveManifest): void {
    if (existsSync(this.config.lkgManifestPath)) {
      try {
        const prev = readFileSync(this.config.lkgManifestPath, "utf8");
        writeFileAtomic(this.config.lkgPrevManifestPath, prev, { durable: true });
      } catch {
        // ignore prev backup failure
      }
    }
    const json = JSON.stringify(manifest, null, 2);
    writeFileAtomic(this.config.lkgManifestPath, json, { durable: true });
    try {
      const st = statSync(this.config.lkgManifestPath);
      this.lastMtimeMs = st.mtimeMs;
    } catch {
      // ignore
    }
  }

  private startWatcher(): void {
    if (!existsSync(this.config.lkgManifestPath)) return;
    try {
      this.fileWatcher = watch(this.config.lkgManifestPath, () => {
        if (this.debounceTimer) clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => {
          this.reloadIfChanged();
        }, 500);
      });
      this.fileWatcher.unref();
    } catch {
      // file watch not supported in some environments
    }
  }

  public reloadIfChanged(): boolean {
    if (!existsSync(this.config.lkgManifestPath)) return false;
    try {
      const st = statSync(this.config.lkgManifestPath);
      if (st.mtimeMs <= this.lastMtimeMs) return false;

      const loaded = this.loadManifestFromDisk();
      if (loaded) {
        this.currentManifest = loaded;
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  getCurrentManifest(): LkgActiveManifest {
    this.reloadIfChanged();
    return this.currentManifest;
  }

  async atomicSwapManifest(
    next: Omit<LkgActiveManifest, "manifest_hmac_sha256">,
  ): Promise<{ reloadMs: number; manifestVersion: number }> {
    const startTime = Date.now();
    const manifest_hmac_sha256 = computeManifestHmac(next, this.secret);
    const fullManifest: LkgActiveManifest = {
      ...next,
      manifest_hmac_sha256,
    };

    this.saveManifestToDisk(fullManifest);
    this.currentManifest = fullManifest;
    const reloadMs = Date.now() - startTime;

    return {
      reloadMs,
      manifestVersion: fullManifest.manifest_version,
    };
  }

  async rollbackToPreviousManifest(
    _reason: string,
  ): Promise<{ rollbackWallMs: number; restoredSnapshotId: string }> {
    const startTime = Date.now();

    if (existsSync(this.config.lkgPrevManifestPath)) {
      try {
        const raw = readFileSync(this.config.lkgPrevManifestPath, "utf8");
        const parsed: LkgActiveManifest = JSON.parse(raw);
        if (verifyManifestHmac(parsed, this.secret)) {
          this.saveManifestToDisk(parsed);
          this.currentManifest = parsed;
          return {
            rollbackWallMs: Date.now() - startTime,
            restoredSnapshotId: parsed.snapshot_id,
          };
        }
      } catch {
        // fall back to empty baseline
      }
    }

    const baseline: Omit<LkgActiveManifest, "manifest_hmac_sha256"> = {
      schema_version: "3.0",
      manifest_version: this.currentManifest.manifest_version + 1,
      snapshot_id: "snapshot-fallback-empty",
      updated_at_iso: new Date().toISOString(),
      active_skills: [],
      canary_skills: [],
    };
    const hmac = computeManifestHmac(baseline, this.secret);
    const restored: LkgActiveManifest = { ...baseline, manifest_hmac_sha256: hmac };
    this.saveManifestToDisk(restored);
    this.currentManifest = restored;

    return {
      rollbackWallMs: Date.now() - startTime,
      restoredSnapshotId: restored.snapshot_id,
    };
  }

  shouldRouteCanary(threadId: string, slug: string, trafficPercent = 10): boolean {
    const bucket = computeCanaryBucket(threadId, slug);
    return bucket < trafficPercent;
  }

  dispose(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    if (this.fileWatcher) {
      this.fileWatcher.close();
      this.fileWatcher = null;
    }
  }
}
