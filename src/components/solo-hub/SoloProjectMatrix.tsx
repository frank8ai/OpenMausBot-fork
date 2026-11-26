import { memo, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronRight, CircleDot, Layers, Loader2, ShieldAlert, Sparkles } from "lucide-react";
import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";
import { openBot, type Bot, type Group } from "@/state/store";
import { sameFields, useStoreDispatch, useStoreSelector } from "@/state/store-select";
import {
  deriveSoloProjects,
  setSoloHubSurface,
  syncSoloHubDocument,
  toggleSoloHubMode,
  useSoloHubMode,
  useSoloHubSurface,
  type SoloHubSurface,
  type SoloProjectSnapshot,
  type SoloProjectStatus,
} from "@/lib/solo-hub";

const SURFACE_ORDER: readonly SoloHubSurface[] = ["auto", "washi-celadon", "linear-alabaster"];

function nextSurface(current: SoloHubSurface): SoloHubSurface {
  const index = SURFACE_ORDER.indexOf(current);
  return SURFACE_ORDER[(index + 1) % SURFACE_ORDER.length] ?? "auto";
}

function surfaceLabel(surface: SoloHubSurface): string {
  if (surface === "washi-celadon") return t("soloHub.surface.washiCeladon");
  if (surface === "linear-alabaster") return t("soloHub.surface.linearAlabaster");
  return t("soloHub.surface.auto");
}

function ProjectStatusGlyph({ status }: { status: SoloProjectStatus }) {
  if (status === "working") {
    return <Loader2 size={13} className="shrink-0 animate-spin text-accent motion-reduce:animate-none" aria-hidden="true" />;
  }
  if (status === "waiting") {
    return <ShieldAlert size={13} className="shrink-0 text-warning" aria-hidden="true" />;
  }
  if (status === "failed") {
    return <AlertTriangle size={13} className="shrink-0 text-danger" aria-hidden="true" />;
  }
  if (status === "done") {
    return <CheckCircle2 size={13} className="shrink-0 text-success" aria-hidden="true" />;
  }
  return <CircleDot size={13} className="shrink-0 text-ink-tertiary" aria-hidden="true" />;
}

function statusLabel(status: SoloProjectStatus): string {
  switch (status) {
    case "working": return t("soloHub.status.working");
    case "waiting": return t("soloHub.status.waiting");
    case "failed": return t("soloHub.status.failed");
    case "done": return t("soloHub.status.done");
    default: return t("soloHub.status.idle");
  }
}

export function SoloHubDocumentSync() {
  const enabled = useSoloHubMode();
  const surface = useSoloHubSurface();
  useEffect(() => {
    syncSoloHubDocument(enabled, surface);
  }, [enabled, surface]);
  return null;
}

export interface SoloProjectMatrixViewProps {
  snapshots: readonly SoloProjectSnapshot[];
  enabled: boolean;
  surface: SoloHubSurface;
  activeBotId?: string;
  activeGroupId?: string;
  compact?: boolean;
  loading?: boolean;
  onToggleMode: () => void;
  onCycleSurface: () => void;
  onSelectProject: (snapshot: SoloProjectSnapshot) => void;
}

export const SoloProjectMatrixView = memo(function SoloProjectMatrixView({
  snapshots,
  enabled,
  surface,
  activeBotId,
  activeGroupId,
  compact = false,
  loading = false,
  onToggleMode,
  onCycleSurface,
  onSelectProject,
}: SoloProjectMatrixViewProps) {
  const [unlinkedHint, setUnlinkedHint] = useState<string | null>(null);
  const pendingTotal = snapshots.reduce((sum, item) => sum + item.pendingDecisions, 0);
  const activeCount = snapshots.filter((item) => item.status === "working" || item.status === "waiting").length;

  if (compact) {
    return (
      <div className="mb-1.5 flex flex-col items-center gap-1" data-testid="solo-hub-compact">
        <button
          type="button"
          aria-pressed={enabled}
          aria-label={t("soloHub.toggleAria")}
          title={enabled ? t("soloHub.modeActive") : t("soloHub.modeEnable")}
          onClick={onToggleMode}
          className={cn(
            "relative flex size-10 items-center justify-center rounded-xl border transition-colors duration-150 motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
            enabled ? "border-accent/40 bg-accent/15 text-accent" : "border-hairline/40 bg-card text-ink-secondary hover:bg-raised hover:text-ink",
          )}
        >
          <Layers size={16} aria-hidden="true" />
          {pendingTotal > 0 && (
            <span className="absolute -end-1 -top-1 flex min-w-4 items-center justify-center rounded-full bg-warning px-1 text-[11px] font-semibold leading-4 tabular-nums text-app">
              {pendingTotal}
            </span>
          )}
        </button>
      </div>
    );
  }

  return (
    <section
      aria-label={t("soloHub.matrixAria")}
      data-testid="solo-project-matrix"
      data-solo-active={enabled ? "true" : "false"}
      className={cn(
        "solo-v5-matrix mb-2 flex flex-col gap-1.5 rounded-2xl border p-2 transition-colors duration-150 motion-reduce:transition-none",
        enabled ? "border-hairline/55 bg-card" : "border-hairline/35 bg-panel/70",
      )}
    >
      <div className="flex min-w-0 items-center justify-between gap-1.5 px-1">
        <button
          type="button"
          aria-pressed={enabled}
          data-testid="solo-hub-toggle"
          onClick={onToggleMode}
          className={cn(
            "inline-flex min-w-0 items-center gap-1.5 rounded-full px-2 py-1 text-[12px] font-semibold leading-4 transition-colors duration-150 motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
            enabled ? "bg-accent/15 text-accent" : "text-ink-secondary hover:bg-raised hover:text-ink",
          )}
        >
          <Layers size={13} className="shrink-0" aria-hidden="true" />
          <span className="truncate">{t("soloHub.title")}</span>
          {pendingTotal > 0 && (
            <span className="rounded-full bg-warning/20 px-1.5 text-[11px] font-semibold tabular-nums text-warning">
              {pendingTotal}
            </span>
          )}
        </button>
        {enabled ? (
          <button
            type="button"
            data-testid="solo-surface-toggle"
            onClick={onCycleSurface}
            title={t("soloHub.surface.cycleHint")}
            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-hairline/40 bg-inset px-2 py-0.5 text-[11px] font-medium text-ink-secondary transition-colors duration-150 hover:bg-raised hover:text-ink motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            <Sparkles size={11} aria-hidden="true" />
            <span>{surfaceLabel(surface)}</span>
          </button>
        ) : (
          <span className="shrink-0 text-[11px] tabular-nums text-ink-tertiary">
            {t("soloHub.compactCount", { count: snapshots.length })}
          </span>
        )}
      </div>

      {enabled && (
        <div className="flex flex-col gap-1" role="list" aria-label={t("soloHub.projectListAria")}>
          {loading ? (
            Array.from({ length: 5 }, (_, index) => (
              <div
                key={index}
                data-testid="solo-project-skeleton"
                aria-hidden="true"
                className="flex h-11 items-center gap-2 rounded-xl border border-hairline/25 bg-inset/60 px-2.5 animate-pulse motion-reduce:animate-none"
              >
                <div className="size-6 shrink-0 rounded-lg bg-raised" />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="h-3 w-24 rounded bg-raised" />
                  <div className="h-2.5 w-32 rounded bg-raised/70" />
                </div>
              </div>
            ))
          ) : (
            snapshots.map((snapshot) => {
              const selected = Boolean((snapshot.botId && snapshot.botId === activeBotId) || (snapshot.groupId && snapshot.groupId === activeGroupId));
              const linked = Boolean(snapshot.botId || snapshot.groupId);
              const subtitle = snapshot.phaseSummary ?? t(snapshot.project.roleKey);
              return (
                <button
                  key={snapshot.project.id}
                  type="button"
                  role="listitem"
                  data-testid={`solo-project-${snapshot.project.id}`}
                  data-solo-status={snapshot.status}
                  aria-current={selected ? "page" : undefined}
                  onClick={() => {
                    if (linked) {
                      setUnlinkedHint(null);
                      onSelectProject(snapshot);
                    } else {
                      setUnlinkedHint(t("soloHub.unlinkedHint", { name: snapshot.project.name }));
                    }
                  }}
                  className={cn(
                    "solo-v5-project-row flex min-h-11 w-full items-center gap-2 rounded-xl border px-2 py-1.5 text-start transition-colors duration-150 motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
                    selected
                      ? "border-accent/40 bg-accent/10 text-ink"
                      : "border-transparent bg-inset/45 text-ink hover:border-hairline/40 hover:bg-raised",
                  )}
                >
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-lg border border-hairline/40 bg-card text-[11px] font-semibold tabular-nums text-ink-secondary">
                    {snapshot.project.shortName}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate text-[13px] font-medium leading-4 text-ink">{snapshot.project.name}</span>
                      <ProjectStatusGlyph status={snapshot.status} />
                    </span>
                    <span className="truncate text-[11px] leading-4 text-ink-tertiary">{subtitle}</span>
                  </span>
                  {snapshot.pendingDecisions > 0 ? (
                    <span
                      title={t("soloHub.pendingBadgeTitle", { count: snapshot.pendingDecisions })}
                      className="shrink-0 rounded-full bg-warning/20 px-1.5 py-0.5 text-[11px] font-semibold leading-3 tabular-nums text-warning"
                    >
                      {snapshot.pendingDecisions}
                    </span>
                  ) : linked ? (
                    <ChevronRight size={13} className="shrink-0 text-ink-tertiary rtl:-scale-x-100" aria-hidden="true" />
                  ) : (
                    <span className="shrink-0 text-[11px] text-ink-tertiary">{statusLabel(snapshot.status)}</span>
                  )}
                </button>
              );
            })
          )}
          <div className="flex items-center justify-between px-1 pt-0.5 text-[11px] text-ink-tertiary">
            <span className="tabular-nums">{t("soloHub.activeSummary", { active: activeCount, total: snapshots.length })}</span>
            <span>{t("soloHub.zeroTokenTag")}</span>
          </div>
          {unlinkedHint && (
            <p role="status" className="rounded-lg border border-hairline/35 bg-inset px-2 py-1 text-[11px] leading-4 text-ink-secondary">
              {unlinkedHint}
            </p>
          )}
        </div>
      )}
    </section>
  );
});

export const SoloProjectMatrix = memo(function SoloProjectMatrix({
  compact = false,
  onPicked,
}: {
  compact?: boolean;
  onPicked?: () => void;
}) {
  const dispatch = useStoreDispatch();
  const enabled = useSoloHubMode();
  const surface = useSoloHubSurface();
  const { bots, groups, pendingQueued, selectedId, activeView, config } = useStoreSelector(
    (state) => ({
      bots: state.bots,
      groups: state.groups,
      pendingQueued: state.pendingQueued,
      selectedId: state.selectedId,
      activeView: state.activeView,
      config: state.config,
    }),
    sameFields,
  );

  const snapshots = useMemo(
    () => deriveSoloProjects(bots as readonly Bot[], groups as readonly Group[], pendingQueued),
    [bots, groups, pendingQueued],
  );

  return (
    <SoloProjectMatrixView
      snapshots={snapshots}
      enabled={enabled}
      surface={surface}
      activeBotId={activeView === "chat" ? (selectedId ?? undefined) : undefined}
      activeGroupId={activeView === "chat" ? (selectedId ?? undefined) : undefined}
      compact={compact}
      loading={!config && bots.length === 0}
      onToggleMode={() => { toggleSoloHubMode(); }}
      onCycleSurface={() => setSoloHubSurface(nextSurface(surface))}
      onSelectProject={(snapshot) => {
        if (snapshot.botId) {
          const bot = bots.find((item) => item.id === snapshot.botId);
          if (bot) openBot(dispatch, bot, false);
          onPicked?.();
        } else if (snapshot.groupId) {
          dispatch({ type: "select", id: snapshot.groupId });
          onPicked?.();
        }
      }}
    />
  );
});
