import { PendingSetsBanner } from "@/components/pending-sets-banner";
import { ReplayConflictNotice } from "@/components/replay-conflict-notice";
import type { PendingSetState } from "@/lib/session/pending-set-controller";

export type RunnerStatusAreaProps = {
  pendingCount: number;
  replayState: PendingSetState;
};

/**
 * Status area shown in the session runner for pending set queue and conflicts.
 * 
 * Displays:
 * - Conflict notice when replayed sets conflict with existing sets
 * - Pending sets banner when sets are queued for sync
 */
export function RunnerStatusArea({ pendingCount, replayState }: RunnerStatusAreaProps) {
  return (
    <>
      <ReplayConflictNotice conflicts={replayState.conflicts} />
      <PendingSetsBanner pendingCount={pendingCount} replayState={replayState} />
    </>
  );
}
