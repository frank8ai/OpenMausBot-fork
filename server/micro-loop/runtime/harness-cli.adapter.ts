import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  HARNESS_EXIT_CODES,
  type HarnessExitCode,
  type HarnessInvocationResult,
  type IHarnessBridgePort,
} from "../contracts/ports.ts";
import { loadMicroLoopConfig } from "../config/micro-loop.config.ts";

const execFileAsync = promisify(execFile);

export interface HarnessCliAdapterOptions {
  hrkRoot?: string;
  bunPath?: string;
  hmacSecret?: string;
}

const VALID_EXIT_CODES = new Set<number>(Object.values(HARNESS_EXIT_CODES));

export class HarnessCliAdapter implements IHarnessBridgePort {
  private readonly hrkRoot: string;
  private readonly bunPath: string;
  private readonly hmacSecret: string;
  private readonly cliPath: string;

  constructor(options?: HarnessCliAdapterOptions) {
    const config = loadMicroLoopConfig();
    this.hrkRoot = options?.hrkRoot || config.hrkRoot;
    this.bunPath = options?.bunPath || "bun";
    this.hmacSecret = options?.hmacSecret || config.hmacSecret;
    this.cliPath = join(this.hrkRoot, "src", "cli.ts");
  }

  private mapExitCode(rawCode: number | null | undefined): HarnessExitCode {
    if (typeof rawCode === "number" && VALID_EXIT_CODES.has(rawCode)) {
      return rawCode as HarnessExitCode;
    }
    return HARNESS_EXIT_CODES.FAIL_RETRYABLE;
  }

  private async invokeCli<T>(
    subCommand: string,
    cliArgs: string[],
    timeoutMs: number,
  ): Promise<HarnessInvocationResult<T>> {
    const startTime = Date.now();
    const args = ["run", this.cliPath, subCommand, ...cliArgs];

    try {
      const { stdout, stderr } = await execFileAsync(this.bunPath, args, {
        cwd: this.hrkRoot,
        timeout: timeoutMs,
        maxBuffer: 10 * 1024 * 1024,
        env: {
          ...process.env,
          OMB_ORACLE_KEY: this.hmacSecret,
          OMB_ORACLE_HMAC_SECRET: this.hmacSecret,
          OMB_MICRO_LOOP_HMAC_SECRET: this.hmacSecret,
        },
      });

      const durationMs = Date.now() - startTime;
      let stdoutJson: T | null = null;
      try {
        const trimmed = stdout.trim();
        if (trimmed) {
          stdoutJson = JSON.parse(trimmed) as T;
        }
      } catch {
        stdoutJson = null;
      }

      return {
        exitCode: HARNESS_EXIT_CODES.PASS,
        stdoutJson,
        stderrSnippet: stderr.slice(-500),
        durationMs,
      };
    } catch (error: unknown) {
      const durationMs = Date.now() - startTime;
      const execErr = error as {
        code?: number | string;
        stdout?: string;
        stderr?: string;
        killed?: boolean;
        signal?: string;
      };

      const rawCode = typeof execErr.code === "number" ? execErr.code : undefined;
      const exitCode = execErr.killed
        ? HARNESS_EXIT_CODES.FREEZE_BUDGET_EXCEEDED
        : this.mapExitCode(rawCode);

      let stdoutJson: T | null = null;
      if (execErr.stdout) {
        try {
          stdoutJson = JSON.parse(execErr.stdout.trim()) as T;
        } catch {
          stdoutJson = null;
        }
      }

      return {
        exitCode,
        stdoutJson,
        stderrSnippet: (execErr.stderr || String(error)).slice(-500),
        durationMs,
      };
    }
  }

  async distill(params: {
    storeDir: string;
    inputFilePath: string;
    playbookPath?: string;
    timeoutMs?: number;
  }): Promise<HarnessInvocationResult> {
    const args = ["--input", params.inputFilePath, "--store", params.storeDir];
    if (params.playbookPath) {
      args.push("--playbook", params.playbookPath);
    }
    return this.invokeCli("distill", args, params.timeoutMs ?? 15_000);
  }

  async oracleJudge(params: {
    slug: string;
    storeDir: string;
    vaultDir: string;
    timeoutMs?: number;
  }): Promise<HarnessInvocationResult> {
    const args = [
      "--slug",
      params.slug,
      "--store",
      params.storeDir,
      "--vault",
      params.vaultDir,
    ];
    return this.invokeCli("oracle-judge", args, params.timeoutMs ?? 90_000);
  }

  async blindReview(params: {
    inputFilePath: string;
    storeDir: string;
    vaultDir: string;
    outFilePath?: string;
    timeoutMs?: number;
  }): Promise<HarnessInvocationResult> {
    const args = [
      "--input",
      params.inputFilePath,
      "--store",
      params.storeDir,
      "--vault",
      params.vaultDir,
    ];
    if (params.outFilePath) {
      args.push("--out", params.outFilePath);
    }
    return this.invokeCli("blind-review", args, params.timeoutMs ?? 30_000);
  }

  async promote(params: {
    slug: string;
    storeDir: string;
    vaultDir: string;
    stage: "shadow" | "canary" | "active";
    timeoutMs?: number;
  }): Promise<HarnessInvocationResult> {
    const args = [
      "--slug",
      params.slug,
      "--store",
      params.storeDir,
      "--stage",
      params.stage,
      "--vault",
      params.vaultDir,
    ];
    return this.invokeCli("promote", args, params.timeoutMs ?? 60_000);
  }

  async rollback(params: {
    slug: string;
    storeDir: string;
    vaultDir: string;
    timeoutMs?: number;
  }): Promise<HarnessInvocationResult> {
    const args = [
      "--slug",
      params.slug,
      "--store",
      params.storeDir,
      "--vault",
      params.vaultDir,
    ];
    return this.invokeCli("rollback", args, params.timeoutMs ?? 15_000);
  }

  async selectSkills(params: {
    storeDir: string;
    domain: "Infra" | "Fulfill" | "App" | "Shared";
    tags: readonly string[];
    maxK?: number;
    maxTokens?: number;
    timeoutMs?: number;
  }): Promise<HarnessInvocationResult> {
    const args = [
      "--store",
      params.storeDir,
      "--domain",
      params.domain,
    ];
    if (params.tags.length > 0) {
      args.push("--tags", params.tags.join(","));
    }
    if (typeof params.maxK === "number") {
      args.push("--max-k", String(params.maxK));
    }
    if (typeof params.maxTokens === "number") {
      args.push("--max-tokens", String(params.maxTokens));
    }
    return this.invokeCli("select-skills", args, params.timeoutMs ?? 5_000);
  }
}

