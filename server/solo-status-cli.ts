/**
 * CLI runner for openmausbot solo-status command.
 */
import { defaultDataDir } from "./data-dir.ts";
import { defaultStatusFilePath, inspectAllProjectsAsync, saveSoloStatusSnapshot, SoloWatcherDaemon, type SoloProjectsSnapshot } from "./solo-watcher.ts";

export interface SoloStatusCliArgs {
  readonly dataDir: string;
  readonly json: boolean;
  readonly once: boolean;
  readonly daemon: boolean;
  readonly pollIntervalSeconds: number;
  readonly help: boolean;
}

export const SOLO_STATUS_USAGE = `openmausbot solo-status [--data-dir DIR] [--once] [--daemon] [--interval SECONDS] [--json]

Inspects local in-development repositories across 5 core solo-company projects
(OpenMausBot, Autofabric, AER-SaaS, Harness-Runner-Kit, Profile-Matrix),
evaluates Git working tree status, tracking branch divergence, and CI health,
generating zero-token alerts and saving snapshot to solo-projects-status.json.
`;

export function parseSoloStatusArgs(argv: readonly string[], env: NodeJS.ProcessEnv = process.env): SoloStatusCliArgs | { error: string } {
  let dataDir = defaultDataDir(env);
  let json = false;
  let once = false;
  let daemon = false;
  let pollIntervalSeconds = 30;
  let help = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === "--help" || arg === "-h") {
      help = true;
    } else if (arg === "--json") {
      json = true;
    } else if (arg === "--once") {
      once = true;
    } else if (arg === "--daemon") {
      daemon = true;
    } else if (arg === "--data-dir") {
      const val = argv[i + 1];
      if (!val || val.startsWith("--")) return { error: "--data-dir needs a directory path" };
      dataDir = val;
      i += 1;
    } else if (arg === "--interval") {
      const val = argv[i + 1];
      if (!val || val.startsWith("--")) return { error: "--interval needs seconds as integer" };
      const parsed = Number(val);
      if (!Number.isInteger(parsed) || parsed <= 0) return { error: "--interval must be a positive integer" };
      pollIntervalSeconds = parsed;
      i += 1;
    } else {
      return { error: `unknown argument "${arg}"` };
    }
  }

  if (!daemon) once = true;

  return {
    dataDir,
    json,
    once,
    daemon,
    pollIntervalSeconds,
    help,
  };
}

export function formatSnapshotText(snapshot: SoloProjectsSnapshot): string[] {
  const lines: string[] = [];
  lines.push(`Solo Company Hub - 5 Projects Health Matrix [${new Date(snapshot.timestamp).toISOString()}]`);
  lines.push(`Summary: ${snapshot.summary.healthy}/${snapshot.summary.total} Healthy | ${snapshot.summary.workingCount} Working | ${snapshot.summary.failedCount} Failed | ${snapshot.summary.alertsCount} Alerts`);
  lines.push("");

  for (const p of snapshot.projects) {
    const statusTag = `[${p.status.toUpperCase()}]`.padEnd(10);
    const gitInfo = p.git?.isRepo
      ? `${p.git.branch ?? "detached"} (ahead ${p.git.ahead}, behind ${p.git.behind}, dirty ${p.git.dirtyCount})`
      : "(no git)";
    const ciInfo = p.ci?.available
      ? `CI: ${p.ci.workflowName ?? "workflow"} (${p.ci.conclusion})`
      : "";

    lines.push(`${statusTag} ${p.name.padEnd(20)} ${gitInfo} ${ciInfo}`);
    for (const alert of p.alerts) {
      lines.push(`   └─ [${alert.level.toUpperCase()}] ${alert.summary}`);
    }
  }

  return lines;
}

export async function runSoloStatusCli(
  argv: readonly string[],
  io: { log(line: string): void; error(line: string): void } = console,
  env: NodeJS.ProcessEnv = process.env,
): Promise<number> {
  const args = parseSoloStatusArgs(argv, env);
  if ("error" in args) {
    io.error(`solo-status: ${args.error}\n\n${SOLO_STATUS_USAGE}`);
    return 2;
  }

  if (args.help) {
    io.log(SOLO_STATUS_USAGE);
    return 0;
  }

  const targetFile = defaultStatusFilePath(args.dataDir);

  if (args.once) {
    const snapshot = await inspectAllProjectsAsync({ dataDir: args.dataDir });
    saveSoloStatusSnapshot(snapshot, targetFile);

    if (args.json) {
      io.log(JSON.stringify(snapshot, null, 2));
    } else {
      for (const line of formatSnapshotText(snapshot)) {
        io.log(line);
      }
    }
    return 0;
  }

  if (args.daemon) {
    io.log(`Starting Solo Watcher Daemon (interval: ${args.pollIntervalSeconds}s, target: ${targetFile})...`);
    const watcher = new SoloWatcherDaemon({
      dataDir: args.dataDir,
      targetFile,
      pollIntervalMs: args.pollIntervalSeconds * 1000,
      unref: false,
    });
    watcher.start();

    await new Promise<void>((resolveStop) => {
      for (const sig of ["SIGINT", "SIGTERM"] as const) {
        process.once(sig, () => {
          watcher.stop();
          resolveStop();
        });
      }
    });
    return 0;
  }

  return 0;
}
