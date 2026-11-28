// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setLocale } from "@/lib/i18n";
import { SOLO_CORE_PROJECTS, type SoloProjectSnapshot } from "@/lib/solo-hub";
import type { Pending } from "@/components/PendingApproval";
import { StoreProvider } from "@/state/store";
import { SoloProjectMatrixView } from "./SoloProjectMatrix";
import { PipelineStatusCapsule } from "./PipelineStatusCapsule";
import { FoldedVerboseMessage } from "./FoldedVerboseMessage";
import { SingleDecisionCard } from "./SingleDecisionCard";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;

beforeEach(() => {
  setLocale("en");
  host = document.createElement("div");
  document.body.append(host);
});

afterEach(() => {
  document.body.innerHTML = "";
});

const SNAPSHOTS: SoloProjectSnapshot[] = SOLO_CORE_PROJECTS.map((project, index) => ({
  project,
  status: index === 0 ? "waiting" : index === 1 ? "working" : "idle",
  botId: index <= 1 ? `bot-${project.id}` : undefined,
  pendingDecisions: index === 0 ? 2 : 0,
  phaseSummary: index === 0 ? "Merge PR #42" : undefined,
}));

function makePending(detail: string): Pending {
  return {
    requestId: "req-solo-1",
    tool: "Bash",
    detail,
    message: {
      id: "msg-1",
      role: "bot",
      kind: "options",
      at: Date.now(),
      card: { title: "Confirm critical action", subtitle: detail, options: ["Allow", "Deny"], requestId: "req-solo-1", tool: "Bash" },
    },
  };
}

describe("Solo Hub v5.0 UI components", () => {
  it("renders the 5 core project matrix, loading skeleton, and unlinked guidance", async () => {
    const root = createRoot(host);
    const onSelectProject = vi.fn();
    const onToggleMode = vi.fn();
    const onCycleSurface = vi.fn();

    await act(async () => {
      root.render(createElement(SoloProjectMatrixView, {
        snapshots: SNAPSHOTS,
        enabled: true,
        surface: "washi-celadon",
        activeBotId: "bot-openmausbot",
        onToggleMode,
        onCycleSurface,
        onSelectProject,
      }));
    });

    for (const project of SOLO_CORE_PROJECTS) {
      expect(host.querySelector(`[data-testid="solo-project-${project.id}"]`)).not.toBeNull();
    }

    await act(async () => {
      host.querySelector<HTMLButtonElement>(`[data-testid="solo-project-openmausbot"]`)!.click();
    });
    expect(onSelectProject).toHaveBeenCalledTimes(1);

    await act(async () => {
      host.querySelector<HTMLButtonElement>(`[data-testid="solo-project-profile-matrix"]`)!.click();
    });
    expect(host.querySelector(`[role="status"]`)?.textContent).toContain("Profile-Matrix");

    await act(async () => {
      root.render(createElement(SoloProjectMatrixView, {
        snapshots: SNAPSHOTS,
        enabled: true,
        surface: "linear-alabaster",
        loading: true,
        onToggleMode,
        onCycleSurface,
        onSelectProject,
      }));
    });
    expect(host.querySelectorAll(`[data-testid="solo-project-skeleton"]`)).toHaveLength(5);
    await act(async () => { root.unmount(); });
  });

  it("toggles PipelineStatusCapsule and FoldedVerboseMessage with accessible disclosure", async () => {
    const root = createRoot(host);
    await act(async () => {
      root.render(createElement("div", null,
        createElement(PipelineStatusCapsule, {
          phases: [
            { id: "p1", label: "Phase 1 Audit", status: "done", stepCount: 2 },
            { id: "p2", label: "Phase 2 Build", status: "running", stepCount: 1 },
          ],
          children: createElement("div", { "data-testid": "capsule-body" }, "Raw tool trace"),
        }),
        createElement(FoldedVerboseMessage, {
          info: { kind: "brief", lineCount: 28, charCount: 1200, headline: "Phase A1 Task Brief", badgeKey: "soloHub.fold.brief" },
          children: createElement("div", { "data-testid": "brief-body" }, "Full internal brief"),
        }),
      ));
    });

    const capsuleBtn = host.querySelector<HTMLButtonElement>(`[data-testid="solo-pipeline-capsule"] button`)!;
    expect(capsuleBtn.getAttribute("aria-expanded")).toBe("false");
    expect(host.querySelector(`[data-testid="capsule-body"]`)).toBeNull();
    await act(async () => { capsuleBtn.click(); });
    expect(capsuleBtn.getAttribute("aria-expanded")).toBe("true");
    expect(host.querySelector(`[data-testid="capsule-body"]`)?.textContent).toBe("Raw tool trace");

    const foldBtn = host.querySelector<HTMLButtonElement>(`[data-testid="solo-folded-message"] button`)!;
    expect(foldBtn.getAttribute("aria-expanded")).toBe("false");
    expect(host.querySelector(`[data-testid="brief-body"]`)).toBeNull();
    await act(async () => { foldBtn.click(); });
    expect(foldBtn.getAttribute("aria-expanded")).toBe("true");
    expect(host.querySelector(`[data-testid="brief-body"]`)?.textContent).toBe("Full internal brief");
    await act(async () => { root.unmount(); });
  });

  it("renders SingleDecisionCard with Approve/Reject/Rework, optimistic undo, and inline error retry", async () => {
    const root = createRoot(host);
    const onCancelTurn = vi.fn();
    let shouldFail = true;
    const onDecide = vi.fn(() => {
      if (shouldFail) {
        shouldFail = false;
        throw new Error("Network timeout");
      }
    });

    await act(async () => {
      root.render(createElement(StoreProvider, null,
        createElement(SingleDecisionCard, {
          pending: makePending("git merge feat/solo-company-ui-v5"),
          threadId: "thread-1",
          count: 3,
          index: 0,
          onCancelTurn,
          onDecide,
        }),
      ));
    });

    const card = host.querySelector<HTMLElement>(`[data-testid="solo-single-decision-card"]`)!;
    expect(card.dataset.decisionRisk).toBe("branch-merge");
    expect(host.querySelector(`[data-testid="solo-decision-queue"]`)?.textContent).toContain("1");
    expect(host.querySelector(`[data-testid="solo-decision-approve"]`)).not.toBeNull();
    expect(host.querySelector(`[data-testid="solo-decision-rework"]`)).not.toBeNull();
    expect(host.querySelector(`[data-testid="solo-decision-reject"]`)).not.toBeNull();

    await act(async () => {
      host.querySelector<HTMLButtonElement>(`[data-testid="solo-decision-rework"]`)!.click();
    });
    expect(host.querySelector(`[data-testid="solo-decision-error"]`)?.textContent).toContain("Network timeout");

    await act(async () => {
      host.querySelector<HTMLButtonElement>(`[data-testid="solo-decision-error"] button`)!.click();
    });
    expect(onDecide).toHaveBeenCalledTimes(2);
    expect(host.querySelector(`[data-testid="solo-decision-optimistic"]`)).not.toBeNull();
    await act(async () => { root.unmount(); });
  });

  it("renders SingleDecisionCard with staged skill preview when reviewing learned skills", async () => {
    const root = createRoot(host);
    const skillPending: Pending = {
      requestId: "req-skill-1",
      tool: "Skill",
      detail: "Enable skill",
      message: {
        id: "msg-skill-1",
        role: "bot",
        kind: "options",
        at: Date.now(),
        card: {
          title: "Enable skill: weather-checker",
          subtitle: "Check real-time weather",
          options: ["Allow", "Deny"],
          requestId: "req-skill-1",
          tool: "Skill",
          skillRequest: {
            version: 1,
            requestId: "req-skill-1",
            botId: "bot-1",
            threadId: "thread-1",
            stagedId: "staged-1",
            action: "enable",
            name: "weather-checker",
            gist: "Check weather",
            preview: "# Weather Checker\nFetches current forecast.",
            sha256: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
            warnings: [],
            createdAt: Date.now(),
          },
        },
      },
    };

    await act(async () => {
      root.render(createElement(StoreProvider, null,
        createElement(SingleDecisionCard, {
          pending: skillPending,
          threadId: "thread-1",
          count: 1,
          onCancelTurn: vi.fn(),
        }),
      ));
    });

    const detailsBtn = host.querySelector<HTMLButtonElement>(`[aria-controls]`)!;
    expect(detailsBtn).not.toBeNull();
    await act(async () => { detailsBtn.click(); });
    expect(host.querySelector(`[data-testid="solo-skill-preview"]`)).not.toBeNull();
    await act(async () => { root.unmount(); });
  });
});
