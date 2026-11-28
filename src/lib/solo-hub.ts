import { useSyncExternalStore } from "react";
import type { Bot, Group, Message } from "@/state/store";
import { visibleMessages } from "@/state/store";
import { pendingApprovals } from "@/components/PendingApproval";
import { sidebarBotStatus } from "@/components/SidebarBotActivity";
import { windowPrefChanged } from "./window-pref-changes";

export const SOLO_HUB_MODE_KEY = "omb-solo-hub-mode";
export const SOLO_HUB_SURFACE_KEY = "omb-solo-hub-surface";

export type SoloHubSurface = "auto" | "washi-celadon" | "linear-alabaster";

export type SoloProjectId =
  | "openmausbot"
  | "autofabric"
  | "aer-saas"
  | "harness-runner-kit"
  | "profile-matrix";

export type SoloProjectStatus = "idle" | "working" | "waiting" | "failed" | "done";

export interface SoloCoreProject {
  readonly id: SoloProjectId;
  readonly name: string;
  readonly shortName: string;
  readonly roleKey:
    | "soloHub.project.openmausbot.role"
    | "soloHub.project.autofabric.role"
    | "soloHub.project.aerSaas.role"
    | "soloHub.project.harnessRunnerKit.role"
    | "soloHub.project.profileMatrix.role";
  readonly matchers: readonly string[];
}

export const SOLO_CORE_PROJECTS: readonly SoloCoreProject[] = [
  { id: "openmausbot", name: "OpenMausBot", shortName: "OM", roleKey: "soloHub.project.openmausbot.role", matchers: ["openmausbot", "mausbot", "solo-hub", "hub"] },
  { id: "autofabric", name: "Autofabric", shortName: "AF", roleKey: "soloHub.project.autofabric.role", matchers: ["autofabric", "auto-fabric", "factory"] },
  { id: "aer-saas", name: "AER-SaaS", shortName: "AE", roleKey: "soloHub.project.aerSaas.role", matchers: ["aer-saas", "aer-runtime", "aer", "rvce"] },
  { id: "harness-runner-kit", name: "Harness-Runner-Kit", shortName: "HR", roleKey: "soloHub.project.harnessRunnerKit.role", matchers: ["harness-runner-kit", "harness", "micro-loop", "cognitive-bridge"] },
  { id: "profile-matrix", name: "Profile-Matrix", shortName: "PM", roleKey: "soloHub.project.profileMatrix.role", matchers: ["profile-matrix", "profilematrix", "browser-matrix"] },
] as const;

export interface SoloProjectSnapshot {
  project: SoloCoreProject;
  status: SoloProjectStatus;
  botId?: string;
  groupId?: string;
  threadId?: string;
  linkedName?: string;
  pendingDecisions: number;
  phaseSummary?: string;
  updatedAt?: number;
}

let modeSession: boolean | undefined;
let surfaceSession: SoloHubSurface | undefined;
const modeListeners = new Set<() => void>();
const surfaceListeners = new Set<() => void>();

function storage(): Storage | undefined {
  try { return globalThis.localStorage; } catch { return undefined; }
}

export function readSoloHubMode(): boolean {
  if (modeSession !== undefined) return modeSession;
  try {
    const stored = storage()?.getItem(SOLO_HUB_MODE_KEY);
    if (stored === "1") return true;
    if (stored === "0") return false;
    return false;
  } catch { return false; }
}

export function readSoloHubSurface(): SoloHubSurface {
  if (surfaceSession !== undefined) return surfaceSession;
  try {
    const stored = storage()?.getItem(SOLO_HUB_SURFACE_KEY);
    if (stored === "washi-celadon" || stored === "linear-alabaster" || stored === "auto") return stored;
    return "auto";
  } catch { return "auto"; }
}

export function syncSoloHubDocument(enabled: boolean, surface: SoloHubSurface = readSoloHubSurface()): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (enabled) {
    root.dataset.soloHub = "true";
    root.dataset.soloSurface = surface;
  } else {
    delete root.dataset.soloHub;
    delete root.dataset.soloSurface;
  }
}

function notifyMode(): void { for (const listener of modeListeners) listener(); }
function notifySurface(): void { for (const listener of surfaceListeners) listener(); }

function onStorage(event: StorageEvent): void {
  if (event.storageArea && event.storageArea !== storage()) return;
  if (event.key === SOLO_HUB_MODE_KEY || event.key === null) {
    modeSession = undefined;
    syncSoloHubDocument(readSoloHubMode(), readSoloHubSurface());
    notifyMode();
  }
  if (event.key === SOLO_HUB_SURFACE_KEY || event.key === null) {
    surfaceSession = undefined;
    syncSoloHubDocument(readSoloHubMode(), readSoloHubSurface());
    notifySurface();
  }
}

let storageListening = false;
function ensureStorageListener(): void {
  if (storageListening || typeof window === "undefined") return;
  window.addEventListener("storage", onStorage);
  storageListening = true;
}
function maybeDropStorageListener(): void {
  if (!storageListening || typeof window === "undefined") return;
  if (modeListeners.size === 0 && surfaceListeners.size === 0) {
    window.removeEventListener("storage", onStorage);
    storageListening = false;
  }
}

export function setSoloHubMode(enabled: boolean): void {
  modeSession = enabled;
  try { storage()?.setItem(SOLO_HUB_MODE_KEY, enabled ? "1" : "0"); } catch {}
  syncSoloHubDocument(enabled, readSoloHubSurface());
  notifyMode();
  windowPrefChanged();
}

export function toggleSoloHubMode(): boolean {
  const next = !readSoloHubMode();
  setSoloHubMode(next);
  return next;
}

export function setSoloHubSurface(surface: SoloHubSurface): void {
  surfaceSession = surface;
  try { storage()?.setItem(SOLO_HUB_SURFACE_KEY, surface); } catch {}
  syncSoloHubDocument(readSoloHubMode(), surface);
  notifySurface();
  windowPrefChanged();
}

export function useSoloHubMode(): boolean {
  return useSyncExternalStore(
    (listener) => {
      modeListeners.add(listener);
      ensureStorageListener();
      return () => { modeListeners.delete(listener); maybeDropStorageListener(); };
    },
    readSoloHubMode,
    () => false,
  );
}

export function useSoloHubSurface(): SoloHubSurface {
  return useSyncExternalStore(
    (listener) => {
      surfaceListeners.add(listener);
      ensureStorageListener();
      return () => { surfaceListeners.delete(listener); maybeDropStorageListener(); };
    },
    readSoloHubSurface,
    () => "auto",
  );
}

export function resetSoloHubCacheForTest(): void {
  modeSession = undefined;
  surfaceSession = undefined;
}

function normalizeHaystack(parts: ReadonlyArray<string | undefined | null>): string {
  return parts.filter((value): value is string => Boolean(value && value.trim())).join(" ").toLowerCase();
}

function matchScore(haystack: string, matchers: readonly string[]): number {
  if (!haystack) return 0;
  for (let index = 0; index < matchers.length; index++) {
    const token = matchers[index]!;
    if (haystack.includes(token)) return matchers.length - index;
  }
  return 0;
}

function latestPhaseHint(messages: readonly Message[]): string | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]!;
    if (message.tool?.label) return message.tool.label;
    if (message.tool?.summary) return message.tool.summary;
    if (message.role === "bot" && message.kind === "text" && message.text?.trim()) {
      const firstLine = message.text.trim().split(/\r?\n/, 1)[0] ?? "";
      const cleaned = firstLine.replace(/^[#>*`\s-]+/, "").trim();
      if (cleaned) return cleaned.length > 44 ? `${cleaned.slice(0, 43)}…` : cleaned;
    }
  }
  return undefined;
}

export function deriveSoloProjects(
  bots: readonly Bot[],
  groups: readonly Group[],
  pendingQueued: Record<string, unknown[]> = {},
): SoloProjectSnapshot[] {
  const visibleBots = bots.filter((bot) => !bot.hidden);
  const usedBotIds = new Set<string>();
  return SOLO_CORE_PROJECTS.map((project) => {
    let bestBot: Bot | undefined;
    let bestBotScore = 0;
    for (const bot of visibleBots) {
      if (usedBotIds.has(bot.id)) continue;
      const haystack = normalizeHaystack([bot.cwd, bot.name, bot.section, ...(bot.tasks?.map((task) => task.title) ?? [])]);
      const score = matchScore(haystack, project.matchers);
      if (score > bestBotScore) { bestBotScore = score; bestBot = bot; }
    }
    if (bestBot) {
      usedBotIds.add(bestBot.id);
      const messages = visibleMessages(bestBot);
      const statusFlags = sidebarBotStatus(bestBot, pendingQueued, messages);
      const pending = pendingApprovals(messages);
      const status: SoloProjectStatus = statusFlags.waiting || pending.length > 0 ? "waiting" : statusFlags.failed ? "failed" : statusFlags.working || statusFlags.queued || statusFlags.teammateWait ? "working" : messages.length > 0 ? "done" : "idle";
      return { project, status, botId: bestBot.id, threadId: bestBot.threadId, linkedName: bestBot.name, pendingDecisions: pending.length, phaseSummary: latestPhaseHint(messages), updatedAt: messages.at(-1)?.at };
    }
    let bestGroup: Group | undefined;
    let bestGroupScore = 0;
    for (const group of groups) {
      const score = matchScore(normalizeHaystack([group.name, group.section]), project.matchers);
      if (score > bestGroupScore) { bestGroupScore = score; bestGroup = group; }
    }
    if (bestGroup) {
      const pending = pendingApprovals(bestGroup.messages);
      const status: SoloProjectStatus = pending.length > 0 ? "waiting" : bestGroup.busyBotId || bestGroup.working ? "working" : bestGroup.messages.length > 0 ? "done" : "idle";
      return { project, status, groupId: bestGroup.id, threadId: bestGroup.threadId, linkedName: bestGroup.name, pendingDecisions: pending.length, phaseSummary: latestPhaseHint(bestGroup.messages), updatedAt: bestGroup.messages.at(-1)?.at };
    }
    return { project, status: "idle", pendingDecisions: 0 };
  });
}
