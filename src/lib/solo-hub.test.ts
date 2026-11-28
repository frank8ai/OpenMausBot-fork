// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Bot, Group, Message } from "@/state/store";
import {
  SOLO_CORE_PROJECTS,
  SOLO_HUB_MODE_KEY,
  SOLO_HUB_SURFACE_KEY,
  deriveSoloProjects,
  readSoloHubMode,
  readSoloHubSurface,
  resetSoloHubCacheForTest,
  setSoloHubMode,
  setSoloHubSurface,
  toggleSoloHubMode,
} from "./solo-hub";

function makeBot(partial: Partial<Bot> & { id: string; name: string }): Bot {
  return {
    threadId: `thread-${partial.id}`,
    color: "#377FE6",
    modelSelection: { instanceId: "inst-1", modelId: "model-1" },
    messages: [],
    busy: false,
    ...partial,
  } as Bot;
}

function makePendingApprovalMessage(id: string): Message {
  return {
    id,
    role: "bot",
    kind: "options",
    at: Date.now(),
    card: {
      title: "Merge branch",
      subtitle: "git merge feat/solo",
      options: ["Allow", "Deny"],
      requestId: `req-${id}`,
      tool: "Bash",
    },
  };
}

describe("solo-hub state and project matrix", () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.soloHub;
    delete document.documentElement.dataset.soloSurface;
    resetSoloHubCacheForTest();
  });

  afterEach(() => {
    resetSoloHubCacheForTest();
  });

  it("defaults off for backward compatibility and syncs document dataset on toggle", () => {
    expect(readSoloHubMode()).toBe(false);
    expect(toggleSoloHubMode()).toBe(true);
    expect(localStorage.getItem(SOLO_HUB_MODE_KEY)).toBe("1");
    expect(document.documentElement.dataset.soloHub).toBe("true");
    setSoloHubSurface("washi-celadon");
    expect(localStorage.getItem(SOLO_HUB_SURFACE_KEY)).toBe("washi-celadon");
    expect(readSoloHubSurface()).toBe("washi-celadon");
    expect(document.documentElement.dataset.soloSurface).toBe("washi-celadon");
    setSoloHubMode(false);
    expect(document.documentElement.dataset.soloHub).toBeUndefined();
  });

  it("exposes the 5 core local active projects and derives live zero-token status", () => {
    expect(SOLO_CORE_PROJECTS.map((p) => p.name)).toEqual([
      "OpenMausBot",
      "Autofabric",
      "AER-SaaS",
      "Harness-Runner-Kit",
      "Profile-Matrix",
    ]);

    const bots: Bot[] = [
      makeBot({
        id: "b-omb",
        name: "MausBot Chief",
        cwd: "C:/Projects/OpenMausBot",
        messages: [makePendingApprovalMessage("m1")],
      }),
      makeBot({
        id: "b-af",
        name: "Autofabric Runner",
        cwd: "C:/Projects/Autofabric",
        busy: true,
        messages: [{ id: "m2", role: "bot", kind: "text", text: "Building artifact", at: 100 }],
      }),
    ];
    const groups: Group[] = [
      {
        id: "g-aer",
        name: "AER-SaaS War Room",
        threadId: "t-aer",
        memberIds: [],
        messages: [{ id: "m3", role: "bot", kind: "text", text: "Release verified", at: 200 }],
      } as unknown as Group,
    ];

    const snapshots = deriveSoloProjects(bots, groups);
    expect(snapshots).toHaveLength(5);
    expect(snapshots[0]).toMatchObject({ botId: "b-omb", status: "waiting", pendingDecisions: 1 });
    expect(snapshots[1]).toMatchObject({ botId: "b-af", status: "working", pendingDecisions: 0 });
    expect(snapshots[2]).toMatchObject({ groupId: "g-aer", status: "done", pendingDecisions: 0 });
    expect(snapshots[3]).toMatchObject({ status: "idle", pendingDecisions: 0 });
    expect(snapshots[4]).toMatchObject({ status: "idle", pendingDecisions: 0 });
  });
});
