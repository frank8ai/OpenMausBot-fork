import { existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { DATA_DIR } from "../../config.ts";

export interface MicroLoopConfig {
  enabled: boolean;
  dataDir: string;
  microLoopDir: string;
  frictionEventsDir: string;
  compiledDraftsDir: string;
  lkgManifestPath: string;
  lkgPrevManifestPath: string;
  telemetryPath: string;
  hrkRoot: string;
  oracleVaultDir: string;
  hmacSecret: string;
}

function resolveHrkRoot(): string {
  if (process.env.OMB_HRK_ROOT && existsSync(process.env.OMB_HRK_ROOT)) {
    return resolve(process.env.OMB_HRK_ROOT);
  }
  const defaultWinPath = "C:\\Users\\frank\\Documents\\frank\\Projects\\Research\\Harness-Runner-Kit";
  if (existsSync(defaultWinPath)) {
    return defaultWinPath;
  }
  return resolve(process.cwd(), "../Research/Harness-Runner-Kit");
}

function resolveOracleVaultDir(): string {
  if (process.env.OMB_ORACLE_VAULT_DIR && existsSync(process.env.OMB_ORACLE_VAULT_DIR)) {
    return resolve(process.env.OMB_ORACLE_VAULT_DIR);
  }
  const defaultWinVault = "C:\\Users\\frank\\Documents\\frank\\Projects\\Research\\OpenMausBot-Oracle-Vault";
  if (existsSync(defaultWinVault)) {
    return defaultWinVault;
  }
  return resolve(process.cwd(), "../Research/OpenMausBot-Oracle-Vault");
}

export function loadMicroLoopConfig(): MicroLoopConfig {
  const isEnabled =
    process.env.OMB_MICRO_LOOP_ENABLED !== "0" &&
    process.env.OMB_MICRO_LOOP_ENABLED !== "false";

  const microLoopDir = join(DATA_DIR, "micro_loop");
  const frictionEventsDir = join(microLoopDir, "friction_events");
  const compiledDraftsDir = join(microLoopDir, "compiled_drafts");
  const lkgManifestPath = join(microLoopDir, "lkg_active_manifest.json");
  const lkgPrevManifestPath = join(microLoopDir, "lkg_active_manifest.prev.json");
  const telemetryPath = join(microLoopDir, "bridge.telemetry.jsonl");

  const hmacSecret =
    process.env.OMB_ORACLE_HMAC_SECRET ||
    process.env.OMB_MICRO_LOOP_HMAC_SECRET ||
    "openmausbot-micro-loop-phase-c-secret-default";

  return {
    enabled: isEnabled,
    dataDir: DATA_DIR,
    microLoopDir,
    frictionEventsDir,
    compiledDraftsDir,
    lkgManifestPath,
    lkgPrevManifestPath,
    telemetryPath,
    hrkRoot: resolveHrkRoot(),
    oracleVaultDir: resolveOracleVaultDir(),
    hmacSecret,
  };
}

export function ensureMicroLoopDirs(cfg: MicroLoopConfig): void {
  const dirs = [
    cfg.microLoopDir,
    cfg.frictionEventsDir,
    join(cfg.frictionEventsDir, "archive"),
    cfg.compiledDraftsDir,
  ];
  for (const d of dirs) {
    if (!existsSync(d)) {
      mkdirSync(d, { recursive: true });
    }
  }
}
