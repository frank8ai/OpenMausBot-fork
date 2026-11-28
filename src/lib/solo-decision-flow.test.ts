import { describe, expect, it } from "vitest";
import { setLocale } from "@/lib/i18n";
import type { Message } from "@/state/store";
import type { Pending } from "@/components/PendingApproval";
import {
  classifyDecisionRisk,
  classifySoloMessage,
  extractPipelinePhases,
  parseExplicitPipelinePhases,
} from "./solo-decision-flow";

function makePending(tool: string, detail: string, title = "Action"): Pending {
  const message: Message = {
    id: "m-1",
    role: "bot",
    kind: "options",
    at: Date.now(),
    card: { title, subtitle: detail, options: ["Allow", "Deny"], requestId: "req-1", tool },
  };
  return { message, requestId: "req-1", tool, detail };
}

describe("solo-decision-flow classifiers", () => {
  it("folds internal briefs, standing prompts, and multi-line build logs while preserving normal messages", () => {
    expect(classifySoloMessage("Shipped the button fix.")).toBeNull();

    const brief = [
      "【任务 Brief · Phase A1】",
      "### 1. 目标与角色",
      "实现一人公司模式侧栏剪枝",
      "物理 Done-When: 5 core projects visible",
      "Done when: tests and build pass",
      "Additional context line 6",
    ].join("\n");
    expect(classifySoloMessage(brief)?.kind).toBe("brief");

    const prompt = [
      "--- BEGIN STANDING INSTRUCTIONS (SOUL.md) ---",
      "Role: Design Engineer",
      "North Star: Linear craft",
      "--- END STANDING INSTRUCTIONS ---",
    ].join("\n");
    expect(classifySoloMessage(prompt)?.kind).toBe("system-prompt");

    const logLines = ["vite v7.3.8 building for production...", ...Array.from({ length: 20 }, (_, i) => `PASS src/file-${i}.test.ts`)].join("\n");
    expect(classifySoloMessage(logLines)?.kind).toBe("build-log");
  });

  it("parses explicit phase arrows and collapses tool activity runs into streaming phases", () => {
    setLocale("en");
    const explicit = parseExplicitPipelinePhases("[Phase 1 架构审计 ✓] ➔ [Phase 2 全栈开发 ⚙] ➔ [Phase 3 验收质保]");
    expect(explicit).toHaveLength(3);
    expect(explicit[0]).toMatchObject({ label: "Phase 1 架构审计", status: "done" });
    expect(explicit[1]).toMatchObject({ label: "Phase 2 全栈开发", status: "running" });
    expect(explicit[2]).toMatchObject({ label: "Phase 3 验收质保", status: "pending" });

    const toolRun: Message[] = [
      { id: "1", role: "bot", kind: "activity", at: 1, tool: { name: "read_file", label: "Read Sidebar.tsx", ok: true } },
      { id: "2", role: "bot", kind: "activity", at: 2, tool: { name: "edit_file", label: "Patch SoloHub", ok: true } },
      { id: "3", role: "bot", kind: "activity", at: 3, tool: { name: "run_command", label: "pnpm vitest run", ok: undefined } },
    ];
    const phases = extractPipelinePhases(toolRun, new Set(["3"]));
    expect(phases.map((p) => [p.id, p.status])).toEqual([
      ["audit", "done"],
      ["build", "done"],
      ["verify", "running"],
    ]);
  });

  it("classifies branch merge, irreversible delete, billing charge, and general approval risks", () => {
    expect(classifyDecisionRisk(makePending("Bash", "git merge feat/solo-company-ui-v5"))).toMatchObject({
      kind: "branch-merge",
      severity: "high",
      reversible: false,
    });
    expect(classifyDecisionRisk(makePending("Bash", "rm -rf ./dist-prod"))).toMatchObject({
      kind: "irreversible-delete",
      severity: "critical",
      reversible: false,
    });
    expect(classifyDecisionRisk(makePending("mcp", "stripe charge capture $49.00"))).toMatchObject({
      kind: "billing-charge",
      severity: "critical",
      reversible: false,
    });
    expect(classifyDecisionRisk(makePending("Read", "Read README.md"))).toMatchObject({
      kind: "general",
      severity: "standard",
      reversible: true,
    });
  });
});
