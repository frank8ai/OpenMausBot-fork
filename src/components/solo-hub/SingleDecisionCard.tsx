import { memo, useId, useState } from "react";
import { AlertTriangle, Check, ChevronDown, CreditCard, GitMerge, Loader2, RotateCcw, ShieldCheck, Trash2, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { t, tFromServer } from "@/lib/i18n";
import { type Bot } from "@/state/store";
import { useStoreDispatch } from "@/state/store-select";
import { isSkillApproval, type Pending } from "@/components/PendingApproval";
import { SkillRequestPreview } from "@/components/SkillRequestPreview";
import { reviewedSkillSha256 } from "../../../shared/skill-request";
import { classifyDecisionRisk, type DecisionRiskInfo } from "@/lib/solo-decision-flow";

export type SoloDecisionAction = "approve" | "reject" | "rework";

function RiskIcon({ kind }: { kind: DecisionRiskInfo["kind"] }) {
  if (kind === "branch-merge") return <GitMerge size={14} className="shrink-0" aria-hidden="true" />;
  if (kind === "irreversible-delete") return <Trash2 size={14} className="shrink-0" aria-hidden="true" />;
  if (kind === "billing-charge") return <CreditCard size={14} className="shrink-0" aria-hidden="true" />;
  return <ShieldCheck size={14} className="shrink-0" aria-hidden="true" />;
}

function riskTitle(kind: DecisionRiskInfo["kind"]): string {
  switch (kind) {
    case "branch-merge": return t("soloHub.decision.risk.branchMerge");
    case "irreversible-delete": return t("soloHub.decision.risk.irreversibleDelete");
    case "billing-charge": return t("soloHub.decision.risk.billingCharge");
    default: return t("soloHub.decision.risk.general");
  }
}

function riskBadgeTone(severity: DecisionRiskInfo["severity"]): string {
  if (severity === "critical") return "border-danger/35 bg-danger/10 text-danger";
  if (severity === "high") return "border-warning/35 bg-warning/10 text-warning";
  return "border-accent/35 bg-accent/10 text-accent";
}

export interface SingleDecisionCardProps {
  pending: Pending;
  threadId: string;
  count: number;
  index?: number;
  bot?: Bot;
  onCancelTurn: () => void;
  onDecide?: (action: SoloDecisionAction, pending: Pending) => void;
}

export const SingleDecisionCard = memo(function SingleDecisionCard({
  pending,
  threadId,
  count,
  index = 0,
  bot,
  onDecide,
}: SingleDecisionCardProps) {
  const dispatch = useStoreDispatch();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [submittedAction, setSubmittedAction] = useState<SoloDecisionAction | null>(null);
  const [errorAction, setErrorAction] = useState<{ action: SoloDecisionAction; message: string } | null>(null);
  const detailsId = useId();

  const risk = classifyDecisionRisk(pending);
  const isSkill = isSkillApproval(pending);
  const skill = pending.message.card?.skillRequest;
  const reviewedSha256 = skill ? reviewedSkillSha256(skill) : undefined;
  const approveDisabled = submittedAction !== null || (isSkill && !reviewedSha256);
  const heldNote = tFromServer(pending.heldCode, pending.held);
  const rawDetail = (pending.commandAllowlist?.command ?? pending.detail ?? pending.message.card?.subtitle ?? "").trim();
  const hasDetails = Boolean(rawDetail || skill);
  const safeFocusReject = risk.severity === "critical" || !risk.reversible;

  const execute = (action: SoloDecisionAction) => {
    setErrorAction(null);
    setSubmittedAction(action);
    try {
      if (onDecide) {
        onDecide(action, pending);
        return;
      }
      const behavior = action === "approve" ? "allow" : "deny";
      const message = action === "rework" ? t("soloHub.decision.reworkPrompt") : action === "reject" ? "Denied by the user." : undefined;
      dispatch({
        type: "decideRequest",
        threadId,
        requestId: pending.requestId,
        behavior,
        message,
        reviewedSha256: behavior === "allow" ? reviewedSha256 : undefined,
        onError: (errMsg) => {
          setSubmittedAction(null);
          setErrorAction({ action, message: errMsg || t("soloHub.decision.failedFallback") });
        },
      });
    } catch (error) {
      setSubmittedAction(null);
      setErrorAction({ action, message: error instanceof Error ? error.message : t("soloHub.decision.failedFallback") });
    }
  };

  return (
    <div
      role="region"
      aria-label={t("soloHub.decision.aria")}
      data-testid="solo-single-decision-card"
      data-decision-risk={risk.kind}
      data-decision-severity={risk.severity}
      data-ask-card="approval"
      className="solo-v5-decision-card px-4 pb-3.5 pt-3"
    >
      <div className="flex min-w-0 items-center gap-2" aria-live="polite">
        <span className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[12px] font-semibold leading-4", riskBadgeTone(risk.severity))}>
          <RiskIcon kind={risk.kind} />
          <span>{riskTitle(risk.kind)}</span>
        </span>
        {!risk.reversible && (
          <span className="shrink-0 rounded-full border border-danger/25 bg-danger/10 px-2 py-0.5 text-[11px] font-medium leading-4 text-danger">
            {t("soloHub.decision.irreversible")}
          </span>
        )}
        {bot?.name && (
          <span className="min-w-0 truncate text-[12px] text-ink-secondary">{bot.name}</span>
        )}
        <div className="ms-auto flex shrink-0 items-center gap-1.5">
          {count > 1 && (
            <span data-testid="solo-decision-queue" className="rounded-full bg-ink/[0.06] px-2 text-[11px] font-medium leading-5 tabular-nums text-ink-secondary">
              {t("approval.position", { index: index + 1, count })}
            </span>
          )}
          {hasDetails && (
            <button
              type="button"
              aria-expanded={detailsOpen}
              aria-controls={detailsId}
              onClick={() => setDetailsOpen((prev) => !prev)}
              className="inline-flex h-7 items-center gap-1 rounded-full border border-hairline/40 bg-inset px-2 text-[11px] font-medium text-ink-secondary transition-colors duration-150 hover:bg-raised hover:text-ink motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              <span>{t(detailsOpen ? "approval.applied.hideDetails" : "approval.applied.details")}</span>
              <ChevronDown size={13} aria-hidden="true" className={cn("transition-transform duration-150 motion-reduce:transition-none", detailsOpen && "rotate-180")} />
            </button>
          )}
        </div>
      </div>

      <div className="mt-2 flex flex-col gap-1.5">
        <p className="text-[14px] font-semibold leading-5 text-ink">
          {pending.message.card?.title || t("soloHub.decision.headline", { target: risk.target })}
        </p>
        {risk.target && (
          <div
            tabIndex={0}
            aria-label={t("approval.aria.reviewDetails")}
            className="max-h-20 overflow-auto rounded-xl border border-hairline/40 bg-inset px-3 py-2 font-mono text-[12px] leading-[18px] text-ink-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            {risk.target}
          </div>
        )}
        {heldNote && (
          <p className="flex items-start gap-1.5 text-[12px] leading-[18px] text-warning">
            <AlertTriangle size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>{heldNote}</span>
          </p>
        )}
      </div>

      {errorAction && (
        <div role="alert" data-testid="solo-decision-error" className="mt-2.5 flex items-center justify-between gap-2 rounded-xl border border-danger/35 bg-danger/10 px-3 py-2 text-[12px] text-danger">
          <span className="min-w-0 truncate">{errorAction.message}</span>
          <button
            type="button"
            onClick={() => execute(errorAction.action)}
            className="shrink-0 rounded-full border border-danger/40 bg-card px-2.5 py-1 text-[12px] font-medium text-danger transition-colors duration-150 hover:bg-raised motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            {t("soloHub.decision.retry")}
          </button>
        </div>
      )}

      {submittedAction ? (
        <div role="status" data-testid="solo-decision-optimistic" className="mt-3 flex items-center gap-2 rounded-xl border border-accent/30 bg-accent/10 px-3 py-2 text-[12px] text-ink">
          <Loader2 size={13} className="shrink-0 animate-spin text-accent motion-reduce:animate-none" aria-hidden="true" />
          <span className="truncate font-medium">
            {submittedAction === "approve" ? t("soloHub.decision.applyingApprove") : submittedAction === "rework" ? t("soloHub.decision.applyingRework") : t("soloHub.decision.applyingReject")}
          </span>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            data-testid="solo-decision-reject"
            autoFocus={safeFocusReject}
            onClick={() => execute("reject")}
            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-hairline/55 bg-inset px-3 text-[13px] font-medium text-ink-secondary transition-colors duration-150 hover:border-danger/40 hover:bg-danger/10 hover:text-danger motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            <X size={13} aria-hidden="true" />
            <span>{t("soloHub.decision.reject")}</span>
          </button>
          <button
            type="button"
            data-testid="solo-decision-rework"
            onClick={() => execute("rework")}
            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-hairline/55 bg-card px-3 text-[13px] font-medium text-ink transition-colors duration-150 hover:bg-raised motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            <RotateCcw size={13} aria-hidden="true" />
            <span>{t("soloHub.decision.rework")}</span>
          </button>
          <button
            type="button"
            data-testid="solo-decision-approve"
            disabled={approveDisabled}
            onClick={() => execute("approve")}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold transition-colors duration-150 motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-45",
              risk.severity === "critical" ? "bg-danger text-app hover:opacity-90" : "bg-accent text-app hover:opacity-90",
            )}
          >
            <Check size={13} aria-hidden="true" />
            <span>{t("soloHub.decision.approve")}</span>
          </button>
        </div>
      )}

      {hasDetails && (
        <div id={detailsId} hidden={!detailsOpen} className="mt-2.5 flex flex-col gap-2">
          {rawDetail && (
            <pre
              tabIndex={0}
              aria-label={t("approval.aria.reviewDetails")}
              className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-hairline/40 bg-inset px-3 py-2 font-mono text-[12px] leading-[18px] text-ink-secondary"
            >
              {rawDetail}
            </pre>
          )}
          {skill && <div data-testid="solo-skill-preview"><SkillRequestPreview request={skill} /></div>}
        </div>
      )}
    </div>
  );
});