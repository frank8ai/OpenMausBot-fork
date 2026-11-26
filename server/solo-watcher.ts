/**
 * Cross-project local watcher daemon for solo company hub.
 * Inspects 5 core local repositories (Git status, tracking branch diffs, CI status),
 * detects alerts (CI failures, branch divergence, dirty worktrees),
 * and persists structured status snapshots atomically to ~/.openmausbot/solo-projects-status.json.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { writeFileAtomic } from "./atomic.ts";

export type SoloProjectId =
  | "openmausbot"
  | "autofabric"
  | "aer-saas"
  | "harness-runner-kit"
  | "profile-matrix";

export type SoloProjectStatus = "idle" | "working" | "waiting" | "failed" | "done";

export interface SoloRepoConfig {
  readonly id: SoloProjectId;
  readonly name: string;
  readonly defaultCandidatePaths: readonly string[];
}

export const SOLO_PROJECT_DEFINITIONS: readonly SoloRepoConfig[] = [
  {
    id: "openmausbot",
    name: "OpenMausBot",
    defaultCandidatePaths: [
      resolve("C:/Users/frank/Documents/frank/Projects/OpenMausBot"),
      resolve(homedir(), "Documents/frank/Projects/OpenMausBot"),
    ],
  },
  {
    id: "autofabric",
    name: "Autofabric",
    defaultCandidatePaths: [
      resolve("C:/Users/frank/Documents/ChatGPT/Autofabric"),
      resolve(homedir(), "Documents/ChatGPT/Autofabric"),
    ],
  },
  {
    id: "aer-saas",
    name: "AER-SaaS",
    defaultCandidatePaths: [
      resolve("C:/Users/frank/Documents/frank/Projects/aer-saas"),
      resolve("C:/Users/frank/Documents/frank/Projects/AER-SaaS"),
      resolve(homedir(), "Documents/frank/Projects/aer-saas"),
    ],
  },
  {
    id: "harness-runner-kit",
    name: "Harness-Runner-Kit",
    defaultCandidatePaths: [
      resolve("C:/Users/frank/Documents/Playground/aer-p1-docker-runner"),
      resolve("C:/Users/frank/actions-runner"),
      resolve("C:/Users/frank/Documents/frank/Projects/harness-runner-kit"),
      resolve(homedir(), "Documents/Playground/aer-p1-docker-runner"),
    ],
  },
  {
    id: "profile-matrix",
    name: "Profile-Matrix",
    defaultCandidatePaths: [
      resolve("C:/Users/frank/Documents/ChatGPT/fingerprint-browser"),
      resolve(homedir(), "Documents/ChatGPT/fingerprint-browser"),
    ],
  },
] as const;

export interface SoloGitMetrics {
  readonly isRepo: boolean;
  readonly branch?: string;
  readonly trackingBranch?: string;
  readonly ahead: number;
  readonly behind: number;
  readonly dirtyCount: number;
  readonly hasUntracked: boolean;
  readonly hasStaged: boolean;
  readonly hasUnstaged: boolean;
}

export type CiConclusion = "success" | "failure" | "in_progress" | "cancelled" | "skipped" | "unknown";

export interface SoloCiStatus {
  readonly available: boolean;
  readonly workflowName?: string;
  readonly conclusion?: CiConclusion;
  readonly status?: string;
  readonly runId?: number;
  readonly headSha?: string;
  readonly headBranch?: string;
  readonly updatedAt?: string;
}

export interface SoloProjectMetrics {
  readonly id: SoloProjectId;
  readonly name: string;
  readonly path?: string;
  readonly exists: boolean;
  readonly isRepo: boolean;
  readonly status: SoloProjectStatus;
  readonly git?: SoloGitMetrics;
  readonly ci?: SoloCiStatus;
  readonly alerts: readonly SoloAlert[];
  readonly lastCheckedAt: number;
}

export interface SoloAlert {
  readonly level: "info" | "warning" | "error";
  readonly category: "ci_failure" | "divergence" | "dirty_worktree" | "repo_missing";
  readonly summary: string;
  readonly details?: string;
}

export interface SoloProjectsSnapshot {
  readonly version: 1;
  readonly timestamp: number;
  readonly projects: readonly SoloProjectMetrics[];
  readonly summary: {
    readonly total: number;
    readonly healthy: number;
    readonly alertsCount: number;
    readonly failedCount: number;
    readonly workingCount: number;
  };
}

export interface SoloWatcherOptions {
  readonly dataDir?: string;
  readonly customPaths?: Partial<Record<SoloProjectId, string>>;
  readonly queryCi?: boolean;
  readonly runCommand?: (command: string, args: readonly string[], cwd?: string) => { status: number | null; stdout: string; stderr: string };
}

function defaultRunCommand(command: string, args: readonly string[], cwd?: string) {
  const result = spawnSync(command, args as string[], {
    cwd,
    encoding: "utf8",
    shell: false,
    timeout: 10_000,
    windowsHide: true,
  });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

export function resolveRepoPath(def: SoloRepoConfig, customPaths?: Partial<Record<SoloProjectId, string>>): string | undefined {
  if (customPaths?.[def.id]) {
    const custom = resolve(customPaths[def.id]!);
    if (existsSync(custom)) return custom;
  }
  for (const candidate of def.defaultCandidatePaths) {
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

export function parseGitPorcelain(output: string): { dirtyCount: number; hasUntracked: boolean; hasStaged: boolean; hasUnstaged: boolean } {
  const lines = output.split(/\r?\n/).filter((l) => l.trim().length > 0);
  let dirtyCount = 0;
  let hasUntracked = false;
  let hasStaged = false;
  let hasUnstaged = false;

  for (const line of lines) {
    dirtyCount += 1;
    const x = line[0];
    const y = line[1];
    if (x === "?" && y === "?") {
      hasUntracked = true;
    } else {
      if (x && x !== " " && x !== "?") hasStaged = true;
      if (y && y !== " " && y !== "?") hasUnstaged = true;
    }
  }

  return { dirtyCount, hasUntracked, hasStaged, hasUnstaged };
}

export function parseGitAheadBehind(output: string): { ahead: number; behind: number } {
  const trimmed = output.trim();
  if (!trimmed) return { ahead: 0, behind: 0 };
  const parts = trimmed.split(/\s+/);
  if (parts.length >= 2) {
    const ahead = Number(parts[0]) || 0;
    const behind = Number(parts[1]) || 0;
    return { ahead, behind };
  }
  return { ahead: 0, behind: 0 };
}

export function inspectRepoGit(
  repoPath: string,
  runCmd: (command: string, args: readonly string[], cwd?: string) => { status: number | null; stdout: string; stderr: string },
): SoloGitMetrics {
  const isGit = runCmd("git", ["-C", repoPath, "rev-parse", "--is-inside-work-tree"]);
  if (isGit.status !== 0 || isGit.stdout.trim() !== "true") {
    return {
      isRepo: false,
      ahead: 0,
      behind: 0,
      dirtyCount: 0,
      hasUntracked: false,
      hasStaged: false,
      hasUnstaged: false,
    };
  }

  const branchRes = runCmd("git", ["-C", repoPath, "rev-parse", "--abbrev-ref", "HEAD"]);
  const branch = branchRes.status === 0 ? branchRes.stdout.trim() : undefined;

  const trackingRes = runCmd("git", ["-C", repoPath, "rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]);
  const trackingBranch = trackingRes.status === 0 && trackingRes.stdout.trim() ? trackingRes.stdout.trim() : undefined;

  let ahead = 0;
  let behind = 0;
  if (trackingBranch) {
    const revListRes = runCmd("git", ["-C", repoPath, "rev-list", "--left-right", "--count", `HEAD...${trackingBranch}`]);
    if (revListRes.status === 0) {
      const counts = parseGitAheadBehind(revListRes.stdout);
      ahead = counts.ahead;
      behind = counts.behind;
    }
  }

  const statusRes = runCmd("git", ["-C", repoPath, "status", "--porcelain"]);
  const { dirtyCount, hasUntracked, hasStaged, hasUnstaged } = statusRes.status === 0 ? parseGitPorcelain(statusRes.stdout) : { dirtyCount: 0, hasUntracked: false, hasStaged: false, hasUnstaged: false };

  return {
    isRepo: true,
    branch,
    trackingBranch,
    ahead,
    behind,
    dirtyCount,
    hasUntracked,
    hasStaged,
    hasUnstaged,
  };
}

export function inspectRepoCi(
  repoPath: string,
  runCmd: (command: string, args: readonly string[], cwd?: string) => { status: number | null; stdout: string; stderr: string },
): SoloCiStatus {
  const ghRun = runCmd("gh", ["run", "list", "--limit", "1", "--json", "databaseId,status,conclusion,workflowName,headSha,headBranch,updatedAt"], repoPath);
  if (ghRun.status !== 0) {
    return { available: false };
  }

  try {
    const parsed = JSON.parse(ghRun.stdout);
    if (Array.isArray(parsed) && parsed.length > 0) {
      const latest = parsed[0];
      const rawConclusion = latest.conclusion?.toLowerCase();
      let conclusion: CiConclusion = "unknown";
      if (rawConclusion === "success") conclusion = "success";
      else if (rawConclusion === "failure") conclusion = "failure";
      else if (rawConclusion === "cancelled") conclusion = "cancelled";
      else if (rawConclusion === "skipped") conclusion = "skipped";
      else if (latest.status?.toLowerCase() === "in_progress" || latest.status?.toLowerCase() === "queued") {
        conclusion = "in_progress";
      }

      return {
        available: true,
        runId: latest.databaseId,
        workflowName: latest.workflowName,
        status: latest.status,
        conclusion,
        headSha: latest.headSha,
        headBranch: latest.headBranch,
        updatedAt: latest.updatedAt,
      };
    }
  } catch {}

  return { available: false };
}

export function deriveProjectStatus(
  exists: boolean,
  isRepo: boolean,
  git?: SoloGitMetrics,
  ci?: SoloCiStatus,
): SoloProjectStatus {
  if (!exists || !isRepo) return "idle";
  if (ci?.conclusion === "failure") return "failed";
  if (ci?.conclusion === "in_progress") return "working";
  if (git && (git.dirtyCount > 0 || git.ahead > 0)) return "working";
  if (ci?.conclusion === "success") return "done";
  return "idle";
}

export function generateAlerts(
  def: SoloRepoConfig,
  exists: boolean,
  path?: string,
  git?: SoloGitMetrics,
  ci?: SoloCiStatus,
): SoloAlert[] {
  const alerts: SoloAlert[] = [];

  if (!exists || !path) {
    alerts.push({
      level: "warning",
      category: "repo_missing",
      summary: `Project repository directory not found locally.`,
      details: `Configured paths checked: ${def.defaultCandidatePaths.join(", ")}`,
    });
    return alerts;
  }

  if (git?.isRepo) {
    if (git.behind > 0) {
      alerts.push({
        level: "warning",
        category: "divergence",
        summary: `Branch '${git.branch}' is behind upstream '${git.trackingBranch}' by ${git.behind} commits.`,
        details: `Run 'git pull' or rebase to keep in sync.`,
      });
    }
    if (git.dirtyCount > 0) {
      alerts.push({
        level: "info",
        category: "dirty_worktree",
        summary: `Worktree has ${git.dirtyCount} modified/untracked files.`,
        details: `Staged: ${git.hasStaged ? "yes" : "no"}, Unstaged: ${git.hasUnstaged ? "yes" : "no"}, Untracked: ${git.hasUntracked ? "yes" : "no"}`,
      });
    }
  }

  if (ci?.available && ci.conclusion === "failure") {
    alerts.push({
      level: "error",
      category: "ci_failure",
      summary: `CI workflow '${ci.workflowName ?? "CI"}' failed on branch '${ci.headBranch ?? "unknown"}'.`,
      details: `Latest run #${ci.runId ?? "N/A"} (${ci.headSha?.slice(0, 7) ?? ""}) failed. Zero-token log alert generated.`,
    });
  }

  return alerts;
}

export function inspectAllProjects(options: SoloWatcherOptions = {}): SoloProjectsSnapshot {
  const runCmd = options.runCommand ?? defaultRunCommand;
  const now = Date.now();
  const queryCi = options.queryCi ?? true;

  const projects: SoloProjectMetrics[] = [];
  let healthyCount = 0;
  let totalAlerts = 0;
  let failedCount = 0;
  let workingCount = 0;

  for (const def of SOLO_PROJECT_DEFINITIONS) {
    const repoPath = resolveRepoPath(def, options.customPaths);
    const exists = Boolean(repoPath && existsSync(repoPath));
    let git: SoloGitMetrics | undefined;
    let ci: SoloCiStatus | undefined;

    if (exists && repoPath) {
      git = inspectRepoGit(repoPath, runCmd);
      if (queryCi) {
        ci = inspectRepoCi(repoPath, runCmd);
      }
    }

    const isRepo = Boolean(git?.isRepo);
    const status = deriveProjectStatus(exists, isRepo, git, ci);
    const alerts = generateAlerts(def, exists, repoPath, git, ci);

    if (status === "failed") failedCount += 1;
    else if (status === "working") workingCount += 1;

    totalAlerts += alerts.length;
    if (alerts.every((a) => a.level === "info")) {
      healthyCount += 1;
    }

    projects.push({
      id: def.id,
      name: def.name,
      path: repoPath,
      exists,
      isRepo,
      status,
      git,
      ci,
      alerts,
      lastCheckedAt: now,
    });
  }

  return {
    version: 1,
    timestamp: now,
    projects,
    summary: {
      total: projects.length,
      healthy: healthyCount,
      alertsCount: totalAlerts,
      failedCount,
      workingCount,
    },
  };
}

export function defaultStatusFilePath(dataDir?: string): string {
  const dir = dataDir ?? process.env.OMB_DATA_DIR ?? join(homedir(), ".openmausbot");
  return join(dir, "solo-projects-status.json");
}

export class FileLockConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FileLockConflictError";
  }
}

export function withLock<T>(lockPath: string, fn: () => T, maxWaitMs = 3000): T {
  const dir = dirname(lockPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const start = Date.now();
  let acquired = false;

  while (Date.now() - start < maxWaitMs) {
    try {
      mkdirSync(lockPath);
      acquired = true;
      break;
    } catch {
      // Busy wait short sleep for lock
      const waitUntil = Date.now() + 50;
      while (Date.now() < waitUntil) {}
    }
  }

  if (!acquired) {
    throw new FileLockConflictError(`Could not acquire file lock within ${maxWaitMs}ms at ${lockPath}`);
  }

  try {
    return fn();
  } finally {
    try {
      rmSync(lockPath, { recursive: true, force: true });
    } catch {}
  }
}

export function saveSoloStatusSnapshot(snapshot: SoloProjectsSnapshot, filePath?: string): void {
  const target = filePath ?? defaultStatusFilePath();
  const dir = dirname(target);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const lockPath = `${target}.lock`;
  withLock(lockPath, () => {
    const serialized = JSON.stringify(snapshot, null, 2);
    writeFileAtomic(target, serialized);
  });
}

export function readSoloStatusSnapshot(filePath?: string): SoloProjectsSnapshot | null {
  const target = filePath ?? defaultStatusFilePath();
  if (!existsSync(target)) return null;
  try {
    const raw = readFileSync(target, "utf8");
    return JSON.parse(raw) as SoloProjectsSnapshot;
  } catch {
    return null;
  }
}

export class SoloWatcherDaemon {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private readonly options: SoloWatcherOptions;
  private readonly targetFile: string;
  private readonly pollIntervalMs: number;

  constructor(options: SoloWatcherOptions & { pollIntervalMs?: number; targetFile?: string } = {}) {
    this.options = options;
    this.targetFile = options.targetFile ?? defaultStatusFilePath(options.dataDir);
    this.pollIntervalMs = options.pollIntervalMs ?? 30_000;
  }

  public tickOnce(): SoloProjectsSnapshot {
    const snapshot = inspectAllProjects(this.options);
    saveSoloStatusSnapshot(snapshot, this.targetFile);
    return snapshot;
  }

  public start(): void {
    if (this.running) return;
    this.running = true;
    this.tickOnce();
    this.timer = setInterval(() => {
      try {
        this.tickOnce();
      } catch (err) {
        console.error("[SoloWatcherDaemon] tick failed:", err);
      }
    }, this.pollIntervalMs);
    this.timer.unref?.();
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.running = false;
  }

  public isRunning(): boolean {
    return this.running;
  }
}
