import { detectUnverifiedDispatchClaim, type DispatchClaimVerdict } from "./chat-announcement.ts";

export const MAX_DISPATCH_NUDGES = 2;
export const DISPATCH_TOOL_NAMES = new Set(["agents_coordinate_bots", "coordinate_bots"]);
export const NUDGE_UNVERIFIED_DISPATCH =
  "[SYSTEM HARD GATE] 检测到未经验证的派发声称。请如实输出实际执行状态，撤回虚假或未经工具确认的派工辞令，切勿编造派发状态。";

export interface VerifiedDispatchReceipt {
  readonly botId: string;
  readonly botName?: string;
  readonly outcome: string;
  readonly requestId?: string;
  readonly toolName: string;
}

export interface DispatchReconciliationResult {
  readonly isUnverified: boolean;
  readonly matchedEvidence?: string;
  readonly reason?: string;
  readonly claimedTargetCount: number;
  readonly verifiedTargetCount: number;
  readonly claimVerdict?: DispatchClaimVerdict;
}

export function isDispatchTool(toolName: string, title?: string): boolean {
  return DISPATCH_TOOL_NAMES.has(toolName) || (title !== undefined && DISPATCH_TOOL_NAMES.has(title));
}

export function parseVerifiedReceipts(
  toolName: string,
  title: string | undefined,
  resultText: string
): VerifiedDispatchReceipt[] {
  if (!isDispatchTool(toolName, title)) return [];

  try {
    const parsed = JSON.parse(resultText);
    if (!parsed || typeof parsed !== "object") return [];
    const root = (parsed.body && typeof parsed.body === "object") ? parsed.body : parsed;
    if (root.instructionOnly === true) return [];
    if (root.error && !Array.isArray(root.receipts)) return [];
    if (!Array.isArray(root.receipts)) return [];

    const verified: VerifiedDispatchReceipt[] = [];
    for (const r of root.receipts) {
      if (!r || typeof r !== "object") continue;
      if (r.instructionOnly === true) continue;
      if (r.outcome === "failed") continue;
      const botId = typeof r.botId === "string" ? r.botId.trim() : "";
      if (!botId) continue;
      const botName = typeof r.botName === "string" ? r.botName.trim() : undefined;
      verified.push({
        botId,
        botName,
        outcome: typeof r.outcome === "string" ? r.outcome : "queued",
        requestId: typeof r.requestId === "string" ? r.requestId : undefined,
        toolName,
      });
    }
    return verified;
  } catch {
    return [];
  }
}

export function reconcileDispatchClaims(
  completionText: string,
  verifiedReceipts: readonly VerifiedDispatchReceipt[]
): DispatchReconciliationResult {
  const claim = detectUnverifiedDispatchClaim(completionText);
  if (!claim.claimed) {
    return {
      isUnverified: false,
      claimedTargetCount: 0,
      verifiedTargetCount: verifiedReceipts.length,
      claimVerdict: claim,
    };
  }

  // Deduplicate verified targets by unique botId
  const verifiedBotIds = new Set<string>();
  const verifiedNames = new Set<string>();
  for (const r of verifiedReceipts) {
    if (r.botId) verifiedBotIds.add(r.botId.toLowerCase());
    if (r.botName) verifiedNames.add(r.botName.toLowerCase());
  }
  const verifiedTargetCount = verifiedBotIds.size;

  if (verifiedTargetCount === 0) {
    return {
      isUnverified: true,
      matchedEvidence: claim.matchedEvidence ?? undefined,
      reason: `reply claimed "${claim.matchedEvidence}" with 0 verified receipts`,
      claimedTargetCount: Math.max(claim.targets.length, claim.claims.length, 1),
      verifiedTargetCount: 0,
      claimVerdict: claim,
    };
  }

  // Extract unique claimed targets
  const claimedNamedTargets = new Set<string>(claim.targets ?? []);
  if (claimedNamedTargets.size === 0 && claim.claims.length > 0) {
    for (const c of claim.claims) {
      const matches = c.matchAll(/【([^】\n]{2,16})】/gu);
      for (const m of matches) {
        const name = m[1].trim();
        if (name) claimedNamedTargets.add(name);
      }
    }
  }

  let unnamedClaims = 0;
  for (const c of claim.claims) {
    if (!/【[^】\n]{2,16}】/u.test(c)) {
      unnamedClaims += 1;
    }
  }

  const claimedTargetCount = Math.max(claimedNamedTargets.size + unnamedClaims, 1);

  let isUnverified = claimedTargetCount > verifiedTargetCount;

  // If named targets exist and verified receipts have names, check coverage
  if (!isUnverified && claimedNamedTargets.size > 0 && verifiedNames.size > 0) {
    for (const target of claimedNamedTargets) {
      const targetLower = target.toLowerCase();
      const matched = Array.from(verifiedNames).some(name => name === targetLower || targetLower.includes(name) || name.includes(targetLower)) ||
                      Array.from(verifiedBotIds).some(id => id === targetLower || targetLower.includes(id) || id.includes(targetLower));
      if (!matched) {
        isUnverified = true;
        break;
      }
    }
  }

  return {
    isUnverified,
    matchedEvidence: claim.matchedEvidence ?? undefined,
    reason: isUnverified
      ? `claimed ${claimedTargetCount} target(s) with ${verifiedTargetCount} verified receipt(s)`
      : undefined,
    claimedTargetCount,
    verifiedTargetCount,
    claimVerdict: claim,
  };
}
