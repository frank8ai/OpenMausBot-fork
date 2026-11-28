import type { Message } from "@/state/store";
import type { Pending } from "@/components/PendingApproval";
import { t } from "@/lib/i18n";

export type FoldedMessageKind = "brief" | "system-prompt" | "build-log";

export interface FoldedMessageInfo {
  kind: FoldedMessageKind;
  lineCount: number;
  charCount: number;
  headline: string;
  badgeKey: "soloHub.fold.brief" | "soloHub.fold.systemPrompt" | "soloHub.fold.buildLog";
}

export type PipelinePhaseStatus = "done" | "running" | "waiting" | "failed" | "pending";

export interface PipelinePhase {
  id: string;
  label: string;
  status: PipelinePhaseStatus;
  stepCount: number;
}

export type DecisionRiskKind = "branch-merge" | "irreversible-delete" | "billing-charge" | "general";

export type DecisionSeverity = "critical" | "high" | "standard";

export interface DecisionRiskInfo {
  kind: DecisionRiskKind;
  severity: DecisionSeverity;
  reversible: boolean;
  target: string;
}

const BRIEF_PATTERN = /(?:【任务\s*Brief|Brief from @|Done when:|物理\s*Done-When|###\s*1\.\s*目标与角色|\[From @[^\]]+·\s*assignment\b)/i;
const SYSTEM_PROMPT_PATTERN = /(?:---\s*BEGIN STANDING INSTRUCTIONS|---\s*BEGIN TEAM MEMORY|\[TEAM ROSTER\]|\[LIVE TEAMMATES\]|<USER_REQUEST>|SOUL\.md\b)/i;
const BUILD_LOG_LINE_PATTERN = /(?:^\s*(?:PASS|FAIL|RUN|ERROR|WARN|INFO|DEBUG|at\s+\S+\s*\(|error TS\d+|vite v\d|pnpm\s|npm\s|git\s|diff --git|@@\s+-\d+|✓|×|❯|\[\d{2}:\d{2}:\d{2}\]))/im;

const LOG_MIN_LINES = 18;
const LOG_MIN_CHARS = 900;
const BRIEF_MIN_CHARS = 240;
const BRIEF_MIN_LINES = 6;

function cleanHeadline(text: string): string {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (const raw of lines) {
    if (raw.startsWith("---") || raw.startsWith("```") || raw.startsWith("[From @")) continue;
    const stripped = raw.replace(/^[#>*`【[\s-]+/, "").replace(/[】\]`]+$/, "").trim();
    if (stripped.length >= 4) {
      return stripped.length > 76 ? `${stripped.slice(0, 75)}…` : stripped;
    }
  }
  const fallback = (lines[0] ?? "").trim();
  return fallback.length > 76 ? `${fallback.slice(0, 75)}…` : fallback;
}

export function classifySoloMessage(text: string): FoldedMessageInfo | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const lines = trimmed.split(/\r?\n/);
  const lineCount = lines.length;
  const charCount = trimmed.length;

  if (SYSTEM_PROMPT_PATTERN.test(trimmed) && (lineCount >= 4 || charCount >= 180)) {
    return { kind: "system-prompt", lineCount, charCount, headline: cleanHeadline(trimmed), badgeKey: "soloHub.fold.systemPrompt" };
  }

  if (BRIEF_PATTERN.test(trimmed) && (lineCount >= BRIEF_MIN_LINES || charCount >= BRIEF_MIN_CHARS)) {
    return { kind: "brief", lineCount, charCount, headline: cleanHeadline(trimmed), badgeKey: "soloHub.fold.brief" };
  }

  const fenceCount = (trimmed.match(/^```/gm) ?? []).length;
  const looksLikeLog = BUILD_LOG_LINE_PATTERN.test(trimmed) || fenceCount >= 2;
  if ((lineCount >= LOG_MIN_LINES && looksLikeLog) || (charCount >= LOG_MIN_CHARS && lineCount >= 24)) {
    return { kind: "build-log", lineCount, charCount, headline: cleanHeadline(trimmed), badgeKey: "soloHub.fold.buildLog" };
  }

  return null;
}

interface StageBucket {
  id: "audit" | "build" | "verify" | "ship";
  labelKey: "soloHub.phase.audit" | "soloHub.phase.build" | "soloHub.phase.verify" | "soloHub.phase.ship";
  pattern: RegExp;
}

const STAGE_BUCKETS: readonly StageBucket[] = [
  { id: "audit", labelKey: "soloHub.phase.audit", pattern: /\b(read|view|list|find|search|grep|glob|inspect|audit|status|diff|log|snapshot|cat|ls)\b/i },
  { id: "build", labelKey: "soloHub.phase.build", pattern: /\b(edit|write|create|patch|replace|format|generate|compile|build|install|apply|refactor)\b/i },
  { id: "verify", labelKey: "soloHub.phase.verify", pattern: /\b(test|vitest|jest|pytest|lint|oxlint|tsc|typecheck|check|verify|smoke|e2e|contrast|i18n)\b/i },
  { id: "ship", labelKey: "soloHub.phase.ship", pattern: /\b(git\s+(commit|push|merge|pr)|gh\s+pr|pull\s+request|deploy|publish|release)\b/i },
];

const EXPLICIT_PHASE_REGEX = /\[([^\]]{2,48})\]/g;

function parsePhaseStatusFromText(raw: string): PipelinePhaseStatus {
  if (/✅|✓|done|pass|passed|complete|全绿|通过|完成/i.test(raw)) return "done";
  if (/❌|✗|fail|failed|error|失败|报错/i.test(raw)) return "failed";
  if (/⏸|⚠|wait|waiting|pending approval|待审批|等待/i.test(raw)) return "waiting";
  if (/⚙|⏳|running|working|in progress|进行中|开发中|审计中|质保中/i.test(raw)) return "running";
  return "pending";
}

export function parseExplicitPipelinePhases(text: string): PipelinePhase[] {
  if (!/[➔→➜⟶>]/.test(text)) return [];
  const matches = [...text.matchAll(EXPLICIT_PHASE_REGEX)];
  if (matches.length < 2) return [];
  return matches.slice(0, 5).map((match, index) => {
    const raw = match[1]!.trim();
    const status = parsePhaseStatusFromText(raw);
    const cleaned = raw.replace(/(?:✅|✓|❌|✗|⚙️|⚙|⏳|⏸|⚠️|⚠)/g, "").trim();
    return { id: `explicit-${index + 1}`, label: cleaned || raw, status, stepCount: 1 };
  });
}

function classifyToolStage(message: Message): StageBucket {
  const haystack = [message.tool?.name, message.tool?.label, message.tool?.summary, message.tool?.input].filter(Boolean).join(" ");
  for (let i = STAGE_BUCKETS.length - 1; i >= 0; i--) {
    const bucket = STAGE_BUCKETS[i]!;
    if (bucket.pattern.test(haystack)) return bucket;
  }
  return STAGE_BUCKETS[1]!;
}

export function extractPipelinePhases(messages: readonly Message[], liveToolIds?: ReadonlySet<string>): PipelinePhase[] {
  for (let i = messages.length - 1; i >= 0; i--) {
    const text = messages[i]?.text;
    if (text) {
      const explicit = parseExplicitPipelinePhases(text);
      if (explicit.length >= 2) return explicit;
    }
  }
  const map = new Map<StageBucket["id"], { bucket: StageBucket; steps: Message[] }>();
  for (const message of messages) {
    if (!message.tool) continue;
    const bucket = classifyToolStage(message);
    const existing = map.get(bucket.id);
    if (existing) existing.steps.push(message);
    else map.set(bucket.id, { bucket, steps: [message] });
  }
  const ordered = STAGE_BUCKETS.map((bucket) => map.get(bucket.id)).filter((entry): entry is { bucket: StageBucket; steps: Message[] } => Boolean(entry));
  return ordered.map(({ bucket, steps }) => {
    const hasFailed = steps.some((step) => step.tool?.ok === false);
    const hasLive = steps.some((step) => step.tool?.ok === undefined && liveToolIds?.has(step.id));
    const hasPending = steps.some((step) => step.tool?.ok === undefined);
    const status: PipelinePhaseStatus = hasFailed ? "failed" : hasLive ? "running" : hasPending ? "waiting" : "done";
    return { id: bucket.id, label: t(bucket.labelKey), status, stepCount: steps.length };
  });
}

const BRANCH_MERGE_PATTERN = /(?:git\s+merge\b|gh\s+pr\s+merge\b|git\s+push\b[^\n]*\b(?:main|master)\b|merge\s+pull\s+request|分支合并|合并主干)/i;
const IRREVERSIBLE_DELETE_PATTERN = /(?:rm\s+-rf?\b|remove-item\b[^\n]*-recurse|del\s+\/[sfq]|drop\s+(?:table|database)\b|truncate\s+table\b|git\s+branch\s+-D\b|git\s+reset\s+--hard\b|git\s+push\b[^\n]*--force|delete\s+(?:bot|repo|repository|branch|database|account)|purge\b|不可逆删除|永久删除)/i;
const BILLING_CHARGE_PATTERN = /(?:stripe\b|charge\b|capture\b|payment\b|billing\b|invoice\b|subscribe\b|subscription\b|purchase\b|checkout\b|top-?up\b|credit\s*card|wallet\b|agentcard|whop\b|充值|扣款|付款|计费)/i;

function truncateTarget(raw: string): string {
  const first = raw.trim().split(/\r?\n/, 1)[0]?.trim() ?? "";
  return first.length > 96 ? `${first.slice(0, 95)}…` : first;
}

export function classifyDecisionRisk(pending: Pending): DecisionRiskInfo {
  const card = pending.message.card;
  const rawDetail = (pending.commandAllowlist?.command ?? pending.detail ?? card?.subtitle ?? "").trim();
  const haystack = [pending.tool, card?.title, card?.subtitle, rawDetail, pending.held].filter(Boolean).join("\n");
  const target = truncateTarget(rawDetail || card?.title || pending.tool);
  if (card?.teamSetupRequest?.deletion || IRREVERSIBLE_DELETE_PATTERN.test(haystack)) {
    return { kind: "irreversible-delete", severity: "critical", reversible: false, target };
  }
  if (BILLING_CHARGE_PATTERN.test(haystack)) {
    return { kind: "billing-charge", severity: "critical", reversible: false, target };
  }
  if (BRANCH_MERGE_PATTERN.test(haystack)) {
    return { kind: "branch-merge", severity: "high", reversible: false, target };
  }
  return { kind: "general", severity: "standard", reversible: true, target };
}
