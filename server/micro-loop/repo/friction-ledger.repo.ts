import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import * as os from "node:os";
import { join } from "node:path";
import { renameWithRetry, writeFileAtomic } from "../../atomic.ts";
import {
  SignedFrictionEventSchema,
  type SignedFrictionEvent,
} from "../contracts/friction-event.schema.ts";
import type { CompiledRuleDraft } from "../contracts/compiled-rule.schema.ts";
import type { IFrictionLedgerPort } from "../contracts/ports.ts";
import {
  ensureMicroLoopDirs,
  loadMicroLoopConfig,
  type MicroLoopConfig,
} from "../config/micro-loop.config.ts";

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const LOCK_TTL_MS = 5000;
const LOCK_RETRIES = 5;
const LOCK_DELAYS_MS = [5, 10, 20, 40, 80];
const LRU_MAX_ITEMS = 512;
const MAX_QUEUE_SIZE = 64;

interface LockContent {
  pid: number;
  host: string;
  acquiredAtMs: number;
  ttlMs: number;
}

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err: unknown) {
    return (err as { code?: string })?.code !== "ESRCH";
  }
}

export class FrictionLedgerRepo implements IFrictionLedgerPort {
  private readonly config: MicroLoopConfig;
  private readonly recentEventIds: Set<string> = new Set();
  private readonly recentIdList: string[] = [];
  private readonly fallbackQueue: SignedFrictionEvent[] = [];
  private flushingQueue = false;

  constructor(customConfig?: MicroLoopConfig) {
    this.config = customConfig ?? loadMicroLoopConfig();
    ensureMicroLoopDirs(this.config);
  }

  private recordSeenEventId(eventId: string): void {
    if (this.recentEventIds.has(eventId)) return;
    this.recentEventIds.add(eventId);
    this.recentIdList.push(eventId);
    if (this.recentIdList.length > LRU_MAX_ITEMS) {
      const oldest = this.recentIdList.shift();
      if (oldest) this.recentEventIds.delete(oldest);
    }
  }

  private tryAcquireLock(lockPath: string): number | null {
    try {
      const fd = openSync(lockPath, "wx");
      const lockPayload: LockContent = {
        pid: process.pid,
        host: os.hostname(),
        acquiredAtMs: Date.now(),
        ttlMs: LOCK_TTL_MS,
      };
      writeSync(fd, JSON.stringify(lockPayload), undefined, "utf8");
      return fd;
    } catch {
      return null;
    }
  }

  private isStaleLock(lockPath: string): boolean {
    try {
      if (!existsSync(lockPath)) return false;
      const raw = readFileSync(lockPath, "utf8");
      const parsed: LockContent = JSON.parse(raw);
      const isExpired = Date.now() - parsed.acquiredAtMs > (parsed.ttlMs || LOCK_TTL_MS);
      if (isExpired) return true;
      if (parsed.host === os.hostname() && !isPidAlive(parsed.pid)) {
        return true;
      }
      return false;
    } catch {
      return true;
    }
  }

  private acquireLockWithBackoff(lockPath: string): number | null {
    for (let attempt = 0; attempt <= LOCK_RETRIES; attempt++) {
      const fd = this.tryAcquireLock(lockPath);
      if (fd !== null) return fd;

      if (this.isStaleLock(lockPath)) {
        try {
          unlinkSync(lockPath);
        } catch {
          // ignore concurrent unlink
        }
        const retryFd = this.tryAcquireLock(lockPath);
        if (retryFd !== null) return retryFd;
      }

      if (attempt < LOCK_RETRIES) {
        const baseDelay = LOCK_DELAYS_MS[attempt] ?? 40;
        const jitter = Math.floor(Math.random() * (baseDelay / 2));
        sleepSync(baseDelay + jitter);
      }
    }
    return null;
  }

  private releaseLock(lockPath: string, fd: number): void {
    try {
      closeSync(fd);
    } catch {
      // ignore
    }
    try {
      unlinkSync(lockPath);
    } catch {
      // ignore
    }
  }

  private getDailyJsonlPath(now = new Date()): string {
    const yyyy = now.getUTCFullYear();
    const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(now.getUTCDate()).padStart(2, "0");
    return join(this.config.frictionEventsDir, `${yyyy}-${mm}-${dd}.jsonl`);
  }

  private rotateIfOversized(filePath: string): void {
    if (!existsSync(filePath)) return;
    try {
      const st = statSync(filePath);
      if (st.size >= MAX_FILE_SIZE_BYTES) {
        for (let i = 1; i <= 99; i++) {
          const target = filePath.replace(/\.jsonl$/, `.${i}.jsonl`);
          if (!existsSync(target)) {
            renameWithRetry(filePath, target);
            break;
          }
        }
      }
    } catch {
      // ignore rotation errors
    }
  }

  private writeEventUnderLock(filePath: string, event: SignedFrictionEvent): void {
    this.rotateIfOversized(filePath);
    const line = JSON.stringify(event) + "\n";
    const fd = openSync(filePath, "a");
    try {
      writeSync(fd, line, undefined, "utf8");
    } finally {
      closeSync(fd);
    }
    this.recordSeenEventId(event.event_id);
  }

  async appendEvent(
    event: SignedFrictionEvent,
  ): Promise<{ written: boolean; deduplicated: boolean; path: string }> {
    const filePath = this.getDailyJsonlPath(new Date(event.timestamp));

    if (this.recentEventIds.has(event.event_id)) {
      return { written: false, deduplicated: true, path: filePath };
    }

    const lockPath = join(this.config.frictionEventsDir, ".write.lock");
    const lockFd = this.acquireLockWithBackoff(lockPath);

    if (lockFd === null) {
      if (this.fallbackQueue.length < MAX_QUEUE_SIZE) {
        this.fallbackQueue.push(event);
        this.scheduleQueueFlush();
      }
      return { written: false, deduplicated: false, path: filePath };
    }

    try {
      if (this.recentEventIds.has(event.event_id)) {
        return { written: false, deduplicated: true, path: filePath };
      }
      this.writeEventUnderLock(filePath, event);

      while (this.fallbackQueue.length > 0) {
        const next = this.fallbackQueue.shift();
        if (next && !this.recentEventIds.has(next.event_id)) {
          const nextPath = this.getDailyJsonlPath(new Date(next.timestamp));
          this.writeEventUnderLock(nextPath, next);
        }
      }

      return { written: true, deduplicated: false, path: filePath };
    } finally {
      this.releaseLock(lockPath, lockFd);
    }
  }

  private scheduleQueueFlush(): void {
    if (this.flushingQueue) return;
    this.flushingQueue = true;
    setTimeout(async () => {
      this.flushingQueue = false;
      if (this.fallbackQueue.length === 0) return;
      const lockPath = join(this.config.frictionEventsDir, ".write.lock");
      const lockFd = this.acquireLockWithBackoff(lockPath);
      if (lockFd === null) return;
      try {
        while (this.fallbackQueue.length > 0) {
          const event = this.fallbackQueue.shift();
          if (event && !this.recentEventIds.has(event.event_id)) {
            const p = this.getDailyJsonlPath(new Date(event.timestamp));
            this.writeEventUnderLock(p, event);
          }
        }
      } finally {
        this.releaseLock(lockPath, lockFd);
      }
    }, 100).unref();
  }

  async listEventsByFingerprint(
    fingerprintId: string,
    windowDays = 14,
  ): Promise<SignedFrictionEvent[]> {
    const results: SignedFrictionEvent[] = [];
    if (!existsSync(this.config.frictionEventsDir)) return results;

    const files = readdirSync(this.config.frictionEventsDir)
      .filter((name) => name.endsWith(".jsonl") && !name.startsWith("."))
      .sort()
      .reverse();

    const cutoff = Date.now() - windowDays * 24 * 60 * 60 * 1000;

    for (const file of files) {
      const fullPath = join(this.config.frictionEventsDir, file);
      try {
        const content = readFileSync(fullPath, "utf8");
        const lines = content.split("\n");
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const json = JSON.parse(trimmed);
            const parsed = SignedFrictionEventSchema.safeParse(json);
            if (parsed.success) {
              const eventTime = Date.parse(parsed.data.timestamp);
              if (eventTime >= cutoff && parsed.data.fingerprint_id === fingerprintId) {
                results.push(parsed.data);
              }
            }
          } catch {
            // skip malformed line
          }
        }
      } catch {
        // skip unreadable file
      }
    }

    return results;
  }

  async saveCompiledDraft(draft: CompiledRuleDraft): Promise<{ draftDir: string }> {
    const draftDir = join(this.config.compiledDraftsDir, draft.fingerprint_id);
    if (!existsSync(draftDir)) {
      mkdirSync(draftDir, { recursive: true });
    }

    const draftJsonPath = join(draftDir, "draft.json");
    writeFileAtomic(draftJsonPath, JSON.stringify(draft, null, 2), { durable: true });

    if (draft.compile_target === "SYMBOLIC_SCRIPT_0TOKEN" && draft.script_body) {
      const ext = draft.script_language === "python" ? "py" : "mjs";
      const scriptPath = join(draftDir, `guard.${ext}`);
      writeFileAtomic(scriptPath, draft.script_body, { durable: true });
    } else if (draft.compile_target === "PROMPT_SKILL_BOUNDED" && draft.rendered_skill_md) {
      const skillMdPath = join(draftDir, "SKILL.md");
      writeFileAtomic(skillMdPath, draft.rendered_skill_md, { durable: true });
    }

    return { draftDir };
  }
}
