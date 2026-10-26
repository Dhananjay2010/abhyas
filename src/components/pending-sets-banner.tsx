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
          {replayState.retrying && (
            <button
              type="button"
              disabled={true}
              className="mt-3 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-fg opacity-50"
            >
              Saving set...
            </button>
          )}
          {!replayState.retrying && (
            <button
              type="button"
              onClick={() => replayState.retryNow?.()}
              className="mt-3 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-fg"
            >
              Retry
            </button>
          )}
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
