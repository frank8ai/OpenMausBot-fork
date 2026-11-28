import { memo } from "react";
import type { Bot } from "@/state/store";
import { cn } from "@/lib/cn";
import { activeLocale } from "@/lib/i18n";
import { useSoloHubMode } from "@/lib/solo-hub";
import { ELEVATED_CARD } from "@/components/elevated";
import { PendingApprovalActions, PendingApprovalPanel, type Pending } from "@/components/PendingApproval";
import { SingleDecisionCard } from "./SingleDecisionCard";

export const ComposerApprovalSlot = memo(function ComposerApprovalSlot({
  approval,
  approvalsCount,
  bot,
  threadId,
  onCancelTurn,
}: {
  approval?: Pending;
  approvalsCount: number;
  bot?: Bot;
  threadId: string;
  onCancelTurn: () => void;
}) {
  const soloHub = useSoloHubMode();
  if (!approval) return null;

  return (
    <div className={cn("mb-2 overflow-hidden rounded-[18px]", ELEVATED_CARD)}>
      {soloHub ? (
        <SingleDecisionCard
          key={approval.requestId}
          pending={approval}
          threadId={threadId}
          count={approvalsCount}
          index={0}
          bot={bot}
          onCancelTurn={onCancelTurn}
        />
      ) : (
        <PendingApprovalPanel
          key={approval.requestId}
          pending={approval}
          botName={bot?.name}
          asker={bot}
          count={approvalsCount}
          index={0}
          locale={activeLocale()}
          actions={<PendingApprovalActions part="primary" pending={approval} threadId={threadId} bot={bot} onCancelTurn={onCancelTurn} />}
          more={approval.message.inbox ? undefined : <PendingApprovalActions part="more" pending={approval} threadId={threadId} bot={bot} onCancelTurn={onCancelTurn} />}
        />
      )}
    </div>
  );
});
