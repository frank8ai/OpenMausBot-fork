import { existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  deriveProjectStatus,
  generateAlerts,
  inspectAllProjects,
  inspectAllProjectsAsync,
  inspectRepoCi,
  inspectRepoCiAsync,
  inspectRepoGit,
  inspectRepoGitAsync,
  parseGitAheadBehind,
  parseGitPorcelain,
  readSoloStatusSnapshot,
  resolveRepoPath,
  saveSoloStatusSnapshot,
  SOLO_PROJECT_DEFINITIONS,
  SoloWatcherDaemon,
  withLock,
} from "./solo-watcher.ts";

describe("solo-watcher daemon unit & integration tests", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `solo-watcher-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {}
  });

  describe("parseGitPorcelain", () => {
    it("parses empty status correctly", () => {
      const res = parseGitPorcelain("");
      expect(res).toEqual({
        dirtyCount: 0,
        hasUntracked: false,
        hasStaged: false,
        hasUnstaged: false,
      });
    });

    it("parses staged, unstaged and untracked files", () => {
      const raw = [
        "M  server/solo-watcher.ts",
        " M src/App.tsx",
        "?? new-file.txt",
        "D  deleted.ts",
      ].join("\n");
      const res = parseGitPorcelain(raw);
      expect(res.dirtyCount).toBe(4);
      expect(res.hasStaged).toBe(true);
      expect(res.hasUnstaged).toBe(true);
      expect(res.hasUntracked).toBe(true);
    });
  });

  describe("parseGitAheadBehind", () => {
    it("parses ahead and behind counts", () => {
      expect(parseGitAheadBehind("3\t5\n")).toEqual({ ahead: 3, behind: 5 });
      expect(parseGitAheadBehind("  0   2 ")).toEqual({ ahead: 0, behind: 2 });
      expect(parseGitAheadBehind("")).toEqual({ ahead: 0, behind: 0 });
    });
  });

  describe("resolveRepoPath", () => {
    it("prioritizes customPaths when provided and existing", () => {
      const customMock = join(testDir, "mock-repo");
      mkdirSync(customMock, { recursive: true });
      const def = SOLO_PROJECT_DEFINITIONS[0]!;
      const resolved = resolveRepoPath(def, { [def.id]: customMock });
      expect(resolved).toBe(customMock);
    });

    it("returns undefined if no candidates exist", () => {
      const def = {
        id: "openmausbot" as const,
        name: "Mock",
        defaultCandidatePaths: [join(testDir, "nonexistent-1"), join(testDir, "nonexistent-2")],
      };
      expect(resolveRepoPath(def)).toBeUndefined();
    });
  });

  describe("inspectRepoGit", () => {
    it("handles non-git directory safely", () => {
      const runCmd = () => ({ status: 128, stdout: "", stderr: "fatal: not a git repo" });
      const metrics = inspectRepoGit(testDir, runCmd);
      expect(metrics.isRepo).toBe(false);
      expect(metrics.dirtyCount).toBe(0);
    });

    it("parses full git status and branch metrics", () => {
      const runCmd = (_cmd: string, args: readonly string[]) => {
        if (args.includes("--is-inside-work-tree")) return { status: 0, stdout: "true\n", stderr: "" };
        if (args.includes("HEAD") && args.includes("--abbrev-ref")) return { status: 0, stdout: "feat/watcher\n", stderr: "" };
        if (args.includes("@{u}")) return { status: 0, stdout: "origin/feat/watcher\n", stderr: "" };
        if (args.includes("rev-list")) return { status: 0, stdout: "2\t0\n", stderr: "" };
        if (args.includes("status")) return { status: 0, stdout: "M  file.ts\n?? test.ts\n", stderr: "" };
        return { status: 1, stdout: "", stderr: "" };
      };

      const metrics = inspectRepoGit(testDir, runCmd);
      expect(metrics.isRepo).toBe(true);
      expect(metrics.branch).toBe("feat/watcher");
      expect(metrics.trackingBranch).toBe("origin/feat/watcher");
      expect(metrics.ahead).toBe(2);
      expect(metrics.behind).toBe(0);
      expect(metrics.dirtyCount).toBe(2);
      expect(metrics.hasStaged).toBe(true);
      expect(metrics.hasUntracked).toBe(true);
    });
  });

  describe("inspectRepoCi", () => {
    it("returns unavailable if gh command fails or is missing", () => {
      const runCmd = () => ({ status: 1, stdout: "", stderr: "gh: command not found" });
      const ci = inspectRepoCi(testDir, runCmd);
      expect(ci.available).toBe(false);
    });

    it("parses successful gh run list output", () => {
      const mockOutput = JSON.stringify([
        {
          databaseId: 12345,
          workflowName: "CI / Production Gate",
          status: "completed",
          conclusion: "failure",
          headSha: "abcdef123456",
          headBranch: "main",
          updatedAt: "2026-11-26T10:00:00Z",
        },
      ]);
      const runCmd = () => ({ status: 0, stdout: mockOutput, stderr: "" });
      const ci = inspectRepoCi(testDir, runCmd);
      expect(ci.available).toBe(true);
      expect(ci.runId).toBe(12345);
      expect(ci.conclusion).toBe("failure");
      expect(ci.workflowName).toBe("CI / Production Gate");
    });
  });

  describe("deriveProjectStatus & generateAlerts", () => {
    const def = SOLO_PROJECT_DEFINITIONS[0]!;

    it("marks status failed when CI failed and generates error alert", () => {
      const git = {
        isRepo: true,
        ahead: 0,
        behind: 0,
        dirtyCount: 0,
        hasUntracked: false,
        hasStaged: false,
        hasUnstaged: false,
      };
      const ci = {
        available: true,
        workflowName: "AER Verify",
        conclusion: "failure" as const,
        runId: 999,
        headSha: "deadbeef",
        headBranch: "main",
      };

      const status = deriveProjectStatus(true, true, git, ci);
      expect(status).toBe("failed");

      const alerts = generateAlerts(def, true, testDir, git, ci);
      expect(alerts).toHaveLength(1);
      expect(alerts[0]!.level).toBe("error");
      expect(alerts[0]!.category).toBe("ci_failure");
    });

    it("generates warning when repo is missing", () => {
      const alerts = generateAlerts(def, false, undefined);
      expect(alerts).toHaveLength(1);
      expect(alerts[0]!.level).toBe("warning");
      expect(alerts[0]!.category).toBe("repo_missing");
    });

    it("generates divergence alert when branch is behind upstream", () => {
      const git = {
        isRepo: true,
        branch: "main",
        trackingBranch: "origin/main",
        ahead: 0,
        behind: 4,
        dirtyCount: 0,
        hasUntracked: false,
        hasStaged: false,
        hasUnstaged: false,
      };
      const alerts = generateAlerts(def, true, testDir, git);
      const divergence = alerts.find((a) => a.category === "divergence");
      expect(divergence).toBeDefined();
      expect(divergence?.level).toBe("warning");
    });
  });

  describe("withLock & saveSoloStatusSnapshot", () => {
    it("acquires lock and writes atomically", () => {
      const statusFile = join(testDir, "solo-projects-status.json");
      const mockSnapshot = {
        version: 1 as const,
        timestamp: Date.now(),
        projects: [],
        summary: { total: 0, healthy: 0, alertsCount: 0, failedCount: 0, workingCount: 0 },
      };

      saveSoloStatusSnapshot(mockSnapshot, statusFile);
      expect(existsSync(statusFile)).toBe(true);

      const readBack = readSoloStatusSnapshot(statusFile);
      expect(readBack).toEqual(mockSnapshot);
    });

    it("recovers from lock conflict or cleans up lock cleanly", () => {
      const lockPath = join(testDir, "test.lock");
      let executed = false;
      withLock(lockPath, () => {
        expect(existsSync(lockPath)).toBe(true);
        executed = true;
      });
      expect(executed).toBe(true);
      expect(existsSync(lockPath)).toBe(false);
    });
  });

  describe("inspectAllProjects & SoloWatcherDaemon", () => {
    it("inspects mock projects and outputs structured snapshot", () => {
      const customPaths = {
        openmausbot: testDir,
      };

      const runCmd = (_cmd: string, args: readonly string[]) => {
        if (args.includes("--is-inside-work-tree")) return { status: 0, stdout: "true\n", stderr: "" };
        if (args.includes("HEAD") && args.includes("--abbrev-ref")) return { status: 0, stdout: "main\n", stderr: "" };
        if (args.includes("status")) return { status: 0, stdout: "", stderr: "" };
        return { status: 1, stdout: "", stderr: "" };
      };

      const snapshot = inspectAllProjects({
        customPaths,
        queryCi: false,
        runCommand: runCmd,
      });

      expect(snapshot.version).toBe(1);
      expect(snapshot.projects).toHaveLength(5);
      const omb = snapshot.projects.find((p) => p.id === "openmausbot");
      expect(omb?.exists).toBe(true);
      expect(omb?.isRepo).toBe(true);
      expect(omb?.status).toBe("idle");
    });

    it("SoloWatcherDaemon starts, ticks once, and stops cleanly", () => {
      const statusFile = join(testDir, "status.json");
      const daemon = new SoloWatcherDaemon({
        targetFile: statusFile,
        queryCi: false,
        pollIntervalMs: 100,
        runCommand: () => ({ status: 1, stdout: "", stderr: "" }),
      });

      expect(daemon.isRunning()).toBe(false);
      daemon.start();
      expect(daemon.isRunning()).toBe(true);
      expect(existsSync(statusFile)).toBe(true);

      daemon.stop();
      expect(daemon.isRunning()).toBe(false);
    });
  });

  describe("inspectRepoGitAsync & inspectRepoCiAsync & inspectAllProjectsAsync", () => {
    it("asynchronously inspects git status and branch metrics", async () => {
      const runCmdAsync = async (_cmd: string, args: readonly string[]) => {
        if (args.includes("--is-inside-work-tree")) return { status: 0, stdout: "true\n", stderr: "" };
        if (args.includes("HEAD") && args.includes("--abbrev-ref")) return { status: 0, stdout: "feat/watcher-async\n", stderr: "" };
        if (args.includes("@{u}")) return { status: 0, stdout: "origin/feat/watcher-async\n", stderr: "" };
        if (args.includes("rev-list")) return { status: 0, stdout: "1\t0\n", stderr: "" };
        if (args.includes("status")) return { status: 0, stdout: "?? new.ts\n", stderr: "" };
        return { status: 1, stdout: "", stderr: "" };
      };

      const metrics = await inspectRepoGitAsync(testDir, runCmdAsync);
      expect(metrics.isRepo).toBe(true);
      expect(metrics.branch).toBe("feat/watcher-async");
      expect(metrics.ahead).toBe(1);
      expect(metrics.dirtyCount).toBe(1);
      expect(metrics.hasUntracked).toBe(true);
    });

    it("asynchronously inspects CI status with gh run list", async () => {
      const mockOutput = JSON.stringify([
        {
          databaseId: 67890,
          workflowName: "CI / Production Gate",
          status: "completed",
          conclusion: "success",
          headSha: "123456abcdef",
          headBranch: "main",
          updatedAt: "2026-11-26T12:00:00Z",
        },
      ]);
      const runCmdAsync = async () => ({ status: 0, stdout: mockOutput, stderr: "" });
      const ci = await inspectRepoCiAsync(testDir, runCmdAsync);
      expect(ci.available).toBe(true);
      expect(ci.runId).toBe(67890);
      expect(ci.conclusion).toBe("success");
    });

    it("asynchronously inspects all projects concurrently", async () => {
      const customPaths = { openmausbot: testDir };
      const runCmdAsync = async (_cmd: string, args: readonly string[]) => {
        if (args.includes("--is-inside-work-tree")) return { status: 0, stdout: "true\n", stderr: "" };
        if (args.includes("HEAD") && args.includes("--abbrev-ref")) return { status: 0, stdout: "main\n", stderr: "" };
        if (args.includes("status")) return { status: 0, stdout: "", stderr: "" };
        return { status: 1, stdout: "", stderr: "" };
      };

      const snapshot = await inspectAllProjectsAsync({
        customPaths,
        queryCi: false,
        runCommandAsync: runCmdAsync,
      });

      expect(snapshot.version).toBe(1);
      expect(snapshot.projects).toHaveLength(5);
    });

    it("SoloWatcherDaemon supports unref option for standalone daemon mode", () => {
      const statusFile = join(testDir, "status-standalone.json");
      const daemon = new SoloWatcherDaemon({
        targetFile: statusFile,
        queryCi: false,
        pollIntervalMs: 100,
        unref: false,
        runCommand: () => ({ status: 1, stdout: "", stderr: "" }),
      });

      daemon.start();
      expect(daemon.isRunning()).toBe(true);
      daemon.stop();
      expect(daemon.isRunning()).toBe(false);
    });
  });
});
