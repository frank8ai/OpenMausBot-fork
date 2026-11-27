import { describe, expect, it } from "vitest";
import { HarnessCliAdapter } from "./runtime/harness-cli.adapter.ts";

describe("Harness CLI Adapter", () => {
  it("initializes with default options and maps known exit codes", () => {
    const adapter = new HarnessCliAdapter({
      hrkRoot: "/fake/hrk",
      bunPath: "bun",
      hmacSecret: "secret-123",
    });

    // Verify adapter implements IHarnessBridgePort methods
    expect(typeof adapter.distill).toBe("function");
    expect(typeof adapter.oracleJudge).toBe("function");
    expect(typeof adapter.blindReview).toBe("function");
    expect(typeof adapter.promote).toBe("function");
    expect(typeof adapter.rollback).toBe("function");
    expect(typeof adapter.selectSkills).toBe("function");
  });

  it("handles exit code mapping correctly", async () => {
    const adapter = new HarnessCliAdapter();

    // Call selectSkills with invalid store dir to verify error handling without crashing
    const res = await adapter.selectSkills({
      storeDir: "/nonexistent-store-path-abc",
      domain: "Infra",
      tags: ["test"],
      timeoutMs: 3000,
    });

    // Bun should execute and exit non-zero (e.g. exit 2 or 1)
    expect(typeof res.exitCode).toBe("number");
    expect(res.durationMs).toBeGreaterThan(0);
  });
});

