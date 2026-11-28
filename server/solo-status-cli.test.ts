import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { formatSnapshotText, parseSoloStatusArgs, runSoloStatusCli } from "./solo-status-cli.ts";
import type { SoloProjectsSnapshot } from "./solo-watcher.ts";

describe("solo-status CLI tests", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `solo-cli-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {}
  });

  describe("parseSoloStatusArgs", () => {
    it("parses defaults as once mode", () => {
      const args = parseSoloStatusArgs([]);
      expect("error" in args).toBe(false);
      if (!("error" in args)) {
        expect(args.once).toBe(true);
        expect(args.daemon).toBe(false);
        expect(args.json).toBe(false);
        expect(args.pollIntervalSeconds).toBe(30);
      }
    });

    it("parses daemon flag and custom interval", () => {
      const args = parseSoloStatusArgs(["--daemon", "--interval", "15", "--json"]);
      expect("error" in args).toBe(false);
      if (!("error" in args)) {
        expect(args.once).toBe(false);
        expect(args.daemon).toBe(true);
        expect(args.json).toBe(true);
        expect(args.pollIntervalSeconds).toBe(15);
      }
    });

    it("returns error on missing required values", () => {
      expect("error" in parseSoloStatusArgs(["--data-dir"])).toBe(true);
      expect("error" in parseSoloStatusArgs(["--interval", "not-a-number"])).toBe(true);
      expect("error" in parseSoloStatusArgs(["--interval", "-5"])).toBe(true);
      expect("error" in parseSoloStatusArgs(["--unknown-flag"])).toBe(true);
    });
  });

  describe("formatSnapshotText", () => {
    it("formats human scannable text overview", () => {
      const mockSnapshot: SoloProjectsSnapshot = {
        version: 1,
        timestamp: Date.now(),
        projects: [
          {
            id: "openmausbot",
            name: "OpenMausBot",
            exists: true,
            isRepo: true,
            status: "working",
            git: {
              isRepo: true,
              branch: "feat/watcher",
              ahead: 1,
              behind: 0,
              dirtyCount: 2,
              hasUntracked: true,
              hasStaged: false,
              hasUnstaged: true,
            },
            alerts: [
              {
                level: "info",
                category: "dirty_worktree",
                summary: "Worktree has 2 modified/untracked files.",
              },
            ],
            lastCheckedAt: Date.now(),
          },
        ],
        summary: {
          total: 1,
          healthy: 1,
          alertsCount: 1,
          failedCount: 0,
          workingCount: 1,
        },
      };

      const lines = formatSnapshotText(mockSnapshot);
      expect(lines.join("\n")).toContain("Solo Company Hub - 5 Projects Health Matrix");
      expect(lines.join("\n")).toContain("[WORKING]  OpenMausBot");
      expect(lines.join("\n")).toContain("feat/watcher (ahead 1, behind 0, dirty 2)");
      expect(lines.join("\n")).toContain("[INFO] Worktree has 2 modified/untracked files.");
    });
  });

  describe("runSoloStatusCli", () => {
    it("runs --help exit 0", async () => {
      const logs: string[] = [];
      const code = await runSoloStatusCli(["--help"], { log: (l) => logs.push(l), error: () => {} });
      expect(code).toBe(0);
      expect(logs.join("\n")).toContain("openmausbot solo-status");
    });

    it("runs --once --json exit 0 and saves snapshot", async () => {
      const logs: string[] = [];
      const code = await runSoloStatusCli(["--data-dir", testDir, "--once", "--json"], {
        log: (l) => logs.push(l),
        error: () => {},
      });
      expect(code).toBe(0);
      expect(logs.length).toBe(1);
      const parsed = JSON.parse(logs[0]!);
      expect(parsed.version).toBe(1);
      expect(parsed.projects).toBeDefined();

      const savedFile = join(testDir, "solo-projects-status.json");
      expect(existsSync(savedFile)).toBe(true);
      const fileData = JSON.parse(readFileSync(savedFile, "utf8"));
      expect(fileData.version).toBe(1);
    });

    it("returns error code 2 on invalid flags", async () => {
      const errors: string[] = [];
      const code = await runSoloStatusCli(["--invalid"], { log: () => {}, error: (e) => errors.push(e) });
      expect(code).toBe(2);
      expect(errors.join("\n")).toContain("unknown argument");
    });
  });
});
