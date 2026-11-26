import { Fragment, memo, useId, useState, type ReactNode } from "react";
import { AlertTriangle, ArrowRight, Check, ChevronRight, Clock3, Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";
import type { PipelinePhase } from "@/lib/solo-decision-flow";

function PhaseIcon({ status }: { status: PipelinePhase["status"] }) {
  if (status === "done") return <Check size={12} className="shrink-0 text-success" aria-hidden="true" />;
  if (status === "running") return <Loader2 size={12} className="shrink-0 animate-spin text-accent motion-reduce:animate-none" aria-hidden="true" />;
  if (status === "failed") return <AlertTriangle size={12} className="shrink-0 text-danger" aria-hidden="true" />;
  if (status === "waiting") return <Clock3 size={12} className="shrink-0 text-warning" aria-hidden="true" />;
  return <span className="size-1.5 shrink-0 rounded-full bg-ink-tertiary/60" aria-hidden="true" />;
}

function phaseChipTone(status: PipelinePhase["status"]): string {
  switch (status) {
    case "done": return "border-success/25 bg-success/10 text-ink";
    case "running": return "border-accent/35 bg-accent/10 text-ink";
    case "failed": return "border-danger/35 bg-danger/10 text-danger";
    case "waiting": return "border-warning/35 bg-warning/10 text-warning";
    default: return "border-hairline/40 bg-inset text-ink-secondary";
  }
}

/**
 * Single-line high-craft streaming phase capsule for Zero-Token Solo Hub Mode.
 * Collapses multi-step tool runs behind one scannable row while keeping full
 * details 1 click away via an accessible disclosure.
 */
export const PipelineStatusCapsule = memo(function PipelineStatusCapsule({
  phases,
  metaLabel,
  forceOpen = false,
  children,
}: {
  phases: readonly PipelinePhase[];
  metaLabel?: string;
  forceOpen?: boolean;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(forceOpen);
  const detailsId = useId();
  const totalSteps = phases.reduce((sum, phase) => sum + phase.stepCount, 0);
  const hasDetails = Boolean(children);

  if (phases.length === 0) return null;

  return (
    <div className="flex w-full max-w-full flex-col gap-1.5" data-testid="solo-pipeline-capsule">
      <div className="flex min-w-0 justify-start">
        <button
          type="button"
          disabled={!hasDetails}
          aria-expanded={hasDetails ? open : undefined}
          aria-controls={hasDetails ? detailsId : undefined}
          onClick={() => hasDetails && setOpen((prev) => !prev)}
          className={cn(
            "solo-v5-capsule group flex min-h-8 max-w-full items-center gap-1.5 overflow-x-auto rounded-full border border-hairline/45 bg-card px-2.5 py-1 text-[12px] text-ink-secondary transition-colors duration-150 motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
            hasDetails ? "cursor-pointer hover:bg-raised" : "cursor-default",
          )}
        >
          <span className="flex min-w-0 items-center gap-1.5">
            {phases.map((phase, index) => (
              <Fragment key={phase.id}>
                {index > 0 && <ArrowRight size={12} className="shrink-0 text-ink-tertiary rtl:-scale-x-100" aria-hidden="true" />}
                <span
                  data-pipeline-phase={phase.id}
                  data-pipeline-status={phase.status}
                  className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[12px] font-medium leading-4", phaseChipTone(phase.status))}
                >
                  <PhaseIcon status={phase.status} />
                  <span className="max-w-[180px] truncate">{phase.label}</span>
                </span>
              </Fragment>
            ))}
          </span>
          {(metaLabel || totalSteps > 0) && (
            <span className="ms-1 shrink-0 text-[11px] tabular-nums text-ink-tertiary">
              {metaLabel ?? t("soloHub.pipeline.steps", { count: totalSteps })}
            </span>
          )}
          {hasDetails && (
            <ChevronRight
              size={12}
              aria-hidden="true"
              className={cn("ms-0.5 shrink-0 text-ink-tertiary transition-transform duration-150 motion-reduce:transition-none", open && "rotate-90")}
            />
          )}
        </button>
      </div>
      {hasDetails && (
        <div id={detailsId} hidden={!open} className="flex flex-col gap-1 ps-2">
          {open ? children : null}
        </div>
      )}
    </div>
  );
});
