import { Fragment, memo, useId, useState, type ReactNode } from "react";
import { AlertTriangle, ArrowRight, Check, ChevronRight, Clock3, Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";
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
  const panelId = useId();

  if (phases.length === 0) return <>{children}</>;

  return (
    <div className="flex w-full max-w-full flex-col gap-1.5" data-testid="solo-pipeline-capsule">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((prev) => !prev)}
        className="solo-v5-capsule-strip flex min-h-8 w-full max-w-[640px] items-center gap-1.5 overflow-x-auto rounded-xl border border-hairline/45 bg-inset/85 px-2.5 py-1 text-start text-[12px] text-ink transition-colors duration-150 hover:bg-raised motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
          {phases.map((phase, idx) => (
            <Fragment key={phase.id}>
              <span
                data-testid={`phase-${phase.id}`}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-4",
                  phaseChipTone(phase.status),
                )}
              >
                <PhaseIcon status={phase.status} />
                <span className="truncate max-w-[140px]">{phase.label}</span>
                {typeof phase.stepCount === "number" && phase.stepCount > 1 && (
                  <span className="text-[10px] tabular-nums text-ink-tertiary">×{phase.stepCount}</span>
                )}
              </span>
              {idx < phases.length - 1 && (
                <ArrowRight size={10} className="shrink-0 text-ink-tertiary/70" aria-hidden="true" />
              )}
            </Fragment>
          ))}
        </div>
        {metaLabel && (
          <span className="shrink-0 text-[11px] tabular-nums text-ink-tertiary">{metaLabel}</span>
        )}
        {children && (
          <ChevronRight
            size={13}
            aria-hidden="true"
            className={cn("shrink-0 text-ink-tertiary transition-transform duration-150 motion-reduce:transition-none", open && "rotate-90")}
          />
        )}
      </button>
      {children && (
        <div id={panelId} hidden={!open} className="min-w-0">
          {open ? children : null}
        </div>
      )}
    </div>
  );
});