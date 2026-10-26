import { getPendingUiMode, getReplayErrorMessage } from "@/lib/session/pending-ui-state";
import type { PendingSetState } from "@/lib/session/pending-set-controller";

export interface PendingSetsBannerProps {
  pendingCount: number;
  replayState: PendingSetState;
}

export function PendingSetsBanner({ pendingCount, replayState }: PendingSetsBannerProps) {
  if (pendingCount === 0) {
    return null;
  }

  const mode = getPendingUiMode(replayState);

  if (mode === "replay-error") {
    return (
      <div className="mb-5">
        <div className="rounded-xl border border-muted/30 bg-muted/10 px-4 py-3 text-sm text-muted">
          <p className="font-medium">Failed to save sets</p>
          <p className="mt-1">{getReplayErrorMessage(replayState)}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-5 rounded-xl border border-muted/30 bg-muted/10 px-4 py-3 text-sm text-muted">
      <p>
        {pendingCount === 1
          ? "1 set saved on this phone, syncing when online"
          : `${pendingCount} sets saved on this phone, syncing when online`}
      </p>
    </div>
  );
}
