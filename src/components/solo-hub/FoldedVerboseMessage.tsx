import { memo, useId, useState, type ReactNode } from "react";
import { ChevronRight, FileText, Shield, Terminal } from "lucide-react";
import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";
import { useSoloHubMode } from "@/lib/solo-hub";
import { classifySoloMessage, parseExplicitPipelinePhases, type FoldedMessageInfo } from "@/lib/solo-decision-flow";
import { PipelineStatusCapsule } from "./PipelineStatusCapsule";

function FoldIcon({ kind }: { kind: FoldedMessageInfo["kind"] }) {
  if (kind === "system-prompt") return <Shield size={13} className="shrink-0 text-ink-secondary" aria-hidden="true" />;
  if (kind === "build-log") return <Terminal size={13} className="shrink-0 text-ink-secondary" aria-hidden="true" />;
  return <FileText size={13} className="shrink-0 text-accent" aria-hidden="true" />;
}

export const FoldedVerboseMessage = memo(function FoldedVerboseMessage({
  info,
  defaultOpen = false,
  children,
}: {
  info: FoldedMessageInfo;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();

  return (
    <div className="flex w-full max-w-full flex-col gap-1.5" data-testid="solo-folded-message" data-fold-kind={info.kind}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((prev) => !prev)}
        className="solo-v5-fold-pill flex min-h-8 w-full max-w-[600px] items-center gap-2 rounded-xl border border-hairline/45 bg-inset/80 px-2.5 py-1.5 text-start text-[12px] text-ink-secondary transition-colors duration-150 hover:bg-raised hover:text-ink motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        <FoldIcon kind={info.kind} />
        <span className="shrink-0 rounded-full border border-hairline/40 bg-card px-1.5 py-0.5 text-[11px] font-medium leading-3 text-ink">
          {t(info.badgeKey)}
        </span>
        <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-ink">{info.headline}</span>
        <span className="shrink-0 text-[11px] tabular-nums text-ink-tertiary">
          {t("soloHub.fold.lines", { count: info.lineCount })}
        </span>
        <ChevronRight
          size={13}
          aria-hidden="true"
          className={cn("shrink-0 text-ink-tertiary transition-transform duration-150 motion-reduce:transition-none", open && "rotate-90")}
        />
      </button>
      <div id={panelId} hidden={!open} className="min-w-0">
        {open ? children : null}
      </div>
    </div>
  );
});

export function SoloMessageEnvelope({
  text,
  isUser = false,
  children,
}: {
  text: string;
  isUser?: boolean;
  children: ReactNode;
}) {
  const soloHub = useSoloHubMode();
  if (!soloHub || !text.trim()) return <>{children}</>;
  if (!isUser) {
    const explicitPhases = parseExplicitPipelinePhases(text);
    if (explicitPhases.length >= 2) {
      return <PipelineStatusCapsule phases={explicitPhases}>{children}</PipelineStatusCapsule>;
    }
  }
  const folded = classifySoloMessage(text);
  if (folded) {
    return <FoldedVerboseMessage info={folded}>{children}</FoldedVerboseMessage>;
  }
  return <>{children}</>;
}